"""Reprice the seed catalogue: ~90% free, a small paid tier at $5-6.

A brand-new marketplace with 100 skills all at $4-11 asks for trust it hasn't
earned yet. Free is the acquisition engine — it also makes the download
counters real, since a free download needs no payment. Only the flagship
skills stay paid, and modestly.

Rewrites priceUsd in the frontmatter in place. Idempotent.
"""
import pathlib
import re
import sys

# The paid tier: the strongest, most-differentiated skills — the ones distilled
# from tapdot's own shipped products, plus two OSS guides with unusual depth.
PAID = {
    "end-to-end-saas-webapp": 6,
    "ondevice-ai-extension": 6,
    "payment-webhook-integration": 6,
    "chrome-extension-mv3-basics": 5,
    "pdf-generation": 5,
    "electron-desktop-app": 5,
    "two-sided-matching-engine": 6,
    "playwright-regression-suite": 5,
    "node-graph-ui": 5,
    "writing-tools-extension": 5,
}

seed = pathlib.Path("seed-content")
files = sorted(seed.glob("*.skill.md"))
if not files:
    sys.exit("REFUSED: no seed files found")

changed, paid_n, free_n = 0, 0, 0
for path in files:
    slug = path.name.replace(".skill.md", "")
    raw = path.read_text(encoding="utf-8")
    if not re.search(r"^priceUsd:", raw, re.M):
        sys.exit(f"REFUSED: {path.name} has no priceUsd line")

    want = PAID.get(slug, 0)
    new = re.sub(r"^priceUsd:.*$", f"priceUsd: {want}", raw, count=1, flags=re.M)
    if new != raw:
        path.write_text(new, encoding="utf-8", newline="\n")
        changed += 1
    if want:
        paid_n += 1
    else:
        free_n += 1

print(f"repriced {changed} file(s)")
print(f"  paid: {paid_n} ($5-6)   free: {free_n}   -> {round(free_n / len(files) * 100)}% free")
missing = set(PAID) - {p.name.replace('.skill.md', '') for p in files}
if missing:
    print("  WARNING: paid slugs not found in seed-content:", ", ".join(sorted(missing)))
