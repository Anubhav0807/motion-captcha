"""
CAPTCHA rendering.

Images are rendered in memory and returned as bytes, so concurrent requests
from different customers never share a file on disk. The dynamic CAPTCHA is the
same effect as before: a field of random grey blocks drifts sideways while the
text is cut out of a separate, stationary noise layer — so the characters are
only visible while the image is moving.
"""

import io
import math
import os
import secrets
import threading

os.environ["SDL_VIDEODRIVER"] = "dummy"

import numpy as np
import pygame
from PIL import Image, ImageDraw, ImageFont, ImageFilter

from app.core import config


WIDTH, HEIGHT = 250, 100
# GIF frame delays are stored in 1/100 s, and browsers slow any delay below
# 20 ms down to 100 ms, so 50 fps (20 ms) is the fastest rate that plays as intended.
GIF_FPS = 50
BLOCK_SIZE = 1
DRIFT_SPEED = 4
FONT_SIZE = 70
NOISE_CYCLES = 5

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)

GRAYS = [
    (0, 0, 0),
    (64, 64, 64),
    (128, 128, 128),
    (192, 192, 192),
    (255, 255, 255),
]

UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
LOWERCASE = "abcdefghijklmnopqrstuvwxyz"
NUMBERS = "0123456789"

DEFAULT_CONFIG = {
    "uppercase": True,
    "lowercase": True,
    "numbers": True
}

EXTENSIONS = {
    "static": "png",
    "dynamic": "gif"
}

STATIC_FONT_PATH = str(config.CAPTCHA_FONT_PATH)

_GIF_PALETTE = [channel for gray in GRAYS for channel in gray] + [0] * (768 - 3 * len(GRAYS))

_pygame_lock = threading.Lock()
_pygame_font = None
_static_font = None


def _get_pygame_font():
    """pygame is initialised once per process (it isn't safe to init/quit per request)."""
    global _pygame_font
    if _pygame_font is None:
        pygame.font.init()
        font = pygame.font.SysFont("Impact", FONT_SIZE)
        if font is None:
            font = pygame.font.Font(None, FONT_SIZE)
        _pygame_font = font
    return _pygame_font


def _get_static_font():
    global _static_font
    if _static_font is None:
        try:
            _static_font = ImageFont.truetype(STATIC_FONT_PATH, FONT_SIZE)
        except OSError:
            # Font file missing: fall back to Pillow's built-in scalable font.
            _static_font = ImageFont.load_default(size=FONT_SIZE)
    return _static_font


def generate_captcha_text(config, length=6):
    characters = ""
    if config["uppercase"]: characters += UPPERCASE
    if config["lowercase"]: characters += LOWERCASE
    if config["numbers"]: characters += NUMBERS

    if not characters:
        characters = UPPERCASE + LOWERCASE + NUMBERS

    # secrets (not random) so the sequence can't be predicted from earlier CAPTCHAs.
    return "".join(secrets.choice(characters) for _ in range(length))


def _noise_indices(rng, width, height):
    """Random grey index per BLOCK_SIZE block, expanded to pixels -> (height, width)."""
    blocks = rng.integers(
        0,
        len(GRAYS),
        size=(math.ceil(height / BLOCK_SIZE), math.ceil(width / BLOCK_SIZE)),
        dtype=np.uint8,
    )
    pixels = np.repeat(np.repeat(blocks, BLOCK_SIZE, axis=0), BLOCK_SIZE, axis=1)
    return pixels[:height, :width]


