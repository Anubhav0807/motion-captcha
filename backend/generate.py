import os
import random

os.environ["SDL_VIDEODRIVER"] = "dummy"

import pygame
from PIL import Image, ImageDraw, ImageFont, ImageFilter


WIDTH, HEIGHT = 250, 100
GIF_FPS = 60
BLOCK_SIZE = 1
DRIFT_SPEED = 4
FONT_SIZE = 70
NOISE_CYCLES = 5

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
KEY_COLOR = (255, 0, 255)

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


def generate_capthca_text(config, length=6):
    characters = ""
    if config["uppercase"]: characters += UPPERCASE
    if config["lowercase"]: characters += LOWERCASE
    if config["numbers"]: characters += NUMBERS

    text = ""
    for _ in range(length):
        text += random.choice(characters)

    return text

def create_cutout_mask(font, config, length):
    temp = pygame.Surface((WIDTH, HEIGHT))
    temp.fill(BLACK)

    text = font.render(generate_capthca_text(config, length), True, WHITE)
    rect = text.get_rect(center=(WIDTH // 2, HEIGHT // 2))
    temp.blit(text, rect)

    mask = pygame.Surface((WIDTH, HEIGHT))
    mask.fill(KEY_COLOR)

    for x in range(0, WIDTH, BLOCK_SIZE):
        for y in range(0, HEIGHT, BLOCK_SIZE):
            sx = min(x + BLOCK_SIZE // 2, WIDTH - 1)
            sy = min(y + BLOCK_SIZE // 2, HEIGHT - 1)

            if temp.get_at((sx, sy)) == WHITE:
                pygame.draw.rect(
                    mask,
                    BLACK,
                    (x, y, BLOCK_SIZE, BLOCK_SIZE),
                )

    mask.set_colorkey(BLACK)
    return mask


def generate_noise():
    surf = pygame.Surface((WIDTH, HEIGHT))

    for x in range(0, WIDTH, BLOCK_SIZE):
        for y in range(0, HEIGHT, BLOCK_SIZE):
            pygame.draw.rect(
                surf,
                random.choice(GRAYS),
                (x, y, BLOCK_SIZE, BLOCK_SIZE),
            )

    return surf


def generate_static_captcha(image_path, config, length):
    """Generate a static capthca PNG."""

    # Generate CAPTCHA text
    captcha_text = generate_capthca_text(config, length)

    # Create image and drawing context
    image = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(image)

    # Load font
    font = ImageFont.truetype("anniesgrids.ttf", FONT_SIZE)

    # Center the CAPTCHA text
    bbox = draw.textbbox((0, 0), captcha_text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = (WIDTH - text_width) // 2
    y = (HEIGHT - text_height) // 2 - bbox[1]

    # Draw CAPTCHA text
    draw.text((x, y), captcha_text, font=font, fill=GRAYS[1])

    # Add random noise dots
    for _ in range(150):
        px = random.randint(0, WIDTH - 1)
        py = random.randint(0, HEIGHT - 1)
        color = tuple(random.randint(80, 200) for _ in range(3))
        draw.point((px, py), fill=color)

    # Add random interference lines
    for _ in range(5):
        start = (random.randint(0, WIDTH), random.randint(0, HEIGHT))
        end = (random.randint(0, WIDTH), random.randint(0, HEIGHT))
        line_color = tuple(random.randint(100, 200) for _ in range(3))
        draw.line((start, end), fill=line_color, width=1)

    # Apply a subtle blur
    image = image.filter(ImageFilter.GaussianBlur(radius=0.3))

    # Save the image
    image.save(image_path)

    return image_path


def generate_dynamic_captcha(image_path, config, length, frames_dir="frames"):
    """Generate a dynamic capthca GIF and PNG frames."""

    pygame.init()

    try:
        screen = pygame.Surface((WIDTH, HEIGHT))

        try:
            font = pygame.font.SysFont("Impact", FONT_SIZE)
        except Exception:
            font = pygame.font.Font(None, FONT_SIZE)

        background_width = WIDTH * NOISE_CYCLES
        background = pygame.Surface((background_width, HEIGHT))

        for x in range(0, background_width, BLOCK_SIZE):
            for y in range(0, HEIGHT, BLOCK_SIZE):
                pygame.draw.rect(
                    background,
                    random.choice(GRAYS),
                    (x, y, BLOCK_SIZE, BLOCK_SIZE),
                )

        text_noise = generate_noise()
        cutout = create_cutout_mask(font, config, length)

        text_layer = text_noise.copy()
        text_layer.blit(cutout, (0, 0))
        text_layer.set_colorkey(KEY_COLOR)

        total_frames = background_width // DRIFT_SPEED
        frames = []
        scroll = 0

        for _ in range(total_frames):
            if scroll + WIDTH <= background_width:
                bg = background.subsurface(
                    (scroll, 0, WIDTH, HEIGHT)
                )
                screen.blit(bg, (0, 0))
            else:
                first_width = background_width - scroll

                bg1 = background.subsurface(
                    (scroll, 0, first_width, HEIGHT)
                )
                screen.blit(bg1, (0, 0))

                bg2 = background.subsurface(
                    (0, 0, WIDTH - first_width, HEIGHT)
                )
                screen.blit(bg2, (first_width, 0))

            screen.blit(text_layer, (0, 0))
            frames.append(screen.copy())

            scroll = (scroll + DRIFT_SPEED) % background_width

        os.makedirs(frames_dir, exist_ok=True)

        for i, frame in enumerate(frames):
            pygame.image.save(
                frame,
                os.path.join(frames_dir, f"frame_{i:04d}.png"),
            )

        gif_frames = []

        for frame in frames:
            data = pygame.image.tobytes(frame, "RGB")
            image = Image.frombytes("RGB", (WIDTH, HEIGHT), data)
            gif_frames.append(image)

        gif_frames[0].save(
            image_path,
            save_all=True,
            append_images=gif_frames[1:],
            duration=round(1000 / GIF_FPS),
            loop=0,
        )

        return image_path

    finally:
        pygame.quit()


def generate_captcha(image_path, captcha_type, config=DEFAULT_CONFIG, length=6):
    if captcha_type == "static":
        return generate_static_captcha(image_path, config, length)
    elif captcha_type == "dynamic":
        return generate_dynamic_captcha(image_path, config, length)


if __name__ == "__main__":
    generate_captcha("captcha.png", "static")
    generate_captcha("captcha.git", "dynamic")