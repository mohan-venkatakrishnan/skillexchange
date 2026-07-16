---
title: Product Dashboards with Recharts Skill
category: Design
description: Build product dashboards that read honestly at a glance instead of chart-junk in the default docs purple. Covers ResponsiveContainer sizing traps, chart-type selection, color as tokens, custom tooltips, axis formatting, empty and loading states, accessible data-table fallbacks, and performance past a few thousand points.
usage: Load this skill before asking your AI assistant to build any chart or dashboard in a React project using Recharts. Describe the question the chart must answer and the shape of your data; the assistant will pick the chart type, wire tokenized colors, and ship the loading, empty, and accessibility states in the same pass instead of leaving them for later.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 16
pocUrl: https://github.com/recharts/recharts
---

# Product Dashboards with Recharts Skill

## 1. Philosophy

A dashboard is a claim about reality. Every chart answers a question someone will make a decision on, so the bar is honesty first and beauty second — though the two agree more often than people expect.

1. **Name the question before choosing the chart.** "Is signup volume recovering?" is a line. "Which plan brings the most revenue?" is a sorted bar. "What is our conversion rate right now?" is a number in large type with no chart at all. A chart answering no stated question is decoration; delete it.
2. **The default palette is a bug.** Recharts ships no colors — you pass `stroke` and `fill` yourself. Most codebases hardcode `#8884d8` from the first docs example they copied, then live with it for two years. Colors are tokens, defined once, mapped to meaning.
3. **The chart is a component of the page, not the page.** Axis labels, tooltip, legend, and empty state carry as much meaning as the geometry. A perfect line chart above the caption "Data" has failed.
4. **Ink must be earned.** Gridlines at low opacity, no chart borders, no 3D, no gradient implying a value it doesn't encode, no dual y-axes unless you enjoy being misread. Remove marks until removing one more would lose information.

Truncated y-axes, area fills on non-accumulating series, and pie charts with nine slices are the three ways product dashboards lie without anyone intending to. This skill exists to prevent all three.

## 2. Tech Stack

- **Recharts** — https://github.com/recharts/recharts — licensed **MIT**. A composable React charting library built on D3 scales with SVG rendering.
- **React 18+** and **TypeScript** — chart props benefit heavily from typed data shapes.
- **Tailwind CSS** (MIT) — for layout, cards, and the CSS variables backing your chart color tokens.
- Supporting cast: `date-fns` (MIT) for axis tick formatting, `Intl.NumberFormat` (platform) for values. No direct D3 import needed.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Recharts maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 ResponsiveContainer: the sizing trap that eats an afternoon

`ResponsiveContainer` measures its parent. If the parent has no resolved height you get a 0-pixel chart and a blank card — the most common Recharts support question in existence.

```tsx
// Broken: parent height is auto, so the container resolves to 0.
<div className="w-full"><ResponsiveContainer width="100%" height="100%">…</ResponsiveContainer></div>

// Correct: the parent owns an explicit height.
<div className="h-72 w-full">
  <ResponsiveContainer width="100%" height="100%"><LineChart data={data}>…</LineChart></ResponsiveContainer>
</div>
```

Rules that end the whole class of bug: give the wrapper a real height (`h-72`, `aspect-[16/9]`, or a flex child with `min-h-0`); inside CSS grid or flex, add `min-h-0` to the chart's parent, because grid children default to `min-height: auto`, refuse to shrink, and produce a chart that grows forever on resize; never nest one `ResponsiveContainer` inside another; and if the chart mounts inside a hidden tab panel or accordion it measures 0 and stays 0 — mount on reveal, or key the chart on the panel's open state so it remeasures.

### 3.2 Chart-type selection heuristic

Decide from the data's shape, not from taste:

| The question | Data shape | Use |
|---|---|---|
| How has X moved over time? | continuous, ordered, ≥ 8 points | `LineChart` |
| How has a cumulative total moved? | continuous, ordered, sums to a whole | stacked `AreaChart` |
| How do a few categories compare? | categorical, ≤ 12 items | `BarChart`, sorted by value; horizontal if labels are long |
| How do parts make a whole, right now? | categorical, ≤ 4 slices | a stacked single bar — almost never `PieChart` |
| Do two measures relate? | two continuous variables | `ScatterChart` |
| What is the value right now? | one number | large type, `tabular-nums`, no chart |

Two hard rules. Never use an area fill for a series that doesn't accumulate — a filled region reads as total volume, so average response time filled to zero implies a quantity nobody measured. Never sort a categorical bar chart alphabetically when the question is "which is biggest"; sort by value descending and the answer appears without the reader working for it.

### 3.3 Color as tokens: categorical vs sequential

Two palettes, two purposes, defined once and never inline.

