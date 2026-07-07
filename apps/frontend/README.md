# Story Creator — Frontend

Vite + React SPA for the Story Creator app. Reads/writes stories via Convex real-time queries and talks to the FastAPI backend to trigger story generation.

## Local development

```bash
npm install
# create .env.local in this directory with VITE_CONVEX_URL (see below)
npm run dev
```

Open [http://localhost:3001](http://localhost:3001). In dev, `vite.config.js` proxies `/api/*` requests to `http://localhost:8000` (the local backend) — no extra config needed.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `VITE_CONVEX_URL` | Yes | Your Convex deployment URL (from `npx convex dev`). |
| `VITE_API_URL` | Only in production | Base URL of the deployed FastAPI backend (e.g. `https://story-creator-xknk.onrender.com`). Leave unset locally — requests fall back to relative `/api/*` paths, handled by the Vite dev proxy. |

Note: your Google AI Studio API key is entered in-app (Settings → API Key) and sent per-request via the `X-Google-Api-Key` header — it isn't an env var.

## Deployment (Render — Static Site)

- **Root Directory:** `apps/frontend`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`
- Set both env vars above in the Render dashboard. Without `VITE_API_URL`, requests go to the frontend's own static host instead of the backend and fail with an empty response (`res.json()` throws "Unexpected end of JSON input").
- Vite bakes env vars in at build time — changing them requires a redeploy/rebuild, not just a dashboard save.
