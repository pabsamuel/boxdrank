import type { PlayState } from '@perde/shared';

/**
 * The line to say, karaoke style: matched words light up, the next word is
 * underlined. Shown on the TV and, smaller, on the phone whose line it is.
 */
export interface KaraokeBarProps {
  play: PlayState;
  color?: string;
  compact?: boolean;
  /** Label shown before the speaker, e.g. "Sıra sende". */
  label?: string;
  /** Show the following line small underneath, so the next puppeteer can get ready. */
  nextLabel?: string;
}

export function KaraokeBar({ play, color, compact, label, nextLabel }: KaraokeBarProps) {
  const line = play.line;
  if (!line) return null;
  const tokens =
    play.progress?.tokens ?? line.text.split(/\s+/).map((word) => ({ word, matched: false }));
  const cursor = tokens.findIndex((t) => !t.matched);
  return (
    <div
      className={`karaoke ${compact ? 'karaoke--compact' : ''}`}
      style={{ ['--speaker' as string]: color ?? '#fff' }}
    >
      <div className="karaoke__meta">
        {label && <span className="karaoke__label">{label}</span>}
        <span className="karaoke__speaker">{line.speaker}</span>
        {line.song && (
          <span className="karaoke__song" aria-label="song">
            ♪
          </span>
        )}
        <span className="karaoke__count">
          {play.lineIndex + 1} / {play.totalLines}
        </span>
      </div>
      <p className="karaoke__line" lang={undefined}>
        {tokens.map((t, i) => (
          <span
            key={i}
            className={`karaoke__word ${t.matched ? 'is-matched' : ''} ${i === cursor ? 'is-next' : ''}`}
          >
            {t.word}{' '}
          </span>
        ))}
      </p>
      {line.hint && !compact && <p className="karaoke__hint">{line.hint}</p>}
      {nextLabel && play.next && (
        <p className="karaoke__next">
          <span className="karaoke__next-label">{nextLabel}</span> <b>{play.next.speaker}:</b>{' '}
          {play.next.text}
        </p>
      )}
    </div>
  );
}
