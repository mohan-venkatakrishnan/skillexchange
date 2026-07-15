// ── SHARED CONSTANTS ── (verbatim from prototype)
export const CATEGORIES=["Coding","Design","Extension","Desktop","Document","Marketing","Website","Data","DevOps","AI/ML","Testing","Mobile","Other"];
export const PLATFORMS=["Claude","ChatGPT","Gemini","Cursor","Copilot"];

// ── CREATE-A-SKILL PROMPT GENERATOR (fully client-side) ──
export const PH={
  Claude:  {name:"Claude / Claude Code",note:"Works best in Claude Code. Paste as your first message in a new project session."},
  ChatGPT: {name:"ChatGPT",note:"Paste into a new chat. Ask ChatGPT to save the output as a .md file."},
  Gemini:  {name:"Gemini",note:"Paste into Gemini Advanced. Works well in Google Docs integration too."},
  Cursor:  {name:"Cursor",note:"The output can also be saved as .cursorrules in your project root."},
  Copilot: {name:"GitHub Copilot",note:"Paste into a Copilot Chat session or save as a workspace instruction file."},
};

export const PT={
  Claude:  (cat,desc,ts)=>`You are an expert in ${cat.toLowerCase()} development. Generate a SKILL.md file for:

Skill: ${desc||"[describe what your skill does]"}
Category: ${cat}
Estimated time saved: ~${ts||"?"}h per use

Include these sections:
## 1. Philosophy — core principles and constraints
## 2. Tech Stack — specific tools, libraries, versions
## 3. Patterns — reusable code patterns with real examples
## 4. Anti-patterns — common mistakes to avoid
## 5. Usage — exact steps to use in a Claude Code session
## 6. Example Output — a before/after or sample

Be specific and opinionated. Include real code. This will be used by other developers on Skill Exchange.`,
  ChatGPT: (cat,desc,ts)=>`Act as a senior ${cat.toLowerCase()} expert. Create a SKILL.md file for:

Skill: ${desc||"[describe what your skill does]"}
Category: ${cat}
Time saved: ~${ts||"?"}h

Sections: 1) Overview & Philosophy 2) Required Tools 3) Core Patterns with code 4) Anti-patterns 5) How to Use 6) Sample Output

Make it specific and actionable. Output as a clean .md file.`,
  Gemini:  (cat,desc,ts)=>`Generate a SKILL.md for:

Skill: ${desc||"[describe what your skill does]"}
Domain: ${cat}
Time saved per use: ~${ts||"?"}h

Sections: Philosophy · Tools & Dependencies · Reusable Patterns · Anti-patterns · Usage Guide · Example

Be opinionated and specific. Generic advice is not useful.`,
  Cursor:  (cat,desc,ts)=>`Generate a .cursorrules compatible SKILL.md for:

Skill: ${desc||"[describe what your skill does]"}
Category: ${cat}
Time saved: ~${ts||"?"}h

Include: Rules & Philosophy · Stack & Setup · Code Patterns · Anti-patterns · Usage

Be precise. Use real code. Every rule must be actionable.`,
  Copilot: (cat,desc,ts)=>`Create a GitHub Copilot workspace instruction file (SKILL.md) for:

Skill: ${desc||"[describe what your skill does]"}
Category: ${cat}
Time saved: ~${ts||"?"}h

Sections: 1) Skill Overview 2) Coding Conventions 3) Reusable Patterns 4) Edge Cases 5) How to Use

Include real code examples.`,
};
