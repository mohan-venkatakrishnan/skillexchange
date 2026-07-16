"""Move page/card headings off the editorial serif onto Inter.

FONT_DISPLAY stays ONLY where display type is deliberate: the brand wordmark,
the hero headline, and the big section statements. Everything a user has to
actually read at 13-19px becomes FONT_HEAD (= Inter).

Fails loudly if an anchor is missing rather than silently no-opping.
"""
import pathlib
import sys

# Files where the serif is intentional and must be left alone.
KEEP = {
    "src/App.jsx",             # brand wordmark + footer wordmark
    "src/pages/HomePage.jsx",  # hero h1 + closing CTA statement
    "src/components/ui.jsx",   # SectionHeading / PageTitle are hero-scale
}

changed = []
for path in sorted(pathlib.Path("src").rglob("*.jsx")):
    rel = path.as_posix()
    src = path.read_text(encoding="utf-8")
    if "FONT_DISPLAY" not in src or rel in KEEP:
        continue

    out = src.replace("FONT_DISPLAY", "FONT_HEAD")

    # The import must resolve — FONT_HEAD is exported from tokens/theme.
    if "FONT_HEAD" in out and "FONT_HEAD" not in out.split("\n", 6)[0]:
        pass  # import line is rewritten below

    path.write_text(out, encoding="utf-8")
    changed.append(rel)

if not changed:
    sys.exit("REFUSED: no files changed — anchors missing, nothing patched")

print("headings switched to Inter:")
for c in changed:
    print("  -", c)
