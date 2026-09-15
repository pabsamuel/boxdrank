/** CUE_ENGINE.md "Output channels" — voice and haptics. */

export class Voice {
  enabled = true;

  say(text: string): void {
    if (!this.enabled || typeof speechSynthesis === 'undefined') return;
    // Never queue: a backlog of stale instructions is worse than silence.
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.15;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
  }

  stop(): void {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }
}

export function buzz(pattern: number | number[] = 40): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}