```css
:root {
  /* Categorical: unrelated series. Distinguishable, similar perceived lightness. */
  --chart-1: oklch(0.62 0.17 258);  --chart-2: oklch(0.68 0.15 165);
  --chart-3: oklch(0.72 0.16 60);   --chart-4: oklch(0.62 0.19 340);
  --chart-5: oklch(0.60 0.12 220);
  /* Semantic: meaning is fixed, never reassign. */
  --chart-positive: oklch(0.65 0.16 150);
  --chart-negative: oklch(0.58 0.20 25);
  --chart-grid: oklch(0.90 0.005 260);
  --chart-axis: oklch(0.55 0.02 260);
}
.dark {
  --chart-1: oklch(0.70 0.15 258);  --chart-2: oklch(0.75 0.13 165);
  --chart-3: oklch(0.78 0.14 60);   --chart-4: oklch(0.70 0.17 340);
  --chart-5: oklch(0.68 0.11 220);
  --chart-grid: oklch(0.28 0.01 260);
  --chart-axis: oklch(0.65 0.015 260);
}
```

```tsx
const SERIES = [
  { key: "web", label: "Web", color: "var(--chart-1)" },
  { key: "ios", label: "iOS", color: "var(--chart-2)" },
  { key: "android", label: "Android", color: "var(--chart-3)" },
] as const
```

Cap categorical series at five — a sixth color is indistinguishable at 2px stroke width on a laptop. Group the tail into "Other" and offer a drill-down. Never encode order with a categorical palette or category with a sequential one, and never use red/green as the *only* signal: roughly one in twelve men reads them as identical. Pair color with a sign, an arrow, or a label.

### 3.4 Custom Tooltip

The built-in tooltip is a debugging affordance, not a product surface. It prints raw keys, unformatted floats, and unsorted series.

```tsx
import type { TooltipProps } from "recharts"
const fmtUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

function RevenueTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const rows = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0)
  return (
    <div className="rounded-md border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur
                    dark:border-slate-700 dark:bg-slate-900/95">
      <p className="mb-2 text-xs font-medium text-slate-500">{formatDay(label)}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.dataKey} className="flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden="true" />
            <span className="text-slate-600 dark:text-slate-300">{r.name}</span>
            <span className="ml-auto font-medium tabular-nums">{fmtUsd.format(r.value ?? 0)}</span>
          </li>))}
      </ul>
      {rows.length > 1 && <p className="mt-2 border-t pt-2 text-sm font-semibold tabular-nums">
        Total {fmtUsd.format(total)}</p>}
    </div>
  )
}
// <Tooltip content={<RevenueTooltip />} cursor={{ stroke: "var(--chart-grid)", strokeWidth: 1 }} />
```

Sorting rows descending puts the largest contributor where the eye lands first. `tabular-nums` stops digits jittering as the cursor moves — the difference between a chart that feels engineered and one that feels twitchy.

### 3.5 Axes, gradients, and reference lines

```tsx
<AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
  <defs>
    {/* id is document-global — namespace it per chart or a second chart inherits this fill */}
    <linearGradient id="fillWeb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
    </linearGradient>
  </defs>
  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32}
         tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
         tickFormatter={(v) => format(new Date(v), "MMM d")} />
  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
         tickFormatter={(v) => compactNumber.format(v)} />
  <Tooltip content={<RevenueTooltip />} />
  <ReferenceLine y={target} stroke="var(--chart-axis)" strokeDasharray="4 4"
    label={{ value: "Target", position: "insideTopRight", fill: "var(--chart-axis)", fontSize: 11 }} />
  <Area type="monotone" dataKey="web" stroke="var(--chart-1)" strokeWidth={2}
        fill="url(#fillWeb)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
</AreaChart>
```

Vertical gridlines are noise on a time series; drop them. `dot={false}` with `activeDot` keeps a 90-day line readable while preserving hover targets. And `<YAxis>` defaults to a zero baseline for bars — keep it. Truncating a bar chart's y-axis triples an 8% difference and is the most common accidental lie in product analytics.

### 3.6 Empty, loading, and accessible states

Ship all of them in the same commit as the chart, in one component, so no code path renders a mystery.

```tsx
export function RevenueChart({ data, isLoading, error, range }) {
  if (isLoading) return <div className="h-72 w-full animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
  if (error) return <ChartMessage title="Couldn’t load revenue" body="Retry, or check back shortly." />
  if (!data.length) return <ChartMessage title="No revenue yet"
    body={`No completed orders in the ${range}. Charts appear after your first sale.`} />
  return (
    <figure>
      <figcaption className="mb-3 text-sm font-medium">Revenue by platform — {range}</figcaption>
      <div className="h-72 w-full" role="img"
           aria-label={`Revenue by platform over the ${range}. ${describeTrend(data)}`}>
        <ResponsiveContainer width="100%" height="100%">{/* chart */}</ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-500">View as table</summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Revenue by platform, {range}</caption>
          <thead><tr>{["Date", ...SERIES.map(s => s.label)].map(h =>
            <th key={h} scope="col" className="p-1 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{data.map((row) => (
            <tr key={row.date}>
              <th scope="row" className="p-1 text-left font-normal">{formatDay(row.date)}</th>
              {SERIES.map(s => <td key={s.key} className="p-1 tabular-nums">{fmtUsd.format(row[s.key])}</td>)}
            </tr>))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
```

