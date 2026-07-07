import os
import logging
from pydantic import BaseModel, Field
from google.adk.agents import Agent
from google import genai
from google.genai import types
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
    before_sleep_log,
)

logger = logging.getLogger("story_creator")

# ---------------------------------------------------------------------------
# Model fallback chain — tried in order on persistent 503 / quota errors
# ---------------------------------------------------------------------------

_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]

# ---------------------------------------------------------------------------
# Pydantic Schemas for Structured Outputs
# ---------------------------------------------------------------------------

class StoryOutput(BaseModel):
    title: str = Field(description="The title of the bedtime story")
    story_text: str = Field(description="The main narrative text matching the exact word count requested in the prompt (kid friendly, engaging, age-appropriate)")
    moral: str = Field(description="The moral lesson taught by the story, chosen from human values such as friendship, trust, respect, kindness, honesty, courage, empathy, gratitude, perseverance, or forgiveness")

class ReviewOutput(BaseModel):
    is_safe: bool = Field(description="True if the story is safe and appropriate for kids")
    reason: str = Field(description="Reason for approval or details of safety violations found")
    suggested_modifications: str = Field(description="Suggestions to make the story safe if it failed")

class CoverPromptOutput(BaseModel):
    image_prompt: str = Field(description="A detailed prompt for a beautiful, warm, child-friendly illustration using Imagen 3")
    scene_description: str = Field(description="A brief description of the cover illustration")

# ---------------------------------------------------------------------------
# Retry / fallback logic
# ---------------------------------------------------------------------------

def _is_retryable(exc: BaseException) -> bool:
    msg = str(exc)
    return any(token in msg for token in ("503", "UNAVAILABLE", "429", "quota", "overloaded"))


