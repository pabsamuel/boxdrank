# Running and deploying TrendGhost

## First run (once per clone)

```bash
npm install
npm run fetch-models     # ~15 MB of MediaPipe models into public/models (gitignored)
npm run verify           # format + typecheck + lint + unit tests
npm run dev -- --host    # dev server on your LAN
```

## Getting it onto your phone

The camera needs a **secure context**: HTTPS, or `localhost`. A plain
`http://192.168.x.x:5173` will load the page and then refuse the camera, and the app
will tell you so rather than failing silently.

Three ways, easiest first:

1. **Deploy it** (recommended — see below). Any HTTPS URL works and it takes a minute.
2. **Tunnel the dev server**: `npx localtunnel --port 5173` or `cloudflared tunnel --url http://localhost:5173`. You get an HTTPS URL that proxies to your machine, so hot reload still works.
3. **Chrome flag, Android only**: open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<your-ip>:5173`, relaunch. Development only — never ask a real user to do this.

Then **Add to Home Screen**. On Android this also registers the share target, so
TrendGhost appears in TikTok's share sheet (`docs/product/CONTENT_SOURCING.md` lane 1).
iOS Safari has no Web Share Target — iPhone users save the video to their camera roll
and pick it from the app, until there's a native build.

## Deploying

It's a static site. `npm run build` produces `dist/`, which any static host serves:

```bash
npm run build
npx vercel deploy dist --prod      # or: netlify deploy --dir dist --prod
```

Two requirements for whatever host you pick:

- **HTTPS** (mandatory — camera).
- Serve `/models/*.task` with a long cache lifetime; they're ~15 MB and never change.

Because `public/models/` is gitignored, your host's build command must run
`npm run fetch-models && npm run build`, or you commit the models to a release
artifact. Do not commit them to git.

## Tests

```bash
npm run verify     # unit tests: the scoring fixtures and the cue engine
npm run test:e2e   # Playwright smoke tests in a real browser with a fake camera
```

The e2e suite needs a Chromium. If yours isn't where Playwright expects it,
point at it: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## What still needs a human

See `OWNER_ACTIONS.md`. The short version before any public launch: a real privacy
policy reviewed by a person, and a decision on the template pack (film it or license
it). Nothing there blocks using the app yourself.
