"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Sparkles, X } from "lucide-react";
import { useClub } from "@/lib/store";
import { runEmza, normalizeFa } from "@/lib/emza";
import { EmzaAsr, type AsrProgress, type AsrState } from "@/lib/emza-asr";
import { faNum } from "@/lib/format";
import { M, tr, useT } from "@/lib/i18n/messages";
import { cn } from "@/components/ui";

const ENABLED_KEY = "emza-agent-enabled-v1";
const WAKE_KEY = "emza-wake-enabled-v1";

interface Message {
  id: number;
  from: "user" | "emza";
  text: string;
}

/** Persian and Latin spellings of the same name: «امضا», «امضا، …», “Emza, …”. */
const WAKE_PATTERN = /امضا|امضاء|اضا|امصا|ایمضا|\bemza\b/;
const STRIP_WAKE = /^[\s,.!?،؛]*(?:امضاء|ایمضا|امصا|اضا|امضا|emza)[\s,.!?،؛]*/u;

function stripWake(text: string) {
  return text.replace(STRIP_WAKE, "").trim();
}

function isPersian(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

export function EmzaAgent() {
  const t = useT();
  const { data, update, role } = useClub();
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [awake, setAwake] = useState(false);
  const [asrState, setAsrState] = useState<AsrState>("idle");
  const [progress, setProgress] = useState<AsrProgress | null>(null);
  const [note, setNote] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, from: "emza", text: tr(M.emzaUi.intro) },
  ]);
  const counterRef = useRef(1);
  const asrRef = useRef<EmzaAsr | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  const roleRef = useRef(role);
  dataRef.current = data;
  roleRef.current = role;

  useEffect(() => {
    const stored = window.localStorage.getItem(ENABLED_KEY);
    if (stored !== null) setEnabled(stored === "1");
    const sync = (event: Event) => {
      const value = (event as CustomEvent<boolean>).detail;
      setEnabled(value);
      if (!value) {
        setOpen(false);
        asrRef.current?.stopListening();
      }
    };
    window.addEventListener("emza-enabled", sync);
    return () => window.removeEventListener("emza-enabled", sync);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(""), 12000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const prefix = isPersian(text) ? "fa" : "en";
    const voice = window.speechSynthesis.getVoices().find((row) => row.lang.toLowerCase().startsWith(prefix));
    if (!voice) return;
    const utterance = new SpeechSynthesisUtterance(text.replace(/\n/g, "، ").replace(/•/g, ""));
    utterance.lang = voice.lang;
    utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const execute = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setMessages((current) => [...current, { id: counterRef.current++, from: "user", text }]);
      const result = runEmza(text, dataRef.current, { role: roleRef.current ?? "player" });
      if (result.data) {
        dataRef.current = result.data;
        update(() => result.data!);
      }
      setMessages((current) => [...current, { id: counterRef.current++, from: "emza", text: result.reply }]);
      speak(result.reply);
      if (result.href) {
        window.setTimeout(() => {
          router.push(result.href!);
          setOpen(false);
        }, 900);
      }
    },
    [router, speak, update],
  );

  const openRef = useRef(open);
  openRef.current = open;

  const handleTranscript = useCallback(
    (raw: string) => {
      if (!raw) {
        setNote(tr(M.emzaUi.nothingDetected));
        return;
      }
      const text = normalizeFa(raw);
      const isOpen = openRef.current;
      if (!isOpen && !WAKE_PATTERN.test(text)) return;
      setAwake(true);
      window.setTimeout(() => setAwake(false), 2500);
      const command = isOpen ? raw : stripWake(raw);
      setNote("");
      if (command.trim()) execute(command);
      else {
        setOpen(true);
        setMessages((current) => [
          ...current,
          { id: counterRef.current++, from: "emza", text: tr(M.emzaUi.yesQuestion) },
        ]);
      }
    },
    [execute],
  );

  const transcriptRef = useRef(handleTranscript);
  transcriptRef.current = handleTranscript;

  useEffect(() => {
    if (!enabled) return;
    const asr = new EmzaAsr({
      onState: setAsrState,
      onProgress: (value) => {
        if (value.file && value.total) setProgress(value);
      },
      onTranscript: (text) => transcriptRef.current(text),
      onError: (message) => {
        const lower = message.toLowerCase();
        if (lower.includes("fetch") || lower.includes("404") || lower.includes("failed to fetch")) {
          setNote(tr(M.emzaUi.modelNotDownloaded));
        } else if (lower.includes("memory") || lower.includes("حافظه")) {
          setNote(tr(M.emzaUi.memoryLow));
        } else {
          setNote(message);
        }
      },
    });
    asrRef.current = asr;
    return () => {
      asr.dispose();
      asrRef.current = null;
    };
  }, [enabled]);

  // Emza listens from the start and only reacts to its own name. iOS withholds
  // the microphone until the first touch, so that touch is also a retry.
  useEffect(() => {
    if (!enabled) return;
    if (window.localStorage.getItem(WAKE_KEY) === "0") return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      void asrRef.current?.startListening();
    };
    const timer = window.setTimeout(start, 1500);
    const onGesture = () => start();
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [enabled]);

  useEffect(() => {
    if (asrRef.current) asrRef.current.wakeOnly = !open;
  }, [open]);

  const toggleListening = useCallback(async () => {
    const asr = asrRef.current;
    if (!asr) return;
    if (asr.currentState === "listening" || asr.currentState === "decoding") {
      asr.stopListening();
      window.localStorage.setItem(WAKE_KEY, "0");
      return;
    }
    setNote("");
    if (asr.currentState === "failed") asr.reset();
    const started = await asr.startListening();
    if (started) {
      window.localStorage.setItem(WAKE_KEY, "1");
      setProgress(null);
      setNote(tr(M.emzaUi.listeningHint));
      return;
    }
    setOpen(true);
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    execute(input);
    setInput("");
  };

  if (!enabled) return null;

  const listening = asrState === "listening" || asrState === "decoding";
  const downloading = asrState === "loading" && progress && progress.total > 0;
  const megabytes = (bytes: number) => faNum(Math.max(1, Math.round(bytes / 1e6)));

  const statusText =
    asrState === "decoding"
      ? t(M.emzaUi.statusDecoding)
      : downloading
        ? t(M.emzaUi.statusPreparing, {
            loaded: megabytes(progress!.loaded),
            total: megabytes(progress!.total),
          })
        : asrState === "listening"
          ? t(M.emzaUi.statusListening)
          : asrState === "failed"
            ? t(M.emzaUi.statusFailed)
            : speaking
              ? t(M.emzaUi.statusSpeaking)
              : t(M.emzaUi.statusReady);

  return (
    <>
      {open ? (
        <section
          className="fixed inset-x-3 bottom-24 z-50 flex max-h-[62dvh] flex-col overflow-hidden rounded-3xl border border-line/80 bg-white shadow-2xl shadow-night-900/20 sm:inset-x-auto sm:left-5 sm:w-[390px] lg:bottom-24"
          aria-label={t(M.emzaUi.chatAria)}
        >
          <header className="flex items-center gap-2.5 bg-gradient-to-l from-night-900 to-brand-800 px-4 py-3 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15">
              <Sparkles className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold">{t(M.emzaUi.wakeWord)}</p>
              <p className="text-[10px] text-white/65">{statusText}</p>
            </div>
            <button
              onClick={() => {
                setEnabled(false);
                window.localStorage.setItem(ENABLED_KEY, "0");
                setOpen(false);
                asrRef.current?.stopListening();
                window.dispatchEvent(new CustomEvent("emza-enabled", { detail: false }));
              }}
              className="grid h-8 w-8 place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label={t(M.emzaUi.disableAria)}
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto bg-canvas/60 p-3.5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[12px] leading-6",
                  message.from === "user"
                    ? "ms-auto rounded-se-md bg-brand-600 text-white"
                    : "rounded-ss-md bg-white text-ink shadow-sm ring-1 ring-line/60",
                )}
              >
                {message.text}
              </div>
            ))}
          </div>

          {note ? (
            <p className="border-t border-line/60 bg-amber-50 px-3.5 py-2 text-[10px] leading-5 text-amber-800">
              {note}
            </p>
          ) : null}

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-line/70 bg-white p-2.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-ink-soft transition hover:bg-slate-200"
              aria-label={t(M.emzaUi.closeAria)}
            >
              <X className="h-4.5 w-4.5" />
            </button>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t(M.emzaUi.placeholder)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-line/80 bg-canvas/50 px-3 text-[12px] outline-none transition focus:border-brand-400 focus:bg-white"
            />
            <button
              type="submit"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700"
              aria-label={t(M.emzaUi.sendAria)}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </form>
        </section>
      ) : null}

      {open ? null : (
        <div className="fixed bottom-20 left-4 z-50 flex items-center gap-2 lg:bottom-6">
          {downloading ? (
            <span className="rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-bold text-ink-soft shadow-lg ring-1 ring-line">
              {t(M.emzaUi.downloadBadge, {
                loaded: megabytes(progress!.loaded),
                total: megabytes(progress!.total),
              })}
            </span>
          ) : note ? (
            <span className="max-w-[230px] rounded-2xl bg-amber-50 px-3 py-1.5 text-[10px] leading-4 text-amber-800 shadow-lg ring-1 ring-amber-200">
              {note}
            </span>
          ) : awake ? (
            <span className="rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-extrabold text-brand-700 shadow-lg ring-1 ring-brand-200">
              {t(M.emzaUi.wakeWord)}
            </span>
          ) : null}
          <button
            onClick={toggleListening}
            className={cn(
              "relative grid h-14 w-14 place-items-center rounded-full text-white shadow-xl transition-all duration-300",
              listening
                ? "scale-110 bg-rose-600 shadow-rose-600/40"
                : speaking
                  ? "bg-emerald-500 shadow-emerald-500/40"
                  : awake
                    ? "bg-amber-500 shadow-amber-500/40"
                    : "bg-gradient-to-br from-brand-500 to-night-800 shadow-brand-700/30 hover:scale-105",
            )}
            aria-label={listening ? t(M.emzaUi.listeningAria) : t(M.emzaUi.enableAria)}
          >
            {listening ? <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" /> : null}
            {asrState === "decoding" ? (
              <Sparkles className="relative h-6 w-6 animate-pulse" />
            ) : listening ? (
              <Mic className="relative h-6 w-6" />
            ) : (
              <Sparkles className="relative h-6 w-6" />
            )}
          </button>
        </div>
      )}
    </>
  );
}
