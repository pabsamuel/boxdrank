# Deploying BoxdRank (DigitalOcean Droplet + Docker + Caddy)

BoxdRank uses SQLite, so it needs a host with a **persistent disk** — a Droplet,
not App Platform (which wipes local files on every deploy). Caddy gives
automatic HTTPS, which X requires to render the rank-card preview.

You do the cloud steps (create the Droplet, set DNS); the server does the rest
with two commands.

---

## 1. Create the Droplet

DigitalOcean → **Create → Droplets**
- **Image:** Ubuntu 24.04 LTS
- **Type:** Basic · Regular · **$12/mo (2 GB / 1 CPU)** — $6/1 GB also works but 2 GB
  gives headroom for image generation + scraping.
- **Datacenter:** closest to your audience (e.g. **Frankfurt / FRA1** for Europe/TR).
- **Authentication:** add your **SSH key** (not password).
- Create, then copy the Droplet's **public IP**.

> Tip: pick the **Docker** Marketplace image instead of plain Ubuntu and Docker
> comes pre-installed — then skip the Docker install in step 3.

---

## 2. Point the domain at the Droplet (name.com)

name.com → your domain → **Manage DNS Records**. Add:

| Type | Host | Answer / Value      | TTL |
|------|------|---------------------|-----|
| A    | `@`  | `<your Droplet IP>` | 300 |
| A    | `www`| `<your Droplet IP>` | 300 |

Remove any conflicting parking/forwarding records. DNS can take a few minutes to
an hour to propagate. Check with: `nslookup boxdrank.app`.

> Caddy can only issue the SSL cert **after** DNS points here, so do this before
> step 5.

---

## 3. SSH in + install Docker

```bash
ssh root@<your Droplet IP>

# (skip if you used the Docker Marketplace image)
curl -fsSL https://get.docker.com | sh

# open the firewall (if ufw is active)
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

---

## 4. Clone the repo + create secrets

```bash
git clone https://github.com/pabsamuel/boxdrank.git
cd boxdrank

# Create the .env (NEVER committed). Generate a real SECRET_KEY:
cat > .env <<EOF
SECRET_KEY=$(openssl rand -hex 32)
TMDB_API_KEY=PASTE_YOUR_TMDB_V3_KEY_HERE
EOF

nano .env   # paste your TMDB key, save (Ctrl-O, Enter, Ctrl-X)
```

`BOXDRANK_DOMAIN`, `BOXDRANK_DB_PATH` and `FLASK_DEBUG` are already set in
`docker-compose.yml` — you only need `SECRET_KEY` and `TMDB_API_KEY` in `.env`.

---

## 5. Launch

```bash
docker compose up -d --build
```

Caddy will fetch the Let's Encrypt cert automatically (give it ~30s). Watch logs:

```bash
docker compose logs -f caddy   # look for "certificate obtained"
docker compose logs -f app
```

---

## 6. Verify

- Visit **https://boxdrank.app** — should load over HTTPS.
- Paste a `https://boxdrank.app/u/<username>` link into the X composer — the rank
  card should appear as the preview (this only works on the live HTTPS domain).
- Look up a profile; the leaderboards/cards should populate (the DB starts empty
  in production and fills as people search).

---

## Updating after a code change

```bash
cd boxdrank && git pull && docker compose up -d --build
```

The leaderboard (SQLite on the `boxdrank-data` volume) survives rebuilds.

## Backups

```bash
# copy the live DB off the volume
docker compose cp app:/data/boxdrank.db ./boxdrank-backup-$(date +%F).db
```

## Notes
- The DB lives on the `boxdrank-data` Docker volume — don't `docker compose down -v`
  (the `-v` deletes volumes and wipes the leaderboard).
- Actor/director photos come from Wikimedia first (free); TMDB fills the gaps and
  needs `TMDB_API_KEY`. Without it those few faces show initials.
- If the GitHub repo is private, clone with a token:
  `git clone https://<token>@github.com/pabsamuel/boxdrank.git`.
