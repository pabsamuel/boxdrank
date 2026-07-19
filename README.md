<div align="center">
  <h1>🎬 BoxdRank</h1>
  <p><strong>Competitive ranks for Letterboxd cinephiles</strong></p>
  <p>Connect your Letterboxd → Get your cinematic rank → Climb the leaderboard</p>
  
  <br/>
  
  ![Python](https://img.shields.io/badge/Python-3.10+-3776ab?style=flat-square&logo=python&logoColor=white)
  ![Flask](https://img.shields.io/badge/Flask-3.1-000000?style=flat-square&logo=flask)
  ![License](https://img.shields.io/badge/License-MIT-00e054?style=flat-square)
</div>

---

## What is BoxdRank?

BoxdRank analyzes your public Letterboxd profile and assigns you a competitive rank — from **Iron** all the way to **Challenger**. Think of it as a fun way to see how your film-watching stacks up.

### Features

🏆 **10-Tier Ranking System** — Iron → Bronze → Silver → Gold → Platinum → Emerald → Diamond → Master → Grandmaster → Challenger

🎬 **Cinematic Rank Reveal** — Full-screen animated rank reveal with particle effects, custom SVG emblems, and LP counter

📊 **Detailed Stats** — Films watched, average rating, reviews, lists, followers, and more

🏅 **Global Leaderboard** — See how you rank against other cinephiles worldwide

𝕏 **X Integration** — Link your X account and share your rank

🖼️ **Shareable Rank Cards** — Download or share your rank card image

---

## How Ranking Works

Your rank is calculated from a composite score (max ~1000 points) based on:

| Category | Max Points | What Counts |
|----------|-----------|-------------|
| Films Watched | 300 | Total films in your diary |
| Average Rating | 200 | Your average star rating |
| Reviews Written | 150 | Number of reviews |
| Films This Year | 150 | Activity in the current year |
| Lists Created | 100 | Number of curated lists |
| Followers | 100 | Community influence |

Each tier has 4 divisions (IV → I) plus LP (League Points) for granular progress.

---

## Tech Stack

- **Backend**: Python / Flask
- **Frontend**: Vanilla HTML/CSS/JS (single-page app)
- **Database**: SQLite (leaderboard storage)
- **Data**: Letterboxd profile scraping (no API required)
- **Images**: Pillow (rank card generation)
- **Server**: Gunicorn (production)

---

## Local Development

### Prerequisites
- Python 3.10+
- pip

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/boxdrank.git
cd boxdrank

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the development server
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
FLASK_ENV=development
FLASK_DEBUG=true
PORT=5000
SECRET_KEY=your-secret-key
```

---

## Deployment (DigitalOcean)

### Option 1: App Platform (Recommended)

1. Push your code to GitHub
2. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
3. Connect your GitHub repo
4. Set the run command: `gunicorn app:app --bind 0.0.0.0:8000 --workers 2 --timeout 120`
5. Set environment variables (`FLASK_ENV=production`, `SECRET_KEY=...`)
6. Deploy!

### Option 2: Docker on a Droplet

```bash
# Build
docker build -t boxdrank .

# Run
docker run -d -p 8000:8000 \
  -e FLASK_ENV=production \
  -e SECRET_KEY=your-secret-key \
  -v boxdrank-data:/app \
  boxdrank
```

### Domain Setup (Namecheap)

1. Buy your domain on Namecheap
2. In Namecheap DNS settings, add an **A record** pointing to your DigitalOcean IP
3. Or use **CNAME** if using App Platform (DigitalOcean provides the target)
4. Enable HTTPS via DigitalOcean's free SSL

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rank/<username>` | Get rank for a Letterboxd user |
| GET | `/api/card/<username>` | Generate rank card image |
| GET | `/api/leaderboard` | Paginated leaderboard |
| GET | `/api/leaderboard/search?q=` | Search leaderboard |
| GET | `/api/leaderboard/stats` | Aggregate statistics |
| POST | `/api/connect-x` | Link X handle to username |
| GET | `/health` | Health check |

---

## Also in this repository

Besides BoxdRank (this directory), the repo hosts two standalone Shopify
apps, each self-contained with its own README, deployment guide, tests,
and CI workflow:

- [`airsync/`](airsync/) — **AirSync**: syncs Shopify orders & products
  into a merchant's Airtable base in near real-time
- [`notionsync/`](notionsync/) — **NotionSync**: the same connector for
  Notion databases

---

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <p>Not affiliated with Letterboxd. Built for the culture 🎥</p>
</div>
