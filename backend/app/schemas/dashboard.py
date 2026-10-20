"""Payloads for quota alerts, rate-limit requests, team, settings and billing."""

from pydantic import BaseModel, EmailStr, Field, field_validator


class AlertsIn(BaseModel):
    thresholds: list[int] = Field(max_length=10)
    emails: list[EmailStr] = Field(default_factory=list, max_length=20)

    @field_validator("thresholds")
    @classmethod
    def valid(cls, v):
        if any(t < 1 or t > 100 for t in v):
            raise ValueError("Thresholds must be between 1 and 100")
        return sorted(set(v))


class IncreaseIn(BaseModel):
    keyId: str | None = None
    requestedRpm: int = Field(ge=1, le=1_000_000)
    reason: str = Field(min_length=10, max_length=2000)


class InviteIn(BaseModel):
    email: EmailStr
    role: str


class RoleIn(BaseModel):
    role: str


class SettingsIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    notifications: dict[str, bool] | None = None
    organizationName: str | None = Field(default=None, min_length=2, max_length=120)
    billingEmail: EmailStr | None = None


class CheckoutIn(BaseModel):
    plan: str
