import os
import time
import uuid
import asyncio
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import requests
from dotenv import load_dotenv
from google.genai import types

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("story_creator")

from app.agent import run_story_creator_pipeline, get_genai_client
from app.utils import generate_tts_mp3, generate_svg_illustration, upload_to_convex

app = FastAPI(
    title="Story Creator: Where Imagination Comes Alive",
    description=(
        "API backend for the kid-friendly Bedtime Story app. "
        "Provides multi-agent pipelines for generating, reviewing, narrating, and illustrating bedtime stories."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory job store  {job_id: {status, error, storyId, title}}
# ---------------------------------------------------------------------------

_jobs: dict[str, dict] = {}

# ---------------------------------------------------------------------------
# API Schemas
# ---------------------------------------------------------------------------

class StoryRequest(BaseModel):
    genre: str = Field(description="Story genre (Nature, Animals, Cars, Toys, etc.)")
    ageGroup: str = Field(description="Target age group (Less than 3, From 3 to 5, 6 to 8, above 8)")
    prompt: Optional[str] = Field(None, description="Optional custom topics, character names, or settings")
    imageMode: str = Field("ai", description="'ai' (Nano Banana) or 'svg' (free, fast)")
    durationSeconds: int = Field(20, description="Target story reading duration in seconds (20–300)")
    enableVeo: bool = Field(False, description="Generate a Veo 3.1 video clip — incurs extra API cost (~$0.35–0.50 per clip)")
    videoDurationSeconds: int = Field(5, description="Video duration in seconds (4–8, only used if enableVeo=true)")

class JobCreateResponse(BaseModel):
    jobId: str
    status: str = "pending"

class StoryboardFrame(BaseModel):
    scene_number: int
    narrative_segment: str
    imageUrl: str

class StoryResponse(BaseModel):
    status: str
    id: str
    title: str
    genre: str
    ageGroup: str
    storyText: str
    moral: str
    voiceName: str
    coverImageUrl: Optional[str] = None
    narrationAudioUrl: Optional[str] = None
    videoUrl: Optional[str] = None
    storyboard: list[StoryboardFrame] = []

# ---------------------------------------------------------------------------
# Image generation helpers
# ---------------------------------------------------------------------------

_IMAGE_GEN_TIMEOUT_SECONDS = 30


def generate_cover_image(client, prompt: str) -> Optional[bytes]:
    """Imagen 3 — only when IMAGEN_ENABLED=true."""
    if os.getenv("IMAGEN_ENABLED") != "true":
        return None
    t0 = time.time()
    try:
        logger.info(f"[Image/Imagen3] Generating — prompt='{prompt[:80]}…'")
        result = client.models.generate_images(
            model="imagen-3.0-generate-001",
            prompt=prompt,
            config=dict(number_of_images=1, output_mime_type="image/png", aspect_ratio="4:3")
        )
        for gen_img in result.generated_images:
            img_bytes = gen_img.image.image_bytes
            logger.info(f"[Image/Imagen3] Success — {len(img_bytes):,} bytes in {time.time()-t0:.2f}s.")
            return img_bytes
        logger.warning("[Image/Imagen3] No images in response.")
        return None
    except Exception as e:
        logger.warning(f"[Image/Imagen3] Failed: {type(e).__name__}: {e}")
        return None


def generate_gemini_flash_image(client, prompt: str) -> Optional[bytes]:
    """Nano Banana (gemini-2.5-flash-image) with hard timeout."""
    t0 = time.time()
    logger.info(f"[Image/NanaBanana] Generating — prompt='{prompt[:80]}…', timeout={_IMAGE_GEN_TIMEOUT_SECONDS}s.")

    def _call():
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=prompt,
            config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
        )
        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                return part.inline_data.data
        return None

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_call)
        try:
            result = future.result(timeout=_IMAGE_GEN_TIMEOUT_SECONDS)
            elapsed = time.time() - t0
            if result:
                logger.info(f"[Image/NanaBanana] Success — {len(result):,} bytes in {elapsed:.2f}s.")
                return result
            logger.warning(f"[Image/NanaBanana] No image parts after {elapsed:.2f}s.")
            return None
        except FuturesTimeoutError:
            logger.warning(f"[Image/NanaBanana] Timed out after {_IMAGE_GEN_TIMEOUT_SECONDS}s.")
            return None
        except Exception as e:
            logger.warning(f"[Image/NanaBanana] Failed: {type(e).__name__}: {e}")
            return None


