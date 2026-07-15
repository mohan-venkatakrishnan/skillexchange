---
title: Node Graph UI Skill
category: Coding
description: Build a smooth, dependency-free node-graph/canvas UI in React — pan/zoom, pointer-captured node dragging, bezier edge rendering, selection, and keyboard shortcuts — using the interaction and rendering patterns proven in LaunchPad's shipped canvas layer. Every primitive here (tap-vs-drag discrimination, DPR-correct canvas loops, SVG path edges, RAF lifecycle hygiene) runs in production today.
usage: Load this skill when building any spatial canvas UI — node editors, flow builders, mind maps, pipeline designers. Give the AI your node/edge data shape, then implement Section 5's steps in order; the pointer-capture and coordinate-space patterns in Section 3 are the load-bearing parts, so apply them verbatim before adding features.
platforms: [Claude, Cursor]
priceUsd: 7
timeSavedHours: 24
pocUrl: https://launch.tapdot.org
---
# Node Graph UI Skill

## 1. Philosophy

A node graph is three coordinate spaces (screen, world, node-local), one interaction state machine, and a render loop. Get those right and every feature — dragging, marquee selection, edge routing — is twenty lines. Get them wrong and every feature fights every other feature.

Rules this skill enforces, each earned in a shipped canvas UI (LaunchPad's draggable dock, animated flight-path scene, and starfield canvas):

- **No graph library until you've outgrown this file.** React Flow is 500KB of someone else's opinions. The full primitive set below is ~400 lines you own and can restyle infinitely.
- **Pointer events only.** Never mix mouse + touch handlers. `setPointerCapture` gives you correct dragging even when the cursor leaves the element or the window.
- **A click is a failed drag.** There is no separate click handler on draggable things — a tap is strictly a matched pointerdown→pointerup pair under a 4px movement threshold. This kills ghost clicks, drag-then-accidental-select, and synthesized-event bugs in one move.
- **Transform state lives in a ref, paints via rAF.** Panning through React state at 120Hz re-renders the world. Mutate a ref, schedule one `requestAnimationFrame` that writes a single CSS transform.
- **DOM nodes, SVG edges, canvas effects.** Nodes want text/inputs/focus (DOM). Edges want beziers with hit-testing (SVG). Background grids/particles want raw speed (canvas). Use all three layers in one stacked container; don't force one to do another's job.
- **Everything degrades.** Ship a perf tier (`high | mid | low`): low tier drops shadows, animation loops, and live edge glows. Users on old laptops are still users.

## 2. Tech Stack

- React 18 + Vite — but the patterns are framework-light; all hot-path work happens in refs and effects, not renders.
- Zero graph dependencies. `<div>` nodes, one absolutely-positioned `<svg>` edge layer, optional `<canvas>` background.
- Pointer Events API (`setPointerCapture`, `pointercancel`, `lostpointercapture`).
- CSS custom properties for theme; `data-testid` on every interactive element (your Playwright suite will thank you).

## 3. Patterns

### 3.1 The three-layer stage and the world transform

```jsx
// One transform to rule them all: screen = world * scale + offset
// Held in a ref; painted at most once per frame.
function useViewport(stageRef, worldRef) {
  const view = useRef({ x: 0, y: 0, k: 1 });   // offset + zoom
  const raf = useRef(0);
  const paint = () => {
    raf.current = 0;
    const { x, y, k } = view.current;
    worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  };
  const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(paint); };

  const toWorld = (clientX, clientY) => {
    const r = stageRef.current.getBoundingClientRect();
    const { x, y, k } = view.current;
    return { x: (clientX - r.left - x) / k, y: (clientY - r.top - y) / k };
  };
  return { view, schedule, toWorld };
}
```

```jsx
<div className="stage" ref={stageRef}>            {/* overflow:hidden; touch-action:none */}
  <canvas className="stage-bg" />                 {/* grid / particles, screen space */}
  <div className="world" ref={worldRef}>          {/* transformed layer */}
    <svg className="edges" />                     {/* under the nodes */}
    {nodes.map((n) => <Node key={n.id} … />)}     {/* absolutely positioned divs */}
  </div>
</div>
```

`touch-action: none` on the stage is non-negotiable — without it, mobile browsers claim the pan gesture for scrolling before your pointermove ever fires.

### 3.2 Zoom-to-cursor (the only wheel handler you need)

```js
const onWheel = (e) => {
  e.preventDefault();
  const v = view.current;
  const factor = Math.exp(-e.deltaY * 0.0015);          // smooth on mouse AND trackpad
  const k = Math.min(2.5, Math.max(0.2, v.k * factor));
  const r = stageRef.current.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  // keep the world point under the cursor stationary:
  v.x = px - ((px - v.x) / v.k) * k;
  v.y = py - ((py - v.y) / v.k) * k;
  v.k = k;
  schedule();
};
// register with { passive: false } — preventDefault is silently ignored otherwise
useEffect(() => {
  const el = stageRef.current;
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}, []);
```

Zoom that centers on the viewport instead of the cursor feels broken within seconds. The two-line reprojection above is the entire fix.

### 3.3 Tap-vs-drag with pointer capture (the load-bearing pattern)

This is the exact discrimination pattern from LaunchPad's draggable dock, generalized to graph nodes. No `click` listener exists — so no synthesized or ghost click can ever mis-fire selection:

```js
const DRAG_THRESHOLD = 4;   // px — below this, it's a tap

function attachNodeDrag(el, node, { toWorld, onMove, onTap }) {
  let activePointer = null, dragging = false;
  let startX = 0, startY = 0, origin = { x: 0, y: 0 };

  const onDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;  // primary button / touch only
    activePointer = e.pointerId;
    try { el.setPointerCapture(activePointer); } catch { /* ignore */ }
    startX = e.clientX; startY = e.clientY;
    origin = { x: node.x, y: node.y };
    dragging = false;
    e.stopPropagation();          // the stage's pan handler must not also fire
    e.preventDefault();
  };
  const onPtrMove = (e) => {
    if (activePointer === null || e.pointerId !== activePointer) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragging = true;
    const k = viewScale();                       // divide by zoom or drags "slip"
    onMove(node.id, origin.x + dx / k, origin.y + dy / k);
  };
  const finish = (e, isUp) => {
    if (activePointer === null || (e && e.pointerId !== activePointer)) return;
    try { el.releasePointerCapture(activePointer); } catch { /* ignore */ }
    activePointer = null;
    if (!dragging && isUp) onTap(node.id, e);    // a tap is a failed drag
    dragging = false;
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onPtrMove);
  el.addEventListener('pointerup', (e) => finish(e, true));
  el.addEventListener('pointercancel', (e) => finish(e, false));   // voids the tap
  el.addEventListener('lostpointercapture', () => { dragging = false; });
  el.addEventListener('mousedown', (e) => e.preventDefault());     // keep text selection alive elsewhere
}
```

The same pattern with `onTap` = "toggle selection" and `onMove` = "move all selected nodes by the same delta" gives you multi-node drag for free. Stage panning is this identical pattern attached to the stage itself, mutating `view.current.x/y`.

### 3.4 Edges as cubic beziers, ports as anchors

```jsx
function edgePath(a, b) {
  // horizontal-out, horizontal-in — the classic node-editor curve.
  // Pull strength scales with distance but is clamped so short edges don't loop.
  const dx = Math.max(40, Math.min(160, Math.abs(b.x - a.x) * 0.5));
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function Edge({ from, to, selected, onSelect }) {
  const d = edgePath(from, to);
  return (
    <g className={selected ? 'edge sel' : 'edge'}>
      {/* invisible fat twin for hit-testing — a 2px stroke is unclickable */}
      <path d={d} stroke="transparent" strokeWidth="14" fill="none"
            style={{ pointerEvents: 'stroke' }} onPointerDown={onSelect} />
      <path d={d} className="edge-line" fill="none" />
    </g>
  );
}
```

Two production tricks from LaunchPad's SVG path work:

- **Draw-in animation**: set `strokeDasharray = \`${t * total} ${total}\`` where `total = path.getTotalLength()` — this is how you animate an edge "growing" from source to target when it's created.
- **Place labels/decorations on the path**: `path.getPointAtLength(t * total)` gives you the midpoint (t=0.5) for an edge label, and sampling two nearby points gives the tangent angle for an arrowhead: `Math.atan2(p2.y - p1.y, p2.x - p1.x)`.

While the user is dragging out a new edge from a port, render one temporary edge from the port to `toWorld(e.clientX, e.clientY)`; on `pointerup` over another port, commit it. On `pointerup` anywhere else, drop it — never leave a dangling ghost edge.

### 3.5 The background canvas — DPR-correct, lifecycle-clean

If you add a canvas layer (dot grid, particles, minimap), this skeleton avoids the three classic bugs — blurry rendering, leaked RAF loops, and resize smearing:

```js
useEffect(() => {
  const cv = ref.current, ctx = cv.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 1.6);  // cap it: 3x retina wastes GPU
  let W = 0, H = 0, raf = null, disposed = false;

  function resize() {
    W = cv.width = Math.floor(cv.clientWidth * DPR);    // backing store in device px
    H = cv.height = Math.floor(cv.clientHeight * DPR);
  }
  function loop() {
    if (disposed) return;                               // guard: unmount mid-frame
    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, view.current, DPR);                   // grid pans/zooms with the world
    raf = requestAnimationFrame(loop);
  }
  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(loop);
  return () => {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}, []);
```

If the graph is embedded in a scrolling page, pause the loop off-screen with an `IntersectionObserver` (threshold ~0.2), exactly as LaunchPad's landing animation does — cancel the RAF when not intersecting, restart when visible. Idle canvases burning CPU are the top complaint on laptop battery.

If nothing on the canvas is animating, don't run a loop at all — redraw only from `schedule()` when the viewport changes.

### 3.6 Selection, marquee, and keyboard shortcuts

```js
// selection is a Set in state; taps and marquee both write to it
const [sel, setSel] = useState(() => new Set());

const onNodeTap = (id, e) => setSel((s) => {
  if (e.shiftKey) { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }
  return new Set([id]);
});

// marquee = stage-drag while Shift is held: track a world-space rect,
// on release select every node whose bounds intersect it.

useEffect(() => {
  const onKey = (e) => {
    // NEVER steal keys from form fields inside nodes
    const t = e.target;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const world = worldFromCenter();
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
    else if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); selectAll(); }
    else if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); duplicateSelected(); }
    else if (e.key === 'Escape') setSel(new Set());
    else if (e.key === 'f') fitToContent();      // zoom-to-fit: everyone expects it
    else if (e.key.startsWith('Arrow')) nudgeSelected(e.key, e.shiftKey ? 10 : 1);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);
```

`fitToContent` is: compute the bounding box of all nodes, set `k = min(stageW / boxW, stageH / boxH) * 0.9` (clamped), center the offset. Bind it to a button too — keyboard-only affordances are invisible.

### 3.7 Perf tiering

```js
// tier.js — decided once at startup, persisted, overridable (and forced to
// 'low' in tests for deterministic screenshots)
const saved = localStorage.getItem('graph-tier');
export const TIER = saved
  ?? (navigator.hardwareConcurrency <= 4 || matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'low' : navigator.hardwareConcurrency >= 8 ? 'high' : 'mid');
```

Low tier: no background animation loop (static grid), no node shadows/glows, no edge draw-in animation, instant transforms instead of eased ones. The graph must be fully *functional* — identical data, identical interactions — on every tier; only the garnish varies. This doubles as your test determinism switch.

## 4. Anti-patterns

- **Panning/dragging through React state.** `setState` per pointermove re-renders every node at 120Hz; the graph judders at 30 nodes. Refs + one rAF-batched CSS transform stays smooth at 500. Commit to state once, on pointerup.
- **`click` handlers on draggable elements.** Every drag ends with a click event landing on whatever is under the cursor. The tap-is-a-failed-drag pattern (§3.3) is the cure; the drag threshold must be checked with `Math.hypot`, not per-axis.
- **Forgetting to divide drag deltas by zoom.** Nodes "slip" under the cursor at any zoom ≠ 1. Screen delta / `view.k` = world delta, always.
- **`{ passive: true }` (the default) wheel listeners.** Your `preventDefault` is silently ignored and the page scrolls while zooming. Register with `{ passive: false }` explicitly.
- **Hit-testing the visible edge stroke.** A 2px path is unclickable. Ship the invisible 14px twin with `pointer-events: stroke`.
- **Sizing the canvas in CSS pixels only.** Blurry on retina. Backing store = CSS size × DPR, and cap DPR (~1.6) — full 3x costs GPU for imperceptible gain on a moving canvas.
- **Global key handlers that swallow typing.** A Delete shortcut that fires while the user edits a node label deletes the node. Check `e.target.closest('input, textarea, [contenteditable]')` first — one guard, top of the handler.
- **Leaking RAF loops on unmount.** A `disposed` flag plus `cancelAnimationFrame` in the effect cleanup, every time. React StrictMode double-mounting will expose you immediately.
- **Mixing mouse and touch event handlers.** You'll fix the same bug twice, then get both simultaneously on hybrid laptops. Pointer events with capture, `pointercancel` handled (it voids the pending tap), nothing else.

## 5. Usage

1. **State the data shape**: "Nodes are `{ id, x, y, w, h, data }`, edges are `{ id, from: {node, port}, to: {node, port} }`, in a Zustand store. Build the three-layer stage from §3.1 with `touch-action: none`."
2. **Viewport first**: implement `useViewport`, stage panning (the §3.3 pattern on the stage), and zoom-to-cursor (§3.2). Verify: pan and zoom feel right *before* any node exists — a broken world transform poisons everything after it.
3. **Nodes**: absolutely-positioned divs at world coordinates, wired with `attachNodeDrag`. Verify at zoom 0.5 and 2.0 that nodes track the cursor exactly.
4. **Edges**: SVG layer under the nodes, `edgePath` beziers, fat invisible hit-twins, port-drag edge creation with the temporary ghost edge.
5. **Selection & keyboard**: tap/shift-tap, marquee, Delete / Ctrl+A / Ctrl+D / Escape / F-to-fit with the form-field guard.
6. **Polish under a tier flag**: dot-grid canvas background (§3.5), edge draw-in via strokeDasharray, node shadows — all skipped on `TIER === 'low'`.
7. **Test hooks**: `data-testid` on stage, every node, every edge; expose `window.__graph = { toWorld, view }` in dev/test builds so Playwright can assert world coordinates instead of eyeballing pixels.

Ask the AI to implement steps 2–3 in one pass and *stop for manual feel-testing* before continuing — interaction feel cannot be code-reviewed.

## 6. Example Output

Component tree a session with this skill produces:

```
src/graph/
├── Stage.jsx        # layers, useViewport, pan + wheel-zoom, marquee
├── Node.jsx         # attachNodeDrag, ports, selection ring
├── Edge.jsx         # bezier + fat hit-twin + draw-in animation
├── GridCanvas.jsx   # DPR-correct background, IO-paused loop
├── useGraphStore.js # nodes/edges/selection; commit-on-pointerup
├── shortcuts.js     # keyboard map with form-field guard
└── tier.js          # high | mid | low
```

Interaction acceptance checklist (paste into the session as the definition of done):

```
[ ] Wheel-zoom keeps the point under the cursor stationary (test at corners)
[ ] Node drag tracks the cursor exactly at zoom 0.5, 1.0, 2.0
[ ] A 3px wiggle on a node still counts as a click (selects, doesn't move)
[ ] Dragging out of the window and releasing doesn't strand a drag state
[ ] pointercancel (alt-tab mid-drag on touch) neither moves nor selects
[ ] Edge clickable along its whole length, not just where the 2px line is
[ ] Delete pressed while renaming a node deletes a CHARACTER, not the node
[ ] 200 nodes: pan stays at 60fps (Performance panel, 6x CPU throttle)
[ ] Background loop stops when the tab/section is off-screen
[ ] tier=low renders a functional, static-background graph
```
