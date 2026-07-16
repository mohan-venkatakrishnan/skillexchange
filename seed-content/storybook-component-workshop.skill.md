---
title: Component Workshop with Storybook Skill
category: Design
description: Treat Storybook as the executable spec for your component library, not a screenshot gallery nobody opens. Covers CSF3 meta/args/argTypes, play functions as real interaction tests, decorators for context, a11y triage, per-story MSW mocking, and using stories as the artifact designers actually review.
usage: Load this skill before asking your AI assistant to write stories, set up Storybook, or add interaction tests to a component. Name the component and its states; the assistant will produce CSF3 stories with typed args, a play function for the interactive path, and the decorators the component needs — rather than one "Default" story with no coverage.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 16
pocUrl: https://github.com/storybookjs/storybook
---

# Component Workshop with Storybook Skill

## 1. Philosophy

Every dying Storybook looks the same: forty components, forty `Default` stories, each rendering the happy path. Designers stopped opening it in month three. Nothing asserts anything, so nobody notices when a story breaks. It's a maintenance cost pretending to be documentation.

The fix is a change in what a story *is*.

1. **A story is a spec, not a demo.** One story per meaningful state — loading, empty, error, overflow, disabled, 200-character-name — because those are the states that break in production. The happy path is the one that never does.
2. **If a state can't be reached by setting args, the component has a design problem.** A state you can only produce by clicking three times means the component owns state it should be receiving. Stories are a design review disguised as a test file.
3. **The play function is the difference between a gallery and a test suite.** A story that renders is worth something. A story that renders, types, clicks, and asserts is worth ten of them, and runs in CI.
4. **Stories are the review artifact.** A designer reviewing a PR should open a story URL, not a Figma frame and a video. That means mocking belongs in the story, so the *real* component runs.
5. **Coverage is measured in states, not components.** "Storybook for 100% of components" is a vanity metric. The question is whether the error state renders.

Success: a designer opens a story, spots a wrong empty state, and comments on the PR before the developer has finished the API.

## 2. Tech Stack

- **Storybook** — https://github.com/storybookjs/storybook — licensed **MIT**. The component workshop, its CSF3 story format, and its addon ecosystem.
- **Component Story Format 3 (CSF3)** — the default authoring format: a default export (`meta`) plus named exports as stories, objects rather than functions.
- **`@storybook/test`** — MIT — bundles `expect`, `userEvent`, `within`, `waitFor`, and `fn()` spies. One import for play functions; don't mix in raw `@testing-library/*`.
- Supporting cast: `@storybook/addon-a11y` (axe in the panel), autodocs via `@storybook/addon-docs`, `msw` + `msw-storybook-addon` for network mocking, `@storybook/test-runner` (Playwright-backed CI runner).

This skill is an independent, original guide; it is not affiliated with or endorsed by the Storybook maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 CSF3 meta: type it once, benefit everywhere

`satisfies Meta<typeof Component>` is what makes args autocomplete and required props error at author time. `StoryObj<typeof meta>` inherits that — this pairing is the whole reason CSF3 exists.

```tsx
// InvoiceRow.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { InvoiceRow } from "./InvoiceRow";

const meta = {
  title: "Billing/InvoiceRow",
  component: InvoiceRow,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    // Shared defaults. Every story starts here and overrides only what it tests.
    invoice: { id: "inv_4192", amountCents: 24000, currency: "USD", status: "open" },
    onPay: fn(),
  },
  argTypes: {
    density: {
      control: "inline-radio",
      options: ["compact", "comfortable"],
      description: "Row height. Compact is used in the dense billing table.",
      table: { defaultValue: { summary: "comfortable" } },
    },
  },
} satisfies Meta<typeof InvoiceRow>;

export default meta;
type Story = StoryObj<typeof meta>;
```

- **`fn()` from `@storybook/test`, not `action()`.** `fn()` logs to the Actions panel *and* gives you a spy to assert on. `action()` only logs; there's no reason to use it in new code.
- **`args` on `meta` are inherited and shallow-merged.** Put the boring valid object there once. A story that redeclares seven props to change one is noise.
- **`argTypes` is documentation with a UI attached.** `description` and `table.defaultValue` land in autodocs. Inferred controls give you a JSON textarea for every enum.

