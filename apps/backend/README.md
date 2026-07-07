# Story Creator — Backend

FastAPI service that runs the Google ADK multi-agent pipeline (story generation, safety review, narration, cover art, and storyboard/video) and pushes results to Convex.

## Local development

```bash
uv sync
# create .env in this directory with the variables below
uv run uvicorn app.main:app --reload --port 8000
```

Docs available at [http://localhost:8000/docs](http://localhost:8000/docs).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_API_KEY` | Yes, unless using Vertex AI | Google AI Studio key. Can also be supplied per-request via the `X-Google-Api-Key` header. |
| `CONVEX_URL` | Yes | App raises a 500 on `/api/generate` if unset. |
| `GOOGLE_CLOUD_PROJECT` | Only for Vertex AI | Used instead of `GOOGLE_API_KEY`. |
| `GOOGLE_CLOUD_LOCATION` | No | Defaults to `"global"`. |
| `IMAGEN_ENABLED` | No | `true`/`false` — gates Imagen 3 cover art. |
| `VEO_ENABLED` | No | `true`/`false` — gates Veo 3.1 video generation. |

## Deployment (Render)

- **Root Directory:** `apps/backend`
- **Build Command:** `uv sync --frozen && uv cache prune --ci`
- **Start Command:** `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Set the env vars above in the Render dashboard.
- Free-tier instances spin down after ~15 min idle. A Render Cron Job pinging `GET /health` every 10 minutes keeps it warm; the alternative is upgrading to the Starter instance for always-on.

## API

See [the root README](../../README.md#api-reference) for the request/response shape of `POST /api/generate`, `GET /api/job/{job_id}`, and `GET /health`.
