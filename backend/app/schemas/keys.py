"""API key payloads and the domain allowlist validator."""

import re

from pydantic import BaseModel, Field, field_validator

DOMAIN_RE = re.compile(r"^(localhost|(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,63}|\d{1,3}(\.\d{1,3}){3})$")


def clean_domains(domains: list[str]) -> list[str]:
    """Accepts 'https://Shop.Example.com/login', '*.example.com', etc. Returns bare lowercase hosts."""
    cleaned = []
    for raw in domains:
        d = raw.strip().lower()
        d = re.sub(r"^https?://", "", d).split("/")[0].split(":")[0]
        d = d.removeprefix("*.")
        if not d:
            continue
        if not DOMAIN_RE.match(d):
            raise ValueError(f"'{raw}' is not a valid domain")
        if d not in cleaned:
            cleaned.append(d)
    return cleaned


class KeySettings(BaseModel):
    uppercase: bool = True
    lowercase: bool = True
    numbers: bool = True
    length: int = Field(default=6, ge=4, le=10)
    dynamicThreshold: int = Field(default=50, ge=0, le=101)   # 0 = always motion, 101 = always static
    caseSensitive: bool = True
    challengeTtl: int = Field(default=120, ge=30, le=900)


class KeyIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    allowedDomains: list[str] = Field(default_factory=list, max_length=50)
    settings: KeySettings = Field(default_factory=KeySettings)

    @field_validator("allowedDomains")
    @classmethod
    def _domains(cls, v):
        return clean_domains(v)


class KeyPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    allowedDomains: list[str] | None = Field(default=None, max_length=50)
    settings: KeySettings | None = None

    @field_validator("allowedDomains")
    @classmethod
    def _domains(cls, v):
        return clean_domains(v) if v is not None else v
