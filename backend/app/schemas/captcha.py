"""Public CAPTCHA API: behaviour metrics, assess and verify payloads."""

from pydantic import BaseModel, ConfigDict, Field


class _Metrics(BaseModel):
    # Reject NaN / Infinity so the model never sees garbage.
    model_config = ConfigDict(allow_inf_nan=False)


class ClicksData(_Metrics):
    averageInterval: float = Field(ge=0, le=1e9)
    intervalVariance: float = Field(ge=0, le=1e15)
    totalClicks: int = Field(ge=0, le=1_000_000)


class KeyboardData(_Metrics):
    averageHoldDuration: float = Field(ge=0, le=1e9)
    averageInterval: float = Field(ge=0, le=1e9)
    holdDurationVariance: float = Field(ge=0, le=1e15)
    intervalVariance: float = Field(ge=0, le=1e15)
    totalKeyPresses: int = Field(ge=0, le=1_000_000)


class MouseData(_Metrics):
    averageAcceleration: float = Field(ge=0, le=1e9)
    averageVelocity: float = Field(ge=0, le=1e9)
    directionChanges: int = Field(ge=0, le=10_000_000)
    maxVelocity: float = Field(ge=0, le=1e9)
    totalDistance: float = Field(ge=0, le=1e12)
    totalSamples: int = Field(ge=0, le=10_000_000)


class MetricsRequest(BaseModel):
    clicks: ClicksData
    keyboard: KeyboardData
    mouse: MouseData


class LabeledMetricsRequest(MetricsRequest):
    label: str = Field(pattern="^(human|bot)$")


class AssessResponse(BaseModel):
    token: str
    challenge_url: str
    expires_in: int


class VerifyRequest(BaseModel):
    token: str = Field(min_length=1, max_length=64)
    answer: str = Field(max_length=64)
    remote_ip: str | None = Field(default=None, max_length=64)


class VerifyResponse(BaseModel):
    success: bool
    risk_score: int | None = None
    challenge_type: str | None = None
    hostname: str | None = None
    challenge_ts: str | None = None
    error_codes: list[str] = []
