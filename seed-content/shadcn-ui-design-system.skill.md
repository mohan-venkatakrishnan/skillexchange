---
title: Design System with shadcn/ui Skill
category: Design
description: Build a coherent, themeable design system on shadcn/ui instead of a folder of copy-pasted components. Covers composition over configuration, CSS-variable theming, dark mode that doesn't flash, and keeping Radix accessibility intact while you restyle.
usage: Load this skill before asking your AI assistant to build or restyle UI in a shadcn/ui project. Describe your brand tokens and the component you need; the assistant will compose from existing primitives, wire theming through CSS variables, and preserve accessibility rather than inventing bespoke one-off components.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 14
pocUrl: https://github.com/shadcn-ui/ui
---

# Design System with shadcn/ui Skill

## 1. Philosophy

shadcn/ui is not a component library. It is a component *distribution* — you copy source into your repo and own it forever. Teams that miss this distinction get the worst of both worlds: they treat the copied files as untouchable vendor code (so they wrap everything in awkward adapters) while also never updating them (so they drift). This skill establishes the correct posture:

1. **The copied components are yours. Edit them.** If every usage of `Button` needs a loading spinner, the spinner goes *into* `button.tsx`, not into forty call sites.
2. **But edit the skin, not the skeleton.** The Radix primitives underneath (focus trapping, ARIA wiring, keyboard handling, portal management) are the part you must not break. Change classes, variants, and layout freely; never remove a `Slot`, an `asChild`, or an ARIA attribute because "it seemed unused."
3. **Design decisions live in tokens, not in components.** Colors, radii, and spacing are CSS variables defined once. A component that hardcodes `#6d28d9` has opted out of your design system, including dark mode.
4. **Compose before you create.** A new "SettingsCard" is `Card` + `Separator` + `Switch` arranged in a file under `components/patterns/` — not a new primitive. New primitives require a reason no existing composition can satisfy.

The goal is that a designer can retheme the entire product by editing one CSS file, and a developer can build a new screen without writing a single raw `<button>`.

## 2. Tech Stack

- **shadcn/ui** — https://github.com/shadcn-ui/ui — licensed **MIT**. CLI-distributed React components built on Radix primitives and Tailwind CSS.
- **Radix UI Primitives** (MIT) — the unstyled, accessible behavior layer under most shadcn/ui components.
- **Tailwind CSS** (MIT) — utility classes bound to your token variables.
- Supporting cast: `class-variance-authority` (variants), `tailwind-merge` + `clsx` via the `cn()` helper, `lucide-react` (icons), `next-themes` or equivalent for theme switching.

This skill is an independent, original guide; it is not affiliated with or endorsed by the shadcn/ui maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Token architecture: two layers, one source of truth

Define *semantic* tokens as CSS variables, mapped to Tailwind. Components consume only semantic names (`bg-primary`, `text-muted-foreground`), never palette values.

```css
/* globals.css — the entire theme lives here */
:root {
  --background: oklch(0.99 0.002 90);
  --foreground: oklch(0.22 0.01 270);
  --primary: oklch(0.55 0.18 275);
  --primary-foreground: oklch(0.98 0.01 275);
  --muted: oklch(0.955 0.005 270);
  --muted-foreground: oklch(0.5 0.02 270);
  --destructive: oklch(0.55 0.2 25);
  --border: oklch(0.9 0.005 270);
  --ring: oklch(0.55 0.18 275);
  --radius: 0.5rem;
}

.dark {
  --background: oklch(0.17 0.01 270);
  --foreground: oklch(0.93 0.005 270);
  --primary: oklch(0.7 0.15 275);
  --primary-foreground: oklch(0.18 0.02 275);
  --muted: oklch(0.23 0.01 270);
  --muted-foreground: oklch(0.65 0.015 270);
  --border: oklch(0.28 0.01 270);
  --ring: oklch(0.7 0.15 275);
}
```

Every color pairs with a `-foreground` partner. If you add `--warning`, you add `--warning-foreground` in the same commit, in both themes. This pairing rule is what keeps contrast survivable when someone rethemes at 2 a.m.

### 3.2 Dark mode without the flash

Dark mode is a class on `<html>`, toggled before first paint. With Next.js, `next-themes` handles the inline script; the two rules that matter:

```tsx
// layout.tsx
<html lang="en" suppressHydrationWarning>
  <body>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  </body>
</html>
```

- `suppressHydrationWarning` on `<html>` only — the theme class is set by a pre-hydration script, so server and client legitimately disagree.
- Never conditionally render based on `theme` during SSR (`theme === 'dark' ? <MoonIcon/> : <SunIcon/>` hydration-mismatches). Render both and toggle with CSS: `<Sun className="dark:hidden" /><Moon className="hidden dark:block" />`.

Because components only use semantic tokens, dark mode needs zero component changes. If a component needs a `dark:` override, that component is using the wrong token.

### 3.3 Variants with CVA: extend the component you own

When the design calls for a new button treatment, add a variant to `button.tsx`. Do not wrap.

```tsx
// components/ui/button.tsx (excerpt — your file, edit it)
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-transparent hover:bg-muted",
        ghost: "hover:bg-muted",
        // Added for our system: destructive actions that need confirmation weight
        danger: "bg-destructive text-white hover:bg-destructive/90",
      },
      size: {
        sm: "h-8 px-3",
        default: "h-9 px-4",
        lg: "h-10 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
```

The type of `variant` flows to every call site automatically. A wrapper component would have hidden this behind a second, drifting API.

### 3.4 Composition layer: patterns, not primitives

