# Story Creator — Architecture & Developer Guide

## Diagrams

Two D2 diagrams live in this folder. To render them:

```bash
# Install D2 (macOS)
brew install d2

# Render to SVG
d2 architecture.d2 architecture.svg
d2 agent-pipeline.d2 agent-pipeline.svg

# Or render to PNG
d2 --scale 2 architecture.d2 architecture.png
d2 --scale 2 agent-pipeline.d2 agent-pipeline.png

# Live preview in browser
d2 --watch architecture.d2
```

| Diagram | File | What it shows |
|---|---|---|
| System Architecture | `architecture.d2` | All components, layers, and connections |
| Agent Pipeline | `agent-pipeline.d2` | The 5 ADK agents and what each one does |

---

## System Overview

Story Creator is a full-stack AI app that generates personalised bedtime stories for children. A user picks a genre and age group, the backend runs a multi-agent AI pipeline, and the result — story text, narration audio, cover illustration, and a storyboard — is saved to a real-time database and shown instantly in the browser.

```
User Browser  →  FastAPI Backend  →  Google AI (Gemini / Imagen / Veo / TTS)
                                 →  Convex (DB + File Storage)
                      ↑
              Convex SDK (real-time)
```

---

## Step-by-Step: What Happens When You Click "Create Story"

### Step 1 — User Input (Frontend)
The user selects a **genre** (Nature, Animals, Cars, Toys, Mythology, Space), an **age group** (Under 3, 3–5, 6–8, 8+), and an optional free-text **prompt** with character names or details. The API key stored in `localStorage` is read and attached to the request.

### Step 2 — HTTP Request (Frontend → Backend)
`App.jsx` sends:
```
POST /api/generate
Content-Type: application/json
X-Google-Api-Key: AIza...

{ "genre": "Cars", "ageGroup": "6 to 8", "prompt": "A red car named Ruby" }
```

### Step 3 — Multi-Agent Pipeline (Backend)
`main.py` calls `asyncio.to_thread(run_story_creator_pipeline, ...)` to run the blocking pipeline in a thread pool so the FastAPI event loop stays free. The pipeline runs 5 ADK agents sequentially — see **Agent Details** below.

### Step 4 — TTS Narration (Backend → gTTS)
`generate_tts_mp3()` uses Google Text-to-Speech (gTTS) to produce an MP3 of the story. The voice accent is chosen by the narration agent:

| Voice | Accent | Best for |
|---|---|---|
| gentle narrator | British | Toddlers, sleep, nature |
| excited storyteller | US | Ages 3–5, toys, cars |
| adventure guide | Australian | Ages 6–8, animals, action |
| wise elder | Indian | Ages 8+, mythology, morals |

### Step 5a — Cover Image (Backend → Imagen 3)
`generate_cover_image()` calls `client.models.generate_images()` with model `imagen-3.0-generate-001` and the cover prompt produced by Agent 4. Returns a PNG at 4:3 aspect ratio.

**Fallback:** If Imagen is not enabled in your AI Studio account (returns 404), `generate_svg_illustration()` calls Gemini 2.5 Flash to produce a full SVG vector illustration instead.

