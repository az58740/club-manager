// Runs Whisper entirely on the device: no Google, no cloud, no API key.
// The model files live on our own origin so the service worker can keep them offline.
import { env, pipeline } from "./transformers.min.js";

env.allowRemoteModels = false;
// Our service worker already keeps every asset, so a second copy here would double storage.
env.useBrowserCache = false;
env.allowLocalModels = true;
env.localModelPath = "/emza/models/";
env.backends.onnx.wasm.wasmPaths = {
  wasm: "/emza/ort-wasm-simd-threaded.asyncify.wasm",
  mjs: "/emza/ort-wasm-simd-threaded.asyncify.mjs",
};
// The asyncify runtime needs no SharedArrayBuffer, so iOS Safari works without special headers.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

let recognizer = null;
let loading = null;

function send(message) {
  self.postMessage(message);
}

async function load() {
  if (recognizer) return recognizer;
  if (loading) return loading;
  send({ type: "status", state: "loading" });
  loading = pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
    dtype: "q8",
    progress_callback: (progress) => send({ type: "progress", progress }),
  })
    .then((model) => {
      recognizer = model;
      send({ type: "status", state: "ready" });
      return model;
    })
    .catch((error) => {
      loading = null;
      send({ type: "status", state: "failed", error: String(error && error.message ? error.message : error) });
      throw error;
    });
  return loading;
}

// Whisper was trained on subtitles, so on quiet or noisy clips it likes to invent
// boilerplate. Anything that matches those known lines is treated as silence.
const HALLUCINATION =
  /^(زیرنویس|با تشکر از (تماشای|دیدن)|مترجم\s*:|ترجمه\s*:|thank you|thanks for watching|subscribe)/i;

// When the model hears noise it tends to answer with a stream of filler words
// («این که از …»). Real commands are mostly nouns and verbs, so a high share of
// function words means the clip was not speech aimed at the assistant.
const FILLER = new Set(
  "و که از به با در را این آن برای تا یا هم بر بی می نمی است بود شد کرد اگر اگه ولی اما چون پس یه یکی خب اون اینو چیه چطور چه چی کی کجا آیا نه بله آره ای اید ایه".split(
    " ",
  ),
);

function looksLikeNoise(words) {
  if (words.length < 5) return false;
  const filler = words.filter((word) => FILLER.has(word) || word.length <= 2 || word.startsWith("ای"))
    .length;
  return filler / words.length >= 0.6;
}

function clean(text, locale) {
  const trimmed = String(text ?? "")
    .replace(/^[\s\-–—،,.…]+|[\s\-–—،,.…]+$/g, "")
    .trim();
  if (!trimmed || HALLUCINATION.test(trimmed)) return "";
  // A word repeated over and over is the model looping on noise, not a command.
  const words = trimmed.split(/\s+/);
  let run = 1;
  let longest = 1;
  for (let index = 1; index < words.length; index += 1) {
    run = words[index] === words[index - 1] ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  // The filler test is a Persian word list, and its «short word» rule would also
  // catch English a/to/in, so it only applies to Persian transcripts.
  const persian = /[\u0600-\u06FF]/.test(trimmed);
  if (longest >= 4 || (persian && looksLikeNoise(words))) return "";
  return trimmed;
}

self.addEventListener("message", async (event) => {
  const { type, buffer, sampleRate, maxNewTokens, locale } = event.data ?? {};

  if (type === "load") {
    try {
      await load();
    } catch {
      return;
    }
    return;
  }

  if (type === "transcribe") {
    const audio = new Float32Array(buffer);
    const english = locale === "en";
    try {
      const model = await load();
      send({ type: "status", state: "decoding" });
      const output = await model(audio, {
        language: english ? "en" : "fa",
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
        force_full_sequences: false,
        temperature: 0,
        // Club commands are short; without a cap a noisy clip makes whisper repeat
        // one token until the model's 448-token limit, which takes minutes on a phone.
        max_new_tokens: Math.min(Math.max(Number(maxNewTokens) || 64, 8), 96),
        no_repeat_ngram_size: 3,
        initial_prompt: english
          ? "Club commands: player, team, practice, match, tuition, invoice, payment, present, absent, jersey, coach, debt, emza"
          : "فرمان‌های باشگاه والیبال: بازیکن، تیم، تمرین، مسابقه، شهریه، فاکتور، پرداخت، حضور، غیاب، پیراهن، مربی، بدهی، امضا",
      });
      const text = clean(typeof output === "string" ? output : output?.text, locale);
      send({ type: "text", text, sampleRate, seconds: audio.length / (sampleRate || 16000) });
    } catch (error) {
      send({
        type: "error",
        message: String(error && error.message ? error.message : error),
      });
    } finally {
      send({ type: "status", state: recognizer ? "ready" : "loading" });
    }
    return;
  }

  if (type === "reset") {
    loading = null;
    send({ type: "status", state: recognizer ? "ready" : "idle" });
  }
});
