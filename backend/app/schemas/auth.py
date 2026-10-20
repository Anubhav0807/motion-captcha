"""Dashboard sign-up, sign-in, password and invite payloads."""

from pydantic import BaseModel, EmailStr, Field

PASSWORD = Field(min_length=8, max_length=128)


class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    company: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = PASSWORD


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = PASSWORD


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(max_length=200)
    password: str = PASSWORD


class AcceptInviteIn(BaseModel):
    token: str = Field(max_length=200)
    name: str = Field(min_length=1, max_length=120)
    password: str = PASSWORD
