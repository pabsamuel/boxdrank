# How a trend gets into the app

The single most important product question, and the one with the most legal rope to hang ourselves with. There are three lanes. We build all three; we never build a fourth.

## Lane 1 — Share from the platform (the "it just works" path)

The user is scrolling TikTok/Reels/Shorts, sees the trend, taps **Share → TrendGhost**. The video lands in the app and processing starts. From the user's point of view this *is* "the app gets it automatically" — one tap, no file managers, no downloads folder.

What makes it legitimate: the *platform's own share affordance* does the exporting, with the creator's own download/share settings respected. We receive a file the user's OS handed us. We are not fetching anything from anyone's servers.

How it's built (this is implemented — `public/sw.js`, `src/storage/sharedMedia.ts`):

- **Web (PWA)**: a [Web Share Target](https://developer.mozilla.org/docs/Web/Manifest/share_target) entry in the manifest accepting **`video/*` and `image/*`** — dances and photo poses arrive the same way. The OS POSTs the file to `/share-target`; the service worker handles that POST.
- **The file is parked in Cache Storage, not in a variable.** This matters more than it looks: the normal case is the app being *closed* when the user taps Share, and the browser may kill the service worker between receiving the POST and the page loading. An in-memory handoff loses the file exactly when people would actually use the feature. The worker writes the file to a cache entry, redirects to `/?shared=1`, and the page reads it back and deletes it, so a shared file is consumed exactly once and never replays on a refresh.
- The app then goes **straight into ingest and starts processing by itself** — no picker, no extra tap.
- Requires the app to be **installed to the home screen**; that's what registers the share target. The UI says so, and says something different once it detects it is installed.
- **iOS Safari has no Web Share Target.** iOS users use Lane 2, and the UI tells them that plainly rather than showing an option that does nothing.
- **Native (later)**: a proper share extension, which works on both. One of the strongest arguments for the native port in `DECISIONS.md` D1.

Covered by two end-to-end tests (`e2e/smoke.spec.ts`): a real multipart POST to `/share-target` with the app closed lands on the ingest screen and starts work, and a shared file is consumed once rather than replayed on every reload.

Where the platform allows it, the user can also use the platform's own "save video" option first, then Lane 2.

## Lane 2 — Pick from the camera roll

A plain file picker. Always available, works everywhere, no platform cooperation needed. This is the fallback for iOS and for videos the user filmed themselves (a friend doing the trend, a dance class, their own earlier take).

## Lane 3 — Built-in template pack (the "templates of viral trends" idea)

A library of routines shipped with the app, so a new user has something to try in the first 30 seconds without hunting for a video.

**The content must be ours.** Two acceptable ways to fill it:

1. **We film it.** A dancer performs the move *pattern* — the steps, not a copy of a specific creator's video — and we own that footage outright.
2. **We license it**, in writing, from the creator.

A dance *step sequence* itself is generally not protectable in the way a specific recorded video is (short routines have repeatedly failed to get copyright protection in the US), but the recording, the music and the creator's likeness absolutely are. So: our own dancer, our own or licensed music, our own recording. Then the template pack ships as ordinary app content, and the pose timelines are just data we generated.

**Pose-timeline-only sharing.** A timeline is a list of joint coordinates — no video, no audio, no likeness. Users can export and swap these freely ("send me the timeline for that trend"), and a recipient practises against a *skeleton* ghost with no video layer. Weaker experience, zero rights problem. This is also how a future community library works without hosting a single frame of anyone's video.

## The fourth lane we never build

**Pasting a link and having the app fetch the video.** No URL input, no embedded downloader, no yt-dlp, no scraping, no "just for testing" version of it. It breaks every platform's terms of service, it strips the creator's download controls, and it is the single fastest way to get the app pulled from both stores and the developer account banned. `CLAUDE.md` rule 5 and `RISKS.md` R1 exist to stop a future session from "helpfully" adding it.

If a user asks for it, the honest answer in the UI is: *"Use the share button in the app you're watching it in — we can't download other people's videos for you."*

## What we store, in all three lanes

| Thing | Where it lives | Leaves the device? |
| --- | --- | --- |
| Source video | OPFS, on the user's phone | Never |
| Pose timeline (JSON) | IndexedDB | Only if the user exports it |
| Recorded takes | OPFS | Only if the user exports/shares |
| Template pack | Bundled with the app | It's ours to ship |
