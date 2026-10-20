import hashlib
import hmac
import secrets

import bcrypt

from app.core import config

SITE_KEY_PREFIX = "mc_pk_"
SECRET_KEY_PREFIX = "mc_sk_"

# Used to keep login timing constant when the email doesn't exist.
_DUMMY_HASH = bcrypt.hashpw(b"timing-equaliser", bcrypt.gensalt(12))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(12)).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        bcrypt.checkpw(password.encode("utf-8"), _DUMMY_HASH)
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode())
    except ValueError:
        return False


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def new_site_key() -> str:
    return SITE_KEY_PREFIX + secrets.token_urlsafe(18)


def new_secret_key() -> str:
    return SECRET_KEY_PREFIX + secrets.token_urlsafe(30)


def answer_hash(token: str, answer: str) -> str:
    """Keyed hash of a CAPTCHA answer, so plaintext answers are never stored."""
    return hmac.new(
        config.SECRET_KEY.encode(),
        f"{token}:{answer}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def safe_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
