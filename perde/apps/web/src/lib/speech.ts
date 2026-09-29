/**
 * Thin wrapper over the Web Speech API. Chrome (Android/desktop) and Safari
 * (iOS 14.5+) expose it as webkitSpeechRecognition; Firefox has none.
 * The transcript handed to the listener is everything heard since the last
 * reset(): finalised chunks plus the newest interim chunk.
 */

export interface SpeechListener {
  onTranscript(transcript: string, final: boolean): void;
  onTalking(talking: boolean): void;
  onError(code: string): void;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((ev: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

export function speechSupported(): boolean {
  return getCtor() !== null;
}

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechSession {
  start(): void;
  stop(): void;
  reset(): void;
  setLang(lang: string): void;
}

export function createSpeechSession(lang: string, listener: SpeechListener): SpeechSession | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  let rec: RecognitionLike | null = null;
  let active = false;
  let finals: string[] = [];
  let currentLang = lang;
  let talkTimer: ReturnType<typeof setTimeout> | null = null;

  const talking = (on: boolean) => {
    listener.onTalking(on);
    if (talkTimer) clearTimeout(talkTimer);
    if (on) talkTimer = setTimeout(() => listener.onTalking(false), 1200);
  };

  const build = () => {
    const r = new Ctor();
    r.lang = currentLang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]!;
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) finals.push(text);
        else interim += text;
      }
      talking(true);
      const transcript = [...finals, interim].join(' ').replace(/\s+/g, ' ').trim();
      listener.onTranscript(transcript, interim === '');
    };
    r.onsoundstart = () => talking(true);
    r.onspeechstart = () => talking(true);
    r.onspeechend = () => talking(false);
    r.onsoundend = () => talking(false);
    r.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        active = false;
        listener.onError(ev.error);
      }
      // 'no-speech' and 'aborted' are routine; onend restarts us.
    };
    r.onend = () => {
      if (!active) return;
      // Browsers stop after silence; keep listening while the session is active.
      setTimeout(() => {
        if (active) {
          try {
            rec?.start();
          } catch {
            /* already started */
          }
        }
      }, 150);
    };
    return r;
  };

  return {
    start() {
      if (active) return;
      active = true;
      rec = build();
      try {
        rec.start();
      } catch {
        /* ignore double start */
      }
    },
    stop() {
      active = false;
      try {
        rec?.abort();
      } catch {
        /* ignore */
      }
      rec = null;
      talking(false);
    },
    reset() {
      finals = [];
      // Restart so the recogniser's own interim buffer forgets the previous line.
      if (active && rec) {
        try {
          rec.abort();
        } catch {
          /* onend restarts */
        }
      }
    },
    setLang(next: string) {
      if (next === currentLang) return;
      currentLang = next;
      if (active) {
        this.stop();
        this.start();
      }
    },
  };
}