def generate_veo_video(client, prompt: str, image_bytes: Optional[bytes], duration_seconds: int = 5, force: bool = False) -> Optional[bytes]:
    if not force and os.getenv("VEO_ENABLED") != "true":
        return None
    # Clamp duration to Veo's valid range: 4-8 seconds
    duration_seconds = max(4, min(8, duration_seconds))
    t0 = time.time()
    try:
        logger.info(f"[Video/Veo] Generating — prompt='{prompt[:80]}…' ({duration_seconds}s)")
        image = types.Image(image_bytes=image_bytes, mime_type="image/png") if image_bytes else None
        operation = client.models.generate_videos(
            model="veo-3.1-generate-preview",
            prompt=prompt,
            image=image,
            config=types.GenerateVideosConfig(duration_seconds=duration_seconds, number_of_videos=1),
        )
        while not operation.done:
            time.sleep(2)
            operation = client.operations.get(operation)
        if operation.result and operation.result.generated_videos:
            video_obj = operation.result.generated_videos[0].video
            video_bytes = video_obj.video_bytes if video_obj else None
            if not video_bytes and video_obj and video_obj.uri:
                video_bytes = client.files.download(file=video_obj)
            if video_bytes:
                logger.info(f"[Video/Veo] Success — {len(video_bytes):,} bytes in {time.time()-t0:.2f}s.")
                return video_bytes
            else:
                logger.warning(f"[Video/Veo] No video bytes in response")
                return None
        return None
    except Exception as e:
        logger.warning(f"[Video/Veo] Failed: {type(e).__name__}: {e}")
        return None

# ---------------------------------------------------------------------------
# Background pipeline
# ---------------------------------------------------------------------------

