#!/usr/bin/env python3
"""Audit WCAG contrast for the NetRouteAI design tokens.

The themes are defined once in frontend/src/index.css, so contrast can be
checked exhaustively for every foreground/background pairing the UI can
produce. This catches the exact class of defect the old UI had: dark-theme
text colours sitting on light surfaces at roughly 2:1 (unreadable).

Both themes are audited separately and must both pass. They are separate
scales, not one scale with variants: a colour that clears 4.5:1 on the dark
`base` can be at 1.1:1 on the cream one, and vice versa. Checking only one of
them says nothing about the other.

Values are plain hex, so this is exact sRGB math with no colour-space
conversion involved.

Run:  python3 scripts/audit_contrast.py
Exit code is non-zero if any pairing fails in any theme.
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

# `accent-ink` is FILL ink: text drawn ON a bright fill, never on a page
# surface. It is checked against the surfaces here on purpose. It was being
# used as a general heading and label colour on panels, where it renders at
# 1.0-1.3:1 -- the hero headline, the "NetRouteAI" wordmark and the "Login to
# NetRouteAI" dialog title were all invisible, and nothing caught it because
# the token was only ever audited in the direction it was meant for.
FILL_INK_MISUSE = [("accent-ink", surface, 3.0) for surface in SURFACES]

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


def _rgb(hexval: str) -> tuple[float, float, float]:
    h = hexval.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def parse_themes() -> dict[str, dict[str, tuple[float, float, float]]]:
    """Read the per-theme token values out of index.css.

    Themes are declared as `--nra-*` custom properties on `:root` (light) and
    `.dark` (dark), then republished to Tailwind through `@theme inline`. The
    audit reads the `--nra-*` blocks directly, because that is where the two
    themes are actually distinct -- the `@theme inline` block names each token
    once and points at a variable, so parsing it would yield one value per
    name and quietly check only a single theme.

    `console-*` is deliberately theme-invariant: a device terminal is dark
    whichever chrome surrounds it. It is declared on its own `:root` block and
    is not listed in either theme, so it is folded into both.
    """
    text = CSS.read_text(encoding="utf-8")

    def blocks(selector: str) -> list[dict[str, tuple[float, float, float]]]:
        # Every `{ ... }` body whose selector is exactly the one asked for,
        # merged. `:root` appears twice -- once for the light theme and once for
        # the theme-invariant console palette -- so taking only the first match
        # would silently drop the console inks.
        found = re.findall(
            rf"(?m)^\s*{re.escape(selector)}\s*\{{(.*?)^\s*\}}", text, re.S | re.M
        )
        return [
            {
                name: _rgb(hexval)
                for name, hexval in re.findall(
                    r"--nra-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;", body
                )
            }
            for body in found
        ]

    def merged(selector: str) -> dict[str, tuple[float, float, float]]:
        out: dict[str, tuple[float, float, float]] = {}
        for body in blocks(selector):
            out.update(body)
        return out

    root = merged(":root")
    dark = merged(".dark")
    if not root or not dark:
        raise SystemExit(
            f"could not find both theme blocks in {CSS} "
            f"(found {len(root)} :root tokens, {len(dark)} .dark tokens)"
        )

    console_only = {k: v for k, v in root.items() if k.startswith("console")}
    if not console_only:
        raise SystemExit(f"no console palette found in {CSS}")

    themes = {"light": {**root}, "dark": {**dark, **console_only}}
    for name, toks in themes.items():
        if "console-ink" not in toks:
            raise SystemExit(f"theme {name} is missing its console palette")
    return themes


# The terminal transcript is a dark surface in both themes, so its own inks
# are audited against it rather than against the page.
CONSOLE_ON: list[tuple[str, str, float]] = [
    ("console-ink", "console", 4.5),
    ("console-muted", "console", 4.5),
    ("console-accent", "console", 4.5),
    ("console-ok", "console", 4.5),
    ("console-bad", "console", 4.5),
    ("console-warn", "console", 4.5),
    ("console-ink", "console-raised", 4.5),
]


def relative_luminance(rgb: tuple[float, float, float]) -> float:
    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


def audit_theme(name: str, tokens: dict[str, tuple[float, float, float]]) -> tuple[int, list[str]]:
    failures: list[str] = []
    checked = 0

    def check(fg: str, bg: str, need: float, note: str) -> None:
        nonlocal checked
        if fg not in tokens or bg not in tokens:
            failures.append(f"[{name}] {fg} on {bg}: token missing")
            return
        ratio = contrast(tokens[fg], tokens[bg])
        checked += 1
        if ratio < need:
            failures.append(
                f"[{name}] {fg} on {bg} = {ratio:.2f}:1, needs {need}:1 ({note})"
            )
            print(f"  {fg:<14} on {bg:<14} {ratio:6.2f}:1  need {need:4.1f}  FAIL   {note}")
        else:
            print(f"  {fg:<14} on {bg:<14} {ratio:6.2f}:1  need {need:4.1f}  ok     {note}")

    print(f"\n{'=' * 72}\n== {name.upper()} THEME ({len(tokens)} tokens) ==\n{'=' * 72}")

    print("-- reading text on every surface --")
    for fg, role, need in FOREGROUNDS:
        for surface in SURFACES:
            check(fg, surface, need, role)
        print()

    print("-- fill ink on bright fills (primary buttons) --")
    for fg, fill, need in ON_FILLS:
        check(fg, fill, need, "on fill")
    print()

    print("-- fill ink on surfaces: expected to FAIL, this is the misuse guard --")
    for fg, surface, need in FILL_INK_MISUSE:
        ratio = contrast(tokens[fg], tokens[surface])
        if ratio >= need:
            failures.append(
                f"[{name}] {fg} on {surface} = {ratio:.2f}:1, which would make the "
                f"misuse undetectable -- pick a more distinct fill ink"
            )
            print(f"  {fg:<14} on {surface:<14} {ratio:6.2f}:1  MISUSE NOT CAUGHT")
        else:
            print(
                f"  {fg:<14} on {surface:<14} {ratio:6.2f}:1  caught"
                f"                          (invisible, as intended)"
            )
    print()

    print("-- status text on its own tinted pill --")
    for fg, soft, need in ON_SOFT:
        check(fg, soft, need, "pill")
    print()

    print("-- terminal inks on the console surface --")
    for fg, bg, need in CONSOLE_ON:
        check(fg, bg, need, "terminal")
    print()

    print("-- border separation from surface --")
    for border in BORDERS:
        for surface in SURFACES:
            check(border, surface, BORDER_MIN, "border")

    return checked, failures


def main() -> int:
    themes = parse_themes()
    print(f"parsed {len(themes)} themes from {CSS.name}: {', '.join(themes)}")

    checked = 0
    failures: list[str] = []
    for name, tokens in themes.items():
        count, failed = audit_theme(name, tokens)
        checked += count
        failures.extend(failed)

    print(f"\n{'=' * 72}")
    print(f"{checked} pairings checked across {len(themes)} themes, {len(failures)} failing")
    for line in failures:
        print("  FAIL", line)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
