"""SQLite persistence for accounts and sessions.

This is a separate database from `training_data.db` on purpose: one holds
measurements, the other holds personal data, and they have different backup and
retention needs.

Passwords are never stored. Only a bcrypt hash is written, because a readable
password column turns any file copy -- a zip of the repo, a stray backup, a
`SELECT *` in a debugging session -- into a full account compromise. The hash is
salted by bcrypt per row, so two users with the same password get different
values and one breach does not reveal whether two people chose the same password.

The email address is the account identity and is immutable once registered: it is
the login handle, it is the key a reset is authorised against, and it is the
subject a Google account is matched on. Letting it change in place would mean a
reset link sent to the old address, or a Google sign-in landing on a second
account. Everything else (name, age, mobile) is editable.
"""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt

AUTH_DB_PATH = os.environ.get(
    "NETROUTEAI_AUTH_DB",
    os.path.join(os.path.dirname(__file__), "auth.db"),
)

# bcrypt silently truncates beyond 72 bytes, so a longer password would be
# accepted while only its first 72 bytes were ever hashed. Rejecting it is
# clearer than pretending the tail is part of the secret.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 8

# How long a login stays valid. The token is a bearer credential held in the
# browser, so this is deliberately short enough that a leaked one is useful for
# little time, and long enough that an active session is not interrupted.
SESSION_DAYS = 7

# A reset code is a single-use, short-lived secret. Ten minutes is enough to read
# an email and type it, and short enough that a code sitting in a mailbox is not
# a standing risk.
RESET_MINUTES = 10

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")
# Deliberately permissive: digits, spaces and the usual punctuation that appear
# on real SIM cards. Only length and digit content are enforced, because a
# stricter rule rejects valid numbers written in other formats.
MOBILE_RE = re.compile(r"^[0-9+][0-9 ()-]{6,19}$")

AGE_MIN = 10
AGE_MAX = 120


def get_auth_db() -> sqlite3.Connection:
    conn = sqlite3.connect(AUTH_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db() -> None:
    """Create the account and session tables. Safe to call repeatedly."""
    conn = get_auth_db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                age INTEGER NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                mobile TEXT NOT NULL,
                google_sub TEXT UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS password_resets (
                code TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id);
            """
        )
        conn.commit()
    finally:
        conn.close()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(moment: datetime) -> str:
    return moment.isoformat()


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #
class ValidationError(ValueError):
    """A field the caller can correct. `field` names it for the form."""

    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


def validate_registration(
    name: str, age: int, email: str, mobile: str, password: str, confirm: str
) -> tuple[str, str]:
    """Check a registration and return the cleaned `(name, email)`.

    Raises `ValidationError` with a message meant to be shown to the user as-is.
    """
    clean_name = (name or "").strip()
    if len(clean_name) < 2:
        raise ValidationError("name", "Enter your full name.")
    if len(clean_name) > 80:
        raise ValidationError("name", "Name is too long (80 characters maximum).")

    if not isinstance(age, int) or isinstance(age, bool):
        raise ValidationError("age", "Enter your age as a whole number.")
    if not AGE_MIN <= age <= AGE_MAX:
        raise ValidationError("age", f"Age must be between {AGE_MIN} and {AGE_MAX}.")

    clean_email = (email or "").strip().lower()
    if not EMAIL_RE.match(clean_email):
        raise ValidationError("email", "Enter a valid email address.")

    clean_mobile = (mobile or "").strip()
    if not MOBILE_RE.match(clean_mobile):
        raise ValidationError(
            "mobile", "Enter a valid mobile number (7-20 digits, spaces and + allowed)."
        )

    if len(password or "") < MIN_PASSWORD_LENGTH:
        raise ValidationError(
            "password", f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
        )
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValidationError(
            "password",
            f"Password is too long (limit {MAX_PASSWORD_BYTES} bytes).",
        )
    if password != confirm:
        raise ValidationError("confirm", "Passwords do not match.")

    return clean_name, clean_email


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, stored_hash: str | None) -> bool:
    """Check a password against the stored hash.

    A Google-only account has no password hash. That is reported as False rather
    than raising, so an attacker cannot tell the two apart from the response.
    """
    if not stored_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
def get_user_by_email(email: str) -> sqlite3.Row | None:
    conn = get_auth_db()
    try:
        return conn.execute(
            "SELECT * FROM users WHERE email = ?", ((email or "").strip().lower(),)
        ).fetchone()
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> sqlite3.Row | None:
    conn = get_auth_db()
    try:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    finally:
        conn.close()


def get_user_by_google_sub(sub: str) -> sqlite3.Row | None:
    conn = get_auth_db()
    try:
        return conn.execute("SELECT * FROM users WHERE google_sub = ?", (sub,)).fetchone()
    finally:
        conn.close()


def create_user(
    name: str,
    age: int,
    email: str,
    mobile: str,
    password_hash: str | None = None,
    google_sub: str | None = None,
) -> int:
    """Insert a user and return its id.

    Raises `sqlite3.IntegrityError` when the email or Google subject is taken;
    the caller turns that into a 409 rather than leaking which field collided.
    """
    conn = get_auth_db()
    try:
        now = iso(utcnow())
        cursor = conn.execute(
            """
            INSERT INTO users
                (name, age, email, password_hash, mobile, google_sub,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name.strip(),
                int(age),
                email.strip().lower(),
                password_hash,
                mobile.strip(),
                google_sub,
                now,
                now,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)
    finally:
        conn.close()


def update_user_profile(user_id: int, name: str, age: int, mobile: str) -> None:
    """Update the editable profile fields. Email is intentionally not among them."""
    conn = get_auth_db()
    try:
        conn.execute(
            """
            UPDATE users
               SET name = ?, age = ?, mobile = ?, updated_at = ?
             WHERE id = ?
            """,
            (name.strip(), int(age), mobile.strip(), iso(utcnow()), user_id),
        )
        conn.commit()
    finally:
        conn.close()


def set_password(user_id: int, password: str) -> None:
    conn = get_auth_db()
    try:
        conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (hash_password(password), iso(utcnow()), user_id),
        )
        conn.commit()
    finally:
        conn.close()