> **Note on Imagen:** To get high-quality PNG cover images, you must enable the **Imagen** API in your [Google AI Studio](https://aistudio.google.com/app/apikey) account. Without it, the app automatically falls back to Gemini-generated SVG illustrations.

### Step 5b — Storyboard Illustrations (Backend → Gemini SVG)
For each of the 3 storyboard scenes produced by Agent 5, `generate_svg_illustration()` prompts Gemini 2.5 Flash to generate a complete, responsive SVG (`viewBox="0 0 800 600"`) in pastel cartoon style.

### Step 5c — Video (Backend → Veo 3.1, optional)
If `VEO_ENABLED=true` in the backend `.env`, `generate_veo_video()` calls `client.models.generate_videos()` with model `veo-3.1-fast-generate-001`. It uses the cover image as the first frame and polls `client.operations.get()` until done.

### Step 6 — Upload to Convex Storage
Each generated file (MP3, PNG/SVG cover, 3× SVG storyboard, optional MP4) is uploaded to **Convex File Storage** via a two-step process:
1. `stories:generateUploadUrl` mutation returns a pre-signed upload URL.
2. The file bytes are PUT to that URL.
3. Convex returns a `storageId` string used as a foreign key in the DB.

### Step 7 — Save to Convex Database
`stories:addStory` mutation inserts one row into the `stories` table with all text fields, optional storage IDs, and the storyboard array.

### Step 8 — Real-time Update (Convex → Frontend)
The frontend uses `useQuery(api.stories.list)` from the Convex React SDK. Convex pushes the updated story list to the browser the moment `addStory` commits. The `list` query resolves every `storageId` to a public HTTPS URL before returning.

### Step 9 — Render (Frontend)
The Story Library grid re-renders with the new card. Clicking it opens the **Book Viewer** which shows:
- The cover image (or storyboard carousel if storyboard scenes are available)
- Story text and moral
- Audio player bar with play/pause

---

## Agent Details

All 5 agents are defined in `apps/backend/app/agent.py` using **Google Agent Development Kit (ADK)**. Each agent is a stateless `Agent` object with a fixed `instruction`, a Pydantic `output_schema`, and an `output_key`. They do not share state — the pipeline wires them together manually by passing parsed output from one as input to the next.

Every agent call is wrapped with `tenacity` exponential-backoff retry (up to 4 attempts, 3–30 s wait) and a model fallback chain: `gemini-2.5-flash → gemini-2.0-flash → gemini-2.0-flash-lite`.

---

### Agent 1 — `story_generator`

| Property | Value |
|---|---|
| Model | gemini-2.5-flash |
| Temperature | 0.7 |
| Output schema | `StoryOutput` |

**What it does:** Writes a 150–200 word (≈ 2 minute) bedtime story grounded in the selected genre and age group. Draws inspiration from Panchatantra tales, Tinkle comics, and Hindu mythology to embed character virtues. Every story ends with exactly one moral value chosen from: **friendship, trust, respect, kindness, honesty, courage, empathy, gratitude, perseverance, or forgiveness**.

**Output:**
```json
{
  "title": "Ruby's Kind Act",
  "story_text": "Ruby the red car zoomed along...",
  "moral": "True friendship means helping others without expecting anything back."
}
```

---

### Agent 2 — `story_reviewer`

| Property | Value |
|---|---|
| Model | gemini-2.5-flash |
| Temperature | 0.1 |
| Output schema | `ReviewOutput` |

**What it does:** Acts as a children's content safety reviewer. Reads the generated title and story text and checks for adult content, foul language, scary or violent themes, or off-topic material. If the story fails the check, the pipeline appends the reason to the prompt and re-runs Agent 1 (up to 2 total attempts). If both attempts fail, the pipeline raises a `ValueError`.

**Output:**
```json
{
  "is_safe": true,
  "reason": "Story is age-appropriate, positive, and free of harmful content.",
  "suggested_modifications": ""
}
```

---

### Agent 3 — `story_narration`

| Property | Value |
|---|---|
| Model | gemini-2.5-flash |
| Temperature | 0.2 |
| Output schema | `NarrationOutput` |

**What it does:** Reads the safe story text and age group, then selects the best narrator voice from 4 options. The selected voice name is later mapped by `generate_tts_mp3()` to a regional gTTS accent.

**Output:**
```json
{
  "voice_name": "adventure guide",
  "reason": "Action-oriented Cars story for ages 6-8 suits the bold Australian accent."
}
```

---

### Agent 4 — `cover_generator`

| Property | Value |
|---|---|
| Model | gemini-2.5-flash |
| Temperature | 0.5 |
| Output schema | `CoverPromptOutput` |

**What it does:** Acts as an art director. Reads the story and writes a rich, detailed text prompt for Imagen 3 to generate a cover illustration. The prompt specifies characters, expressions, setting, style (pastel watercolor cartoon), and emotional mood. This prompt is also re-used as the fallback SVG prompt if Imagen is unavailable.

**Output:**
```json
{
  "image_prompt": "A warm pastel watercolor illustration of Ruby, a cheerful red sports car with big friendly eyes...",
  "scene_description": "Ruby and Benny driving side-by-side at sunset, Ruby sharing fuel."
}
```

---

### Agent 5 — `video_generator`

| Property | Value |
|---|---|
| Model | gemini-2.5-flash |
| Temperature | 0.5 |
| Output schema | `VideoPromptOutput` |

**What it does:** Acts as a storyboard artist. Reads the story and designs:
1. A **Veo 3.1 video prompt** describing the mood, motion, and style of an 8-second animated clip.
2. **Exactly 3 storyboard scenes** — beginning, turning point, and resolution — each with a detailed SVG illustration prompt and a narrative excerpt from the story.

These scene prompts are later used to generate the 3 SVG storyboard images shown in the Book Viewer carousel.

**Output:**
```json
{
  "video_prompt": "Smooth cartoon animation, Ruby zooming on a highway...",
  "storyboard_scenes": [
    { "scene_number": 1, "image_prompt": "Ruby zooming alone on a sunny highway...", "narrative_segment": "Ruby loved to race..." },
    { "scene_number": 2, "image_prompt": "Ruby stopping beside stranded Benny...", "narrative_segment": "Then she saw Benny..." },
    { "scene_number": 3, "image_prompt": "Ruby and Benny driving together into the sunset...", "narrative_segment": "Together they drove on..." }
  ]
}
```

---

## Database — Convex

Story Creator uses **Convex** as its serverless database and file storage backend. Convex provides real-time reactivity: when `addStory` is called, every browser that has `useQuery(api.stories.list)` open receives the new row within milliseconds without any polling.

### `stories` Table Schema

```typescript
stories: defineTable({
  // Text content
  title:          v.string(),
  genre:          v.string(),
  ageGroup:       v.string(),
  storyText:      v.string(),
  moral:          v.string(),
  voiceName:      v.optional(v.string()),
  createdAt:      v.number(),             // Unix timestamp ms

  // Convex Storage IDs (resolved to URLs by the list query)
  coverImageId:      v.optional(v.string()),   // PNG or SVG
  narrationAudioId:  v.optional(v.string()),   // MP3
  videoStorageId:    v.optional(v.string()),   // MP4

  // Storyboard — 3 scenes with individual storage IDs
  storyboard: v.optional(v.array(v.object({
    scene_number:      v.number(),
    narrative_segment: v.string(),
    imageId:           v.string(),   // SVG storage ID
  }))),
})
```

### Mutations

| Mutation | Purpose |
|---|---|
| `stories:generateUploadUrl` | Returns a pre-signed URL to upload a file directly to Convex Storage |
| `stories:addStory` | Inserts a new story row with all fields and storyboard array |
| `stories:remove` | Deletes a story by ID |

### Queries

| Query | Purpose |
|---|---|
| `stories:list` | Returns all stories ordered newest-first. Resolves every `storageId` to a public HTTPS URL before returning. Also expands the `storyboard[]` array by resolving each `imageId`. |

### File Storage

All media files are uploaded to Convex Storage (not a separate S3 bucket). The workflow is:
1. Backend calls `generateUploadUrl` mutation → gets a signed PUT URL.
2. Backend uploads the raw bytes with the correct `Content-Type`.
3. Convex returns a `storageId` (opaque string).
4. The `storageId` is stored in the DB row.
5. The `list` query calls `ctx.storage.getUrl(storageId)` at read time to produce a public URL.

---

## API Key — How It Works in the Frontend

> The Google API key is **never stored on the server**. It lives only in the user's browser and is sent with each request.

### Flow

1. The user opens **Settings** and enters their Google AI Studio key (`AIza...`).
2. The key is saved to `localStorage` under the key `sc_google_api_key`.
3. On every `POST /api/generate` call, the frontend reads it from `localStorage` and sends it as the `X-Google-Api-Key` HTTP header.
4. The FastAPI backend reads the header in the endpoint signature:
   ```python
   x_google_api_key: Optional[str] = Header(None, alias="X-Google-Api-Key")
   ```
5. `get_genai_client(api_key=x_google_api_key)` initialises `genai.Client(api_key=key)`.
6. The key is used for the duration of that single request and not persisted anywhere server-side.

### Fallback Order (Backend)

If no key is in the header, the backend falls back in this order:
1. `GOOGLE_API_KEY` environment variable in `apps/backend/.env`
2. Vertex AI (if `GOOGLE_CLOUD_PROJECT` env var is set)
3. Raises `ValueError` — request fails with HTTP 500

### Getting a Key

Get a free key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

For **Imagen 3** cover images to work, you must additionally enable the Imagen API in your project at [AI Studio](https://aistudio.google.com/app/apikey). Without Imagen access the app automatically falls back to Gemini-generated SVG illustrations.

---

## Environment Variables

### Backend (`apps/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_API_KEY` | No (user provides via UI) | Fallback API key if not sent in header |
| `CONVEX_URL` | Yes | Your Convex deployment URL (e.g. `https://xxx.convex.cloud`) |
| `VEO_ENABLED` | No | Set to `true` to enable Veo 3.1 video generation (disabled by default) |
| `GOOGLE_CLOUD_PROJECT` | No | GCP project ID for Vertex AI mode |
| `GOOGLE_CLOUD_LOCATION` | No | GCP region (default: `global`) |

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Convex React SDK |
| Backend | Python 3.14, FastAPI, Uvicorn |
| AI Agents | Google ADK (Agent Development Kit) |
| LLM | Gemini 2.5 Flash / 2.0 Flash |
| Image generation | Imagen 3.0 (PNG) + Gemini SVG fallback |
| Video generation | Veo 3.1 (optional) |
| Text-to-speech | gTTS (Google TTS) |
| Database | Convex (serverless, real-time) |
| File storage | Convex Storage |
| Monorepo | Turborepo |
| Retry logic | tenacity (exponential backoff) |
| Schema validation | Pydantic v2 |