### 3.2 One story per state, named for the state

```tsx
export const Open: Story = {};

export const Overdue: Story = {
  args: { invoice: { id: "inv_4188", amountCents: 24000, currency: "USD", status: "overdue", daysLate: 12 } },
};

export const Processing: Story = {
  args: { invoice: { id: "inv_4193", amountCents: 24000, currency: "USD", status: "processing" } },
};

export const LongVendorZeroAmount: Story = {
  name: "Overflow: long vendor, zero amount",
  args: {
    invoice: {
      id: "inv_4200",
      vendor: "Ipsum Dolor Consolidated Facilities Management & Logistics (APAC) Pvt. Ltd.",
      amountCents: 0,
      currency: "JPY",
      status: "open",
    },
  },
};
```

`export const Open: Story = {}` — an empty object — is a complete story, inheriting everything from meta. That terseness is the point: adding the ninth state should cost three lines, or it won't happen.

The overflow story is the one people skip and the one that catches real bugs: longest realistic string, zero value, a currency with no decimal places. Every component gets one. Name stories after the *state* (`Overdue`, not `WithStatusOverdue`) — the sidebar is read by designers.

### 3.3 Play functions: the story that tests itself

```tsx
import { expect, userEvent, waitFor, within } from "@storybook/test";

export const PayFlow: Story = {
  play: async ({ canvasElement, args, step }) => {
    const canvas = within(canvasElement);

    await step("Pay is enabled for an open invoice", async () => {
      await expect(canvas.getByRole("button", { name: /pay \$240\.00/i })).toBeEnabled();
    });

    await step("Confirmation is required before the handler fires", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /pay \$240\.00/i }));
      const dialog = within(document.body).getByRole("dialog", { name: /confirm payment/i });
      await expect(args.onPay).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole("button", { name: /confirm/i }));
    });

    await step("Handler receives the invoice id", async () => {
      await waitFor(() => expect(args.onPay).toHaveBeenCalledWith("inv_4192"));
    });
  },
};
```

What earns its keep:

- **Query by role, with the accessible name.** `getByRole("button", { name: /pay \$240\.00/i })` fails if the label regresses, if the element stops being a button, or if an icon-only redesign drops the accessible name. `getByTestId` catches none of that — your interaction test doubles as an a11y test for free.
- **`within(document.body)` for portals.** Dialogs, popovers, and toasts render outside `canvasElement`. `canvas.getByRole("dialog")` won't find them, and this costs everyone an afternoon exactly once.
- **`step()` isn't cosmetic.** It structures the Interactions panel, so CI tells you *which* step broke instead of dumping one long trace.
- **Assert the negative.** `expect(args.onPay).not.toHaveBeenCalled()` catches the refactor that quietly makes the confirmation dialog decorative.
- **`await` every `userEvent` call.** They're async. An un-awaited click passes locally and fails on a slow CI runner — the worst failure mode there is.

Run these with `@storybook/test-runner`: it drives every story in a real browser, fails on play-function errors, and — critically — fails on any story that renders with a console error, giving smoke coverage even where there's no play function.

### 3.4 Decorators: context in, not behavior around

A component needing a theme, router, or query client gets it from a decorator. Decorators compose bottom-up: story → meta → preview.

```tsx
// .storybook/preview.tsx
import type { Preview } from "@storybook/react";
import { ThemeProvider } from "../src/theme";

const preview: Preview = {
  parameters: { a11y: { test: "error" } },
  globalTypes: {
    theme: {
      description: "Color theme",
      toolbar: { icon: "circlehollow", items: ["light", "dark"], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (Story, context) => (
      <ThemeProvider mode={context.globals.theme}>
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
```

The `globalTypes` + toolbar pattern is the highest-value twenty lines in any Storybook config: every story becomes themeable from the toolbar, and visual regression can snapshot both themes from the same story set.

