import io
import wave
import logging
import requests
from gtts import gTTS
from google.genai import types

logger = logging.getLogger("story_creator")

# Always use Puck — upbeat, warm, works across all genres/ages.
# Pricing is per character on gemini-2.5-flash-preview-tts, not per voice,
# so this choice saves nothing on its own, but skipping the narration-agent
# LLM call (which previously selected the voice) saves one full API round-trip.
_GEMINI_TTS_VOICE = "Puck"



def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 24000) -> bytes:
    """Wrap raw 16-bit mono PCM bytes in a WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


def generate_tts_mp3(text: str, voice_name: str, client=None) -> tuple[bytes, str]:
    """Generate TTS audio. Returns (audio_bytes, mime_type).

    Tries Gemini TTS (natural storyteller voices) first when a client is
    provided, then falls back to gTTS.
    """
    if client is not None:
        gemini_voice = _GEMINI_TTS_VOICE
        logger.info(
            f"[TTS] Attempting Gemini TTS — voice='{gemini_voice}', text length={len(text)} chars."
        )
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=gemini_voice
                            )
                        )
                    ),
                ),
            )
            part = response.candidates[0].content.parts[0]
            if part.inline_data and part.inline_data.data:
                pcm_data = part.inline_data.data
                wav_bytes = _pcm_to_wav(pcm_data)
                logger.info(
                    f"[TTS] Gemini TTS succeeded — {len(wav_bytes):,} bytes WAV "
                    f"(mime_type: {part.inline_data.mime_type})."
                )
                return wav_bytes, "audio/wav"
            else:
                logger.warning(
                    "[TTS] Gemini TTS returned a response but contained no audio data. "
                    f"Candidates: {response.candidates}. Falling back to gTTS."
                )
        except Exception as e:
            logger.warning(
                f"[TTS] Gemini TTS failed with {type(e).__name__}: {e}. "
                "Falling back to gTTS.",
                exc_info=True,
            )
    else:
        logger.info("[TTS] No GenAI client provided — skipping Gemini TTS, using gTTS directly.")

    # --- gTTS fallback (free, no API key required) ---
    logger.info(f"[TTS] Generating gTTS audio — text length={len(text)} chars.")
    try:
        tts = gTTS(text=text, lang="en", slow=False)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        mp3_bytes = fp.getvalue()
        logger.info(f"[TTS] gTTS succeeded — {len(mp3_bytes):,} bytes MP3.")
        return mp3_bytes, "audio/mpeg"
    except Exception as e:
        logger.error(
            f"[TTS] gTTS with TLD '{tld}' failed: {e}. Retrying with default US accent.",
            exc_info=True,
        )
        tts = gTTS(text=text, lang="en", slow=False)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        return fp.getvalue(), "audio/mpeg"


def generate_svg_illustration(client, prompt: str) -> bytes:
    """Use Gemini to generate a beautiful, responsive SVG illustration for the story."""
    logger.info(f"[SVG] Generating SVG fallback illustration — prompt='{prompt[:80]}...'")
    sys_instruction = (
        "You are an expert graphic designer who creates beautiful vector illustrations for kids' bedtime storybooks. "
        "Generate a single, complete, and valid SVG XML string representing the scene. "
        "Design rules:\n"
        "- Use vibrant pastel colors, soft gradients, and friendly cartoon vector shapes.\n"
        "- Include a nice background landscape or sky.\n"
        "- Do NOT draw any text or letters.\n"
        "- Make it responsive using viewBox='0 0 800 600' (no fixed width or height attributes).\n"
        "- Output ONLY the raw valid SVG XML content within an xml code block. No explanations, no markdown other than the block."
    )
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[f"Create an SVG illustration representing this scene: {prompt}"],
            config={
                "system_instruction": sys_instruction,
                "temperature": 0.7,
            },
        )

        text = response.text or ""
        if "```xml" in text:
            svg_content = text.split("```xml")[1].split("```")[0]
        elif "```svg" in text:
            svg_content = text.split("```svg")[1].split("```")[0]
        elif "```" in text:
            svg_content = text.split("```")[1].split("```")[0]
        else:
            svg_content = text

        svg_content = svg_content.strip()

        if not svg_content.startswith("<svg"):
            start_idx = svg_content.find("<svg")
            if start_idx != -1:
                svg_content = svg_content[start_idx:]
            else:
                logger.warning("[SVG] Response did not contain a valid <svg> tag. Using minimal fallback SVG.")
                svg_content = (
                    '<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">'
                    '<rect width="100%" height="100%" fill="#e0f7fa"/>'
                    '<circle cx="400" cy="300" r="150" fill="#ffb74d"/>'
                    "</svg>"
                )

        logger.info(f"[SVG] SVG generation succeeded — {len(svg_content):,} chars.")
        return svg_content.encode("utf-8")
    except Exception as e:
        logger.error(f"[SVG] SVG illustration generation failed: {e}", exc_info=True)
        fallback_svg = (
            '<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">'
            '<rect width="100%" height="100%" fill="#f3e5f5"/>'
            '<circle cx="400" cy="300" r="100" fill="#ba68c8"/>'
            "</svg>"
        )
        return fallback_svg.encode("utf-8")


def upload_to_convex(convex_url: str, file_bytes: bytes, mime_type: str) -> str:
    """Upload file bytes to Convex storage and return the storageId."""
    logger.info(
        f"[Upload] Uploading {len(file_bytes):,} bytes (mime='{mime_type}') to Convex..."
    )
    try:
        base_url = convex_url.rstrip("/")

        # 1. Request an upload URL
        mutation_url = f"{base_url}/api/mutation"
        res = requests.post(
            mutation_url,
            json={"path": "stories:generateUploadUrl", "args": {}},
            timeout=15,
        )
        res.raise_for_status()

        res_json = res.json()
        if res_json.get("status") != "success":
            raise ValueError(f"Convex generateUploadUrl failed: {res_json}")

        upload_url = res_json.get("value")
        if not upload_url:
            raise ValueError("No upload URL returned from Convex.")

        # 2. Upload the file
        upload_res = requests.post(
            upload_url,
            data=file_bytes,
            headers={"Content-Type": mime_type},
            timeout=60,
        )
        upload_res.raise_for_status()

        upload_json = upload_res.json()
        storage_id = upload_json.get("storageId")
        if not storage_id:
            raise ValueError(f"Convex upload did not return a storageId: {upload_json}")

        logger.info(f"[Upload] Convex upload succeeded — storageId={storage_id}.")
        return storage_id
    except Exception as e:
        logger.error(f"[Upload] Convex upload failed: {e}", exc_info=True)
        raise e