def _text_mask(captcha_text):
    """Boolean (height, width) mask of the text, sampled at block centres."""
    with _pygame_lock:
        font = _get_pygame_font()
        temp = pygame.Surface((WIDTH, HEIGHT))
        temp.fill(BLACK)
        text = font.render(captcha_text, True, WHITE)
        rect = text.get_rect(center=(WIDTH // 2, HEIGHT // 2))
        temp.blit(text, rect)
        rgb = pygame.surfarray.array3d(temp).transpose(1, 0, 2)  # -> (height, width, 3)

    white = np.all(rgb == 255, axis=2)

    ys = np.minimum(np.arange(0, HEIGHT, BLOCK_SIZE) + BLOCK_SIZE // 2, HEIGHT - 1)
    xs = np.minimum(np.arange(0, WIDTH, BLOCK_SIZE) + BLOCK_SIZE // 2, WIDTH - 1)
    sampled = white[np.ix_(ys, xs)]
    mask = np.repeat(np.repeat(sampled, BLOCK_SIZE, axis=0), BLOCK_SIZE, axis=1)
    return mask[:HEIGHT, :WIDTH]


def generate_static_captcha(captcha_text) -> bytes:
    """Generate a static CAPTCHA PNG."""

    # Create image and drawing context
    image = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(image)

    font = _get_static_font()

    # Center the CAPTCHA text
    bbox = draw.textbbox((0, 0), captcha_text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = (WIDTH - text_width) // 2
    y = (HEIGHT - text_height) // 2 - bbox[1]

    # Draw CAPTCHA text
    draw.text((x, y), captcha_text, font=font, fill=GRAYS[1])

    rand = secrets.SystemRandom()

    # Add random noise dots
    for _ in range(150):
        px = rand.randint(0, WIDTH - 1)
        py = rand.randint(0, HEIGHT - 1)
        color = tuple(rand.randint(80, 200) for _ in range(3))
        draw.point((px, py), fill=color)

    # Add random interference lines
    for _ in range(5):
        start = (rand.randint(0, WIDTH), rand.randint(0, HEIGHT))
        end = (rand.randint(0, WIDTH), rand.randint(0, HEIGHT))
        line_color = tuple(rand.randint(100, 200) for _ in range(3))
        draw.line((start, end), fill=line_color, width=1)

    # Apply a subtle blur
    image = image.filter(ImageFilter.GaussianBlur(radius=0.3))

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def generate_dynamic_captcha(captcha_text) -> bytes:
    """Generate a dynamic CAPTCHA GIF."""

    rng = np.random.default_rng()

    background_width = WIDTH * NOISE_CYCLES
    background = _noise_indices(rng, background_width, HEIGHT)
    text_noise = _noise_indices(rng, WIDTH, HEIGHT)
    mask = _text_mask(captcha_text)

    total_frames = background_width // DRIFT_SPEED
    columns = np.arange(WIDTH)
    frames = []

    for i in range(total_frames):
        scroll = (i * DRIFT_SPEED) % background_width
        frame = background[:, (scroll + columns) % background_width].copy()
        frame[mask] = text_noise[mask]

        image = Image.fromarray(frame, mode="P")
        image.putpalette(_GIF_PALETTE)
        frames.append(image)

    buffer = io.BytesIO()
    frames[0].save(
        buffer,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / GIF_FPS),
        loop=0,
        optimize=False,
        disposal=1,
    )
    return buffer.getvalue()


def generate_captcha(captcha_type, config=None, length=6):
    """Return (captcha_text, image_bytes, extension)."""
    if config is None:
        config = DEFAULT_CONFIG.copy()

    extension = EXTENSIONS[captcha_type]

    # Generate CAPTCHA text
    captcha_text = generate_captcha_text(config, length)

    if captcha_type == "static":
        image_bytes = generate_static_captcha(captcha_text)
    elif captcha_type == "dynamic":
        image_bytes = generate_dynamic_captcha(captcha_text)
    else:
        raise ValueError(f"Unknown CAPTCHA type: {captcha_type}")

    return captcha_text, image_bytes, extension


if __name__ == "__main__":
    # python -m app.services.captcha_renderer  -> writes samples to backend/output/
    out = os.path.join(config.BASE_DIR, "output")
    os.makedirs(out, exist_ok=True)
    for kind in ("static", "dynamic"):
        text, data, ext = generate_captcha(kind)
        path = os.path.join(out, f"captcha.{ext}")
        with open(path, "wb") as f:
            f.write(data)
        print(f"{kind}: {text} -> {path} ({len(data) // 1024} KB)")
