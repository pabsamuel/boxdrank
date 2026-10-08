# Deploying LIGHTGUN

Hosting exists to delete the setup problems, not to add a feature. Locally the phone has to
reach the laptop: same network, a self-signed certificate to tap through, a firewall hole, and
the right network adapter guessed out of several. Hosted, both devices open the same URL and
none of that applies.

What it costs: aim packets travel to the host and back instead of across the room. On a LAN the
transport is under 3 ms; over the internet expect tens. The diagnostics overlay (**D**) reports
transport separately from render time, so you can see the real number rather than guess.

---

## Railway

This repository holds several unrelated projects, so the one setting that matters is the root
directory.

1. **New Project → Deploy from GitHub repo →** `pabsamuel/boxdrank`
2. **Settings → Source:**
   - **Root Directory:** `lightgun`  ← without this, Railway builds the wrong project
   - **Branch:** `claude/light-gun-arcade-prototype-ta4fqo` (or `main` once the PR is merged)
3. Railway finds `railway.json` and builds `Dockerfile`. Nothing else to configure — `PORT` is
   injected by Railway and is what switches the server into hosted mode.
4. **Settings → Networking → Generate Domain.**
5. Open the domain on the laptop. Scan the QR with the phone. That is the whole setup.

Health check is `/healthz`; it is already in `railway.json`.

### Environment variables

None are required. One is occasionally useful:

| Variable | When you need it |
|---|---|
| `LG_PUBLIC_ORIGIN` | Only if a proxy rewrites the `Host` header, so the display cannot work out its own public URL. Set it to e.g. `https://lightgun.up.railway.app`. |

`PORT` is set by the platform — do not set it yourself.

---

## Render, Fly, or any container host

`render.yaml` is included for Render (same idea: root directory `lightgun`). Anything that runs a
container works:

```bash
docker build -t lightgun .
docker run -p 8080:8080 -e PORT=8080 lightgun
```

The only requirements are that the platform terminates TLS (WebXR and iOS motion access both
refuse to run otherwise) and that it passes WebSocket traffic through, which all of the above do.

---

## Checking a deploy

```
GET /healthz        → ok
GET /               → redirects to /display/
GET /api/info       → {"hosted":true, ...}
```

If `hosted` is `false`, `PORT` did not reach the process and it is trying to run the local path
with a self-signed certificate — the phone will then be told to use a LAN address it cannot reach.

If the deploy reports unhealthy but the logs look fine, check the logs for
`could not start: listen EADDRINUSE` — in hosted mode the server binds the port it was given or
exits, deliberately, rather than quietly moving to another port where nothing would find it.

---

## What hosting does not change

The relay stays dumb: rooms and forwarding, no accounts, no database, no game state. It is
rate-limited and frame-capped because a public URL attracts traffic that is not a light gun
(`node tests/relay.js` covers both the abuse cases and that real play passes untouched), and room
codes are six random characters so a stranger cannot stumble into your session.

Aiming still runs entirely on the phone. Only normalised `(x, y)` crosses the network, which is
why hosting adds transport latency but does not change the aiming maths at all.
