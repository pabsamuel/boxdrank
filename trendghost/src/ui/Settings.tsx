import { useState } from 'react';
import { clearAllData } from '../storage/db';
import { useSettings } from './useSettings';

export function Settings({ onBack, onCleared }: { onBack: () => void; onCleared: () => void }) {
  const s = useSettings();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="screen">
      <header className="app-header">
        <h1>Settings</h1>
        <button className="text-button" onClick={onBack}>
          Done
        </button>
      </header>

      <section className="settings">
        <label className="setting">
          <span>
            Mirror me
            <em>Like a mirror. Off means copy left/right exactly as the original.</em>
          </span>
          <input
            type="checkbox"
            checked={s.mirrored}
            onChange={(e) => s.update('mirrored', e.target.checked)}
          />
        </label>

        <div className="setting">
          <span>
            How strict?
            <em>How close you have to be before a limb turns green.</em>
          </span>
          <div className="row">
            {(['chill', 'normal', 'strict'] as const).map((level) => (
              <button
                key={level}
                className={s.sensitivity === level ? 'chip active' : 'chip'}
                onClick={() => s.update('sensitivity', level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <label className="setting">
          <span>
            Voice cues
            <em>Calls the next move out loud.</em>
          </span>
          <input
            type="checkbox"
            checked={s.voice}
            onChange={(e) => s.update('voice', e.target.checked)}
          />
        </label>

        <label className="setting">
          <span>
            Buzz on the beat
            <em>A vibration on each move, so you feel it without looking.</em>
          </span>
          <input
            type="checkbox"
            checked={s.haptics}
            onChange={(e) => s.update('haptics', e.target.checked)}
          />
        </label>

        <div className="setting">
          <span>
            Ghost strength
            <em>How visible the original video is over your camera.</em>
          </span>
          <input
            type="range"
            min={0.1}
            max={0.6}
            step={0.05}
            value={s.ghostOpacity}
            onChange={(e) => s.update('ghostOpacity', Number(e.target.value))}
          />
        </div>

        <label className="setting">
          <span>
            Reduced mode
            <em>Skeleton only, no ghost video. Use this if it feels laggy.</em>
          </span>
          <input
            type="checkbox"
            checked={s.reducedMode}
            onChange={(e) => s.update('reducedMode', e.target.checked)}
          />
        </label>

        <label className="setting">
          <span>
            Colour-blind palette
            <em>Blue instead of green for "matched".</em>
          </span>
          <input
            type="checkbox"
            checked={s.colorBlind}
            onChange={(e) => s.update('colorBlind', e.target.checked)}
          />
        </label>

        <label className="setting">
          <span>
            Skip the framing check
            <em>Go straight to the countdown.</em>
          </span>
          <input
            type="checkbox"
            checked={s.skipFraming}
            onChange={(e) => s.update('skipFraming', e.target.checked)}
          />
        </label>
      </section>

      <section className="settings">
        <h2>Your data</h2>
        <ul className="privacy">
          <li>
            <strong>Your camera feed never leaves this device.</strong> Pose tracking runs here, in
            your browser. No frames, no images, no body coordinates are sent anywhere.
          </li>
          <li>
            <strong>Nothing is uploaded.</strong> The videos you add and the takes you record are
            stored in this browser's local storage. They go nowhere else unless you save or share
            them yourself.
          </li>
          <li>
            <strong>No account, no tracking.</strong> TrendGhost has no sign-in and collects no
            analytics.
          </li>
          <li>
            <strong>Other people's videos stay theirs.</strong> TrendGhost can't download clips from
            a link — you supply a video you already have, and we keep it on your phone.
          </li>
        </ul>
        {confirming ? (
          <div className="row">
            <button
              className="danger"
              onClick={async () => {
                await clearAllData();
                setConfirming(false);
                onCleared();
              }}
            >
              Yes, delete everything
            </button>
            <button className="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="text-button danger" onClick={() => setConfirming(true)}>
            Delete all my data
          </button>
        )}
      </section>
    </div>
  );
}
