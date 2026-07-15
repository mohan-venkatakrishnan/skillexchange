---
title: Accessible Components with Headless UI Skill
category: Design
description: Build Listbox, Combobox, Dialog, Menu, and Tabs that behave correctly for keyboard and screen-reader users instead of divs with click handlers. Covers data-attribute styling, the `as` prop, focus management, async Combobox filtering, and the accessibility gaps Headless UI deliberately leaves to you.
usage: Load this skill before asking your AI assistant to build any interactive widget — dropdown, autocomplete, modal, tab set — in a Headless UI project. Describe the interaction and your Tailwind tokens; the assistant will reach for the right primitive, style it through `data-*` attributes, and flag the labels and announcements Headless UI will not supply on your behalf.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 5
timeSavedHours: 12
pocUrl: https://github.com/tailwindlabs/headlessui
---

# Accessible Components with Headless UI Skill

## 1. Philosophy

Headless UI sells you behavior and nothing else. No borders, no shadows, no opinions about spacing — just the WAI-ARIA state machine that takes a senior engineer two weeks to get wrong. The mental model that keeps teams out of trouble:

1. **The primitive owns the state machine; you own the pixels.** Arrow-key traversal, typeahead, `aria-activedescendant`, focus return on close, scroll locking — that is the product you are buying. Every line you write should be about appearance, not about which element is focused.
2. **State is published as DOM attributes, not as a render prop you must thread.** `data-open`, `data-active`, `data-selected`, `data-disabled`, and `data-focus` land on the element. Style them. Computing class names from render props is the old API and it doubles your markup.
3. **"Accessible component" ≠ "accessible feature."** A perfect `Listbox` inside a form with no label is inaccessible. Headless UI cannot know what your control means. Naming, announcements, and error association stay your job — permanently.
4. **If you are fighting the primitive, you picked the wrong one.** A `Menu` that must stay open while the user types is a `Popover` containing inputs. A `Listbox` that needs free text is a `Combobox`. Choosing correctly eliminates almost all custom keyboard code. The finish line: a keyboard-only user completes every flow without touching the mouse, and you never wrote a `keydown` handler.

## 2. Tech Stack

- **Headless UI** — https://github.com/tailwindlabs/headlessui — licensed **MIT**. Unstyled, fully accessible UI primitives for React and Vue, built by the Tailwind CSS team.
- **React 18+** — the primitives rely on modern concurrent-safe effects and `useId`.
- **Tailwind CSS** (MIT) — pairs with the `data-*` API via variants like `data-open:` and `data-focus:`.
- Supporting cast: `@heroicons/react` (MIT) for icons, `clsx` for conditional classes, and any async data layer (TanStack Query, SWR, plain `fetch`) for Combobox sources.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Headless UI maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Style state with data attributes, not render props

Every component reflects its state onto the DOM. Target it with Tailwind data variants and keep JSX flat.

```tsx
export function PriorityPicker({ value, onChange, options }) {
  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton className="flex w-56 items-center justify-between rounded-md border border-slate-300
        px-3 py-2 text-sm data-open:border-indigo-500 data-focus:outline-2 data-disabled:opacity-50">
        {value.label}<ChevronsUpDown className="size-4 opacity-60" aria-hidden="true" />
      </ListboxButton>
      <ListboxOptions anchor="bottom start" className="w-(--button-width) rounded-md border
        border-slate-200 bg-white p-1 shadow-lg [--anchor-gap:4px] empty:hidden">
        {options.map((o) => (
          <ListboxOption key={o.id} value={o} className="group flex cursor-default items-center gap-2
            rounded px-2 py-1.5 text-sm data-focus:bg-indigo-600 data-focus:text-white data-disabled:opacity-40">
            <Check className="size-4 opacity-0 group-data-selected:opacity-100" aria-hidden="true" />{o.label}
          </ListboxOption>))}
      </ListboxOptions>
    </Listbox>
  )
}
```

Two details worth stealing: `anchor="bottom start"` replaces hand-rolled Popper wiring, and `--button-width` is exposed as a CSS variable so the panel matches its trigger without a `useLayoutEffect` measuring loop.

### 3.2 `as` composition: render the element the semantics demand

`as` swaps the rendered tag; `as={Fragment}` renders nothing and forwards props to your child.

```tsx
// A menu item that navigates must be an anchor, not a div with onClick:
<MenuItem as={Link} to="/settings" className="block px-3 py-2 data-focus:bg-slate-100">Settings</MenuItem>
// A trigger that reuses your existing styled Button:
<MenuButton as={Fragment}><Button variant="outline">Actions</Button></MenuButton>
```