An SVG chart is invisible to screen readers. `role="img"` with a summarizing `aria-label` plus a real `<table>` behind `<details>` makes the data reachable — and the table doubles as the thing power users copy into a spreadsheet. Empty-state copy names the reason; never "No data available."

Performance: past roughly 2,000 rendered points set `isAnimationActive={false}` (the animation stutters, not the render), drop `dot`, and aggregate server-side — hourly to daily beyond 60 days. Recharts renders one SVG node per dot, so 5,000 dots is 5,000 DOM nodes and a frozen tab. If you genuinely need 50k points you need canvas, not Recharts; say so rather than fight it.

## 4. Anti-patterns

- **`ResponsiveContainer` in an auto-height parent.** Renders a blank card. Give the wrapper a real height and add `min-h-0` in flex/grid columns.
- **`#8884d8` in the codebase.** The docs' placeholder purple, shipped to production, immune to dark mode and rebranding. Tokens only.
- **Truncated y-axes on bar charts.** `domain={['dataMin', 'dataMax']}` turns a 3% dip into a cliff. Bars start at zero; if you must zoom, use a line and label the axis clearly.
- **Pie charts with more than four slices.** Humans compare angles poorly. A sorted horizontal bar answers the same question in a third of the time.
- **Dual y-axes.** Two scales, one plot area, and any correlation you like depending on the domains. Use two stacked charts sharing an x-axis.
- **Duplicate `<defs>` gradient ids across charts.** Document-global namespace; the second chart silently inherits the first's fill.
- **The default `<Tooltip />` in production.** It prints `revenue_cents: 1234500` and unsorted series. Always pass `content`.
- **Animating on every refetch.** A chart replaying its 800ms entrance each poll makes the dashboard feel broken. Animate on first mount at most.

## 5. Usage

1. Load this skill into your assistant (project skill, Cursor rule, or pasted context).
2. State the question the chart answers and paste one representative row of data. Ask the assistant to justify the chart type against the §3.2 heuristic *before* writing JSX.
3. Provide your `--chart-*` tokens, or ask it to generate the `:root` / `.dark` block first and approve that before any chart code.
4. Require loading, empty, error, and table-fallback states in the same response — not "we'll add those later."
5. Give it your realistic point count and cadence ("90 days, hourly, refetch every 30s") so it makes the animation and aggregation calls correctly the first time.

## 6. Example Output

Prompt with this skill loaded: *"Add a chart to the seller dashboard showing which categories drive downloads — we have about nine categories."*

Expected shape of the answer — a chart-type correction, then code:

> Nine categories with one measure is a comparison question, not part-to-whole, so this is a sorted horizontal `BarChart`, not a pie. Category names are long, so bars run horizontally to keep labels readable. I'm showing the top seven and grouping the tail as "Other" — the eighth and ninth bars are one pixel apart and carry no decision.

```tsx
export function CategoryDownloadsChart({ rows, isLoading }) {
  if (isLoading) return <div className="h-80 w-full animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
  if (!rows.length) return <ChartMessage title="No downloads yet"
    body="This chart fills in once your skills have been downloaded." />

  const sorted = [...rows].sort((a, b) => b.downloads - a.downloads)
  const [top, tail] = [sorted.slice(0, 7), sorted.slice(7)]
  const data = tail.length
    ? [...top, { category: "Other", downloads: tail.reduce((s, r) => s + r.downloads, 0) }]
    : top

  return (
    <figure>
      <figcaption className="mb-3 text-sm font-medium">Downloads by category — all time</figcaption>
      <div className="h-80 w-full" role="img"
           aria-label={`Downloads by category. ${data[0].category} leads with ${data[0].downloads} downloads.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis type="number" tickLine={false} axisLine={false}
                   tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
                   tickFormatter={(v) => compactNumber.format(v)} />
            <YAxis type="category" dataKey="category" width={120} tickLine={false} axisLine={false}
                   tick={{ fill: "var(--chart-axis)", fontSize: 12 }} />
            <Tooltip content={<DownloadsTooltip />} cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.3 }} />
            <Bar dataKey="downloads" fill="var(--chart-1)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
```

Note the markers of skill-compliant output: the chart type was argued from the question rather than accepted from the prompt, the long tail is grouped instead of rendered as noise, a single tokenized `--chart-1` is used because one measure needs one color (not nine), the x-axis starts at zero, `layout="vertical"` earns its keep on long labels, and the loading and empty states arrived with the chart rather than after it.
