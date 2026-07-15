---
title: Interface Animation with Motion for React Skill
category: Design
description: Ship interface motion that explains state changes instead of decorating them, using Motion for React. Covers layout animations and shared-element transitions, exit choreography with AnimatePresence, when a spring beats a tween, variant orchestration, and the transform-only rule that keeps 60fps on a mid-range Android.
usage: Load this skill before asking your AI assistant to add or fix animation in a React project using Motion. Describe the state change you want to explain — not the effect you want to see — and the assistant will choose layout animation, variants, or gestures accordingly, keep animation on compositor-friendly properties, and wire useReducedMotion from the start.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 6
timeSavedHours: 12
pocUrl: https://github.com/motiondivision/motion
---

# Interface Animation with Motion for React Skill

## 1. Philosophy

Most product animation is added at the end, by someone told to "make it feel more polished." That is why most product animation is noise: fade-ins on page load, cards that scale on hover for no reason, a 600ms modal that makes the app feel slower every single time. Motion is powerful enough to build all of that very efficiently. This skill points it somewhere useful.

1. **Motion explains a state change, or it is decoration.** Before writing an `animate` prop, name the two states and what the user must understand about the transition. "The row moved to the top because you sorted it." "The panel came from the button you clicked." No answer means ship it static.
2. **The interruption is the design.** Users click during animations. A tween must finish or snap; a spring absorbs a new target from its current velocity. Design for the second frame after the user changes their mind.
3. **Transform and opacity, or nothing.** `x`, `y`, `scale`, `rotate`, `opacity` run on the compositor. `width`, `height`, `top`, `margin` run layout every frame and jank on the devices your users actually own. The `layout` prop exists so you can animate layout *results* using transforms.
4. **Duration is inversely proportional to frequency.** A modal opened forty times a day gets 150ms. A once-per-session celebration can afford 600ms. Delight that repeats becomes latency.
5. **Reduced motion is a second design, not a fallback.** `useReducedMotion` should change *what* you animate — opacity instead of position — not merely zero the duration.

The goal: a user who never notices the animation, but would notice its absence.

## 2. Tech Stack

- **Motion** (formerly Framer Motion) — https://github.com/motiondivision/motion — licensed **MIT**. The React animation library providing `motion` components, `AnimatePresence`, layout animations, gestures, and scroll-linked values.
- **React 18+** — `AnimatePresence` and layout animations depend on commit-phase measurement.
- Supporting cast: `motion/react` (the modern import path; `framer-motion` still resolves for legacy code), `LazyMotion` + `domAnimation` for bundle size, and any styling layer — Motion is agnostic.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Motion maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Layout animation: animate the result, not the property

The `layout` prop is the highest-leverage feature in the library. Motion measures the element before and after a re-render, then animates the *difference* with transforms. You change flexbox or grid; Motion makes the geometry change legible.

```tsx
import { motion } from "motion/react";

export function FilterChips({ items, activeId, onPick }: ChipProps) {
  return (
    <div className="chip-row">
      {items.map((item) => (
        <button key={item.id} onClick={() => onPick(item.id)} className="chip">
          {item.label}
          {item.id === activeId && (
            <motion.span
              layoutId="chip-underline"
              className="chip-underline"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
```

`layoutId` is the shared-element mechanism: when one element with an id unmounts and another mounts with the same id, Motion animates one into the other's position — the underline *slides* between chips despite being a different DOM node. That's thirty lines of `getBoundingClientRect` bookkeeping reduced to one prop.

The traps you will hit:

- **Scale distortion.** Layout animation uses `scale`, so children squash mid-flight. Any child that must stay undistorted needs its own `layout` prop. Border radius distorts too — set `borderRadius` in `style` (not a CSS class) and Motion corrects it per frame.
- **`layout` and `transform` don't share.** Animating `x` on the same element fights the layout animation. Layout on a wrapper, transform on the child.
- **`layout="position"`** skips scale correction entirely — cheaper and cleaner for anything moving in a list.
- **Keys are load-bearing.** Index keys mean React reuses nodes and Motion sees nothing move. Stable ids, always.
- **`LayoutGroup`** for independent siblings that resize each other, or one measures before the other commits.

### 3.2 AnimatePresence: exits are a contract

React unmounts immediately. `AnimatePresence` keeps the node alive until `exit` resolves — the only way to animate a component out.

