# 🏆 Floor Duel

A mobile party game inspired by *The Floor*: two players face off on one phone. A topic is
chosen, each player gets their own countdown clock, and you take turns naming things that fit
the topic. Say your answer, tap your half of the screen to pass the turn — **the player whose
clock hits zero loses**.

## How it works

- **Split screen, face to face** — the top half of the screen is rotated 180°, so you stand or
  lay the phone between the two players and each sees their own half right-side up.
- **Two cameras** — the front camera films the top player and the back camera films the bottom
  player, so both faces are on screen during the duel, game-show style. If a device can't run
  both cameras at once (many phones can't), that half falls back to a styled panel and the game
  plays on.
- **Chess-clock rules** — only the active player's clock drains. Tap your side after you answer
  to freeze your clock and start your opponent's. Under 10 seconds the clock turns amber, under
  5 it turns red with haptic ticks.
- **25 built-in topics** (fruits, countries, rappers, football clubs, pizza toppings, …), a
  random picker, or type any custom topic.
- Configurable clock (30 / 45 / 60 seconds per player — the show uses 45), pause button,
  rematch with alternating first turn, and a winner screen.

## Running it

```bash
cd floor-duel
npm install
npx expo start
```

Then scan the QR code with [Expo Go](https://expo.dev/go) on your phone (camera preview needs a
real device — simulators have no cameras). For a standalone build, use
`npx expo run:android` / `npx expo run:ios` or EAS Build.

## Stack

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) / React Native 0.86, TypeScript
- `expo-camera` for the two camera feeds
- `expo-haptics` for turn-pass and low-time feedback
- `expo-keep-awake` so the screen never sleeps mid-duel
- No navigation library — a tiny two-screen state machine in `App.tsx`

## Project layout

```
floor-duel/
├── App.tsx                    # setup ↔ duel state machine
└── src/
    ├── screens/
    │   ├── SetupScreen.tsx    # names, topic picker, clock length, camera toggle
    │   └── DuelScreen.tsx     # split-screen duel: cameras, chess clocks, overlays
    ├── topics.ts              # built-in topic list + random picker
    ├── theme.ts               # colors
    └── types.ts               # shared types
```

## Ideas for later

- Online matchmaking (find a stranger, duel over video with WebRTC)
- Best-of-3 duels and a whole-floor territory mode like the show
- Voice detection to auto-pass the turn when an answer is spoken
