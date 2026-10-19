import os
import threading
import uuid

from fastapi import BackgroundTasks

from generate import generate_captcha


OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

_generator_lock = threading.Lock()
_generator_running = False


def generate_captcha_atomic(image_path, captcha_type, config):
    """Generate a temporary CAPTCHA and atomically publish it."""
    temp_path = os.path.join(
        os.path.dirname(image_path),
        f"captcha_{uuid.uuid4().hex}.gif",
    )

    try:
        generate_captcha(temp_path, captcha_type, config)

        if not os.path.isfile(temp_path) or os.path.getsize(temp_path) == 0:
            raise RuntimeError("Generated CAPTCHA file is missing or empty")

        os.replace(temp_path, image_path)

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def _regenerate_captcha(image_path, captcha_type, config):
    global _generator_running

    try:
        generate_captcha_atomic(image_path, captcha_type, config)
    except Exception:
        import logging
        logging.exception("CAPTCHA regeneration failed")
    finally:
        with _generator_lock:
            _generator_running = False


def prepare_captcha(background_tasks: BackgroundTasks, config, captcha_type="dynamic"):
    """Ensure a CAPTCHA exists and schedule at most one replacement."""
    global _generator_running

    extensions = {
        "static": "png",
        "dynamic": "gif",
    }

    if captcha_type not in extensions:
        raise ValueError(f"Unsupported CAPTCHA type: {captcha_type}")

    extension = extensions[captcha_type]
    image_path = os.path.join(
        OUTPUT_DIR,
        f"captcha.{extension}",
    )

    with _generator_lock:
        if not os.path.isfile(image_path):
            # First request: generate the initial image.
            generate_captcha_atomic(image_path, captcha_type, config)

        elif not _generator_running:
            # Serve the existing image while one replacement is generated.
            _generator_running = True
            background_tasks.add_task(
                _regenerate_captcha,
                image_path,
                captcha_type,
                config.copy(),
            )

    if not os.path.isfile(image_path):
        raise RuntimeError("CAPTCHA image is unavailable")

    return image_path, extension
