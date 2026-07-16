"""Move the platform commission 10% -> 5% (sellers keep 95%).

The rate was prose in five components plus `* 0.9` in the publish form, so it
could drift from the money math. Everything seller-facing now derives from
src/data/pricing.js; lambda/src/lib/purchases.mjs stays the authority for
actual money.

Historical purchases are unaffected by design: commissionCents is stored on
each PURCHASE row at sale time and never recomputed (CLAUDE.md §6).

Every anchor asserted — a silent miss would leave a stale "90%" on a page.
"""
import pathlib
import sys

EDITS = [
    ("lambda/src/lib/purchases.mjs", [
        (
            "export const COMMISSION_RATE = 0.10; // stored per transaction, never recalculated",
            "export const COMMISSION_RATE = 0.05; // stored per transaction, never recalculated",
        ),
    ]),
    ("src/pages/HomePage.jsx", [
        (
            "{ n: '04', t: 'Keep 90%', d: 'You set the price. The exchange takes 10% on paid sales — nothing else, ever. Your commission rate is locked at the sale.' },",
            "{ n: '04', t: `Keep ${SELLER_PCT}`, d: `You set the price. The exchange takes ${COMMISSION_PCT} on paid sales — nothing else, ever. Your commission rate is locked at the sale.` },",
        ),
        (
            "t: 'Sellers keep 90%', d: 'A flat 10% commission on paid sales, stored per transaction so your rate never changes retroactively.'",
            "t: `Sellers keep ${SELLER_PCT}`, d: `A flat ${COMMISSION_PCT} commission on paid sales, stored per transaction so your rate never changes retroactively.`",
        ),
        (
            "You've already solved it once. Package it as a skill, prove it with the project it shipped, and keep 90% of every sale.",
            "You've already solved it once. Package it as a skill, prove it with the project it shipped, and keep {SELLER_PCT} of every sale.",
        ),
    ]),
    ("src/pages/MyProfilePage.jsx", [
        (
            'body="Package a workflow you\'ve already built, prove it with the project it shipped, and keep 90% of every sale."',
            'body={`Package a workflow you\'ve already built, prove it with the project it shipped, and keep ${SELLER_PCT} of every sale.`}',
        ),
    ]),
    ("src/pages/PublishPage.jsx", [
        (
            '<SectionTitle title="Pricing" sub="One-time payment. You keep 90% of every sale." />',
            '<SectionTitle title="Pricing" sub={`One-time payment. You keep ${SELLER_PCT} of every sale.`} />',
        ),
        (
            "${(form.amount * 0.9).toFixed(2)}",
            "${sellerEarns(form.amount).toFixed(2)}",
        ),
    ]),
]

IMPORTS = {
    "src/pages/HomePage.jsx": ("import { CATEGORIES } from '../data/constants.js';", "import { SELLER_PCT, COMMISSION_PCT } from '../data/pricing.js';"),
    "src/pages/MyProfilePage.jsx": ("import * as api from '../lib/api.js';", "import { SELLER_PCT } from '../data/pricing.js';"),
    "src/pages/PublishPage.jsx": ("import * as api from '../lib/api.js';", "import { SELLER_PCT, sellerEarns } from '../data/pricing.js';"),
}

missing = []
for path, pairs in EDITS:
    p = pathlib.Path(path)
    src = p.read_text(encoding="utf-8")
    for old, new in pairs:
        if old not in src:
            missing.append(f"{path}: {old[:70]}")
            continue
        src = src.replace(old, new, 1)
    if path in IMPORTS:
        anchor, imp = IMPORTS[path]
        if "data/pricing" not in src:
            if anchor not in src:
                missing.append(f"{path}: IMPORT ANCHOR {anchor[:50]}")
            else:
                src = src.replace(anchor, f"{imp}\n{anchor}", 1)
    p.write_text(src, encoding="utf-8")

if missing:
    print("MISSING ANCHORS — commission may be stale in these places:")
    for m in missing:
        print("  !!", m)
    sys.exit(1)

print("commission moved to 5% (sellers keep 95%) across UI + money math")
