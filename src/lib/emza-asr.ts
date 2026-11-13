"use client";

import { getLocale } from "./i18n/locale";
import { M, tr } from "./i18n/messages";

const TARGET_RATE = 16000;

export type AsrState = "idle" | "loading" | "ready" | "listening" | "decoding" | "failed";

export interface AsrProgress {
  file: string;
  loaded: number;
  total: number;
}

interface WorkerMessage {
  type: string;
  state?: AsrState;
  text?: string;
  error?: string;
  message?: string;
  progress?: AsrProgress;
}

interface EmzaAsrOptions {
  onState: (state: AsrState) => void;
  onProgress: (progress: AsrProgress) => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}

export function isWebAssemblySupported() {
  return typeof WebAssembly === "object" && "instantiateStreaming" in WebAssembly;
}

const OPEN_THRESHOLD = 0.012;
const CLOSE_THRESHOLD = 0.006;
// Club commands are long («یک بازیکن به نام … برای تیم … ثبت کن»), so allow a
// mid-sentence pause and up to 12 seconds before the segment is cut.
const SILENCE_MS = 900;
const MIN_SEGMENT_S = 0.45;
const MAX_SEGMENT_S = 12;

export class EmzaAsr {
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buffer: Float32Array[] = [];
  private active = false;
  private speaking = false;
  private lastVoiceAt = 0;
  private state: AsrState = "idle";
  private busy = false;
  // While the panel is closed only a wake word is expected, so generation is capped
  // short; every token saved is roughly a second less work on a phone.
  wakeOnly = true;

  constructor(private options: EmzaAsrOptions) {}

  get supported() {
    return typeof window !== "undefined" && typeof Worker !== "undefined" && isWebAssemblySupported();
  }

  get currentState() {
    return this.state;
  }

  private setState(next: AsrState) {
    this.state = next;
    this.options.onState(next);
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (!this.supported) return null;
    const worker = new Worker("/emza/asr-worker.js", { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
      const data = event.data;
      if (data.type === "status" && data.state) this.setState(data.state);
      if (data.type === "progress" && data.progress) this.options.onProgress(data.progress);
      if (data.type === "text") {
        this.busy = false;
        this.options.onTranscript((data.text ?? "").trim());
        if (this.active) this.setState("listening");
      }
      if (data.type === "error") {
        this.busy = false;
        this.setState("failed");
        this.options.onError(data.message ?? tr(M.emzaUi.asrModelFailed));
      }
    });
    worker.addEventListener("error", () => {
      this.busy = false;
      this.setState("failed");
      this.options.onError(tr(M.emzaUi.asrWorkerFailed));
      worker.terminate();
      this.worker = null;
    });
    this.worker = worker;
    return worker;
  }

  warm() {
    this.ensureWorker()?.postMessage({ type: "load" });
  }

  async startListening(): Promise<boolean> {
    if (this.active) return true;
    const worker = this.ensureWorker();
    if (!worker) {
      this.options.onError(tr(M.emzaUi.asrNoWasm));
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.options.onError(tr(M.emzaUi.asrNoMic));
      return false;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      this.options.onError(tr(M.emzaUi.asrMicDenied));
      return false;
    }

    const context = new AudioContext();
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    this.buffer = [];
    this.speaking = false;
    this.active = true;
    this.lastVoiceAt = 0;

    processor.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      this.pushFrame(new Float32Array(data));
    };

    source.connect(processor);
    processor.connect(context.destination);

    this.stream = stream;
    this.context = context;
    this.processor = processor;
    this.source = source;
    worker.postMessage({ type: "load" });
    this.setState("listening");
    return true;
  }

  private pushFrame(frame: Float32Array) {
    const sampleRate = this.context?.sampleRate ?? TARGET_RATE;
    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    const now = performance.now();

    if (!this.speaking && rms > OPEN_THRESHOLD) {
      this.speaking = true;
      this.buffer = [frame];
      this.lastVoiceAt = now;
      return;
    }
    if (!this.speaking) {
      this.buffer = [];
      return;
    }

    this.buffer.push(frame);
    if (rms > CLOSE_THRESHOLD) this.lastVoiceAt = now;

    const captured = this.buffer.reduce((total, chunk) => total + chunk.length, 0) / sampleRate;
    const quiet = now - this.lastVoiceAt;
    if (quiet >= SILENCE_MS || captured >= MAX_SEGMENT_S) this.flush(sampleRate, captured, quiet);
  }

  private flush(sampleRate: number, captured: number, quiet: number) {
    const frames = this.buffer;
    this.buffer = [];
    this.speaking = false;
    if (captured < MIN_SEGMENT_S || (quiet < SILENCE_MS && captured < MAX_SEGMENT_S)) return;
    if (this.busy) return;
    const mono = concat(frames);
    const audio = resample(mono, sampleRate, TARGET_RATE);
    this.busy = true;
    this.setState("decoding");
    const maxNewTokens = this.wakeOnly ? 32 : 64;
    this.worker?.postMessage(
      {
        type: "transcribe",
        buffer: audio.buffer,
        sampleRate: TARGET_RATE,
        maxNewTokens,
        locale: getLocale(),
      },
      [audio.buffer],
    );
  }

  stopListening() {
    this.active = false;
    this.speaking = false;
    this.buffer = [];
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
    }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => undefined);
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.context = null;
    this.setState(this.worker ? "ready" : "idle");
  }

  dispose() {
    this.stopListening();
    this.worker?.terminate();
    this.worker = null;
  }

  // Rebuilds the worker after a failed load so the user can retry from the button.
  reset() {
    this.dispose();
    this.busy = false;
    this.setState("idle");
  }
}

function concat(chunks: Float32Array[]) {
  const out = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function resample(input: Float32Array, from: number, to: number) {
  if (from === to || !input.length) return input;
  const ratio = from / to;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const low = Math.floor(position);
    const high = Math.min(low + 1, input.length - 1);
    const weight = position - low;
    output[i] = input[low] * (1 - weight) + input[high] * weight;
  }
  return output;
}
