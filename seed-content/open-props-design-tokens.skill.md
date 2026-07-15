---
title: Design Tokens with Open Props Skill
category: Design
description: Build a real token architecture on Open Props instead of sprinkling --size-3 through your stylesheets. Covers the sub-atomic/semantic two-layer alias system, adaptive light/dark theming, motion and elevation tokens, and shipping a themeable product in plain CSS with zero framework lock-in.
usage: Load this skill before asking your AI assistant to set up theming or write CSS in an Open Props project. Describe your brand hue, density, and whether you need dark mode; the assistant will produce a semantic alias layer first, then write components that consume only your aliases — never raw Open Props values.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 4
timeSavedHours: 9
pocUrl: https://github.com/argyleink/open-props
---

# Design Tokens with Open Props Skill

## 1. Philosophy

Open Props gives you a few hundred well-tuned CSS custom properties — sizes, colors, easings, shadows — and no opinions about your product. That freedom is where teams go wrong. They import the whole thing, type `padding: var(--size-3)` in forty components, and six months later have a design system made of magic numbers with nicer names. `--size-3` tells you nothing about *why* that gap exists, so nobody can change it safely.

1. **Open Props is a palette, not a design system.** It supplies raw material. The system is the meaning you assign on top.
2. **Two layers, always.** Sub-atomic props (`--gray-7`, `--size-3`, `--ease-3`) live in exactly one file. Semantic aliases (`--surface-raised`, `--gap-inline`, `--ease-ui`) are the only thing components touch.
3. **A token name should survive a redesign.** `--brand` survives; `--purple-500` does not. When marketing swaps to teal, only the alias file changes.
4. **Adaptive first, dark mode second.** Light and dark are two values of one name, not two stylesheets. Any alias that changes with theme is defined in both, in the same commit.
5. **Plain CSS is the point.** No build step required, no framework config, no JS theme object. A token layer that only works inside one framework is lock-in you didn't need.

Success: a designer rethemes the product by editing one file, and a developer building a screen never types a number.

## 2. Tech Stack

- **Open Props** — https://github.com/argyleink/open-props — licensed **MIT**. A CSS custom-property library of design tokens: sizes, fluid sizes, colors, gradients, shadows, borders, animations, easings, springs.
- **Plain CSS** with `@layer`, custom properties, and `@custom-media`. Works identically in Vite, Astro, Rails, or a static `index.html`.
- **PostCSS** (MIT) with `postcss-custom-media` and `postcss-jit-props` — optional, but JIT props is how you ship only the props you reference instead of the full bundle.
- Supporting cast: `open-props/normalize.min.css`, and native `color-scheme` / `light-dark()` for adaptive theming.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Open Props maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 The two-layer alias file

One file imports Open Props. One file defines your aliases. Nothing else names a raw prop.

```css
/* tokens.css — the only file allowed to name an Open Props variable */
@import "open-props/style";

@layer tokens {
  :root {
    /* brand — alias the ramp position, never the hue name */
    --brand-subtle: var(--indigo-1); --brand: var(--indigo-6);
    --brand-strong: var(--indigo-8); --brand-ink: var(--indigo-0);

    /* surfaces & text */
    --surface-page: var(--gray-0);  --surface-raised: #fff;
    --border-subtle: var(--gray-3);
    --text-primary: var(--gray-9);  --text-secondary: var(--gray-7);

    /* spacing — intent, not magnitude */
    --gap-tight: var(--size-1);     /* icon ↔ label */
    --gap-inline: var(--size-3);    /* sibling controls */
    --gap-stack: var(--size-5);     /* blocks in a column */
    --gap-section: var(--size-8);   /* page sections */
    --pad-card: var(--size-4);

    /* shape & elevation */
    --radius-control: var(--radius-2); --radius-card: var(--radius-3);
    --radius-pill: var(--radius-round);
    --elevation-rest: var(--shadow-2); --elevation-hover: var(--shadow-3);

    /* motion */
    --ease-ui: var(--ease-3); --ease-exit: var(--ease-in-2);
    --ease-bounce: var(--ease-spring-3);
    --dur-instant: 90ms; --dur-ui: 180ms;
  }
}
```

The `@layer tokens` wrapper parks aliases below component styles in the cascade, so a component overrides without a specificity fight.

### 3.2 Adaptive theming with one alias set

Don't write a `.dark` stylesheet. Redefine the *same alias names*, and let `color-scheme` handle native widgets:

```css
@layer tokens {
  :root { color-scheme: light dark; }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --surface-page: var(--gray-10); --surface-raised: var(--gray-9);
      --border-subtle: var(--gray-8);
      --text-primary: var(--gray-1);  --text-secondary: var(--gray-4);
      --brand: var(--indigo-4);       /* not --indigo-6 */
      --brand-ink: var(--gray-12);
    }
  }
}
```