The `as={Fragment}` child must accept and forward `ref` plus arbitrary props. A child that drops `ref` yields a panel positioned at the top-left of the viewport — a bug that looks like CSS and is not.

### 3.3 Dialog: the three things that actually go wrong

```tsx
export function RenameProjectDialog({ open, onClose, onSubmit, current }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Dialog open={open} onClose={onClose} initialFocus={inputRef} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-slate-900/40 transition duration-200 data-closed:opacity-0" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel transition className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl
          transition duration-200 data-closed:scale-95 data-closed:opacity-0">
          <DialogTitle className="text-base font-semibold">Rename project</DialogTitle>
          <input ref={inputRef} defaultValue={current} aria-label="Project name"
                 className="mt-4 w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          <div className="mt-6 flex justify-end gap-2">   {/* inside the Panel — a sibling would count as "outside" */}
            <button onClick={onClose} className="rounded px-3 py-2 text-sm">Cancel</button>
            <button onClick={onSubmit} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white">Save</button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
```

- **`onClose` fires for Escape, outside click, and your Cancel button alike.** It is not "the X button handler." Treat it as "the user wants out" and make it idempotent.
- **`initialFocus` or the first focusable element wins.** Without it, focus can land on a destructive action one Enter keypress from an accident. Point it at the safe control.
- **Only `DialogPanel` gets outside-click immunity.** Content rendered as a sibling of `DialogPanel` counts as "outside," so clicking your own footer closes the modal.

### 3.4 Transition choreography

The `transition` prop plus `data-closed` covers the common case with zero extra components. Reach for standalone `<Transition>` only when a non-Headless element must animate in sync, and use `TransitionChild` so parent and children share one timeline:

```tsx
<Transition show={isOpen}>
  <TransitionChild enter="duration-300 ease-out" enterFrom="opacity-0" enterTo="opacity-100"
                   leave="duration-200 ease-in" leaveFrom="opacity-100" leaveTo="opacity-0">
    <div className="fixed inset-0 bg-black/30" />           {/* backdrop fades */}
  </TransitionChild>
  <TransitionChild enter="duration-300 ease-out" enterFrom="translate-x-full" enterTo="translate-x-0"
                   leave="duration-200 ease-in" leaveFrom="translate-x-0" leaveTo="translate-x-full">
    <aside className="fixed inset-y-0 right-0 w-80 bg-white shadow-xl">…</aside>  {/* panel slides */}
  </TransitionChild>
</Transition>
```

Keep leave durations under 200ms — a slide-out that takes 400ms feels expensive on the first view and unbearable on the fiftieth. Gate the classes with Tailwind's `motion-safe:` variant to respect `prefers-reduced-motion`.

### 3.5 Combobox with async filtering

The trap: `Combobox` filters nothing for you. You own the query state, the debounce, and the race conditions.

```tsx
export function UserPicker({ value, onChange }) {
  const [query, setQuery] = useState("")
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (query.length < 2) { setUsers([]); return }
    const controller = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/users?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        setUsers(await res.json())
      } catch (e) { if (e.name !== "AbortError") setUsers([]) } finally { setLoading(false) }
    }, 200)
    return () => { clearTimeout(t); controller.abort() }   // debounce + cancel the in-flight request
  }, [query])

  return (
    <Combobox value={value} onChange={onChange} onClose={() => setQuery("")} by="id">
      <ComboboxInput aria-label="Assignee" displayValue={(u) => u?.name ?? ""}
        onChange={(e) => setQuery(e.target.value)} className="w-64 rounded-md border px-3 py-2 text-sm" />
      <ComboboxOptions anchor="bottom start" className="w-(--input-width) rounded-md border bg-white p-1">
        {loading && <div className="px-2 py-1.5 text-sm text-slate-500">Searching…</div>}
        {!loading && query.length >= 2 && users.length === 0 &&
          <div className="px-2 py-1.5 text-sm text-slate-500">No people match “{query}”.</div>}
        {users.map((u) => (
          <ComboboxOption key={u.id} value={u}
            className="rounded px-2 py-1.5 text-sm data-focus:bg-indigo-600 data-focus:text-white">{u.name}</ComboboxOption>))}
      </ComboboxOptions>
      <span aria-live="polite" className="sr-only">{loading ? "Searching" : `${users.length} results`}</span>
    </Combobox>
  )
}
```

`displayValue` is mandatory when `value` is an object — omit it and the input renders `[object Object]`. `onClose` resetting `query` prevents a stale filter greeting the user on reopen. The `AbortController` is what stops a slow response for `"an"` from overwriting results for `"andrea"`. The `aria-live` span is yours to write; no primitive announces result counts.

