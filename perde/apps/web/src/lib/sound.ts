/**
 * The sounds of a Karagöz screen, synthesized so nothing has to be downloaded:
 * the nareke (a buzzing reed whistle) when the göstermelik is lifted, the tef
 * (frame drum with jingles) when someone steps on stage or a section turns,
 * and a soft sting when the curtain comes down.
 *
 * Browsers only let audio start after the person has touched the page, so the
 * TV asks for one tap; until then `onState` reports "blocked".
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
const listeners = new Set<(running: boolean) => void>();

function get(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    ctx.onstatechange = () => {
      for (const l of listeners) l(ctx?.state === 'running');
    };
  }
  return ctx;
}

/** Create the context early so the TV knows whether a tap is needed. */
export function watchSound(onState: (running: boolean) => void): () => void {
  const c = get();
  listeners.add(onState);
  onState(!!c && c.state === 'running');
  return () => {
    listeners.delete(onState);
  };
}

/** Call from a click or key press: resumes audio and warms up speech synthesis. */
export function unlockSound(): void {
  const c = get();
  if (c && c.state !== 'running') void c.resume().catch(() => undefined);
  try {
    if (typeof speechSynthesis !== 'undefined' && !speechSynthesis.speaking) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch {
    /* not critical */
  }
}

function ready(): AudioContext | null {
  const c = get();
  return c && c.state === 'running' && master ? c : null;
}

function noise(c: AudioContext): AudioBufferSourceNode {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

/** One tef hit: a skin thump, a slap of noise and three ringing jingles. */
function tefHit(c: AudioContext, at: number, accent: boolean): void {
  const out = master!;
  const thump = c.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(accent ? 150 : 120, at);
  thump.frequency.exponentialRampToValueAtTime(58, at + 0.09);
  const tg = c.createGain();
  tg.gain.setValueAtTime(accent ? 0.7 : 0.4, at);
  tg.gain.exponentialRampToValueAtTime(0.001, at + 0.17);
  thump.connect(tg).connect(out);
  thump.start(at);
  thump.stop(at + 0.19);

  const slap = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = accent ? 2200 : 3600;
  bp.Q.value = 0.9;
  const sg = c.createGain();
  sg.gain.setValueAtTime(accent ? 0.35 : 0.26, at);
  sg.gain.exponentialRampToValueAtTime(0.001, at + (accent ? 0.13 : 0.08));
  slap.connect(bp).connect(sg).connect(out);
  slap.start(at);
  slap.stop(at + 0.16);

  for (const f of [5400, 6900, 8300]) {
    const j = c.createOscillator();
    j.type = 'triangle';
    j.frequency.value = f * (0.98 + Math.random() * 0.04);
    const jg = c.createGain();
    jg.gain.setValueAtTime(0.0001, at);
    jg.gain.linearRampToValueAtTime(0.05, at + 0.006);
    jg.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
    j.connect(jg).connect(out);
    j.start(at);
    j.stop(at + 0.16);
  }
}

const TEF: Record<'entrance' | 'section' | 'hit', Array<[number, boolean]>> = {
  entrance: [
    [0, true],
    [0.22, false],
    [0.33, false],
    [0.55, true],
    [0.77, false],
    [0.88, false],
    [1.1, true],
  ],
  section: [
    [0, false],
    [0.09, false],
    [0.18, false],
    [0.3, true],
  ],
  hit: [[0, true]],
};

export function playTef(kind: keyof typeof TEF): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.02;
  for (const [dt, accent] of TEF[kind]) tefHit(c, t + dt, accent);
}

/** The nareke: a reedy buzz with a fast tremble, sliding up then down. */
export function playNareke(): void {
  const c = ready();
  if (!c) return;
  const out = master!;
  const t = c.currentTime + 0.02;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(470, t);
  osc.frequency.linearRampToValueAtTime(560, t + 0.35);
  osc.frequency.linearRampToValueAtTime(430, t + 1.05);
  const lfo = c.createOscillator();
  lfo.frequency.value = 26;
  const depth = c.createGain();
  depth.gain.value = 38;
  lfo.connect(depth).connect(osc.frequency);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 2.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.32, t + 0.06);
  g.gain.setValueAtTime(0.32, t + 0.8);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
  osc.connect(bp).connect(g).connect(out);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 1.2);
  lfo.stop(t + 1.2);
}

/** Curtain: four falling notes and a last tef hit. */
export function playSting(): void {
  const c = ready();
  if (!c) return;
  const out = master!;
  const t = c.currentTime + 0.02;
  [659.25, 493.88, 392, 329.63].forEach((f, i) => {
    const at = t + i * 0.22;
    for (const type of ['sine', 'triangle'] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(type === 'sine' ? 0.22 : 0.06, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.55);
    }
  });
  tefHit(c, t + 0.95, true);
}