Two non-obvious rules. Dark mode **inverts the ramp direction** — `--brand` moves from `--indigo-6` to `--indigo-4`, because a mid-tone that reads saturated on white reads muddy on near-black. Copying light values into dark is the most common Open Props mistake. And `color-scheme: light dark` on `:root` is what makes scrollbars, `<select>` popups, and date pickers follow your theme; without it your dark page renders a blinding white native picker. If you can drop older browsers, the alias collapses to one line: `--surface-page: light-dark(var(--gray-0), var(--gray-10));`.

### 3.3 Spacing and size scales: pick a lane

Open Props ships three families, and mixing them randomly is how vertical rhythm dies:

- `--size-1` … `--size-15` — the fixed ramp, for padding, gaps, icon boxes. Roughly geometric: `--size-3` → `--size-4` is a *small* step, `--size-7` → `--size-8` is large. Don't assume linearity.
- `--size-fluid-1` … `--size-fluid-10` — `clamp()`-based. Section padding and page gutters only.
- `--size-content-1` … `--size-content-3` — measure caps (~20ch/45ch/60ch) for prose. The token most teams never find and most need.

```css
.prose { max-inline-size: var(--size-content-3); }
.prose > * + * { margin-block-start: var(--gap-stack); }
.page {
  padding-inline: var(--size-fluid-3);   /* fluid: gutters breathe */
  padding-block:  var(--gap-section);    /* fixed: rhythm stays honest */
}
```

Typography follows suit: alias `--font-size-0` … `--font-size-8` into roles (`--type-caption`, `--type-body`, `--type-title`) and pair each with a `--font-lineheight-*`. A size without a paired leading token is a bug waiting for a designer.

### 3.4 Motion tokens: easings and springs are decisions

Open Props gives `--ease-1` … `--ease-5`, directional `--ease-in-*`/`--ease-out-*`, and `--ease-spring-1` … `--ease-spring-5`. Alias by *intent*, then guard globally:

```css
@layer components {
  .toast {
    animation: var(--animation-slide-in-up) forwards;
    animation-duration: var(--dur-ui);
    animation-timing-function: var(--ease-bounce);
  }
  .toast[data-state="closing"] {
    animation: var(--animation-fade-out) forwards;
    animation-duration: var(--dur-instant);        /* exits are short */
    animation-timing-function: var(--ease-exit);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-instant: 1ms; --dur-ui: 1ms; }     /* tokens do most of the work */
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

The rule that survives contact with real products: **things enter with personality and leave without it.** Entrances get springs and `--ease-out-*`; exits get short durations and `--ease-in-*` — nobody enjoys watching an element they dismissed bounce away for 400ms.

The `--animation-*` props (`--animation-fade-in`, `--animation-slide-out-right`, `--animation-shake-x`) are full `animation` *shorthands*. Setting `animation-duration` **after** one works; setting it before does not, because the shorthand resets it — this trips everyone once. And because durations are tokens, the `:root` override above covers every animation that respects the alias layer; the blanket selector is only the net for what doesn't.

### 3.5 Elevation and gradients without the mud

`--shadow-1` … `--shadow-6` are layered, *tinted* shadows — not black at low opacity. That tint is why they look right on white and wrong on dark, where a shadow reads as a smudge rather than a lift. Dark themes elevate with **surface color**, not shadow:

```css
@layer components {
  .card {
    background: var(--surface-raised); padding: var(--pad-card);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-card);
    box-shadow: var(--elevation-rest);
    transition: box-shadow var(--dur-ui) var(--ease-ui);
  }
  .card:hover { box-shadow: var(--elevation-hover); }
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --elevation-rest: none; --elevation-hover: none;  /* elevate with surface */
    --surface-raised: var(--gray-9);                  /* lighter than page = raised */
  }
}
```

The alias layer absorbs the entire strategy change; `.card` never learns dark mode exists. Gradients (`--gradient-1` … `--gradient-30`) are decorative stock art: fine for empty states and marketing, never for a token text sits on — you cannot reason about contrast against a gradient. For branded warmth, build from your own ramp instead.

### 3.6 Shipping only what you use

`@import "open-props/style"` ships every prop. `postcss-jit-props` emits only what you reference — typically a few hundred bytes instead of ~10kB:

```js
// postcss.config.js
import jitProps from "postcss-jit-props";
import OpenProps from "open-props";
import customMedia from "postcss-custom-media";
export default { plugins: [jitProps({ ...OpenProps, layer: "tokens" }), customMedia()] };
```

Two consequences. JIT resolves props **statically** — a prop referenced only from an inline style or a JS string is invisible and renders empty. And because your alias file is the only place raw props appear, JIT sees exactly one file's references: the two-layer architecture makes the build smaller *and* the audit trivial. `grep` one file to know your entire dependency on Open Props. Define breakpoints as aliases too — `@custom-media --sm (min-width: 40rem);` beats memorizing ten you didn't choose.

## 4. Anti-patterns

- **Raw props in components.** `padding: var(--size-3)` in `card.css` is a magic number with a nicer name. If `--size-3` appears outside `tokens.css`, the alias layer is bypassed and the redesign is a find-and-replace.
- **Aliasing by appearance, not role.** `--purple-button`, `--big-gap`, `--shadow-small`. When the brand goes teal, the name lies. Name the job.
- **Copying light values into the dark block.** `--brand: var(--indigo-6)` in both themes gives a muddy, low-contrast brand on dark. Dark moves *toward* the lighter end of the ramp.
- **Forgetting `color-scheme`.** Native selects, scrollbars, and date pickers stay white in your dark theme, and no custom property fixes it.
- **Text on `--gradient-*`.** Decorative gradients have no contrast contract. Any a11y audit finds this immediately.
- **Setting `animation-duration` before the `--animation-*` shorthand.** The shorthand resets it; your override vanishes.
- **Shipping the whole library for six props.** Without `postcss-jit-props`, every visitor downloads every color ramp on earth.
- **Treating Open Props as a component library.** No components, no dark mode for *your* semantics. It hands you variables; the system is still your job.

## 5. Usage

1. Load this skill into your assistant (project skill, Cursor rule, or pasted context).
2. Give it your brand: hue family, density, whether dark mode is required, whether prose measure matters. Ask for `tokens.css` — the alias layer only — and approve it before any component CSS.
3. Instruct explicitly: "Components consume only aliases. If you need a value with no alias, add the alias to `tokens.css` first and tell me."
4. For dark mode, require the light and dark blocks in one response, and check the brand ramp moved direction rather than repeating.
5. Request a motion pass separately: entrance easings, exit easings, durations, `prefers-reduced-motion` guard.
6. Before shipping, ask for a JIT-props config and a grep of every raw `--size-*`/`--gray-*`/`--ease-*` outside `tokens.css`. That list should be empty.

## 6. Example Output

Prompt with this skill loaded: *"Add a dismissible inline banner for unpaid-invoice warnings — warning treatment, icon, close button. Dark mode required."*

Expected shape — new aliases first, then a component that names none of them:

```css
/* tokens.css — additions, both themes, same commit */
@layer tokens {
  :root {
    --warn-surface: var(--yellow-1); --warn-border: var(--yellow-4);
    --warn-ink: var(--yellow-9);     --warn-accent: var(--yellow-7);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --warn-surface: var(--yellow-11);   /* opposite end of the ramp, not a copy */
      --warn-border: var(--yellow-9);
      --warn-ink: var(--yellow-2);        --warn-accent: var(--yellow-4);
    }
  }
}

