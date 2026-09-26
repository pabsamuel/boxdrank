/**
 * Camera permission pre-screen (CLAUDE.md rule 4): explain BEFORE the OS prompt,
 * plus the space/safety card from RISKS.md R9.
 */

import { useState } from 'react';

export function Onboarding({ onDone }: { onDone: () => void | Promise<void> }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      emoji: '👻',
      title: 'Copy any trend',
      body: 'The original video plays as a ghost over your camera. Move into it — your body turns green as you match, and the app calls each move before it happens.',
      action: 'Next',
    },
    {
      emoji: '📷',
      title: 'About your camera',
      body: 'Next you will be asked for camera access. Everything happens on your phone: your camera feed is never uploaded, never sent to us, and never leaves the device. Recordings stay in your browser until you share them yourself.',
      action: 'Got it',
    },
    {
      emoji: '🪑',
      title: 'Make some space',
      body: 'Prop your phone about waist height, step back until you fit head-to-toe in the frame, and check you have roughly two metres of clear space around you.',
      action: 'Start',
    },
  ] as const;

  const current = steps[step]!;

  return (
    <div className="screen centre onboarding">
      <div className="onboard-emoji" aria-hidden>
        {current.emoji}
      </div>
      <h2>{current.title}</h2>
      <p>{current.body}</p>
      <button
        className="primary"
        onClick={() => (step === steps.length - 1 ? void onDone() : setStep(step + 1))}
      >
        {current.action}
      </button>
      <div className="dots">
        {steps.map((_, i) => (
          <span key={i} className={i === step ? 'dot active' : 'dot'} />
        ))}
      </div>
    </div>
  );
}
