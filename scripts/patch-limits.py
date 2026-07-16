"""Attach maxLength to every user-facing text field, sourced from data/limits.js.

Asserts each anchor so a silent no-op is impossible — a limit that quietly
fails to apply is worse than no limit, because you believe it's there.
"""
import pathlib
import sys

EDITS = [
    (
        "src/pages/MyProfilePage.jsx",
        "import * as api from '../lib/api.js';",
        [
            ('testId="profile-name" />', 'testId="profile-name" maxLength={LIMITS.name} />'),
            ('testId="profile-location" />', 'testId="profile-location" maxLength={LIMITS.location} />'),
            ('testId="profile-bio" />', 'testId="profile-bio" maxLength={LIMITS.bio} />'),
        ],
    ),
    (
        "src/components/AuthModal.jsx",
        "import UsernameField, { USERNAME_RE } from './UsernameField.jsx';",
        [
            ('testId="signup-name" />', 'testId="signup-name" maxLength={LIMITS.name} />'),
        ],
    ),
    (
        "src/pages/PublishPage.jsx",
        "import * as api from '../lib/api.js';",
        [
            ('testId="pub-title" />', 'testId="pub-title" maxLength={LIMITS.skillTitle} />'),
            ('testId="pub-description" />', 'testId="pub-description" maxLength={LIMITS.skillDescription} />'),
            ('testId="pub-usage" />', 'testId="pub-usage" maxLength={LIMITS.skillUsage} />'),
            ('testId="pub-pocurl" style={{ fontSize: 12.5 }} />', 'testId="pub-pocurl" maxLength={LIMITS.pocUrl} style={{ fontSize: 12.5 }} />'),
        ],
    ),
    (
        "src/pages/GetVerifiedPage.jsx",
        "import * as api from '../lib/api.js';",
        [
            ('placeholder="Link to your published skill" />', 'placeholder="Link to your published skill" maxLength={LIMITS.verifyUrl} />'),
            ('placeholder="Tell us about the product you built with this skill…" />', 'placeholder="Tell us about the product you built with this skill…" maxLength={LIMITS.verifyNote} />'),
        ],
    ),
]

REL = {"src/pages": "../data/limits.js", "src/components": "../data/limits.js"}

print("attaching maxLength:")
total = 0
for path, import_anchor, pairs in EDITS:
    p = pathlib.Path(path)
    src = p.read_text(encoding="utf-8")
    changed = 0
    for old, new in pairs:
        if old not in src:
            print(f"  !! MISSING anchor in {path}: {old[:55]}")
            continue
        src = src.replace(old, new, 1)
        changed += 1
    if changed and "data/limits" not in src:
        if import_anchor not in src:
            sys.exit(f"REFUSED: import anchor missing in {path}")
        rel = REL["/".join(path.split("/")[:2])]
        src = src.replace(import_anchor, f"import {{ LIMITS }} from '{rel}';\n{import_anchor}", 1)
    p.write_text(src, encoding="utf-8")
    total += changed
    print(f"  {path}: {changed}/{len(pairs)} field(s)")

if not total:
    sys.exit("REFUSED: nothing patched")
print(f"\n{total} fields limited")
