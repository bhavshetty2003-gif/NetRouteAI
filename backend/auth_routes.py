"""HTTP surface for accounts, sessions, password reset and Google sign-in.

The endpoints live here rather than in `main.py` so `main.py` keeps its single
responsibility of orchestrating the network API, and so the whole auth surface
can be read in one place.

Every route takes the bearer token from the `Authorization` header. The frontend
keeps it in localStorage and sends it on each call, which avoids the cross-origin
cookie problems this deployment would otherwise hit (API on :8000, UI on :3000).

The session token is *not* enough to change an email address: there is no route
that accepts an email update, and `update_profile` never reads one from the body.
That is the whole mechanism by which the address stays immutable -- there is
simply no code path that can write it.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

import auth as auth_service
import auth_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _bearer(authorization: Optional[str]) -> Optional[str]:
    """Pull the token out of an `Authorization: Bearer ...` header."""
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def _current_user(authorization: Optional[str]) -> dict[str, Any]:
    return _require(_bearer(authorization))


def _require(token: Optional[str]) -> dict[str, Any]:
    try:
        return auth_service.require_user(token)
    except auth_service.AuthError as exc:
        raise _fail(exc) from exc


def _fail(exc: auth_service.AuthError) -> HTTPException:
    """Turn an `AuthError` into a 4xx whose body names the offending field.

    `detail` is an object here rather than the bare string the rest of this API
    uses, because the register form needs to know *which* input to mark: telling
    a user "passwords do not match" without saying which password field is the
    one they typed wrong is only half an answer.
    """
    return HTTPException(
        status_code=exc.status,
        detail={"message": exc.message, "field": exc.field},
    )


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class RegisterRequest(BaseModel):
    name: str
    age: int
    email: str
    password: str
    confirm_password: str
    mobile: str


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleRequest(BaseModel):
    credential: str = Field(..., description="The ID token from Google Identity Services.")


class GoogleCompleteRequest(BaseModel):
    pending_token: str
    age: int
    mobile: str
    name: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    password: str
    confirm_password: str


class ProfileUpdateRequest(BaseModel):
    """Only the editable fields. Email is absent by design and cannot be added."""

    name: Optional[str] = None
    age: Optional[int] = None
    mobile: Optional[str] = None


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@router.get("/config")
def auth_config() -> dict[str, Any]:
    """What the login page needs to know before anyone has signed in.

    The frontend calls this to decide whether to draw the Google button, and it
    takes the client id from *here* rather than carrying its own copy. A client
    id pasted in two places is a client id that works in the browser and fails
    on the server (or the reverse), which is exactly the mismatch that makes
    "invalid audience" errors so hard to read. There is one place to set it:
    `GOOGLE_CLIENT_ID` in `auth.py`, or the environment variable of that name.
    """
    auth_db.init_auth_db()
    auth_db.purge_expired()
    client_id = auth_service.GOOGLE_CLIENT_ID
    return {
        "google_enabled": bool(client_id),
        "google_client_id": client_id,
    }


@router.post("/register", status_code=201)
def register(request: RegisterRequest) -> dict[str, Any]:
    try:
        user, token = auth_service.register(
            name=request.name,
            age=request.age,
            email=request.email,
            mobile=request.mobile,
            password=request.password,
            confirm=request.confirm_password,
        )
    except auth_service.AuthError as exc:
        raise _fail(exc) from exc
    return {"user": user, "token": token}


@router.post("/login")
def login(request: LoginRequest) -> dict[str, Any]:
    try:
        user, token = auth_service.login(request.email, request.password)
    except auth_service.AuthError as exc:
        raise _fail(exc) from exc
    return {"user": user, "token": token}


@router.post("/logout")
def logout(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    auth_service.logout(_bearer(authorization))
    return {"ok": True}


@router.get("/me")
def me(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    return {"user": _current_user(authorization)}


@router.patch("/me")
def update_me(
    request: ProfileUpdateRequest, authorization: Optional[str] = Header(default=None)
) -> dict[str, Any]:
    user = _current_user(authorization)
    try:
        updated = auth_service.update_profile(
            user_id=user["id"], name=request.name, age=request.age, mobile=request.mobile
        )
    except auth_service.AuthError as exc:
        raise _fail(exc) from exc
    return {"user": updated}


@router.post("/google")
def google(request: GoogleRequest) -> dict[str, Any]:
    try:
        return auth_service.google_sign_in(request.credential)
    except auth_service.AuthError as exc:
        raise _fail(exc) from exc


@router.post("/google/complete", status_code=201)
def google_complete(request: GoogleCompleteRequest) -> dict[str, Any]:
    try:
        user, token = auth_service.google_complete_profile(
            pending_token=request.pending_token,
            age=request.age,
            mobile=request.mobile,
            name=request.name,
        )
    except auth_service.AuthError as exc:
        raise _fail(exc) from exc
    return {"user": user, "token": token}


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest) -> dict[str, Any]:
    try:
        return auth_service.request_password_reset(request.email)
    except auth_service.AuthError as exc:
        raise _fail(exc) from exc


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest) -> dict[str, Any]:
    try:
        auth_service.complete_password_reset(
            email=request.email,
            code=request.code,
            password=request.password,
            confirm=request.confirm_password,
        )
    except auth_service.AuthError as exc:
        raise _fail(exc) from exc
    return {"ok": True, "message": "Your password has been changed. Sign in with it."}