@retry(
    retry=retry_if_exception(_is_retryable),
    wait=wait_exponential(multiplier=1, min=3, max=30),
    stop=stop_after_attempt(4),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _call_model(client, model: str, contents, config):
    """Single model call wrapped with exponential-backoff retry."""
    return client.models.generate_content(model=model, contents=contents, config=config)


def _call_with_fallback(client, contents, config) -> object:
    """Try each model in _MODELS in order; falls back on persistent 503/quota errors."""
    last_exc: Exception = RuntimeError("No models available in fallback chain.")
    for model in _MODELS:
        try:
            logger.info(f"Calling model: {model}")
            return _call_model(client, model, contents, config)
        except Exception as exc:
            logger.warning(f"Model {model} failed after retries: {exc}. Trying next model…")
            last_exc = exc
    raise last_exc

# ---------------------------------------------------------------------------
# ADK Agent Definitions
# ---------------------------------------------------------------------------

def create_story_agents():
    model_name = _MODELS[0]

    story_gen = Agent(
        name="story_generator",
        model=model_name,
        instruction=(
            "You are a professional children's book author. Write a short, engaging bedtime story based on the selected genre and age group.\n\n"

            "STYLE REFERENCES — always draw from these sources:\n"
            "1. tell-a-tale.com — warm, imaginative stories with vivid animal and nature characters, gentle humour, "
            "simple sentence structures, and a satisfying emotional resolution. Stories feel like they were written "
            "by a loving storyteller sitting beside the child. Each scene is visual and sensory.\n"
            "2. ekdali.com Indian mythology & folklore collection — stories rooted in Panchatantra, Jataka Tales, "
            "Ramayana, Mahabharata, Akbar-Birbal, and Tenali Raman traditions. Characters are clever, courageous, "
            "or kind animals/people who face a clear dilemma and resolve it through wisdom or virtue. "
            "Cultural details (forest kingdoms, wise sages, talking animals, river settings) add richness without "
            "being overwhelming for young readers.\n\n"

            "WRITING RULES:\n"
            "- IMPORTANT: Write to the EXACT word count specified in the user's prompt — no more, no less.\n"
            "- Age-appropriate vocabulary: simple words for Under 3 and Ages 3–5; richer language for 6–8 and 8+.\n"
            "- Open with a vivid scene-setting sentence that pulls the child in immediately.\n"
            "- Introduce one lovable main character with a clear personality trait.\n"
            "- Build a small conflict or challenge that mirrors a real childhood feeling (loneliness, fear, jealousy, curiosity).\n"
            "- Resolve it warmly — the child character or animal earns the lesson through action, not lecture.\n"
            "- Close with one quiet, satisfying sentence (bedtime tone — peaceful, hopeful).\n"
            "- Each story must teach exactly one moral value: "
            "friendship, trust, respect, kindness, honesty, courage, empathy, gratitude, perseverance, or forgiveness.\n\n"

            "Output must be structured as JSON matching the StoryOutput schema."
        ),
        output_schema=StoryOutput,
        output_key="story",
    )

    story_reviewer = Agent(
        name="story_reviewer",
        model=model_name,
        instruction=(
            "You are a children's content safety reviewer. Analyze the provided story text and title. "
            "Ensure there is no adult content, foul language, scary themes, or off-topic material. "
            "The story must be safe, educational, and appropriate for kids. "
            "Output must be structured as JSON matching the ReviewOutput schema."
        ),
        output_schema=ReviewOutput,
        output_key="review",
    )

    cover_gen = Agent(
        name="cover_generator",
        model=model_name,
        instruction=(
            "You are an art director for a children's publisher. Read the bedtime story and generate a detailed prompt "
            "for generating a beautiful, warm, child-friendly cover illustration using Imagen 3. "
            "The prompt should describe colors, main character, setting, and style (e.g. pastel, soft water-color cartoon). "
            "Output must be structured as JSON matching the CoverPromptOutput schema."
        ),
        output_schema=CoverPromptOutput,
        output_key="cover",
    )

    return story_gen, story_reviewer, cover_gen

# ---------------------------------------------------------------------------
# GenAI Client Resolver
# ---------------------------------------------------------------------------

def get_genai_client(api_key: str = None):
    """Priority: caller-supplied key > GOOGLE_API_KEY env var > Vertex AI."""
    key = api_key or os.getenv("GOOGLE_API_KEY")
    if key:
        source = "request header" if api_key else "GOOGLE_API_KEY env var"
        logger.info(f"Initializing GenAI Client in AI Studio mode using {source}.")
        return genai.Client(api_key=key)

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
    if project:
        logger.info(f"Initializing GenAI Client in Vertex AI mode for project {project}.")
        return genai.Client(vertexai=True, project=project, location=location)

    raise ValueError(
        "No API key provided. Supply your Google AI Studio key via the app Settings, "
        "or set GOOGLE_API_KEY in the backend .env file."
    )

# ---------------------------------------------------------------------------
# Programmatic Pipeline Runner
# ---------------------------------------------------------------------------

def run_story_creator_pipeline(
    genre: str,
    age_group: str,
    user_prompt: str = None,
    api_key: str = None,
    duration_seconds: int = 20,
) -> dict:
    """Run the multi-agent bedtime story creator pipeline — 3 LLM calls only."""
    # ~130 wpm kids narration pace; minimum 35 words for very short stories
    word_count = max(35, round((duration_seconds / 60) * 130))
    logger.info(
        f"Starting pipeline — genre: {genre}, age: {age_group}, "
        f"duration: {duration_seconds}s, target words: {word_count}"
    )

    story_gen, story_reviewer, cover_gen = create_story_agents()
    client = get_genai_client(api_key=api_key)

    # 1. Story Generation (up to 2 safety-retry attempts)
    story_result = None
    story_input = (
        f"Write a bedtime story of exactly {word_count} words. "
        f"Genre: {genre}. Age group: {age_group}."
    )
    if user_prompt:
        story_input += f" Incorporate: {user_prompt}"

    for attempt in range(2):
        logger.info(f"Story generation attempt {attempt + 1}…")
        resp = _call_with_fallback(
            client,
            contents=[story_input],
            config=types.GenerateContentConfig(
                system_instruction=story_gen.instruction,
                response_mime_type="application/json",
                response_schema=StoryOutput,
                temperature=0.7,
            ),
        )
        try:
            story_result = StoryOutput.model_validate_json(resp.text)
            logger.info(f"Generated story: '{story_result.title}' ({len(story_result.story_text.split())} words)")

            # 2. Safety Review
            review_resp = _call_with_fallback(
                client,
                contents=[f"Title: {story_result.title}\nStory Text:\n{story_result.story_text}"],
                config=types.GenerateContentConfig(
                    system_instruction=story_reviewer.instruction,
                    response_mime_type="application/json",
                    response_schema=ReviewOutput,
                    temperature=0.1,
                ),
            )
            review_result = ReviewOutput.model_validate_json(review_resp.text)
            logger.info(f"Review: is_safe={review_result.is_safe} — {review_result.reason}")

            if review_result.is_safe:
                break
            else:
                story_input += (
                    f"\nNote: Previous attempt failed safety check ({review_result.reason}). "
                    "Rewrite it to be 100% kid-safe."
                )
                story_result = None
        except Exception as e:
            logger.error(f"Error on attempt {attempt + 1}: {e}")
            story_result = None

    if not story_result:
        raise ValueError("Failed to generate a safe bedtime story after all attempts.")

    # 3. Cover illustration prompt
    cover_resp = _call_with_fallback(
        client,
        contents=[f"Story Title: {story_result.title}\nStory Text:\n{story_result.story_text}"],
        config=types.GenerateContentConfig(
            system_instruction=cover_gen.instruction,
            response_mime_type="application/json",
            response_schema=CoverPromptOutput,
            temperature=0.5,
        ),
    )
    cover_prompt_result = CoverPromptOutput.model_validate_json(cover_resp.text)
    logger.info(f"Cover prompt: '{cover_prompt_result.image_prompt[:80]}…'")

    # Split story text into 3 scene segments (no extra LLM call needed)
    words = story_result.story_text.split()
    n = len(words)
    b = [0, n // 3, 2 * n // 3, n]
    scenes = []
    for i in range(3):
        segment = " ".join(words[b[i]:b[i + 1]])
        scenes.append({
            "scene_number": i + 1,
            "narrative_segment": segment,
            "image_prompt": (
                f"{cover_prompt_result.image_prompt} "
                f"Depict this specific moment from the story: {segment[:220]}"
            ),
        })

    return {
        "title": story_result.title,
        "story_text": story_result.story_text,
        "moral": story_result.moral,
        "voice_name": "excited storyteller",  # Always maps to Puck — cheapest, no agent call needed
        "cover_prompt": cover_prompt_result.image_prompt,
        "storyboard_scenes": scenes,
    }
