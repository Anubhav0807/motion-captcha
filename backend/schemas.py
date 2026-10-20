from pydantic import BaseModel


class ClicksData(BaseModel):
    averageInterval: float
    intervalVariance: float
    totalClicks: int


class KeyboardData(BaseModel):
    averageHoldDuration: float
    averageInterval: float
    holdDurationVariance: float
    intervalVariance: float
    totalKeyPresses: int


class MouseData(BaseModel):
    averageAcceleration: float
    averageVelocity: float
    directionChanges: int
    maxVelocity: float
    totalDistance: float
    totalSamples: int


class MetricsRequest(BaseModel):
    clicks: ClicksData
    keyboard: KeyboardData
    mouse: MouseData

class RiskScoreData(BaseModel):
    token: str
    risk_score: int
    

class CaptchaData(BaseModel):
    token: str
    captcha_text: str