def set_google_sub(user_id: int, sub: str) -> None:
    """Attach a Google identity to an existing password account."""
    conn = get_auth_db()
    try:
        conn.execute(
            "UPDATE users SET google_sub = ?, updated_at = ? WHERE id = ?",
            (sub, iso(utcnow()), user_id),
        )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #
def create_session(user_id: int) -> tuple[str, str]:
    """Create a session and return `(token, expires_at_iso)`."""
    token = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(days=SESSION_DAYS)
    conn = get_auth_db()
    try:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, iso(utcnow()), iso(expires)),
        )
        conn.commit()
    finally:
        conn.close()
    return token, iso(expires)


def user_for_token(token: str | None) -> sqlite3.Row | None:
    """Resolve a session token to its user, dropping the row if it has expired.

    An expired session is deleted on sight rather than left for a sweep job, so
    a stale token can never be revived by a clock change.
    """
    if not token:
        return None
    conn = get_auth_db()
    try:
        row = conn.execute(
            """
            SELECT s.token AS session_token, s.expires_at, u.*
              FROM sessions s
              JOIN users u ON u.id = s.user_id
             WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        if row is None:
            return None
        if row["expires_at"] < iso(utcnow()):
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            return None
        return row
    finally:
        conn.close()


def delete_session(token: str) -> None:
    conn = get_auth_db()
    try:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    finally:
        conn.close()


def purge_expired() -> None:
    """Remove expired sessions and used/expired reset codes."""
    now = iso(utcnow())
    conn = get_auth_db()
    try:
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
        conn.execute(
            "DELETE FROM password_resets WHERE expires_at < ? OR used_at IS NOT NULL", (now,)
        )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Password reset
# --------------------------------------------------------------------------- #
def create_reset_code(user_id: int) -> tuple[str, str]:
    """Create a single-use reset code and return `(code, expires_at_iso)`."""
    code = f"{secrets.randbelow(10**6):06d}"
    expires = utcnow() + timedelta(minutes=RESET_MINUTES)
    conn = get_auth_db()
    try:
        # One live code per account: issuing a new one retires the previous, so
        # an older email in the inbox cannot be replayed.
        conn.execute("DELETE FROM password_resets WHERE user_id = ?", (user_id,))
        conn.execute(
            """
            INSERT INTO password_resets (code, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (code, user_id, iso(utcnow()), iso(expires)),
        )
        conn.commit()
    finally:
        conn.close()
    return code, iso(expires)


def claim_reset_code(email: str, code: str) -> sqlite3.Row | None:
    """Return the user for a valid, unexpired, unused code, and mark it used."""
    conn = get_auth_db()
    try:
        now = iso(utcnow())
        row = conn.execute(
            """
            SELECT r.code, r.user_id, u.email
              FROM password_resets r
              JOIN users u ON u.id = r.user_id
             WHERE u.email = ? AND r.code = ?
               AND r.used_at IS NULL AND r.expires_at >= ?
            """,
            ((email or "").strip().lower(), (code or "").strip(), now),
        ).fetchone()
        if row is None:
            return None
        conn.execute(
            "UPDATE password_resets SET used_at = ? WHERE code = ?", (now, row["code"])
        )
        conn.commit()
        return row
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Serialisation
# --------------------------------------------------------------------------- #
def public_user(row: "sqlite3.Row | dict[str, Any]") -> dict[str, Any]:
    """The user as the API exposes it.

    `password_hash` and `google_sub` are absent by construction rather than by
    being filtered out later, so a future field cannot leak by being forgotten.

    A `sqlite3.Row` is read by *key*: `getattr(row, "email")` would look for a
    Python attribute called `email`, find none, and silently yield None -- which
    is how a fully-populated account once serialised as a row of nulls.
    """
    if isinstance(row, dict):
        def get(key: str, default: Any = None) -> Any:
            return row.get(key, default)
    else:
        def get(key: str, default: Any = None) -> Any:
            try:
                return row[key]
            except (IndexError, KeyError):
                return default

    return {
        "id": get("id"),
        "name": get("name"),
        "age": get("age"),
        "email": get("email"),
        "mobile": get("mobile"),
        "created_at": get("created_at"),
        "has_password": bool(get("password_hash")),
        "has_google": bool(get("google_sub")),
    }