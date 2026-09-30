#!/usr/bin/env python3
"""Audit WCAG contrast for the NetRouteAI design tokens.

The theme is defined once in frontend/src/index.css, so contrast can be checked
exhaustively for every foreground/background pairing the UI can produce. This
catches the exact class of defect the old UI had: dark-theme text colours
sitting on light surfaces at roughly 2:1 (unreadable).

Values are plain hex, so this is exact sRGB math with no colour-space
conversion involved.

Run:  python3 scripts/audit_contrast.py
Exit code is non-zero if any pairing fails.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parents[1] / "frontend" / "src" / "index.css"

# Layer surfaces, darkest first.
SURFACES = ["base", "panel", "raised", "overlay", "sunken"]

# Foreground roles and the WCAG bar each must clear:
#   4.5:1 body text, 3.0:1 large text / icons / non-text UI.
FOREGROUNDS: list[tuple[str, str, float]] = [
    ("ink", "body text", 4.5),
    ("ink-soft", "body text", 4.5),
    ("ink-muted", "labels / meta", 4.5),
    ("ink-faint", "decorative", 3.0),
    ("accent", "accent text", 4.5),
    ("ok", "success text", 4.5),
    ("warn", "warning text", 4.5),
    ("bad", "error text", 4.5),
    ("info", "info text", 4.5),
    ("ai", "AI marker", 4.5),
]

# Text drawn on the bright accent fill of primary buttons.
ON_FILLS: list[tuple[str, str, float]] = [
    ("accent-ink", "accent", 4.5),
    ("accent-ink", "accent-deep", 4.5),
    ("accent-ink", "ok", 4.5),
    ("accent-ink", "bad", 4.5),
    ("accent-ink", "ai", 4.5),
]

# Status text sitting on its own tinted panel, e.g. a .pill-warn chip.
ON_SOFT: list[tuple[str, str, float]] = [
    ("ok", "ok-soft", 4.5),
    ("warn", "warn-soft", 4.5),
    ("bad", "bad-soft", 4.5),
    ("info", "info-soft", 4.5),
    ("ai", "ai-soft", 4.5),
    ("accent", "accent-soft", 4.5),
]

# Borders only need to be distinguishable from the surface they sit on.
BORDERS = ["line", "line-strong"]
BORDER_MIN = 1.3


def parse_tokens() -> dict[str, tuple[float, float, float]]:
    text = CSS.read_text(encoding="utf-8")
    tokens: dict[str, tuple[float, float, float]] = {}
    for name, hexval in re.findall(r"--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;", text):
        h = hexval.lstrip("#")
        tokens[name] = tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return tokens


def relative_luminance(rgb: tuple[float, float, float]) -> float:
    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


def main() -> int:
    tokens = parse_tokens()
    if not tokens:
        print(f"no hex tokens parsed from {CSS}")
        return 1

    print(f"parsed {len(tokens)} tokens from {CSS.name}\n")

    failures: list[str] = []
    checked = 0

    def check(fg: str, bg: str, need: float, note: str) -> None:
        nonlocal checked
        if fg not in tokens or bg not in tokens:
            failures.append(f"{fg} on {bg}: token missing")
            return
        ratio = contrast(tokens[fg], tokens[bg])
        checked += 1
        status = "ok" if ratio >= need else "FAIL"
        if ratio < need:
            failures.append(f"{fg} on {bg} = {ratio:.2f}:1, needs {need}:1 ({note})")
        print(f"  {fg:<12} on {bg:<13} {ratio:6.2f}:1  need {need:4.1f}  {status:<4} {note}")

    print("== foreground on every surface ==")
    for fg, role, need in FOREGROUNDS:
        for surface in SURFACES:
            check(fg, surface, need, role)
        print()

    print("== dark ink on bright fills (primary buttons) ==")
    for fg, fill, need in ON_FILLS:
        check(fg, fill, need, "on fill")
    print()

    print("== status text on its own tinted pill ==")
    for fg, soft, need in ON_SOFT:
        check(fg, soft, need, "pill")
    print()

    print("== border separation from surface ==")
    for border in BORDERS:
        for surface in SURFACES:
            check(border, surface, BORDER_MIN, "border")

    print(f"\n{checked} pairings checked, {len(failures)} failing")
    for line in failures:
        print("  FAIL", line)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
