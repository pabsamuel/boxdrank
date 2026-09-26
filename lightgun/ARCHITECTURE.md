# Architecture

The prototype exists to answer one question: *can a normal Android phone provide accurate,
low-latency, absolute pointing at a TV?* Every decision below is in service of answering that
cheaply, and of not painting the product into a corner afterwards.

```
   ┌──────────────────────┐          ┌──────────────┐          ┌────────────────────┐
   │  Android phone       │   wss    │  node server │   ws     │  Laptop → HDMI → TV│
   │  Chrome + WebXR/AR   │ ───────► │  room relay  │ ───────► │  display client    │
   │  pose → aim maths    │   x,y    │  (no logic)  │   x,y    │  crosshair + game  │
   └──────────────────────┘          └──────────────┘          └────────────────────┘
```

## Decisions

### WebXR `immersive-ar`, not a native ARCore app

The product fantasy is *scan a QR code and you are playing*. An APK install kills that, and for the
technical question it buys nothing: WebXR `immersive-ar` on Android Chrome **is** ARCore — the same
visual-inertial tracker, exposed as `XRFrame.getViewerPose()` in a `local` reference space. We get
6DoF at display refresh rate with no install step.

Costs we accepted:

- **HTTPS is mandatory.** WebXR needs a secure context and a phone on the LAN is not `localhost`, so
  `server/certs.js` mints a self-signed certificate covering every local IP. The player taps through
  one browser warning. A native app would not need this; nor would a hosted build with a real
  certificate, which is the obvious fix later.
- **`pose.emulatedPosition`** tells us when ARCore has quietly degraded to rotation-only. We surface
  that as `LIMITED` tracking rather than letting the crosshair slide around unexplained.

`phone/js/pose.js` hides both behind one interface, so swapping in a native ARCore controller later
means implementing one class, not rewriting the controller.

### The maths runs on the phone

Only `{x, y}` crosses the network. The phone already has the pose at frame rate; shipping raw poses to
the display would insert a network hop *before* a crosshair position even exists, and make the
display's frame rate part of the aiming loop. This also means a second player costs nothing but
another WebSocket.

### Calibration: solve for ranges, not for a plane

The naive formulation — fit a plane to the aiming rays — is under-constrained and numerically nasty.
Instead we parameterise by **one unknown range per ray** (how far along that ray its corner sits),
which is minimal and well-conditioned:

- **4 points:** 4 unknowns, 7 residuals — four edge lengths against the known physical width/height,
  plus a 3-component parallelogram closure. Over-determined, so we also get a meaningful residual to
  report as calibration error.
- **3 points:** 3 unknowns, 3 residuals — two edges plus perpendicularity. Exact, faster, slightly
  worse in practice (4.6% vs 4.1% p95 under simulated hand noise).

Levenberg–Marquardt, seeded from the angle the rays subtend. Converges in well under a millisecond.

The corners are then re-squared in a least-squares sense (averaged edge directions, orthogonalised)
before being used, which is what makes the residual a usable quality metric rather than noise.

**Scale comes from the player's stated screen size.** Without it, scale is only weakly observable —
the small hand translation between calibration shots is the entire baseline. Asking "how big is your
TV?" is one dropdown and it makes the problem exactly determined.

**The markers are inset, and the solver knows it.** Markers at the literal corners are half off the
panel and awkward to aim at, so they sit at 5%/8% inside. Telling the solver those were the true
corners inflates the solved distance by ~11%, which is invisible while standing still and catastrophic
when you move. This was a real bug, caught by the end-to-end test: aim error after a 0.9 m step was
36%, and 0.6% once the inset rectangle was passed through to the solver.

### Rotation-only fallback (and control condition)

`calibrateRotation()` gnomonically projects the four aiming directions onto a tangent plane and fits a
homography to the unit square. From a fixed viewpoint this is *exact* — a plane viewed by a rotating
camera is a homography, no approximation. It needs no position, so it works on phones without ARCore
and on a bare `deviceorientation` feed.

It is also the honest control: press **R** on the display to A/B it live against the 6DoF path. The
difference only appears when the player moves, which is exactly the failure mode gyro light guns have.

### Transport: LAN WebSocket, not WebRTC

Measured loopback transport latency is **0.9 ms mean, 2.6 ms p95** — a fifth of a 60 Hz frame before
the packet even reaches the renderer. A WebRTC data channel might shave a millisecond on a congested
Wi-Fi network at the cost of a signalling dance and an ICE failure mode in someone's living room.
Revisit only if real-network measurement shows the transport is actually the problem; the diagnostics
panel reports transport latency separately from pose and render latency precisely so that question can
be answered with numbers.

The server is deliberately dumb: rooms, relay, nothing else. No database, no accounts, no game state.
Aim packets are forwarded untouched.

### Smoothing

A One-Euro filter on `(x, y)`, in normalised screen units per second. Tuned so a resting hand is quiet
(88% of jitter removed) without the sludge that a plain low-pass produces: a brisk sweep lags **11.8
ms**, under a frame. The first tuning had a 1.5 Hz fixed cutoff and 126 ms of lag — unusable, and
caught by a test that measures lag rather than by eye. Press **S** to toggle it off and feel the
difference.

The shot packet carries **its own coordinates** rather than relying on the last aim packet having
arrived, which removes one class of "I hit it but it said miss".

## Latency budget

Where the time goes, from the phone's pose to lit pixels:

| Stage | Measured | Notes |
|---|---|---|
| Pose → aim packet sent | ~4 ms (simulated) | maths is sub-millisecond; mostly frame timing |
| Transport | 0.9 ms mean / 2.6 ms p95 | loopback; expect single-digit ms on Wi-Fi |
| Packet → pixels | 6–7 ms | one display frame, plus filter settling |
| Panel | unmeasurable from here | typically 10–30 ms on a TV, more in some game-less picture modes |

Everything we control sits inside one 60 Hz frame. Tell players to put the TV in **Game Mode** — that
is likely the largest single term in the budget and it is not ours.

## What this deliberately is not

No accounts, no cloud, no analytics, no persistence beyond a high score in `localStorage`, no
monetisation, no locomotion, no second game. The protocol is player-indexed from the start (two
crosshairs render today) so multiplayer is not blocked, but it is untested with real hardware.
