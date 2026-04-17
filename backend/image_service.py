"""Image generation service — creates 500×500 transparent PNG overlays for OBS."""
from __future__ import annotations

import io
import logging
import os
import re
import threading
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

SPRITE_CACHE_DIR = Path(__file__).parent / ".sprite_cache"
_lock = threading.Lock()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _ensure_dirs() -> None:
    SPRITE_CACHE_DIR.mkdir(exist_ok=True)


def _poke_slug(species: str) -> str:
    """Normalise a species name to a PokeAPI-compatible slug."""
    name = species.lower().strip()
    # Nidoran gender special cases
    if "nidoran" in name:
        return "nidoran-f" if ("♀" in name or "female" in name) else "nidoran-m"
    name = re.sub(r"[♂♀]", "", name)
    name = name.replace(" ", "-").replace("'", "").replace("'", "").replace(".", "")
    name = re.sub(r"-+", "-", name).strip("-")
    return name


def _fetch_sprite(species: str):
    """Return a PIL RGBA Image for `species`, fetching from PokeAPI if not cached."""
    from PIL import Image

    _ensure_dirs()
    slug = _poke_slug(species)
    cache_file = SPRITE_CACHE_DIR / f"{slug}.png"

    with _lock:
        if cache_file.exists():
            try:
                return Image.open(cache_file).convert("RGBA")
            except Exception:
                pass

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"https://pokeapi.co/api/v2/pokemon/{slug}")
            if resp.status_code != 200:
                logger.warning("PokeAPI: no entry for %r (status %s)", slug, resp.status_code)
                return None
            sprite_url = resp.json().get("sprites", {}).get("front_default")
            if not sprite_url:
                return None
            sprite_resp = client.get(sprite_url)
            if sprite_resp.status_code != 200:
                return None
            img = Image.open(io.BytesIO(sprite_resp.content)).convert("RGBA")
            with _lock:
                img.save(cache_file)
            return img
    except Exception as exc:
        logger.warning("Sprite fetch failed for %r: %s", species, exc)
        return None


def _get_font(size: int, bold: bool = False):
    """Load a TrueType font at `size`, falling back to Pillow's built-in."""
    from PIL import ImageFont

    bold_candidates = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
    ]
    regular_candidates = [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
    ]
    for path in (bold_candidates if bold else regular_candidates):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


