// Stages the offline multilingual speech model + ONNX runtime into public/emza so the
// service worker can cache them on first use; afterwards recognition needs no network.
// Big files are fetched in 1 MB chunks, so a flaky link still finishes: every chunk is
// retried on its own and progress is written to <file>.chunks.json between runs.
//
// The script never fails the build: a host that cannot reach the model mirror still
// deploys, and only Emza voice is unavailable until the files are staged locally.
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  truncate,
  unlink,
  writeFile,
} from "node:fs/promises";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const model = "Xenova/whisper-tiny";
const target = join(root, "public", "emza");
const modelDir = join(target, "models", model);
// The mirror is a byte-identical copy; used when the main host is unreachable.
const MODEL_HOSTS = ["https://huggingface.co", "https://hf-mirror.com"];

const MODEL_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "added_tokens.json",
  "vocab.json",
  "merges.txt",
  "normalizer.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];

// Exact byte counts so a half-written file from an interrupted run is refetched.
const EXACT_SIZE = {
  "onnx/encoder_model_quantized.onnx": 10124910,
  "onnx/decoder_model_merged_quantized.onnx": 30727765,
};

// transformers.min.js is the self-contained browser bundle; it loads the asyncify
// runtime, which is the one variant that runs on iOS without SharedArrayBuffer.
const RUNTIME_FILES = [
  { from: "@huggingface/transformers/dist/transformers.min.js", to: "transformers.min.js" },
  {
    from: "onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs",
    to: "ort-wasm-simd-threaded.asyncify.mjs",
  },
  {
    from: "onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm",
    to: "ort-wasm-simd-threaded.asyncify.wasm",
  },
];

const CHUNK = 1024 * 1024;
const PARALLEL = 3;
const CHUNK_RETRY = 40;
// A hosted build must not sit retrying a blocked mirror until the CI times out: each big
// file gets this budget, and after one file stalls the remaining big files are skipped.
const FILE_BUDGET_MS = 4 * 60 * 1000;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function sizeOf(file) {
  return existsSync(file) ? (await stat(file)).size : 0;
}