```tsx
import { AnimatePresence, motion } from "motion/react";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="palette-root" className="palette-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }} onClick={onClose}>
          <motion.div className="palette"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.09 } }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* … */}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- **The conditional must be a *direct* child of `AnimatePresence`.** Wrapping it in a component that returns `null` means Presence never sees the child leave and `exit` silently never fires. This is the #1 "why doesn't my exit animation work" bug.
- **Every child needs a stable `key`.** Presence tracks departures by key.
- **Exit is faster than entrance.** Above, the panel springs in and leaves in 90ms. The user already decided to dismiss it; making them watch is a tax.
- **`mode="wait"`** for crossfades that must not overlap (route transitions); **`mode="popLayout"`** when a removed list item should let siblings close the gap immediately.

### 3.3 Spring or tween: a decision, not a taste

| Use a spring | Use a tween |
|---|---|
| The user's hand caused it (drag, hover, tap) | The system caused it (page load, timed reveal) |
| It can be interrupted mid-flight | It runs to completion |
| Layout and `layoutId` animation | `opacity`-only crossfades |
| It should feel physical | It should feel precise |

Springs are interruption-safe because they carry velocity: retarget mid-flight and the element continues from its current speed instead of restarting. Every gesture-driven animation should be a spring. Specify them by **feel**, in one shared file:

```tsx
export const spring = {
  ui:    { type: "spring", stiffness: 520, damping: 38, mass: 0.9 }, // dropdowns, toggles
  panel: { type: "spring", stiffness: 300, damping: 32 },            // sheets, drawers
  pop:   { type: "spring", stiffness: 400, damping: 14 },            // celebration only
} as const;
```

The intuition to keep: **`damping` controls bounce, `stiffness` controls speed.** Bouncy-but-slow (`stiffness: 120, damping: 8`) reads as broken — if you want bounce, raise stiffness with it. Motion also accepts `{ type: "spring", duration: 0.4, bounce: 0.25 }`, the friendlier parameterization and the one to reach for when a designer says "same speed, less bouncy." For tweens: `easeOut` for entrances, `easeIn` for exits, and never `linear` on anything spatial.

### 3.4 Variants: orchestration you don't hand-roll

Variants let a parent broadcast a state name to descendants, unlocking `staggerChildren` — otherwise a pile of `delay: i * 0.05`.

```tsx
const list = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { staggerChildren: 0.045, delayChildren: 0.06 } },
  exit:  { opacity: 0, transition: { staggerChildren: 0.02, staggerDirection: -1 } },
};

const row = {
  hidden: { opacity: 0, y: 12 },
  shown:  { opacity: 1, y: 0, transition: spring.ui },
  exit:   { opacity: 0, y: -6 },
};

