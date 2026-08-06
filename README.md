# Peleg Trading Desk

Daily portfolio dashboard + calendar archive for swing trading.

## What it is

- **Daily page:** Flex/CSV/OCR import, open positions, manual stops, live marks, portfolio heat, game plan, soft pre-flight watchlist, TradingView daily charts (SPY/QQQ + tickers)
- **Calendar page:** saved days for review
- **Cloud sync (optional):** Auth0 free tier + MongoDB Atlas via a thin API
- **Local mode:** works without keys (browser storage) until you add credentials

## Quick start (local mode)

```bash
npm install
npm run dev
```

Open the Vite URL. No Auth0/Atlas required.

## Architecture (production)

| Piece | Host |
|--------|------|
| Frontend | GitHub Pages |
| API | [Render](https://render.com) free Web Service (`render.yaml`) |
| DB | MongoDB Atlas M0 |
| Auth | Auth0 free SPA |

## Cloud sync setup

### 1) MongoDB Atlas

1. Create a free cluster + database user
2. **Network Access:** allow `0.0.0.0/0` (Render free tier outbound IPs change) or your current IP for local only
3. Copy connection string as `MONGODB_URI`

### 2) Auth0

1. Create a **Single Page Application**
2. Create an **API** (audience e.g. `https://peleg-trading-api`)
3. Allowed callback / logout / web origins:
   - `http://localhost:5173`
   - your GitHub Pages URL (e.g. `https://<user>.github.io/<repo>/`)
4. Optional: Actions → add `email` claim to access tokens if using email allowlist

### 3) Deploy API on Render

1. Push this repo to GitHub
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select repo (uses `render.yaml`)
   - Or **New Web Service** → root directory `server`, build `npm install`, start `npm start`, health `/health`
3. Set env vars on the service:

| Key | Example |
|-----|---------|
| `MONGODB_URI` | `mongodb+srv://...` |
| `AUTH0_DOMAIN` | `YOUR_TENANT.auth0.com` |
| `AUTH0_AUDIENCE` | `https://peleg-trading-api` |
| `ALLOWED_USERS` | `you@example.com` (optional) |

4. Deploy → copy the service URL, e.g. `https://peleg-trading-api.onrender.com`
5. Check `https://<your-service>.onrender.com/health` → `"ok": true` (and `"mongo": true` when Atlas is reachable)

> Free tier sleeps after ~15 minutes idle. First request after sleep can take 30–60s.

### 4) Point GitHub Pages at the API

In the GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|--------|--------|
| `VITE_API_URL` | `https://peleg-trading-api.onrender.com` (no trailing slash) |
| `VITE_AUTH0_DOMAIN` | same as Auth0 domain |
| `VITE_AUTH0_CLIENT_ID` | SPA client id |
| `VITE_AUTH0_AUDIENCE` | `https://peleg-trading-api` |

Push to `master` (or run the **Deploy to GitHub Pages** workflow). The build injects these into the static site.

### 5) Local env files

Root `.env` (frontend):

```env
VITE_API_URL=http://localhost:8787
VITE_AUTH0_DOMAIN=YOUR_TENANT.auth0.com
VITE_AUTH0_CLIENT_ID=YOUR_SPA_CLIENT_ID
VITE_AUTH0_AUDIENCE=https://peleg-trading-api
```

`server/.env`:

```env
PORT=8787
MONGODB_URI=mongodb+srv://...
AUTH0_DOMAIN=YOUR_TENANT.auth0.com
AUTH0_AUDIENCE=https://peleg-trading-api
ALLOWED_USERS=you@example.com
```

### 6) Run locally

```bash
npm run install:all
npm run dev:api
npm run dev
```

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Frontend |
| `npm run dev:api` | API server |
| `npm run build` | Production frontend build |
| `npm run install:all` | Install root + server deps |

## Notes

- Flex/CSV is the daily book; stops are manual; marks can be refreshed live
- Pre-Flight sizer is soft (editable risk, watchlist builder — not a lockout gate)
- Old cockpit file `peleg_trading_cockpit_os_base.tsx` is kept for reference but no longer mounted
