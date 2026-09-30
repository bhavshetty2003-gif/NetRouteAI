#!/usr/bin/env python3
"""Migrate the NetRouteAI frontend from the broken mixed light/dark palette
onto the semantic tokens defined in src/index.css.

The old UI painted its chrome with light surfaces (bg-white, bg-*-50) while
using dark-theme text colours, so `text-cyan-400` on white rendered at roughly
2:1 contrast. This rewrites every colour class to a token whose pairing is
guaranteed legible on the new dark surfaces.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "frontend" / "src"

# ---------------------------------------------------------------------------
# Token map. Left = exact Tailwind class (without opacity suffix), right = the
# semantic token from index.css.
# ---------------------------------------------------------------------------

INK = {
    "text-slate-100": "text-ink",
    "text-slate-200": "text-ink",
    "text-slate-300": "text-ink-soft",
    "text-slate-400": "text-ink-muted",
    "text-slate-500": "text-ink-faint",
    "text-slate-600": "text-ink-faint",
    "text-slate-700": "text-ink-faint",
    "text-white": "text-ink",
    # Typo in the original: `text-black0` is not a real Tailwind class, so it
    # rendered as no colour at all. It sat on light chips, so it became the
    # dark ink used on bright accent fills.
    "text-black0": "text-accent-ink",
    "text-black": "text-accent-ink",
    # `text-slate-900` was dark-on-bright (buttons). Keep it dark but name it.
    "text-slate-900": "text-accent-ink",
}

ACCENT_TEXT = {
    "text-cyan-200": "text-accent",
    "text-cyan-300": "text-accent",
    "text-cyan-400": "text-accent",
    "text-cyan-500": "text-accent",
    "text-cyan-600": "text-accent",
    "text-teal-200": "text-info",
    "text-teal-300": "text-info",
    "text-teal-400": "text-info",
    "text-teal-500": "text-info",
    "text-indigo-300": "text-info",
    "text-indigo-400": "text-info",
    "text-blue-300": "text-info",
    "text-blue-400": "text-info",
}

STATUS_TEXT = {
    "text-emerald-300": "text-ok",
    "text-emerald-400": "text-ok",
    "text-emerald-500": "text-ok",
    "text-green-400": "text-ok",
    "text-amber-300": "text-warn",
    "text-amber-400": "text-warn",
    "text-yellow-400": "text-warn",
    "text-orange-400": "text-warn",
    "text-rose-100": "text-bad",
    "text-rose-200": "text-bad",
    "text-rose-300": "text-bad",
    "text-rose-400": "text-bad",
    "text-red-200": "text-bad",
    "text-red-300": "text-bad",
    "text-red-400": "text-bad",
    "text-purple-300": "text-ai",
    "text-purple-400": "text-ai",
    "text-purple-500": "text-ai",
}

SURFACE = {
    # Deepest background
    "bg-slate-900": "bg-base",
    "bg-slate-950": "bg-sunken",
    "bg-black": "bg-base",
    # Panels: sidebars, toolbars, modals (these were `bg-white`)
    "bg-white": "bg-panel",
    "bg-slate-800": "bg-panel",
    # Raised: cards, inputs, wells
    "bg-slate-700": "bg-raised",
    # Hover / active overlay
    "bg-slate-600": "bg-overlay",
    "bg-slate-500": "bg-overlay",
}

# Light tinted panels (bg-*-50 / -100) become their dark `*-soft` equivalent.
TINTED = {
    "cyan": "accent",
    "teal": "info",
    "indigo": "info",
    "blue": "info",
    "emerald": "ok",
    "green": "ok",
    "amber": "warn",
    "yellow": "warn",
    "orange": "warn",
    "rose": "bad",
    "red": "bad",
    "purple": "ai",
    "fuchsia": "ai",
    "pink": "ai",
}

# Dark tinted panels (bg-*-900 / -950) also fold into the `*-soft` tokens so
# the palette stays in one place.
DARK_TINT_SUFFIXES = ("900", "950")

LINE = {
    "border-slate-800": "border-line",
    "border-slate-700": "border-line",
    "border-slate-950": "border-line",
    "border-slate-600": "border-line-strong",
    "border-slate-500": "border-line-strong",
    "border-slate-400": "border-line-strong",
    "border-slate-300": "border-line-strong",
    "border-white": "border-line-strong",
    "border-black": "border-line-strong",
    "border-transparent": "border-line",
}

FILL = {
    "bg-cyan-400": "bg-accent",
    "bg-cyan-500": "bg-accent",
    "bg-cyan-600": "bg-accent-deep",
    "bg-cyan-700": "bg-accent-deep",
    "bg-emerald-400": "bg-ok",
    "bg-emerald-500": "bg-ok",
    "bg-emerald-600": "bg-ok",
    "bg-green-500": "bg-ok",
    "bg-teal-400": "bg-info",
    "bg-teal-500": "bg-info",
    "bg-amber-400": "bg-warn",
    "bg-amber-500": "bg-warn",
    "bg-yellow-500": "bg-warn",
    "bg-orange-500": "bg-warn",
    "bg-rose-400": "bg-bad",
    "bg-rose-500": "bg-bad",
    "bg-red-500": "bg-bad",
    "bg-red-600": "bg-bad",
    "bg-purple-500": "bg-ai",
    "bg-purple-600": "bg-ai",
    "bg-indigo-500": "bg-info",
    "bg-indigo-600": "bg-info",
    "bg-blue-500": "bg-info",
    "bg-fuchsia-500": "bg-ai",
    "bg-pink-500": "bg-ai",
}

GRADIENT = {
    "from-cyan-400": "from-accent",
    "from-cyan-500": "from-accent",
    "from-cyan-600": "from-accent",
    "from-cyan-700": "from-accent-deep",
    "to-cyan-400": "to-accent",
    "to-cyan-500": "to-accent",
    "to-cyan-600": "to-accent-deep",
    "to-cyan-700": "to-accent-deep",
    "to-cyan-800": "to-accent-deep",
    "to-teal-300": "to-info",
    "to-teal-400": "to-info",
    "to-teal-500": "to-info",
    "to-teal-600": "to-info",
    "to-indigo-500": "to-info",
    "to-indigo-600": "to-info",
    "to-blue-500": "to-info",
    "to-emerald-400": "to-ok",
    "to-emerald-500": "to-ok",
    "to-emerald-600": "to-ok",
    "to-green-400": "to-ok",
    "to-amber-400": "to-warn",
    "to-amber-500": "to-warn",
    "to-rose-400": "to-bad",
    "to-rose-500": "to-bad",
    "to-red-500": "to-bad",
    "to-purple-500": "to-ai",
    "to-purple-600": "to-ai",
    "to-pink-500": "to-ai",
    "from-emerald-400": "from-ok",
    "from-emerald-500": "from-ok",
    "from-emerald-600": "from-ok",
    "from-green-500": "from-ok",
    "from-teal-400": "from-info",
    "from-teal-500": "from-info",
    "from-amber-500": "from-warn",
    "from-yellow-500": "from-warn",
    "from-rose-500": "from-bad",
    "from-red-500": "from-bad",
    "from-purple-500": "from-ai",
    "from-purple-600": "from-ai",
    "from-indigo-500": "from-info",
    "from-indigo-600": "from-info",
    "from-blue-500": "from-info",
    "from-pink-500": "from-ai",
    # Gradient stops that were simply "the dark background"
    "via-white": "via-panel",
    "to-slate-900": "to-base",
    "to-slate-800": "to-panel",
    "from-slate-950": "from-sunken",
}

RING = {
    "ring-cyan-300": "ring-accent",
    "ring-cyan-400": "ring-accent",
    "ring-cyan-500": "ring-accent",
    "ring-emerald-300": "ring-ok",
    "ring-emerald-400": "ring-ok",
    "ring-emerald-500": "ring-ok",
    "ring-teal-300": "ring-info",
    "ring-teal-400": "ring-info",
    "ring-rose-300": "ring-bad",
    "ring-rose-400": "ring-bad",
    "ring-red-400": "ring-bad",
    "ring-amber-400": "ring-warn",
    "ring-purple-400": "ring-ai",
    "ring-indigo-400": "ring-info",
    "ring-slate-500": "ring-line-strong",
    "ring-slate-600": "ring-line-strong",
    "ring-slate-700": "ring-line",
    "ring-white": "ring-accent",
    "ring-black": "ring-base",
    "accent-cyan-300": "accent-accent",
    "accent-cyan-400": "accent-accent",
    "accent-cyan-500": "accent-accent",
    "accent-emerald-400": "accent-ok",
    "accent-emerald-500": "accent-ok",
    "accent-red-400": "accent-bad",
    "accent-red-500": "accent-bad",
    "caret-cyan-400": "caret-accent",
    "caret-cyan-500": "caret-accent",
    "fill-slate-300": "fill-ink-soft",
    "fill-slate-400": "fill-ink-muted",
    "fill-slate-500": "fill-ink-faint",
    "fill-cyan-400": "fill-accent",
    "fill-cyan-500": "fill-accent",
    "fill-emerald-400": "fill-ok",
    "fill-rose-400": "fill-bad",
    "fill-red-400": "fill-bad",
}

DIVIDE = {
    "divide-slate-700": "divide-line",
    "divide-slate-800": "divide-line",
    "divide-slate-600": "divide-line-strong",
    "divide-white": "divide-line-strong",
}

PLACEHOLDER = {
    "placeholder-slate-400": "placeholder-ink-faint",
    "placeholder-slate-500": "placeholder-ink-faint",
    "placeholder-slate-600": "placeholder-ink-faint",
    "placeholder-cyan-300": "placeholder-ink-faint",
    "placeholder-cyan-400": "placeholder-ink-faint",
    "placeholder-cyan-500": "placeholder-ink-faint",
    "placeholder-rose-300": "placeholder-ink-faint",
    "placeholder-rose-400": "placeholder-ink-faint",
    "placeholder-red-300": "placeholder-ink-faint",
    "placeholder-emerald-300": "placeholder-ink-faint",
}


def build_map() -> dict[str, str]:
    mapping: dict[str, str] = {}
    for group in (INK, ACCENT_TEXT, STATUS_TEXT, SURFACE, LINE, FILL, GRADIENT, RING, DIVIDE, PLACEHOLDER):
        for old, new in group.items():
            mapping.setdefault(old, new)

    # Border colours for every accent/status family.
    for family, token in TINTED.items():
        for shade in ("200", "300", "400", "500", "600", "700", "800", "900", "950"):
            mapping.setdefault(f"border-{family}-{shade}", f"border-{token}")

    # Shadows were coloured with the old `*-950` backgrounds; on the new
    # surfaces a neutral black shadow reads correctly and keeps depth.
    for family in TINTED:
        for shade in ("200", "300", "400", "500", "600", "700", "800", "900", "950"):
            mapping.setdefault(f"shadow-{family}-{shade}", "shadow-black")
    for shade in ("600", "700", "800", "900", "950"):
        mapping.setdefault(f"shadow-slate-{shade}", "shadow-black")

    # Tinted panel backgrounds: light shades and dark shades both collapse onto
    # the single `*-soft` token, with the original alpha preserved. `setdefault`
    # keeps the solid accent fills above (bg-cyan-500 -> bg-accent) intact.
    for family, token in TINTED.items():
        for shade in DARK_TINT_SUFFIXES + ("50", "100", "200", "500", "600", "700", "800"):
            mapping.setdefault(f"bg-{family}-{shade}", f"bg-{token}-soft")

    # Gradient stops that were tinted panels.
    for family, token in TINTED.items():
        for shade in DARK_TINT_SUFFIXES + ("50", "100"):
            mapping.setdefault(f"from-{family}-{shade}", f"from-{token}-soft")
            mapping.setdefault(f"to-{family}-{shade}", f"to-{token}-soft")

    return mapping


def main() -> int:
    mapping = build_map()
    # Longest first so that e.g. `border-slate-700` is not shadowed by a
    # shorter prefix rule.
    keys = sorted(mapping, key=len, reverse=True)

    pattern = re.compile(
        r"(?<![\w-])(" + "|".join(re.escape(k) for k in keys) + r")(/(?:\d{1,3}))?(?![\w/-])"
    )

    changed: list[tuple[Path, int]] = []

    for path in sorted(SRC.rglob("*.ts")) + sorted(SRC.rglob("*.tsx")):
        original = path.read_text(encoding="utf-8")
        count = 0

        def sub(match: re.Match[str]) -> str:
            nonlocal count
            count += 1
            replacement = mapping[match.group(1)]
            alpha = match.group(2)
            return replacement + alpha if alpha else replacement

        updated = pattern.sub(sub, original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append((path.relative_to(SRC), count))

    for path, count in changed:
        print(f"  {path}: {count}")
    print(f"\n{sum(c for _, c in changed)} classes rewritten across {len(changed)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