export function ResultList({ results }: { results: Result[] }) {
  return (
    <motion.ul variants={list} initial="hidden" animate="shown" exit="exit">
      {results.map((r) => (
        <motion.li key={r.id} variants={row} layout="position">
          <ResultRow result={r} />
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

Children with a `variants` prop and no explicit `initial`/`animate` **inherit the variant name from the parent**. Passing an object — `initial={{ opacity: 0 }}` — *breaks the chain*, and the stagger silently does nothing. That's why your stagger isn't staggering.

Mind the budget: 12 rows × 45ms means the last arrives 540ms late. Past ~10 items, cap it (`staggerChildren: Math.min(0.045, 0.4 / results.length)`). A stagger that outlives the user's attention is latency with choreography.

### 3.5 Gestures: `whileHover`, `whileTap`, `drag` — and their discipline

`whileHover` and `whileTap` are state props, not animations you fire — Motion returns to `animate` on release from wherever the element reached. Never reimplement this with `onMouseEnter` + `useState`.

- **`whileHover` is desktop-only, silently.** On touch it can stick after tap. If hover reveals something load-bearing (a delete button), it needs a focus/tap path too.
- **`whileTap` must not move a target the finger is on.** Scale *down* (0.96–0.98), never up, never translate — a button that jumps under a thumb causes mis-taps.
- **Gestures need real hit areas.** `scale: 1.02` on a 24px icon is invisible; animate a padded wrapper.
- **`whileFocus` is not optional** anywhere you used `whileHover` on an interactive element, or the affordance exists only for mouse owners.
- **`drag` needs `dragConstraints` and `dragElastic`,** and dismissal decided on **velocity**, not distance — a fast flick should dismiss even if short:

```tsx
<motion.div
  drag="y"
  dragConstraints={{ top: 0, bottom: 0 }}
  dragElastic={{ top: 0, bottom: 0.4 }}   // rubber-band down, hard stop up
  onDragEnd={(_, info) => {
    if (info.offset.y > 120 || info.velocity.y > 500) onDismiss();
  }}
/>
```

### 3.6 Scroll-linked motion and `useReducedMotion`

`useScroll` + `useTransform` map scroll to a motion value **without React re-rendering** — the value writes straight to the DOM. Never replicate this with `onScroll` + `setState`; that re-renders the subtree sixty times a second.

```tsx
import { useScroll, useTransform, useReducedMotion, motion } from "motion/react";
import { useRef } from "react";

export function ParallaxHeader({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "35%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div ref={ref} className="header-frame">
      <motion.img src={src} alt="" className="header-image"
                  style={reduced ? { opacity } : { y, opacity }} />
    </div>
  );
}
```

The `offset` tuple is the part to internalize: `["start start", "end start"]` means progress hits 0 when the target's start meets the viewport's start, and 1 when the target's end meets the viewport's start. Most parallax bugs are an offset that never reaches 1 because the element is shorter than the viewport.

Note what reduced motion does here: it doesn't disable the animation, it **swaps the channel** — the image still responds to scroll via opacity, it just doesn't translate. Vestibular triggers are position, scale, and parallax; opacity and color are almost always safe. For a global net, set it once at the root:

```tsx
<MotionConfig reducedMotion="user">{children}</MotionConfig>
```

`reducedMotion="user"` drops transform animations while keeping opacity ones across the whole tree — the safety net under every component whose author forgot.

## 4. Anti-patterns

- **Animating `width`, `height`, `top`, or `margin`.** Every frame triggers layout for the subtree. That's what `layout` is for — same visual result, on the compositor.
- **A conditional child that isn't a *direct* child of `AnimatePresence`.** `exit` never fires, and it looks like a library bug for about two hours.
- **Object `initial` on a variant child.** `initial={{ opacity: 0 }}` instead of `initial="hidden"` severs inheritance and `staggerChildren` quietly does nothing.
- **Index keys in an animated list.** React reuses the nodes; Motion sees nothing move.
- **Fade-in-on-mount for everything.** It makes a fast app feel slow and delays first meaningful paint for zero informational gain. Animate what *changed*, not what merely appeared.
- **Bouncy springs on frequent interactions.** `damping: 10` on a dropdown is charming twice and irritating forever after. Save `pop` for once-per-session moments.
- **`onScroll` + `setState`.** Sixty React renders a second when `useScroll` bypasses render entirely.
- **Treating `useReducedMotion` as `duration: 0`.** The setting means "don't trigger my vestibular system," not "I hate your product." Keep opacity; drop position, scale, parallax.

## 5. Usage

1. Load this skill into your assistant (project skill, Cursor rule, or pasted context).
2. Describe the **state change**, not the effect: "the sidebar collapses and the main panel widens," not "make the sidebar slide." Ask it to name what the motion communicates before writing code — if it can't, ship it static.
3. Ask for a shared spring/transition constants file first, and require every `transition` to reference it. Inline `stiffness: 300` scattered around is the same problem as hardcoded hex.
4. For lists and reordering, instruct: "use `layout="position"` and stable ids; don't hand-roll FLIP."
5. Request the reduced-motion pass separately, and reject `duration: 0` — ask which channel each animation falls back to.
6. Before merging, ask it to list every animated property and justify anything that isn't a transform or opacity.

## 6. Example Output

Prompt with this skill loaded: *"Clicking a project card should expand it into a detail panel — it must feel like the card became the panel, not like a modal appeared."*

Expected shape — shared-element via `layoutId`, not a modal with a fade:

```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { spring } from "@/lib/motion-tokens";

export function ProjectGrid({ projects }: { projects: Project[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = projects.find((p) => p.id === openId) ?? null;

  return (
    <>
      <ul className="grid">
        {projects.map((p) => (
          <motion.li key={p.id} layoutId={`card-${p.id}`} className="card"
                     onClick={() => setOpenId(p.id)}
                     whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                     transition={spring.ui} style={{ borderRadius: 12 }}>
            <motion.img layoutId={`thumb-${p.id}`} src={p.thumb} alt="" className="card__thumb" />
            <motion.h3 layoutId={`title-${p.id}`} className="card__title">{p.name}</motion.h3>
          </motion.li>
        ))}
      </ul>

      <AnimatePresence>
        {open && (
          <motion.div key="scrim" className="scrim"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.1 } }}
                      onClick={() => setOpenId(null)}>
            <motion.article layoutId={`card-${open.id}`} className="detail"
                            style={{ borderRadius: 16 }} transition={spring.panel}
                            onClick={(e) => e.stopPropagation()}
                            role="dialog" aria-modal="true" aria-labelledby={`title-${open.id}`}>
              <motion.img layoutId={`thumb-${open.id}`} src={open.hero} alt="" className="detail__hero" />
              <motion.h2 layoutId={`title-${open.id}`} id={`title-${open.id}`}>{open.name}</motion.h2>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.12, ...spring.ui } }}
                exit={{ opacity: 0, transition: { duration: 0.06 } }}
              >
                <p className="detail__body">{open.description}</p>
              </motion.div>
              <button className="detail__close" onClick={() => setOpenId(null)} aria-label="Close project details">×</button>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

Note the markers of skill-compliant output: `layoutId` does the shared-element work — the card genuinely *becomes* the panel rather than a new node fading over it; the id is shared on three levels (container, thumbnail, title) so nothing snaps mid-flight; `borderRadius` lives in `style` rather than a class so Motion can correct the scale distortion; the detail body is deliberately *not* part of the shared element and enters on a short delay, because content with no counterpart in the source state has nothing to morph from; the scrim exit is 100ms against a spring entrance; springs come from a shared token file rather than inline magic numbers; `whileTap` scales down, never up; and the panel carries `role`, `aria-modal`, and `aria-labelledby`, because a shared-element transition is still a modal to a screen reader — which sees none of the choreography and needs the semantics anyway.