async def _run_pipeline(job_id: str, request: StoryRequest, api_key: Optional[str]):
    """Full story creation pipeline — runs as a FastAPI background task."""
    pipeline_start = time.time()
    logger.info(f"[Job/{job_id}] Starting — {request.model_dump()}")

    convex_url = os.getenv("CONVEX_URL")
    if not convex_url:
        _jobs[job_id] = {"status": "failed", "error": "CONVEX_URL not configured.", "storyId": None, "title": None}
        return

    try:
        # Step 1 — Multi-agent pipeline (3 LLM calls: generate, review, cover prompt)
        t1 = time.time()
        duration = max(20, min(request.durationSeconds, 300))
        pipeline_data = await asyncio.to_thread(
            run_story_creator_pipeline,
            genre=request.genre,
            age_group=request.ageGroup,
            user_prompt=request.prompt,
            api_key=api_key,
            duration_seconds=duration,
        )
        logger.info(f"[Job/{job_id}] Step 1 done in {time.time()-t1:.2f}s — '{pipeline_data['title']}'")

        client = get_genai_client(api_key=api_key)

        # Step 2 — TTS + Cover image (concurrent)
        t2 = time.time()

        async def _gen_tts():
            return await asyncio.to_thread(
                generate_tts_mp3,
                pipeline_data["story_text"],
                pipeline_data["voice_name"],
                client,
            )

        async def _gen_cover():
            mode = request.imageMode
            cover_prompt = pipeline_data["cover_prompt"]
            if mode == "svg":
                logger.info("[Image/Cover] SVG mode — skipping AI generation.")
                svg_bytes = await asyncio.to_thread(generate_svg_illustration, client, cover_prompt)
                return svg_bytes, "image/svg+xml"

            img_bytes = await asyncio.to_thread(generate_cover_image, client, cover_prompt)
            if img_bytes:
                return img_bytes, "image/png"

            img_bytes = await asyncio.to_thread(generate_gemini_flash_image, client, cover_prompt)
            if img_bytes:
                return img_bytes, "image/png"

            raise RuntimeError(
                "Nano Banana (gemini-2.5-flash-image) returned no image and Imagen 3 is not enabled. "
                "Check your API quota or switch to SVG mode."
            )

        try:
            tts_result, cover_result = await asyncio.gather(_gen_tts(), _gen_cover())
        except RuntimeError as img_err:
            logger.error(f"[Job/{job_id}] AI image failed: {img_err}")
            _jobs[job_id] = {"status": "failed", "error": str(img_err), "storyId": None, "title": pipeline_data["title"]}
            return

        audio_bytes, audio_mime = tts_result
        cover_bytes, cover_mime = cover_result
        logger.info(f"[Job/{job_id}] Step 2 done in {time.time()-t2:.2f}s.")

        # Step 3 — Upload TTS + cover image
        narration_audio_id = None
        cover_image_id = None
        try:
            narration_audio_id = upload_to_convex(convex_url, audio_bytes, audio_mime)
        except Exception as e:
            logger.error(f"[Job/{job_id}] TTS upload failed: {e}")
        try:
            cover_image_id = upload_to_convex(convex_url, cover_bytes, cover_mime)
        except Exception as e:
            logger.error(f"[Job/{job_id}] Cover upload failed: {e}")

        # Step 4 — Video (opt-in via UI or VEO_ENABLED env var)
        video_storage_id = None
        veo_requested = request.enableVeo or os.getenv("VEO_ENABLED") == "true"
        if veo_requested:
            video_bytes = generate_veo_video(
                client,
                pipeline_data.get("cover_prompt", ""),
                cover_bytes if cover_mime == "image/png" else None,
                duration_seconds=request.videoDurationSeconds,
                force=True,
            )
            if video_bytes:
                try:
                    video_storage_id = upload_to_convex(convex_url, video_bytes, "video/mp4")
                except Exception as e:
                    logger.error(f"[Job/{job_id}] Video upload failed: {e}")

        # Step 5 — Build storyboard using cover image (no per-scene generation)
        storyboard_frames = [
            {"scene_number": s["scene_number"], "narrative_segment": s["narrative_segment"], "imageId": cover_image_id}
            for s in pipeline_data["storyboard_scenes"]
            if cover_image_id
        ]

        # Step 6 — Save to Convex
        args = {
            "title": pipeline_data["title"],
            "genre": request.genre,
            "ageGroup": request.ageGroup,
            "storyText": pipeline_data["story_text"],
            "moral": pipeline_data["moral"],
            "voiceName": pipeline_data["voice_name"],
            "coverImageId": cover_image_id,
            "narrationAudioId": narration_audio_id,
            "videoStorageId": video_storage_id,
            "storyboard": storyboard_frames if storyboard_frames else None,
        }
        payload = {
            "path": "stories:addStory",
            "args": {k: v for k, v in args.items() if v is not None},
        }
        mutation_url = f"{convex_url.rstrip('/')}/api/mutation"
        db_res = requests.post(mutation_url, json=payload, timeout=15)
        db_res.raise_for_status()
        db_json = db_res.json()
        if db_json.get("status") != "success":
            raise ValueError(f"Convex addStory failed: {db_json}")

        story_id = db_json.get("value")
        total = time.time() - pipeline_start
        logger.info(f"[Job/{job_id}] COMPLETE in {total:.2f}s — story_id={story_id}")
        _jobs[job_id] = {"status": "completed", "error": None, "storyId": story_id, "title": pipeline_data["title"]}

    except Exception as e:
        logger.error(f"[Job/{job_id}] Pipeline error: {e}", exc_info=True)
        _jobs[job_id] = {"status": "failed", "error": str(e), "storyId": None, "title": None}

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/generate", response_model=JobCreateResponse, tags=["Stories"])
async def generate_story(
    request: StoryRequest,
    background_tasks: BackgroundTasks,
    x_google_api_key: Optional[str] = Header(None, alias="X-Google-Api-Key"),
):
    """Submit a story creation job. Returns immediately with a jobId to poll."""
    if not os.getenv("CONVEX_URL"):
        raise HTTPException(status_code=500, detail="Backend configuration error: CONVEX_URL is not set.")

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "pending", "error": None, "storyId": None, "title": None}
    background_tasks.add_task(_run_pipeline, job_id, request, x_google_api_key)
    logger.info(f"[Job/{job_id}] Queued — genre={request.genre}, duration={request.durationSeconds}s, imageMode={request.imageMode}")
    return JobCreateResponse(jobId=job_id)


@app.get("/api/job/{job_id}", tags=["Stories"])
async def get_job_status(job_id: str):
    """Poll for job status. Status: pending | completed | failed."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {"jobId": job_id, **job}


@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "timestamp": time.time(), "active_jobs": len(_jobs)}
