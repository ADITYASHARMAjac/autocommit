# 🚀 AutoCommit AI Agent (Render Deployable)

An autonomous Git agent that leverages **NVIDIA Nemotron-3 Ultra** (`nvidia/nemotron-3-ultra`) to generate 5 high-value engineering insights and automatically commits & pushes them to your GitHub repository **3 times daily**.

Equipped with a **Live Glassmorphic Control Dashboard**, real-time countdown timer, manual trigger button, and `/health` monitoring for 24/7 continuous hosting on [Render](https://render.com).

---

## ✨ Features

- 🧠 **NVIDIA Nemotron-3 Ultra AI**: Automatically generates 5 distinct, punchy software engineering and architecture insights for every commit.
- ⏰ **3x Daily Automated Schedule**: Pre-configured cron schedule (`0 9,14,20 * * *`) firing at 9:00 AM, 2:00 PM, and 8:00 PM (configurable timezone & cron expression).
- ☁️ **Render-Optimized Push Engine**: Uses GitHub's REST Contents API directly — no local git repositories, SSH keys, or persistent disks required. Perfect for Render's ephemeral containers.
- 🎛️ **Live Web Dashboard**:
  - Live status pills and countdown timer to the next scheduled commit.
  - One-click **"Commit & Push Now"** button for immediate testing.
  - Live preview of generated 5 lines and direct link to view the commit on GitHub.
  - Real-time event log terminal.
- 💓 **Render Keep-Alive**: Built-in `/health` endpoint to keep Render's free tier awake 24/7 using services like UptimeRobot or CronJob.org.

---

## 📋 Prerequisites

Before deploying, ensure you have:
1. **NVIDIA Nemotron-3 Ultra API Key**: [build.nvidia.com](https://build.nvidia.com)
2. **GitHub Personal Access Token (PAT)**: [github.com/settings/tokens](https://github.com/settings/tokens)
3. A **GitHub Repository** where the commits will be pushed (e.g. `your-username/my-daily-log`).

---

## 🔑 1. Getting Your API Keys

### A. NVIDIA Nemotron-3 Ultra API Key
1. Go to [NVIDIA NIM Catalog](https://build.nvidia.com).
2. Search for **Nemotron-3 Ultra** (or Nemotron models).
3. Click **"Get API Key"** and copy your key (starts with `nvapi-...`).

### B. GitHub Personal Access Token (PAT)
1. Go to GitHub **Settings** → **Developer Settings** → **Personal Access Tokens** → **Tokens (classic)** (or Fine-grained tokens).
2. Generate a new token with:
   - **`repo`** (Full control of private repositories / repo contents write).
3. Copy the token (starts with `ghp_...`).

---

## 🌐 2. Deploying to Render (Step-by-Step)

### Option A: 1-Click Blueprint Deploy (Recommended)
1. Push this repository to your GitHub account.
2. Log into [Render Dashboard](https://dashboard.render.com).
3. Click **"New +"** → **"Blueprint"**.
4. Connect this GitHub repository. Render will automatically detect [`render.yaml`](./render.yaml).
5. When prompted, fill in your secret environment variables:
   - `NEMOTRON_API_KEY` (or `AI_API_KEY`): Your NVIDIA Nemotron API key (`nvapi-...`).
   - `GITHUB_TOKEN`: Your GitHub token (`ghp_...`).
   - `GITHUB_REPO`: Your target repository (`username/repo-name`).
6. Click **"Apply"**. Render will build and launch your agent in under 2 minutes!

### Option B: Manual Web Service Setup on Render
1. Go to [Render Dashboard](https://dashboard.render.com) and click **"New +"** → **"Web Service"**.
2. Connect your repository.
3. Configure the following settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
4. Under **"Environment Variables"**, add:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `NEMOTRON_API_KEY` | `nvapi-xxxxxxxxxxxx` | Your NVIDIA Nemotron 3 Ultra API Key |
| `AI_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b` | Target Nemotron model |
| `GITHUB_TOKEN` | `ghp_xxxxxxxxxxxx` | GitHub Personal Access Token |
| `GITHUB_REPO` | `your-user/your-repo` | Target repo to push commits to |
| `GITHUB_BRANCH` | `main` | Branch to commit to |
| `TARGET_FILE_PATH` | `daily-log.md` | Target file for 5 lines |
| `CRON_SCHEDULE` | `0 9,14,20 * * *` | 3 times daily cron |
| `CRON_TIMEZONE` | `UTC` | Your timezone (e.g. `Asia/Kolkata`) |

5. Click **"Deploy Web Service"**.

---

## ⚡ 3. Keeping Render Free Tier Awake 24/7

Render's free web services sleep after 15 minutes of inactivity. To ensure your 3x daily schedule runs without interruption:

1. Create a free account at [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com).
2. Add a new monitor / cron job targeting your Render URL's health endpoint:
   ```
   https://your-service-name.onrender.com/health
   ```
3. Set the interval to **every 10 or 14 minutes**.
4. That's it! Your agent will remain active 24/7 and execute all 3 scheduled commits reliably every single day.

---

## 💻 4. Running Locally

To test locally on your machine:

1. Clone your repo:
   ```bash
   git clone https://github.com/your-username/auto-commit-agent.git
   cd auto-commit-agent
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your AI_API_KEY and GITHUB_TOKEN
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open your browser at `http://localhost:3000` to access the Control Dashboard and click **"Commit & Push Now"**!

---

## 📁 Repository Structure

```
├── public/
│   ├── index.html       # Glassmorphic control dashboard UI
│   ├── style.css        # Modern dark-mode styling & animations
│   └── app.js           # Real-time polling, countdown, trigger logic
├── src/
│   ├── server.js        # Express web server & API endpoints
│   ├── scheduler.js     # 3x daily cron scheduler (node-cron)
│   ├── commitAgent.js   # Orchestrator for commit cycles & history
│   ├── aiService.js     # NVIDIA Nemotron Ultra 5-line generator
│   ├── githubService.js # Direct GitHub REST API committer & pusher
│   └── logger.js        # Activity buffer & terminal stream
├── .env.example         # Template for environment configuration
├── .gitignore           # Git ignore list
├── package.json         # Scripts and project dependencies
├── render.yaml          # Render Blueprint for automated deployment
└── README.md            # Complete documentation
```

---

## 🛡️ License

MIT License. Free to use and customize!