### 3.6 Form integration: the hidden input you get for free

Give the component a `name` and Headless UI renders hidden inputs so native `FormData` and non-JS submission work:

```tsx
<form action="/api/tickets" method="post">
  <Listbox name="priority" defaultValue={options[1]} by="id">{/* … */}</Listbox>
  <button type="submit">Create ticket</button>
</form>
```

For object values, `name="assignee"` serializes to `assignee[id]`, `assignee[name]`, and so on — dotted keys your backend must expect. `by="id"` makes selection compare by identity field instead of reference equality; without it, a `defaultValue` fetched from the server never appears selected because it is a different object than the one in `options`.

## 4. Anti-patterns

- **Divs with `onClick` for anything list-shaped.** If it opens, closes, and has arrow-key traversal, it is a `Menu`, `Listbox`, or `Combobox`. Hand-rolling means reimplementing typeahead and `aria-activedescendant` badly.
- **Using `Menu` as a container for forms.** `Menu` closes on item activation and treats children as commands. Filters, checkboxes, and inputs belong in a `Popover`.
- **Unlabeled controls.** `ComboboxInput` without `aria-label` or an associated `<Label>` announces as "edit text, blank." The primitive wires `aria-expanded` but cannot invent your control's name.
- **Silent async results.** Options appearing after a fetch are invisible to screen readers unless you announce them in an `aria-live` region.
- **Nesting Dialogs** to build confirmation-inside-a-modal. Escape ordering and focus return get ambiguous fast. Swap content within one Dialog, or close the first before opening the second.
- **Forgetting `displayValue`** on object-valued Comboboxes, then patching the symptom with a `useEffect` that rewrites the input value.
- **Removing focus rings during restyling.** `data-focus:` styles are the keyboard user's only cursor. Restyle them; never delete them.
- **Assuming `by` is optional.** Object identity comparison silently fails across refetches, and "selection doesn't stick" gets misdiagnosed as a state-management problem for hours.

## 5. Usage

1. Load this skill into your assistant (project skill, Cursor rule, or pasted context).
2. Describe the interaction behaviorally — "picks one of six statuses," "searches 4,000 customers," "confirms a destructive action" — and let the assistant name the primitive before any code exists.
3. Supply your Tailwind tokens and ask for `data-*` variant styling explicitly: "style state with `data-open` / `data-focus` / `data-selected`, no render props."
4. Request a separate accessibility pass covering control names, `aria-live` for async results, `initialFocus` targets, and escape ordering.
5. For any Combobox, state your data source and ask for debounce plus `AbortController` up front — retrofitting race-condition handling is where the bugs hide.

## 6. Example Output

Prompt with this skill loaded: *"Add a bulk-actions toolbar to our tickets table — a dropdown of actions applying to selected rows, with Archive requiring confirmation."*

Expected shape of the answer — correct primitive selection, no nested dialogs:

```tsx
export function BulkActions({ selectedIds, onApply }) {
  const [pending, setPending] = useState<null | "archive">(null)
  const count = selectedIds.length
  return (
    <>
      <Menu>
        <MenuButton disabled={count === 0} className="rounded-md border px-3 py-2 text-sm
          data-open:border-indigo-500 data-focus:outline-2 data-disabled:opacity-40">
          Actions{count > 0 ? ` (${count})` : ""}
        </MenuButton>
        <MenuItems anchor="bottom start" className="w-48 rounded-md border bg-white p-1 shadow-lg">
          <MenuItem><button onClick={() => onApply("assign")}
            className="w-full rounded px-2 py-1.5 text-left text-sm data-focus:bg-slate-100">Assign to me</button></MenuItem>
          <MenuItem><button onClick={() => setPending("archive")}
            className="w-full rounded px-2 py-1.5 text-left text-sm text-red-600 data-focus:bg-red-50">Archive</button></MenuItem>
        </MenuItems>
      </Menu>
      <ConfirmDialog open={pending === "archive"} onClose={() => setPending(null)}
        title={`Archive ${count} ${count === 1 ? "ticket" : "tickets"}?`}
        description="Archived tickets leave the active queue. You can restore them from Archived."
        onConfirm={async () => { await onApply("archive"); setPending(null) }} />
      <p aria-live="polite" className="sr-only">{count} tickets selected</p>
    </>
  )
}
```

Note the markers of skill-compliant output: `Menu` for commands with confirmation living in a sibling `Dialog` rather than nested inside the panel, `data-focus` / `data-open` / `data-disabled` styling instead of render props, `anchor` doing the positioning, an `aria-live` region announcing a selection count no primitive would announce for you, and pluralized copy that reads correctly at n=1.
