# Story Creator — Where Imagination Comes Alive

A kid-friendly bedtime story app built with Google ADK multi-agent pipelines, Convex real-time database, and a Vite React frontend. Submitted for the Kaggle Capstone challenge.

---

## Architecture

```
story-creator/                  ← Turborepo monorepo root
├── apps/
│   ├── frontend/               ← Vite React SPA (Convex hooks, Vanilla CSS)
│   └── backend/                ← Python FastAPI + Google ADK agents
└── convex/                     ← Convex schema, queries, mutations
```

### Multi-Agent Pipeline (Google ADK)

Five sequential ADK agents power each story:

| Agent | Model | Role |
|---|---|---|
| **Story Generator** | Gemini 2.5 Flash | Writes a 300–500 word bedtime story with a moral |
| **Story Reviewer** | Gemini 2.5 Flash | Safety-checks the content for kids |
| **Narration Director** | Gemini 2.5 Flash | Selects the best narrator voice |
| **Cover Art Director** | Gemini 2.5 Flash + Imagen 3 | Generates a cover illustration (SVG fallback) |
| **Storyboard Artist** | Gemini 2.5 Flash + Veo 3.1 | Designs a video / animated storyboard |

### Tech Stack

- **Frontend:** Vite + React 18, Convex React hooks, Vanilla CSS (no component library)
- **Backend:** FastAPI, Google ADK, Google GenAI SDK (Gemini / Imagen / Veo), gTTS
- **Database & Storage:** Convex (real-time queries, file storage for audio / image / video)
- **Monorepo:** Turborepo

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+, [`uv`](https://github.com/astral-sh/uv)
- A Google AI Studio API key (`GOOGLE_API_KEY`)

### 1 — Install dependencies

```bash
# Root — installs turbo + frontend deps
npm install

# Backend
cd apps/backend
uv sync
```

### 2 — Configure Convex

```bash
# From the repo root
npx convex dev
```

Copy the printed deployment URL (e.g. `https://happy-otter-123.convex.site`) and paste it into:

- `apps/backend/.env` → `CONVEX_URL=<your-url>`
- `apps/frontend/.env.local` → `VITE_CONVEX_URL=<your-url>`

### 3 — Seed sample stories

Run the seed mutation once (optional — gives you two demo stories before generating):

```bash
npx convex run stories:seed
```

### 4 — Configure the backend

Edit `apps/backend/.env`:

```env
GOOGLE_API_KEY=<your-ai-studio-key>
CONVEX_URL=<your-convex-url>
VEO_ENABLED=false          # set to true to enable Veo video generation
```

### 5 — Start all services

**Terminal 1 — Convex dev server (keep running)**
```bash
npx convex dev
```

**Terminal 2 — FastAPI backend**
```bash
cd apps/backend
uv run uvicorn app.main:app --reload --port 8000
```

**Terminal 3 — Vite frontend**
```bash
cd apps/frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## API Reference

The FastAPI server exposes Swagger docs at [http://localhost:8000/docs](http://localhost:8000/docs).

### `POST /api/generate`

```json
{
  "genre": "Nature",
  "ageGroup": "From 3 to 5",
  "prompt": "A brave fox named Arjun who loves to paint"
}
```

**Response** includes `title`, `storyText`, `moral`, `voiceName`, `coverImageUrl`, `narrationAudioUrl`, `videoUrl`, and a `storyboard` array.

### `GET /health`

Returns `{ "status": "ok" }`.

---

## Graceful Fallbacks

| Feature | Primary | Fallback |
|---|---|---|
| Cover image | Imagen 3 (PNG) | Gemini-generated SVG illustration |
| Video | Veo 3.1 (MP4) | 3-scene storyboard with SVG frames |
| Narration | gTTS (regional accent) | Standard US accent gTTS |

---

## Project Highlights

- **Safety-first:** Every story passes through the Story Reviewer agent before any assets are generated. Unsafe content triggers an automatic rewrite attempt.
- **Always works:** All three asset types (image, video, audio) have graceful fallbacks so the app never shows a blank card.
- **Real-time updates:** Convex subscriptions push new stories to all connected clients instantly — no polling required.
- **Kid-friendly UI:** Night-sky glassmorphism theme, large touch targets, animated story cards, and an integrated audio player.