The rule that keeps decorators from rotting: **a decorator supplies context, not behavior.** The moment one contains an `if` about which story is rendering, you've written a second component no user will ever run, and your story now tests the decorator.

### 3.5 A11y triage and per-story mocking

The a11y addon runs axe on the rendered story. With `a11y: { test: "error" }`, violations **fail the test runner** — that's what turns the panel from a suggestion into a gate.

Triage honestly. Real violations get fixed. Genuine false positives get disabled at the narrowest scope, with a reason:

```tsx
export const OnBrandGradient: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [{
          // Axe can't compute contrast against the gradient; verified 5.1:1 at the
          // lightest stop with the design team on 2026-06-11.
          id: "color-contrast", selector: ".hero-cta", enabled: false,
        }],
      },
    },
  },
};
```

Disabling `color-contrast` globally because "it's noisy" is how a11y coverage dies. One story, one selector, one comment.

For network-backed components, mock with MSW so the *real* component runs — no `<FakeInvoiceRow>`:

```tsx
import { http, HttpResponse, delay } from "msw";

export const LoadingState: Story = {
  parameters: {
    msw: { handlers: [http.get("/api/invoices/:id", async () => { await delay("infinite"); return HttpResponse.json({}); })] },
  },
};
```

`delay("infinite")` is the cleanest loading-state story in existence: no fake `isLoading` prop, no timing hack — the component sits in its real pending state indefinitely so a designer can actually look at it.

### 3.6 Autodocs and visual-regression discipline

`tags: ["autodocs"]` generates a docs page from the component's TypeScript props, your `argTypes` descriptions, and every story. One line, and it stays correct — more than any hand-written component `README.md` has ever managed.

- **JSDoc on props becomes prop-table descriptions.** A comment above `density?: "compact" | "comfortable"` in the props interface shows up in autodocs. Highest-return documentation habit available.
- **Prose goes in meta:** `parameters: { docs: { description: { component: "Renders one invoice…" } } }`.
- **Hide noise stories** that exist only for the test runner with `tags: ["!autodocs"]`, or the docs page becomes an unreviewed dump.
- **Order stories deliberately.** Docs render them in file order — `Default` first, `Overflow: …` last. The file is a narrative.

For visual regression the discipline is *determinism*: no `Date.now()`, no `Math.random()`, no live data, no entrance animation at snapshot time. Freeze what varies by passing it in — `args: { now: new Date("2026-01-15T09:00:00Z") }`. That `now` prop isn't a testing hack; it's the component accepting its clock as a dependency instead of reaching for a global. If a component can't be made deterministic for a snapshot, that's a design finding — the third time this skill has said so.

## 4. Anti-patterns

- **One `Default` story per component.** It documents the state that never breaks and asserts nothing. The value is in `Error`, `Empty`, `Loading`, `Overflow`.
- **`getByTestId` in play functions.** It passes after you remove the accessible name, ship an icon-only button, or swap `<button>` for a `<div onClick>`. Query by role and name; let the test fail when the a11y contract does.
- **Un-awaited `userEvent` calls.** Green locally, flaky in CI, blamed on the runner for weeks.
- **Querying portalled content with `within(canvasElement)`.** Dialogs and toasts live on `document.body`. The most common "the element exists, I can see it" bug in Storybook tests.
- **Decorators with story-specific logic.** An `if (context.name === "Empty")` means you're testing a wrapper no user runs.
- **Disabling axe rules globally.** One noisy contrast warning becomes `color-contrast: off` for the whole library, and nobody turns it back on.
- **Mock components instead of mocked data.** A story about `<InvoiceRowMock>` is a story about `InvoiceRowMock`. Mock the network; render the real thing.
- **Non-deterministic stories under visual regression.** Random ids or a running entrance animation diff on every run, and a suite that always fails is a suite everyone force-merges past.
- **Stories in `__tests__/`.** Colocate `Component.stories.tsx` beside `Component.tsx`, or it goes stale on the next rename.

## 5. Usage

