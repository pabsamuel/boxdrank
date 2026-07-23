import { BRAND } from '@/lib/api';

export const metadata = { title: 'Keyboard privacy' };

export default function KeyboardPrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>The keyboard is not a keylogger</h1>
      <p>
        Third-party keyboards have a trust problem, so here is exactly what the {BRAND} keyboard
        does and does not do — enforced in code and checked in CI, not just promised here.
      </p>
      <div className="card">
        <h3>Never</h3>
        <ul>
          <li>Reads, stores, or transmits the text you type</li>
          <li>Collects surrounding text, passwords, or secure-field input</li>
          <li>Includes message contents or recipients in analytics</li>
          <li>Makes network calls while you type</li>
        </ul>
        <h3>Only</h3>
        <ul>
          <li>Shows your unlocked emote packs from a local, offline cache</li>
          <li>Inserts, copies, or shares the emote you tap</li>
          <li>
            Records allowlisted anonymous events (keyboard opened, emote selected, insertion
            succeeded/fell back) — the server rejects anything else
          </li>
        </ul>
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        iOS asks about “Allow Full Access” for keyboards that need network access. Our keyboard is
        designed to work without it: the host app syncs packs, and the keyboard reads the shared
        local cache. Details in the app onboarding.
      </p>
    </main>
  );
}