def _get_emoji_font(size: int):
    """Load a font that can render both text and emoji glyphs."""
    from PIL import ImageFont

    candidates = [
        "C:/Windows/Fonts/seguiemj.ttf",   # Segoe UI Emoji — Windows
        "C:/Windows/Fonts/seguisym.ttf",   # Segoe UI Symbol — Windows fallback
        "/System/Library/Fonts/Apple Color Emoji.ttc",  # macOS
        "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",  # Linux
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return _get_font(size, bold=True)  # last resort: no emoji but text still renders


def _sanitize_filename(text: str) -> str:
    text = text.lower().replace(" ", "_")
    text = re.sub(r"[^a-z0-9_\-]", "", text)
    return text[:60]


def _scale_sprite(img, max_size: int):
    """Crop transparent padding then scale up to fill max_size, preserving aspect ratio."""
    from PIL import Image
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    scale = max_size / max(w, h)
    return img.resize((int(w * scale), int(h * scale)), Image.NEAREST)


def _draw_text_centered(draw, text: str, y: int, cell_x: int, cell_w: int, font, color) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    x = cell_x + (cell_w - (bbox[2] - bbox[0])) // 2
    draw.text((x, y), text, font=font, fill=color)


def _truncate_text(draw, text: str, max_px: int, font: object) -> str:
    """Truncate `text` with ellipsis if it exceeds `max_px` wide."""
    bbox = draw.textbbox((0, 0), text, font=font)
    if bbox[2] - bbox[0] <= max_px:
        return text
    while len(text) > 1:
        text = text[:-1]
        bbox = draw.textbbox((0, 0), text + "…", font=font)
        if bbox[2] - bbox[0] <= max_px:
            return text + "…"
    return "…"


# ── Individual pokemon image ─────────────────────────────────────────────────

def generate_individual_image(
    *,
    run_name: str,
    pokemon_name: str,
    nickname: str | None,
    twitch_username: str | None,
    impatience: int = 0,
    output_dir: str,
) -> None:
    """Generate a 500×500 transparent PNG for a single captured pokemon."""
    try:
        from PIL import Image, ImageDraw

        SIZE = 500
        SPRITE_MAX = 390  # sprite area; leaves ~110px for text at bottom
        SPRITE_Y = 10

        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        draw = ImageDraw.Draw(canvas)

        font_name = _get_font(40, bold=True)
        font_user = _get_emoji_font(36)

        sprite = _fetch_sprite(pokemon_name)
        if sprite:
            scaled = _scale_sprite(sprite, SPRITE_MAX)
            sx = (SIZE - scaled.width) // 2
            sy = SPRITE_Y + (SPRITE_MAX - scaled.height) // 2
            canvas.paste(scaled, (sx, sy), scaled)

        display = f"{nickname} ({pokemon_name})" if nickname else pokemon_name
        display = _truncate_text(draw, display, SIZE - 20, font_name)

        text_y = SPRITE_Y + SPRITE_MAX + 10
        _draw_text_centered(draw, display, text_y, 0, SIZE, font_name, (20, 20, 20, 255))

        user_parts = []
        if twitch_username:
            user_parts.append(f"@{twitch_username}")
        user_parts.append(f"🔥{impatience}")
        user_text = _truncate_text(draw, "  ".join(user_parts), SIZE - 20, font_user)
        _draw_text_centered(draw, user_text, text_y + 50, 0, SIZE, font_user, (60, 60, 90, 255))

        out_dir = Path(output_dir) / "Captured Pokemon"
        out_dir.mkdir(parents=True, exist_ok=True)

        display_name = nickname or pokemon_name
        filename = f"{_sanitize_filename(run_name)}_{_sanitize_filename(display_name)}.png"
        canvas.save(out_dir / filename, "PNG")
        logger.info("Saved individual image: %s", filename)

    except Exception as exc:
        logger.error("generate_individual_image failed: %s", exc, exc_info=True)


# ── Team image ────────────────────────────────────────────────────────────────

def generate_team_image(
    *,
    pokemon_list: list[dict],
    run_name: str,
    output_dir: str,
) -> None:
    """Generate a transparent PNG banner (500px wide, auto height) for the current team."""
    try:
        from PIL import Image, ImageDraw

        if not pokemon_list:
            return

        CELL = 500
        n = len(pokemon_list)
        WIDTH = CELL * n
        HEIGHT = CELL
        cell_w = CELL

        SPRITE_MAX = 390
        SPRITE_Y = 10
        font_name = _get_font(40, bold=True)
        font_user = _get_emoji_font(36)

        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(canvas)

        for i, poke in enumerate(pokemon_list):
            cx = i * cell_w

            sprite = _fetch_sprite(poke["pokemon_name"])
            if sprite:
                scaled = _scale_sprite(sprite, SPRITE_MAX)
                sx = cx + (cell_w - scaled.width) // 2
                sy = SPRITE_Y + (SPRITE_MAX - scaled.height) // 2
                canvas.paste(scaled, (sx, sy), scaled)

            nickname = poke.get("nickname")
            species = poke["pokemon_name"]
            twitch_username = poke.get("twitch_username")
            display = f"{nickname} ({species})" if nickname else species
            display = _truncate_text(draw, display, cell_w - 20, font_name)

            text_y = SPRITE_Y + SPRITE_MAX + 10
            _draw_text_centered(draw, display, text_y, cx, cell_w, font_name, (20, 20, 20, 255))

            if twitch_username:
                user_text = _truncate_text(draw, f"@{twitch_username}", cell_w - 20, font_user)
                _draw_text_centered(draw, user_text, text_y + 50, cx, cell_w, font_user, (60, 60, 90, 255))

        Path(output_dir).mkdir(parents=True, exist_ok=True)
        canvas.save(Path(output_dir) / "team.png", "PNG")
        logger.info("Saved team image for run %r", run_name)

    except Exception as exc:
        logger.error("generate_team_image failed: %s", exc, exc_info=True)
