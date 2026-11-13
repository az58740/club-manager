// Injects the built file list into out/sw.js so the service worker can precache
// the whole app and run fully offline after the first visit.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "out");
const SW_PATH = join(root, "sw.js");
const CACHE_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".txt",
  ".svg",
  ".png",
  ".ico",
  ".webmanifest",
  ".woff",
  ".woff2",
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function toUrl(file) {
  return `/${file.slice(root.length + 1).split("\\").join("/")}`;
}

const files = await walk(root);
const urls = new Set();

for (const file of files) {
  const url = toUrl(file);
  if (url === "/sw.js" || !CACHE_EXTENSIONS.has(extname(file).toLowerCase())) continue;
  urls.add(url);
  if (url.endsWith("/index.html")) urls.add(url.slice(0, -"index.html".length));
}

const precache = [...urls].sort();
const buildId = createHash("sha256").update(precache.join("|")).digest("hex").slice(0, 10);

const source = await readFile(SW_PATH, "utf8");
const injected = source
  .replaceAll("__BUILD_ID__", buildId)
  .replace("[/*__PRECACHE__*/]", JSON.stringify(precache, null, 2));

if (injected.includes("__BUILD_ID__") || injected.includes("[/*__PRECACHE__*/]")) {
  throw new Error("sw.js placeholders were not replaced");
}

await writeFile(SW_PATH, injected);
console.log(`sw.js: precached ${precache.length} files, build ${buildId}`);