Product-specific arrangements live one level up, in `components/patterns/`, and are built entirely from `ui/` parts:

```tsx
// components/patterns/stat-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function StatCard({
  label, value, delta,
}: { label: string; value: string; delta?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {delta !== undefined && (
          <p className={cn("text-xs", delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            {delta >= 0 ? "+" : ""}{delta}% from last month
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

Directory contract: `ui/` (owned primitives, editable, no product logic) → `patterns/` (compositions, no data fetching) → `features/` (wired to data). Dependencies point downward only.

### 3.5 Accessibility: what Radix gives you and what it can't

Radix handles focus trapping in dialogs, roving tabindex in menus, `aria-expanded`/`aria-controls` wiring, and escape/outside-click dismissal. Your responsibilities remain:

- **Icon-only buttons need labels**: `<Button size="icon" aria-label="Delete row"><Trash2 /></Button>`. This is the single most common a11y regression in shadcn/ui codebases.
- **`DialogTitle` is mandatory.** If the design has no visible title, wrap it: `<DialogTitle className="sr-only">Search</DialogTitle>`. Radix warns for a reason.
- **Keep `focus-visible:ring` styles.** Deleting the ring classes because "the designer didn't spec focus states" removes keyboard navigation affordance. Restyle the ring with `--ring`; never remove it.
- **`asChild` merges, it doesn't wrap.** `<Button asChild><Link href="/x">Go</Link></Button>` renders one anchor with button styling — correct. Nesting `<button>` inside `<a>` is invalid HTML and a Radix `Slot` error.

### 3.6 Forms: one pattern, everywhere

Standardize on `react-hook-form` + Zod + the shadcn/ui `Form` wrappers. The `FormField`/`FormItem`/`FormMessage` triad wires labels, described-by, and error announcement for free:

```tsx
<FormField control={form.control} name="email" render={({ field }) => (
  <FormItem>
    <FormLabel>Work email</FormLabel>
    <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
    <FormDescription>We only use this for billing receipts.</FormDescription>
    <FormMessage />
  </FormItem>
)} />
```

Every form in the product uses this shape. Uniformity here is worth more than any individual cleverness.

## 4. Anti-patterns

- **Wrapping instead of editing.** `<AppButton>` that renders `<Button>` with three props remapped. You own `button.tsx` — put the change there.
- **Hardcoded palette values.** `bg-violet-600` in a component means dark mode, retheming, and white-labeling all break silently. Semantic tokens only; raw palette values are allowed *only* inside `globals.css`.
- **`dark:` overrides scattered through components.** A component needing `dark:bg-zinc-800` is bypassing the token layer. Fix the token mapping instead.
- **Deleting "unused" ARIA props or `sr-only` elements** during restyling. They are the accessibility contract.
- **Re-running the CLI over customized components.** `npx shadcn add button` on an edited `button.tsx` overwrites your variants. Diff upstream changes manually and port what you want.
- **A new primitive per screen.** `PricingCard`, `TeamCard`, `BillingCard` as separate 200-line files that are all `Card` with different padding. Compose in `patterns/`, vary with props.
- **Portal-blindness in tests and z-index.** Dialogs/popovers render in a portal at `<body>`. Styling them via a parent's descendant selectors, or querying them inside the component root in tests, both fail. Style via their own classes; query via `screen`/role.
- **Toast-driven UX for validation.** Field errors belong next to fields (`FormMessage`), not in a toast that vanishes. Toasts are for async outcomes only.

## 5. Usage

1. Load this skill into your assistant (project skill, Cursor rule, or pasted context).
2. Give it your brand: primary hue, radius feel (sharp/soft), density (compact/comfortable). Ask it to generate the `:root` / `.dark` token block first — approve tokens before any components.
3. For each screen, name the shadcn/ui components already installed; ask the assistant to compose in `patterns/` and to state explicitly when it believes a genuinely new primitive is required (it should be rare).
4. Request an accessibility pass as a separate step: icon-button labels, dialog titles, focus order.
5. When restyling existing components, instruct: "edit `components/ui/*` in place; do not create wrappers; do not remove ARIA or focus-visible styles."

## 6. Example Output

Prompt with this skill loaded: *"We need a destructive confirmation flow for deleting a workspace — typed-name confirmation, like GitHub repo deletion."*

Expected shape of the answer — a composition, not a new primitive:

```tsx
// components/patterns/confirm-delete-dialog.tsx
"use client"
import { useState } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ConfirmDeleteDialog({
  resourceName, onConfirm,
}: { resourceName: string; onConfirm: () => Promise<void> }) {
  const [typed, setTyped] = useState("")
  const [pending, setPending] = useState(false)
  const armed = typed === resourceName

  return (
    <AlertDialog onOpenChange={() => setTyped("")}>
      <AlertDialogTrigger asChild>
        <Button variant="danger">Delete workspace</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {resourceName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the workspace and all its data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-name">
            Type <span className="font-semibold">{resourceName}</span> to confirm
          </Label>
          <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)}
                 autoComplete="off" spellCheck={false} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "danger" })}
            disabled={!armed || pending}
            onClick={async (e) => {
              e.preventDefault()
              setPending(true)
              try { await onConfirm() } finally { setPending(false) }
            }}
          >
            {pending ? "Deleting…" : "I understand, delete it"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

Note the markers of skill-compliant output: `AlertDialog` (Radix focus trap and escape handling intact), the `danger` variant added in section 3.3 rather than inline red classes, `AlertDialogTitle` present, disabled state instead of a hidden button, and zero hardcoded colors.
