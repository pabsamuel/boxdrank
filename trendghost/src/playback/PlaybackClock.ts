/**
 * DECISIONS.md D6 — ONE clock. Video position, audio, reference-frame lookup and
 * cue firing all read from here. Camera frames are timestamped against it; they
 * never drive it.
 */

export type ClockListener = (time: number) => void;

export class PlaybackClock {
  private listeners = new Set<ClockListener>();
  private rate = 1;

  constructor(private media: HTMLMediaElement | null = null) {}

  attach(media: HTMLMediaElement | null): void {
    this.media = media;
    if (media) media.playbackRate = this.rate;
  }

  now(): number {
    return this.media?.currentTime ?? 0;
  }

  get duration(): number {
    const d = this.media?.duration ?? 0;
    return Number.isFinite(d) ? d : 0;
  }

  get playing(): boolean {
    return this.media ? !this.media.paused && !this.media.ended : false;
  }

  get playbackRate(): number {
    return this.rate;
  }

  async play(): Promise<void> {
    await this.media?.play();
  }

  pause(): void {
    this.media?.pause();
  }

  seek(time: number): void {
    if (!this.media) return;
    this.media.currentTime = Math.max(0, Math.min(this.duration || time, time));
    this.emit();
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.media) this.media.playbackRate = rate;
  }

  subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called from the render loop — one tick per frame, cheap. */
  tick(): number {
    const time = this.now();
    this.emit(time);
    return time;
  }

  private emit(time = this.now()): void {
    for (const listener of this.listeners) listener(time);
  }
}