1. Load this skill into your assistant (project skill, Cursor rule, or pasted context).
2. Give it the component file and ask for the **state list first** — no code. If `Error`, `Empty`, `Loading`, and an overflow case aren't there, say so before any story is written.
3. Ask for `satisfies Meta<typeof X>` + `StoryObj<typeof meta>` typing, shared `args` on meta, and `fn()` spies — never `action()`.
4. Request a play function for the component's primary interaction only: `@storybook/test`, queried by role and name, `step()` blocks, at least one negative assertion.
5. Tell it which context the component needs (theme, router, query client) so it writes decorators instead of guessing, and whether network calls should be MSW-mocked per story.
6. Ask it to flag any state it could not reach through args alone. That list is your component refactor backlog — the most valuable output of the exercise.

## 6. Example Output

Prompt with this skill loaded: *"Write stories for our `SeatPicker` — it fetches the org's seat usage, lets an admin add seats, and disables the control when the plan is at its cap."*

Expected shape — states enumerated, network mocked, roles queried:

```tsx
// SeatPicker.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import { http, HttpResponse, delay } from "msw";
import { SeatPicker } from "./SeatPicker";

const usage = (used: number, cap: number) => ({ orgId: "org_77", seatsUsed: used, seatCap: cap });

const meta = {
  title: "Billing/SeatPicker",
  component: SeatPicker,
  tags: ["autodocs"],
  args: { orgId: "org_77", onAddSeats: fn() },
  argTypes: { onAddSeats: { description: "Called with the delta, not the new total." } },
  parameters: {
    layout: "centered",
    msw: { handlers: [http.get("/api/orgs/:id/seats", () => HttpResponse.json(usage(8, 25)))] },
    docs: { description: { component: "Admin control for adjusting an org's paid seat count." } },
  },
} satisfies Meta<typeof SeatPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: { handlers: [http.get("/api/orgs/:id/seats", async () => { await delay("infinite"); return HttpResponse.json({}); })] },
  },
};

export const AtCap: Story = {
  parameters: { msw: { handlers: [http.get("/api/orgs/:id/seats", () => HttpResponse.json(usage(25, 25)))] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: /add seats/i })).toBeDisabled();
    await expect(canvas.getByRole("status")).toHaveTextContent(/plan limit reached/i);
  },
};

export const FetchFailed: Story = {
  parameters: { msw: { handlers: [http.get("/api/orgs/:id/seats", () => new HttpResponse(null, { status: 503 }))] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent(/couldn't load seat usage/i));
  },
};

export const AddsSeats: Story = {
  play: async ({ canvasElement, args, step }) => {
    const canvas = within(canvasElement);

    await step("Waits for usage before enabling", async () => {
      await waitFor(() => expect(canvas.getByRole("spinbutton", { name: /seats/i })).toHaveValue(8));
    });

    await step("Increment alone does not call the handler", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /increase seats/i }));
      await userEvent.click(canvas.getByRole("button", { name: /increase seats/i }));
      await expect(args.onAddSeats).not.toHaveBeenCalled();
    });

    await step("Submitting sends the delta", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /add seats/i }));
      await waitFor(() => expect(args.onAddSeats).toHaveBeenCalledWith(2));
    });
  },
};

export const CapOfOne: Story = {
  name: "Overflow: single-seat plan, four-digit price",
  parameters: {
    msw: { handlers: [http.get("/api/orgs/:id/seats", () => HttpResponse.json({ ...usage(1, 1), pricePerSeatCents: 129900 }))] },
  },
};
```

Note the markers of skill-compliant output: five states beyond the happy path, each named for the state rather than the props; MSW handlers per story so the real `SeatPicker` does its real fetch instead of a mock impersonating it; `delay("infinite")` for a loading state with no fake `isLoading` prop; `fn()` spies asserted on, not `action()` logged; every query by role and accessible name — `spinbutton`, `status`, `alert` — so the stories fail when the a11y contract regresses; `step()` blocks that name what CI broke; the negative assertion proving increment doesn't fire the handler prematurely; `findByRole`/`waitFor` around anything downstream of the fetch rather than a bare `getBy`; the overflow story pairing the smallest cap with the widest price string; and the `onAddSeats` argType documenting the delta-not-total trap that would otherwise be found in production.
