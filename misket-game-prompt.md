# Prompt: Classic Turkish Marbles Game ("Misket / Bilye") — Fully Deployable

Copy everything below the line and paste it into your AI coding tool of choice.

---

Build a complete, polished, **fully deployable** browser game of the classic Turkish street marbles game (*misket / bilye*), the "circle game" variant kids played on dirt: marbles are placed inside a circle drawn on the ground, and players take turns flicking their shooter marble to knock marbles out of the circle. Every marble you knock out is yours to keep. The player who collects the most marbles wins.

## Deliverable & deployment (non-negotiable)

- A **single, self-contained `index.html` file** — all CSS and JavaScript inlined, zero external dependencies, no CDN links, no build step, no frameworks. Vanilla JS + Canvas 2D only.
- It must run by simply double-clicking the file, and be instantly deployable to **GitHub Pages, Netlify Drop, Vercel, or Cloudflare Pages** as a static file with no configuration.
- Must work offline once loaded. No network requests of any kind.
- Include a short `README.md` with one-paragraph deploy instructions for GitHub Pages and Netlify Drop.

## Game rules (classic circle variant)

1. A chalk-white circle is drawn on a dirt ground. 9–15 target marbles are scattered inside it (slightly randomized positions each round).
2. Two players — **human vs. computer AI** — each have one "shooter" marble (*enek*). Players alternate turns.
3. On your turn, you flick your shooter from outside the circle (first shot) or from where it stopped (subsequent shots).
4. Any target marble knocked **fully outside the circle** is captured by the shooter and added to their pouch.
5. If you capture at least one marble on a shot AND your shooter stays inside the circle, you shoot again (bonus turn). Otherwise the turn passes.
6. The round ends when the circle is empty. Most captured marbles wins the round. Best of 3 rounds wins the match.
7. Optional toggle: "**Kanlı** mode" (for keeps) — captured marbles persist across rounds in a visible collection; and a casual mode where they reset.

## Controls

- **Drag-and-release flick** (like Angry Birds / pool games): press on the shooter, drag backwards to aim, see a dotted trajectory/aim line and a power meter, release to shoot. Works with **both mouse and touch** — must be fully playable on mobile (responsive canvas, `touch-action: none`, no scroll-jank).
- A subtle cancel zone (drag back onto the shooter) to abort a shot.

## Physics (make it feel real)

- 2D top-down physics: velocity, friction (dirt drag), elastic marble-to-marble collisions with proper impulse resolution based on mass and radius, slight restitution loss.
- Marbles must never overlap or tunnel — use continuous or sub-stepped collision detection.
- Satisfying "clack" feel: tiny screen-shake on hard hits, marbles spin/roll visually as they move.

## Visuals & audio (nostalgic, Anatolian schoolyard)

- Warm dirt-ground texture drawn procedurally (noise speckles, subtle patches), hand-drawn-looking chalk circle with slight irregularity.
- Marbles rendered as **glass marbles with colored swirls inside** (the classic cat's-eye look), radial-gradient shine, soft shadows. Give the shooter a distinct larger look.
- Ambient details: a few pebbles, tufts of grass at the edges, warm late-afternoon light.
- Procedural audio via **Web Audio API** (no audio files): marble click sounds pitched by impact force, a soft "win" jingle, a pop when a marble leaves the circle. Mute button.
- UI in a playful hand-written style font (system/local fallback stack only): score pouches for each player showing collected marbles as little icons, turn indicator, round counter, "Your turn!" callouts.

## AI opponent

- Three difficulties (Easy / Normal / Hard). The AI simulates candidate shots (sample angles/powers, run a fast headless physics rollout) and picks a good one, with aim error scaled by difficulty. Add a small human-like delay and a visible aim line while the AI "thinks."

## Polish & structure

- Start screen (title "Misket" with a marble logo, difficulty select, mode toggle), pause/restart, end-of-round and end-of-match screens with a rematch button.
- Persist best score / match wins in `localStorage`.
- Clean, commented code organized in clear sections (physics, rendering, AI, game state, audio, input) — all still inside the single file.
- 60 FPS target with `requestAnimationFrame` and a fixed-timestep physics loop; must stay smooth with 20 marbles.
- All on-screen text in **English**, but keep the authentic Turkish flavor words: title "Misket", the shooter labeled "Enek", the for-keeps toggle labeled "Kanlı (for keeps)".

Test the full game loop mentally before finishing: first flick from outside the circle, captures, bonus turns, turn passing, round end, match end, rematch — every path must work with no dead ends and no console errors.
