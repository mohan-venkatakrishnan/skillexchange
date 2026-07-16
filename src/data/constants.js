// ── SHARED CONSTANTS ── (verbatim from prototype)
export const CATEGORIES=["Coding","Design","Extension","Desktop","Document","Marketing","Website","Data","DevOps","AI/ML","Testing","Mobile","Other"];
export const PLATFORMS=["Claude","ChatGPT","Gemini","Cursor","Copilot"];

// ── CREATE-A-SKILL PROMPT GENERATOR (fully client-side) ──
// These prompts distil an EXISTING project into a sellable SKILL.md. Claude Code,
// Cursor and Copilot Chat can read the working directory / workspace themselves —
// their prompts tell the assistant to go read the code. ChatGPT and Gemini are
// plain chat sessions with no filesystem access, so their prompts ask the user to
// paste the code in. Never imply a tool can read local files when it can't.
// `readsProject` — true only for tools that can genuinely open your files. It
// drives the honest wording of the "what to do next" steps on Create a Skill.
export const PH={
  Claude:  {name:"Claude / Claude Code",readsProject:true,note:"Run this in Claude Code from inside your project folder — it reads your actual files. In the Claude web/desktop app it can't see your code, so attach or paste your key files first."},
  ChatGPT: {name:"ChatGPT",readsProject:false,note:"ChatGPT can't read your local folder. Paste your key files into the chat (or upload the repo as a zip) before you send the prompt."},
  Gemini:  {name:"Gemini",readsProject:false,note:"Gemini can't read your local folder. Paste your key files into the chat (or upload them) before you send the prompt."},
  Cursor:  {name:"Cursor",readsProject:true,note:"Open your project in Cursor and run this in Chat — it reads the codebase directly. Save the output as SKILL.md in your project root."},
  Copilot: {name:"GitHub Copilot",readsProject:true,note:"Run this in Copilot Chat with your project open — the @workspace prefix lets it read your repo."},
};

const P=d=>d||"[one line: what this project is and what it does]";
const SECTIONS=`## 1. Philosophy — the principles and constraints this project actually follows, and why
## 2. Tech Stack — the real libraries, versions and tooling, read from the manifest and lockfile
## 3. Patterns — the reusable patterns, with code lifted from this codebase
## 4. Anti-patterns — what breaks here, and what was tried and abandoned
## 5. Usage — the exact steps to apply this skill in a fresh session on a new project
## 6. Example Output — a real before/after taken from this project`;

export const PT={
  Claude:  (cat,desc,ts)=>`Read this project in the current working directory, then distil the workflow behind it into a SKILL.md that another developer could follow to build something similar from scratch.

The project: ${P(desc)}
Category: ${cat}
Time this skill should save a reader: ~${ts||"?"}h per use

First, investigate before you write:
- Read the manifest/lockfile, config and build setup to pin the real stack and versions.
- Read enough source to find the conventions this project holds to — file layout, naming, state, error handling, testing.
- Find the non-obvious decisions: the workarounds, the odd-looking code that exists for a reason, anything a newcomer would "clean up" and break.
- Check git history and comments for mistakes that were fixed along the way — those are the anti-patterns.
- Ask me about anything you can't infer from the code. Don't guess.

Then write SKILL.md with exactly these sections:
${SECTIONS}

Rules: everything must be grounded in what is actually in this repository. Quote real code from these files, not invented examples. Be opinionated — say what to do, not what one might consider. Strip out anything specific to this project's business domain so the skill is reusable. No generic advice that would be true of any codebase; if a line would survive being pasted into an unrelated project's guide, cut it.`,
  ChatGPT: (cat,desc,ts)=>`Act as a senior ${cat.toLowerCase()} engineer reverse-engineering a working project into a reusable SKILL.md — a guide that teaches another developer the workflow behind it.

The project: ${P(desc)}
Category: ${cat}
Time this skill should save a reader: ~${ts||"?"}h per use

You can't see my files, so start by asking me for what you need — typically:
- my package manifest / dependency list, so you can pin real versions
- 2-3 representative source files that show how this project is structured
- anything I remember getting wrong and having to fix

Wait for me to paste those in. Don't write the skill from assumptions.

Then write SKILL.md with exactly these sections:
${SECTIONS}

Rules: ground every claim in the code I gave you and quote it directly — no invented examples. Be opinionated and specific. Strip out my business domain so the skill is reusable. Cut any line that would be equally true of an unrelated project. Output one clean .md file.`,
  Gemini:  (cat,desc,ts)=>`Turn a project I've already built into a reusable SKILL.md — a guide that teaches another developer the workflow behind it.

The project: ${P(desc)}
Domain: ${cat}
Time this skill should save a reader: ~${ts||"?"}h per use

You can't read my local folder, so begin by asking me to paste in:
- my dependency manifest, so you can pin real versions
- 2-3 source files that show how this project is actually structured
- the mistakes I made and fixed while building it

Wait for those before writing anything.

Then write SKILL.md with exactly these sections:
${SECTIONS}

Rules: every pattern must come from the code I paste, quoted directly — not invented. Be opinionated and specific; generic advice is worthless here. Strip my business domain so the skill is reusable by anyone.`,
  Cursor:  (cat,desc,ts)=>`Read this codebase — you have the project open — and distil the workflow behind it into a SKILL.md another developer could follow to build something similar.

The project: ${P(desc)}
Category: ${cat}
Time this skill should save a reader: ~${ts||"?"}h per use

Investigate the actual files first:
- Read the manifest and lockfile to pin the real stack and versions.
- Read the source for this project's real conventions — structure, naming, state, error handling.
- Find the non-obvious decisions and the code that looks wrong but isn't.
- Surface the mistakes that were fixed along the way; those become the anti-patterns.
- Ask me anything the code doesn't answer rather than guessing.

Then write SKILL.md with exactly these sections:
${SECTIONS}

Rules: quote real code from this repo — no invented examples. Every rule must be actionable and specific enough to be worth following. Strip this project's business domain so the skill is reusable. Save the result as SKILL.md in the project root.`,
  Copilot: (cat,desc,ts)=>`@workspace Read this repository and distil the workflow behind it into a SKILL.md — a guide that teaches another developer to build something similar.

The project: ${P(desc)}
Category: ${cat}
Time this skill should save a reader: ~${ts||"?"}h per use

Investigate the workspace before writing:
- Pin the real stack and versions from the manifest and lockfile.
- Read the source for this project's conventions and the patterns it repeats.
- Identify the non-obvious decisions and the mistakes that were corrected along the way.
- Ask me about anything the code doesn't explain.

Then write SKILL.md with exactly these sections:
${SECTIONS}

Rules: quote real code from this workspace, not invented examples. Be opinionated and specific. Strip the business domain so the skill is reusable by other developers.`,
};
