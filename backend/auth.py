"""Registration, login, sessions, password reset and Google sign-in.

Passwords are verified against a bcrypt hash and never stored. Google sign-in
verifies the ID token Google Identity Services hands the browser against Google's
own published public keys -- the signature is checked, the `aud` claim is checked
against *this* project's client id, and the expiry is checked. A token minted for
a different application is therefore rejected here even though it is a perfectly
valid Google token.

HOW TO ENABLE GOOGLE SIGN-IN
----------------------------
1. Open https://console.cloud.google.com/ -> create a project.
2. APIs & Services -> Credentials -> Create credentials -> OAuth client ID.
3. Choose "Web application". Under "Authorized JavaScript origins" add the exact
   origin you serve the frontend from, e.g. `http://localhost:3000`.
4. Copy the Client ID.
5. Paste it into GOOGLE_CLIENT_ID below (or set the GOOGLE_CLIENT_ID environment
   variable, which takes precedence).

Until a client id is set, `/api/auth/google` returns 503 and the frontend hides
the Google button rather than showing one that cannot work.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any

import requests
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

import auth_db
from auth_db import ValidationError

logger = logging.getLogger("netroute.auth")

# --------------------------------------------------------------------------- #
# PASTE YOUR GOOGLE CLIENT ID HERE
# --------------------------------------------------------------------------- #
# The Client ID from Google Cloud Console -> Credentials -> OAuth client ID.
# Example shape: "123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com"
# Leave it empty and the Google button stays hidden instead of failing.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
# Google's keys rotate; cache them briefly so a burst of sign-ins does not
# refetch, but not so long that a rotation leaves sign-in broken.
_CERT_TTL_SECONDS = 3600
_certs_cache: dict[str, Any] = {"fetched_at": 0.0, "keys": {}}

# A Google identity that has been verified but has no account yet. This is a
# short-lived signed blob, not a session: it authorises creating the one account
# and nothing else, and it expires quickly.
PENDING_TTL_SECONDS = 900
_PENDING_SECRET = os.environ.get(
    "NETROUTEAI_PENDING_SECRET", os.urandom(32).hex()
).encode("utf-8")


class AuthError(Exception):
    """A caller-facing authentication failure. `status` is the HTTP code."""

    def __init__(self, message: str, status: int = 400, field: str | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.field = field


# --------------------------------------------------------------------------- #
# Google ID token verification
# --------------------------------------------------------------------------- #
def _google_public_keys() -> dict[str, rsa.RSAPublicKey]:
    now = time.time()
    if now - _certs_cache["fetched_at"] < _CERT_TTL_SECONDS and _certs_cache["keys"]:
        return _certs_cache["keys"]

    response = requests.get(GOOGLE_CERTS_URL, timeout=10)
    response.raise_for_status()
    payload = response.json()

    keys: dict[str, rsa.RSAPublicKey] = {}
    for entry in payload.get("keys", []):
        try:
            # A JWK carries `n` and `e` as base64url-encoded *big-endian
            # integers*, not as a DER-encoded key. Decoding `n` with
            # `load_der_public_key` throws for every real Google key, and the
            # bare `except` below would then swallow it and leave the cache
            # empty -- so sign-in would fail with "could not read Google's
            # signing keys" no matter how correct the token was. Rebuild the key
            # from the two integers instead.
            modulus = int.from_bytes(
                base64.urlsafe_b64decode(entry["n"] + "=" * (-len(entry["n"]) % 4)),
                "big",
            )
            exponent = int.from_bytes(
                base64.urlsafe_b64decode(entry["e"] + "=" * (-len(entry["e"]) % 4)),
                "big",
            )
            keys[entry["kid"]] = rsa.RSAPublicNumbers(e=exponent, n=modulus).public_key()
        except Exception:  # a single malformed key must not break the rest
            logger.warning("Skipped a Google signing key with kid=%r", entry.get("kid"))
            continue

    if not keys:
        raise AuthError("Could not read Google's signing keys.", status=503)

    _certs_cache.update({"fetched_at": now, "keys": keys})
    return keys


def verify_google_token(credential: str) -> dict[str, Any]:
    """Verify a Google ID token and return its claims.

    Raises `AuthError` for anything that is not a currently-valid token issued
    to this project by Google.
    """
    if not GOOGLE_CLIENT_ID:
        raise AuthError(
            "Google sign-in is not configured on this server.", status=503
        )

    parts = (credential or "").split(".")
    if len(parts) != 3:
        raise AuthError("Malformed Google credential.", status=400)

    header_segment, payload_segment, signature_segment = parts

    def decode(segment: str) -> dict[str, Any]:
        padded = segment + "=" * (-len(segment) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))

    try:
        header = decode(header_segment)
        claims = decode(payload_segment)
        signature = base64.urlsafe_b64decode(
            signature_segment + "=" * (-len(signature_segment) % 4)
        )
    except Exception as exc:
        raise AuthError("Malformed Google credential.", status=400) from exc

    if header.get("alg") != "RS256":
        # Refusing anything but RS256 blocks the `alg: none` and HMAC confusion
        # tricks, where an attacker signs a token with a public key as the secret.
        raise AuthError("Unexpected Google token algorithm.", status=400)

    key = _google_public_keys().get(header.get("kid", ""))
    if key is None:
        raise AuthError("Google token was signed by an unknown key.", status=400)

    try:
        key.verify(signature, f"{header_segment}.{payload_segment}".encode("ascii"), padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature as exc:
        raise AuthError("Google token signature is invalid.", status=400) from exc

    if claims.get("aud") != GOOGLE_CLIENT_ID:
        raise AuthError(
            "This Google token was issued for a different application.", status=400
        )
    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise AuthError("Unexpected Google token issuer.", status=400)
    if not claims.get("sub"):
        raise AuthError("Google token has no subject.", status=400)

    now = int(time.time())
    expiry = int(claims.get("exp") or 0)
    if expiry and expiry < now:
        raise AuthError("Google token has expired. Please sign in again.", status=400)

    # An unverified Google email must not be allowed to claim an existing
    # account, or anyone able to add an unverified address to a Google profile
    # could take over that account by signing in with it.
    if not claims.get("email_verified"):
        raise AuthError(
            "Your Google account's email is not verified, so it cannot be used to sign in.",
            status=400,
        )

    return claims


# --------------------------------------------------------------------------- #
# Pending Google registrations
# --------------------------------------------------------------------------- #
def make_pending_token(claims: dict[str, Any]) -> str:
    body = {
        "sub": claims["sub"],
        "email": (claims.get("email") or "").lower(),
        "name": claims.get("name") or (claims.get("email") or "").split("@")[0],
        "exp": int(time.time()) + PENDING_TTL_SECONDS,
    }
    raw = base64.urlsafe_b64encode(json.dumps(body).encode("utf-8")).decode("ascii")
    signature = hmac.new(_PENDING_SECRET, raw.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw}.{signature}"


def read_pending_token(token: str) -> dict[str, Any]:
    if not token or "." not in token:
        raise AuthError("This sign-in link has expired. Please sign in again.", status=400)
    raw, signature = token.rsplit(".", 1)
    expected = hmac.new(_PENDING_SECRET, raw.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise AuthError("This sign-in link is not valid.", status=400)
    try:
        body = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    except Exception as exc:
        raise AuthError("This sign-in link is not valid.", status=400) from exc
    if body.get("exp", 0) < time.time():
        raise AuthError("This sign-in link has expired. Please sign in again.", status=400)
    return body


# --------------------------------------------------------------------------- #
# Registration / login
# --------------------------------------------------------------------------- #
def register(
    name: str,
    age: int,
    email: str,
    mobile: str,
    password: str,
    confirm: str,
) -> tuple[dict[str, Any], str]:
    """Create an account and sign it in. Returns `(user, session_token)`."""
    try:
        clean_name, clean_email = auth_db.validate_registration(
            name, age, email, mobile, password, confirm
        )
    except ValidationError as exc:
        raise AuthError(exc.message, status=400, field=exc.field) from exc

    if auth_db.get_user_by_email(clean_email):
        raise AuthError(
            "An account already exists for this email address. Sign in instead.",
            status=409,
            field="email",
        )

    password_hash = auth_db.hash_password(password)
    try:
        user_id = auth_db.create_user(clean_name, age, clean_email, mobile, password_hash)
    except Exception as exc:  # sqlite3.IntegrityError
        raise AuthError(
            "An account already exists for this email address. Sign in instead.",
            status=409,
            field="email",
        ) from exc

    token, _ = auth_db.create_session(user_id)
    return auth_db.public_user(auth_db.get_user_by_id(user_id)), token


def login(email: str, password: str) -> tuple[dict[str, Any], str]:
    row = auth_db.get_user_by_email(email)
    if row is None:
        # Still spend the bcrypt time on a dummy hash so the response does not
        # reveal whether the address is registered.
        auth_db.verify_password(password, "$2b$12$" + "." * 53)
        raise AuthError("Email or password is incorrect.", status=401)

    if not auth_db.verify_password(password, row["password_hash"]):
        if row["google_sub"]:
            raise AuthError(
                "This account uses Google sign-in. Use the Google button, or set a "
                "password with 'Forgot password'.",
                status=401,
            )
        raise AuthError("Email or password is incorrect.", status=401)

    token, _ = auth_db.create_session(row["id"])
    return auth_db.public_user(row), token


def google_sign_in(credential: str) -> dict[str, Any]:
    """Sign in with a Google ID token, or ask for the missing profile fields.

    Google supplies an identity and a verified email, but not the age and mobile
    number this project's registration requires. A brand-new Google identity is
    therefore verified and handed back as a pending registration rather than
    creating a half-populated account.
    """
    claims = verify_google_token(credential)
    sub = claims["sub"]
    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise AuthError("Your Google account did not share an email address.", status=400)

    row = auth_db.get_user_by_google_sub(sub)
    if row is None:
        existing = auth_db.get_user_by_email(email)
        if existing is not None:
            # Same verified address, first time signing in with Google: attach
            # the identity to the account they already made rather than creating
            # a duplicate.
            if existing["google_sub"] and existing["google_sub"] != sub:
                raise AuthError(
                    "That email is already linked to a different Google account.",
                    status=409,
                )
            auth_db.set_google_sub(existing["id"], sub)
            row = auth_db.get_user_by_id(existing["id"])

    if row is not None:
        token, _ = auth_db.create_session(row["id"])
        return {
            "status": "signed_in",
            "user": auth_db.public_user(row),
            "token": token,
        }

    return {
        "status": "needs_profile",
        "pending_token": make_pending_token(claims),
        "email": email,
        "name": claims.get("name") or email.split("@")[0],
    }


def google_complete_profile(
    pending_token: str, age: int, mobile: str, name: str | None = None
) -> tuple[dict[str, Any], str]:
    """Create the account for a verified Google identity, then sign it in."""
    body = read_pending_token(pending_token)
    email = body["email"]
    sub = body["sub"]
    final_name = (name or body.get("name") or email.split("@")[0]).strip()

    if auth_db.get_user_by_email(email):
        raise AuthError(
            "An account already exists for this email. Sign in instead.", status=409
        )

    try:
        auth_db.validate_registration(
            final_name, age, email, mobile, "google-signin-placeholder", "google-signin-placeholder"
        )
    except ValidationError as exc:
        raise AuthError(exc.message, status=400, field=exc.field) from exc

    try:
        user_id = auth_db.create_user(
            final_name, age, email, mobile, password_hash=None, google_sub=sub
        )
    except Exception as exc:
        raise AuthError("Could not create the account.", status=409) from exc

    token, _ = auth_db.create_session(user_id)
    return auth_db.public_user(auth_db.get_user_by_id(user_id)), token


def request_password_reset(email: str) -> dict[str, Any]:
    """Issue a reset code for an account.

    The response never says whether the address is registered -- that would turn
    this endpoint into an account-enumeration oracle.
    """
    row = auth_db.get_user_by_email(email)
    if row is None:
        return {"sent": True, "delivery": "none", "expires_in_minutes": auth_db.RESET_MINUTES}

    code, expires = auth_db.create_reset_code(row["id"])

    # There is no SMTP configuration in this project, so the code cannot be
    # emailed. It is returned in the response instead, and `delivery` says so,
    # so the flow is usable and honest rather than silently failing. Wire up
    # `smtplib` here to send it for real.
    return {
        "sent": True,
        "delivery": "shown_in_response",
        "code": code,
        "expires_at": expires,
        "note": (
            "Email delivery is not configured on this server, so the reset code "
            "is shown here instead of being emailed."
        ),
    }


def complete_password_reset(email: str, code: str, password: str, confirm: str) -> None:
    if len(password or "") < auth_db.MIN_PASSWORD_LENGTH:
        raise AuthError(
            f"Password must be at least {auth_db.MIN_PASSWORD_LENGTH} characters.",
            status=400,
            field="password",
        )
    if len(password.encode("utf-8")) > auth_db.MAX_PASSWORD_BYTES:
        raise AuthError(
            f"Password is too long (limit {auth_db.MAX_PASSWORD_BYTES} bytes).",
            status=400,
            field="password",
        )
    if password != confirm:
        raise AuthError("Passwords do not match.", status=400, field="confirm")

    claimed = auth_db.claim_reset_code(email, code)
    if claimed is None:
        raise AuthError("That reset code is wrong or has expired.", status=400, field="code")

    auth_db.set_password(claimed["user_id"], password)

    # Every existing session for the account is dropped: whoever asked for the
    # reset may be responding to a compromise, and the point of resetting is
    # that whoever had the old session loses it.
    import auth_db as _db

    conn = _db.get_auth_db()
    try:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (claimed["user_id"],))
        conn.commit()
    finally:
        conn.close()


def update_profile(
    user_id: int, name: str | None, age: int | None, mobile: str | None
) -> dict[str, Any]:
    """Update the editable fields. Email is never accepted here."""
    current = auth_db.get_user_by_id(user_id)
    if current is None:
        raise AuthError("Account not found.", status=404)

    final_name = current["name"] if name is None else name
    final_age = current["age"] if age is None else age
    final_mobile = current["mobile"] if mobile is None else mobile

    try:
        auth_db.validate_registration(
            final_name, final_age, current["email"], final_mobile,
            "google-signin-placeholder", "google-signin-placeholder",
        )
    except ValidationError as exc:
        raise AuthError(exc.message, status=400, field=exc.field) from exc

    auth_db.update_user_profile(user_id, final_name, final_age, final_mobile)
    return auth_db.public_user(auth_db.get_user_by_id(user_id))


def user_from_token(token: str | None) -> dict[str, Any] | None:
    row = auth_db.user_for_token(token)
    return auth_db.public_user(row) if row is not None else None


def require_user(token: str | None) -> dict[str, Any]:
    user = user_from_token(token)
    if user is None:
        raise AuthError("Sign in to continue.", status=401)
    return user


def logout(token: str | None) -> None:
    if token:
        auth_db.delete_session(token)