"""Give every key route a distinct <title>/description via useSeo.
Distinct titles are the prerequisite for Google picking sitelinks — it won't
surface pages it can't tell apart. Each anchor asserted."""
import pathlib, sys

# (file, hook-import-after-this-line, [(component-body-anchor, seo-call)])
EDITS = [
    ("src/pages/MarketplacePage.jsx",
     "export default function MarketplacePage() {",
     "  useSeo({ title: 'Browse skills', description: 'Search 100+ AI skill files across coding, design, data, DevOps and more. Filter by assistant, price and category — every skill ships with proof it works.', path: '/marketplace' });"),
    ("src/pages/LeaderboardPage.jsx",
     "export default function LeaderboardPage() {",
     "  useSeo({ title: 'Leaderboard', description: 'The top builders and top skills on Skill Exchange, ranked by real sales and downloads.', path: '/leaderboard' });"),
    ("src/pages/CreateSkillPage.jsx",
     "export default function CreateSkillPage({ user, onShowAuth }) {",
     "  useSeo({ title: 'Create a Skill', description: 'Turn a project you already shipped into a sellable SKILL.md. Generate the prompt, run it in your project folder, publish.', path: '/create' });"),
    ("src/pages/PublishPage.jsx",
     "export default function PublishPage() {",
     "  useSeo({ title: 'Publish a Skill', description: 'Publish your SKILL.md and earn from every download. Proof of concept required — a live project URL and screenshot. Keep 95%.', path: '/publish' });"),
    ("src/pages/GetVerifiedPage.jsx",
     "export default function GetVerifiedPage({ user, onShowAuth }) {",
     "  useSeo({ title: 'Get Verified', description: 'Earn the Verified Creator badge. A human reviews your proof of concept — no automated approvals.', path: '/verify' });"),
    ("src/pages/LibraryPage.jsx",
     "export default function LibraryPage() {",
     "  useSeo({ title: 'My Library', description: 'Skills you have purchased or downloaded.', path: '/library', noindex: true });"),
]

def add_import(src, path):
    if "lib/seo" in src: return src
    anchor = "import useFetch from '../lib/useFetch.js';"
    imp = "import useSeo from '../lib/seo.js';"
    if anchor in src:
        return src.replace(anchor, anchor + "\n" + imp, 1)
    # fall back: after the first react-router import
    anchor2 = "import { useNavigate } from 'react-router-dom';"
    if anchor2 in src:
        return src.replace(anchor2, anchor2 + "\n" + imp, 1)
    sys.exit(f"no import anchor in {path}")

miss = []
for path, body_anchor, call in EDITS:
    p = pathlib.Path(path); s = p.read_text(encoding="utf-8")
    if body_anchor not in s:
        miss.append(f"{path}: body anchor"); continue
    if "useSeo(" in s:  # already has one
        p.write_text(s, encoding="utf-8"); continue
    s = add_import(s, path)
    s = s.replace(body_anchor, body_anchor + "\n" + call, 1)
    p.write_text(s, encoding="utf-8")
    print("seo:", path)

if miss:
    print("MISSING:", *miss, sep="\n  "); sys.exit(1)