function curl(args) {
  execFileSync("curl", ["-4", "-fL", "--no-progress-meter", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function hostUrls(path) {
  return MODEL_HOSTS.map((host) => `${host}/${model}/resolve/main/${path}`);
}

async function download(path, file, exact) {
  await mkdir(resolve(file, ".."), { recursive: true });
  const temp = `${file}.part`;
  let lastError = null;
  for (const url of hostUrls(path)) {
    try {
      curl([
        "--retry",
        "20",
        "--retry-all-errors",
        "--retry-connrefused",
        "--retry-delay",
        "2",
        "--connect-timeout",
        "20",
        "--speed-limit",
        "1024",
        "--speed-time",
        "45",
        "-C",
        "-",
        "-o",
        temp,
        url,
      ]);
    } catch (error) {
      lastError = error;
      continue;
    }
    const size = await sizeOf(temp);
    if (!size) {
      lastError = new Error(`empty download from ${url}`);
      continue;
    }
    if (exact && size !== exact) {
      throw new Error(`${file} is ${size} bytes, expected ${exact}; delete ${temp} and retry`);
    }
    await rename(temp, file);
    return size;
  }
  throw lastError ?? new Error(`could not download ${path}`);
}

async function fetchChunk(path, start, end, temp) {
  const want = end - start + 1;
  for (const url of hostUrls(path)) {
    try {
      curl([
        "--retry",
        "5",
        "--retry-all-errors",
        "--retry-connrefused",
        "--retry-delay",
        "2",
        "--connect-timeout",
        "15",
        "--speed-limit",
        "4096",
        "--speed-time",
        "30",
        "--max-time",
        "120",
        "-r",
        `${start}-${end}`,
        "-o",
        temp,
        url,
      ]);
      const size = await sizeOf(temp);
      if (size !== want) throw new Error(`range ${start}-${end}: got ${size} of ${want} bytes`);
      return await readFile(temp);
    } catch {
      // try the next host
    }
  }
  return null;
}

async function downloadChunked(path, file, total) {
  const building = `${file}.building`;
  const progressPath = `${file}.chunks.json`;
  await mkdir(resolve(file, ".."), { recursive: true });
  await unlink(`${file}.part`).catch(() => undefined);

  const count = Math.ceil(total / CHUNK);
  let done = [];
  if (existsSync(building) && existsSync(progressPath)) {
    try {
      done = JSON.parse(await readFile(progressPath, "utf8"));
    } catch {
      done = [];
    }
  }
  const doneSet = new Set(done.filter((index) => Number.isInteger(index) && index < count));
  const pending = [];
  for (let index = 0; index < count; index += 1) if (!doneSet.has(index)) pending.push(index);

  if (!existsSync(building)) {
    await writeFile(building, new Uint8Array(0));
    await truncate(building, total);
    doneSet.clear();
    pending.length = 0;
    for (let index = 0; index < count; index += 1) pending.push(index);
  }
  if (!pending.length) {
    await rename(building, file);
    await unlink(progressPath).catch(() => undefined);
    return total;
  }
  console.log(`  ${path} · ${pending.length}/${count} chunks to fetch`);

  const handle = await open(building, "r+");
  const deadline = Date.now() + FILE_BUDGET_MS;
  let saved = doneSet.size;
  let reported = saved;
  const queue = pending;
  const save = () => writeFileSync(progressPath, JSON.stringify([...doneSet].sort((a, b) => a - b)));

  const worker = async (id) => {
    while (queue.length) {
      if (Date.now() > deadline) {
        throw new Error(`${path}: no progress within ${FILE_BUDGET_MS / 1000}s, giving up`);
      }
      const index = queue.shift();
      const start = index * CHUNK;
      const end = Math.min(total, start + CHUNK) - 1;
      const temp = `${building}.chunk${id}`;
      let data = null;
      for (let attempt = 1; attempt <= CHUNK_RETRY && !data; attempt += 1) {
        data = await fetchChunk(path, start, end, temp);
        if (!data) await sleep(3000);
      }
      if (!data) throw new Error(`chunk ${index} of ${path} kept failing; rerun to resume`);
      await handle.write(data, 0, data.length, start);
      doneSet.add(index);
      saved += 1;
      if (saved - reported >= 2 || saved === count) {
        reported = saved;
        save();
        console.log(`  ${path} · ${saved}/${count} chunks (${Math.round((saved / count) * 100)}%)`);
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: PARALLEL }, (_, id) => worker(id)));
  } finally {
    await handle.close();
  }

  const size = await sizeOf(building);
  if (size !== total) throw new Error(`${path} assembled ${size} bytes, expected ${total}`);
  await rename(building, file);
  await unlink(progressPath).catch(() => undefined);
  console.log(`  ${path} · ${(total / 1e6).toFixed(1)} MB complete`);
  return total;
}

await mkdir(modelDir, { recursive: true });

let fetched = 0;
let bytes = 0;
let stalled = false;

for (const file of MODEL_FILES) {
  const dest = join(modelDir, file);
  const exact = EXACT_SIZE[file] ?? 0;
  const current = await sizeOf(dest);
  if (exact ? current === exact : current > 0) continue;
  if (stalled && exact > 4e6) {
    console.warn(`  model ${file} skipped: the mirror was already unreachable`);
    continue;
  }
  try {
    const size =
      exact > 4e6 ? await downloadChunked(file, dest, exact) : await download(file, dest, exact);
    fetched += 1;
    bytes += size;
    console.log(`  model ${file} · ${(size / 1e6).toFixed(1)} MB`);
  } catch (error) {
    if (exact > 4e6) stalled = true;
    console.warn(`  model ${file} failed: ${error.message}`);
  }
}

for (const { from, to } of RUNTIME_FILES) {
  const source = join(root, "node_modules", from);
  const dest = join(target, to);
  if (!existsSync(source)) {
    console.warn(`  runtime ${to} missing: install dependencies first (${from})`);
    continue;
  }
  const expected = statSync(source).size;
  if ((await sizeOf(dest)) === expected) continue;
  await mkdir(resolve(dest, ".."), { recursive: true });
  await copyFile(source, dest);
  fetched += 1;
  bytes += expected;
  console.log(`  runtime ${to} · ${(expected / 1e6).toFixed(1)} MB`);
}

const staged = await readdir(target).catch(() => []);
const missing = [];
for (const file of MODEL_FILES) {
  const exact = EXACT_SIZE[file] ?? 0;
  const size = await sizeOf(join(modelDir, file));
  if (exact ? size !== exact : size === 0) missing.push(file);
}
if (missing.length) {
  console.warn(
    `emza assets incomplete (${missing.length} file(s)): ${missing.join(", ")} — the app still builds; ` +
      "Emza voice stays unavailable until they are staged. Run npm run emza:assets where the mirror is reachable, then rebuild.",
  );
} else {
  console.log(
    fetched
      ? `emza assets staged: ${fetched} files, ${(bytes / 1e6).toFixed(0)} MB total (worker: ${staged.includes("asr-worker.js") ? "present" : "missing"})`
      : "emza assets already staged",
  );
}