/* banner.css — names no Open Props primitive */
@layer components {
  .banner {
    display: grid; grid-template-columns: auto 1fr auto;
    gap: var(--gap-inline); padding: var(--pad-card);
    background: var(--warn-surface); color: var(--warn-ink);
    border: 1px solid var(--warn-border);
    border-inline-start: 3px solid var(--warn-accent);
    border-radius: var(--radius-card);
    animation: var(--animation-fade-in);        /* shorthand first… */
    animation-duration: var(--dur-ui);          /* …then the override */
    animation-timing-function: var(--ease-ui);
  }
  .banner__icon { inline-size: var(--size-5); color: var(--warn-accent); }
  .banner__text { font-size: var(--type-caption); max-inline-size: var(--size-content-2); }
  .banner__close {
    display: grid; place-items: center;
    inline-size: var(--size-7); block-size: var(--size-7);
    border: 0; border-radius: var(--radius-pill);
    background: none; color: inherit;
    transition: background var(--dur-instant) var(--ease-ui);
  }
  .banner__close:hover { background: var(--warn-border); }
  .banner__close:focus-visible { outline: 2px solid var(--warn-accent); outline-offset: 2px; }
  .banner[data-state="closing"] {
    animation: var(--animation-fade-out);
    animation-duration: var(--dur-instant);     /* exit: faster, eased-in */
    animation-timing-function: var(--ease-exit);
  }
}
```

```html
<div class="banner" role="status">
  <svg class="banner__icon" aria-hidden="true" viewBox="0 0 24 24"><!-- … --></svg>
  <p class="banner__text">Invoice #4192 is past due. Update your card to avoid interruption.</p>
  <button class="banner__close" aria-label="Dismiss warning">×</button>
</div>
```

Note the markers of skill-compliant output: warning aliases were added to `tokens.css` in both themes before a single component rule existed; the dark values moved to the *opposite end* of the yellow ramp (`--yellow-1` → `--yellow-11`) rather than being copied; the component references zero Open Props primitives directly; `--animation-fade-in` is assigned before `animation-duration` overrides it; the exit is faster and eased-in while the entrance is not; logical properties (`inline-size`, `border-inline-start`) are used throughout; the icon-only close button carries an `aria-label` and keeps a visible `:focus-visible` outline; and `--size-content-2` caps the message measure instead of a hardcoded `max-width`.
