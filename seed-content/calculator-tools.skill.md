---
title: Finance & Calculator Tools Skill
category: Data
description: How to build calculator UIs people trust with real money decisions — input forgiveness, formula transparency, edge-case guards, and localized currency formatting, extracted from a shipping suite of 11 finance tools (loan, compound, retirement, tax, inflation). Includes the month-by-month simulation pattern that beats closed-form formulas whenever prepayments or rate quirks enter the picture.
usage: Load this skill when building any calculator — financial or otherwise — where users will act on the numbers. Apply the input-normalization and edge-case table in section 3 to every numeric field, and never ship a result stat without the plain-English "how it's calculated" explainer from section 3.5.
platforms: [Claude, ChatGPT, Gemini]
priceUsd: 0
timeSavedHours: 10
pocUrl: https://tools.tapdot.org
---
# Finance & Calculator Tools Skill

## 1. Philosophy

A calculator is a trust product. Users are about to make a prepayment, pick a tax
regime, or set a retirement contribution based on your number. Principles from shipping
tapdot's finance collection (11 tools: LoanCalc, CompoundCalc, RetireCalc, MortgageCalc,
TaxEstimate, InflationCalc, BudgetPlanner, EquityCalc, NetWorthTracker, InvestmentTracker,
CurrencyConvert):

1. **Live, not button-gated.** Recompute on every keystroke. A "Calculate" button hides
   the model; a live calculator teaches it — users drag the rate and watch the interest
   gap move, which is the actual product.
2. **Simulate, don't just formula.** Closed-form EMI/compound formulas are the starting
   point, but the moment reality intrudes (a lump-sum prepayment in month 24, an EMI
   that no longer covers interest, a strategy toggle), a **month-by-month simulation
   loop** is simpler, auditable, and correct. Formulas for the headline; simulation for
   the schedule.
3. **Show your work.** Every non-obvious result gets a plain-English "how it's
   calculated" paragraph. Seller-of-truth calculators (investor.gov, xe.com) do this;
   it's also what converts "is this right?" skeptics.
4. **Never crash on garbage; never lie either.** Empty fields, negatives, zero rates,
   and pathological combinations must produce a sane result or an explicit dash — not
   `NaN`, not `Infinity`, not a frozen tab.
5. **Money is locale-sensitive.** ₹12,34,567 (lakh/crore) and $1,234,567 are different
   groupings of the same number. A calculator that only formats en-US quietly tells half
   the world it wasn't built for them.

## 2. Tech Stack

- Plain JS, zero dependencies. `Intl`/`toLocaleString` for grouping; `Math.pow`, `Math.log`
  for the finance math — no numeric library needed at calculator scale.
- One shared money module (IIFE, localStorage-persisted) used by every tool in the suite.
- Hand-rolled SVG line/area charts (~80 lines) instead of a charting library: themeable
  via CSS variables, printable as vectors, no dependency. Overlay series (dashed) for
  baseline-vs-scenario comparisons.
- `localStorage` for persistence, URL hash for shareable state. No backend — a finance
  tool that transmits nothing is a feature you can prove in the network tab.

## 3. Patterns

### 3.1 Input normalization — one line per field, every field

Read inputs through a clamp that makes bad input impossible rather than validated:

```js
const principal    = Math.max(0, parseFloat($('amount').value) || 0);
const annualRate   = Math.max(0, parseFloat($('rate').value)   || 0);
const years        = Math.max(1, parseFloat($('years').value)  || 1);
const extraMonthly = Math.max(0, parseFloat($('extra').value)  || 0);
```

`parseFloat(...) || 0` converts empty/`NaN` to a safe default; `Math.max` sets the
domain floor. No red error text for a half-typed number — the result simply reflects
the sane interpretation, and updates as they finish typing. Reserve real error messages
for semantic problems ("EMI doesn't cover monthly interest"), not syntax.

### 3.2 The edge-case table (test each one explicitly)

| Case | Wrong behavior | Right behavior |
|---|---|---|
| Rate = 0 | `0/0` → NaN in the EMI formula | Branch: `principal / months` (simple division) |
| Principal = 0 or months = 0 | NaN/Infinity | Return 0 before touching the formula |
| Division for a percentage share | `x/0` → Infinity% | Guard: `total > 0 ? Math.round(i/total*100) + '%' : '—'` |
| EMI < monthly interest | Infinite loop, tab freeze | Detect `principalPaid <= 0 && r > 0` → break, explain |
| Pathological tenure/rate combos | Loop runs forever | Hard iteration cap: `maxMonths = totalMonths * 3 + 12` |
| Prepayment > remaining balance | Negative balance | `lump = Math.min(lump, balance)` |
| Negative real return (inflation > post-retirement return) | Silent nonsense corpus | Compute REAL rate `(1+post)/(1+inf)−1`; handle its negative branch |
| Negative results (net worth, savings gap) | "−" glyph chaos, broken layout | Format sign explicitly; style with a semantic danger class |

The zero-rate EMI branch, distilled:

```js
function calcEMI(principal, monthlyRate, months) {
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;      // the formula divides by zero here
  const k = Math.pow(1 + monthlyRate, months);
  return principal * monthlyRate * k / (k - 1);
}
```

### 3.3 The simulation loop (the heart of every serious loan tool)

```js
function simulate({ principal, annualRate, years, extraMonthly, lumps, strategy }) {
  const r = annualRate / 100 / 12;
  const totalMonths = Math.round(years * 12);
  let emi = calcEMI(principal, r, totalMonths);
  let balance = principal, m = 0, totalInterest = 0;
  const monthly = [];
  const maxMonths = totalMonths * 3 + 12;                // hard stop for bad inputs
  while (balance > 0.5 && m < maxMonths) {               // 0.5 = float-dust threshold
    m++;
    const interest = balance * r;
    totalInterest += interest;
    let principalPaid = emi + extraMonthly - interest;
    if (principalPaid <= 0 && r > 0) break;              // EMI can't cover interest
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    if (lumps[m] && balance > 0) {
      balance -= Math.min(lumps[m], balance);
      if (strategy === 'emi' && balance > 0 && m < totalMonths)
        emi = calcEMI(balance, r, totalMonths - m);      // keep tenure, reduce EMI
      // strategy 'tenure': keep EMI, loan just ends earlier
    }
    monthly.push({ month: m, interest, principalPaid, balance });
  }
  return { monthly, payoffMonths: m, totalInterest, startEmi: emi, endEmi: emi };
}
```

Why this beats formula gymnastics: run it **twice** — baseline (no prepayments) and
scenario — and every impact stat is a subtraction: interest saved, months saved, new
payoff date. The yearly amortisation table is `monthly` sliced in chunks of 12 and
summed. One loop, every feature.

### 3.4 Localized currency formatting (the shared money module)

```js
const money = (() => {
  let symbol = localStorage.getItem('cur') || '$';
  let format = localStorage.getItem('fmt') || 'intl';    // 'intl' | 'in'
  function fmt(n) {
    const r = Math.round(n);                             // calculators round display, not math
    const grouped = Math.abs(r).toLocaleString(format === 'in' ? 'en-IN' : 'en-US');
    return (r < 0 ? '−' : '') + symbol + grouped;        // en-IN gives 12,34,567
  }
  function fmtCompact(n) {                               // for tight stat cards
    const abs = Math.abs(n), sign = n < 0 ? '−' : '';
    if (format === 'in') {
      if (abs >= 1e7) return sign + symbol + (abs / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
      if (abs >= 1e5) return sign + symbol + (abs / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
    } else {
      if (abs >= 1e9) return sign + symbol + (abs / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
      if (abs >= 1e6) return sign + symbol + (abs / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    }
    return fmt(n);
  }
  return { fmt, fmtCompact, get symbol() { return symbol; } };
})();
```

Key decisions: symbol and grouping are **independent** settings (a user can want ₹ with
million/billion grouping); both persist in localStorage so the whole suite follows one
choice; each tool's local `fmtMoney` just delegates. Layout consequence: long formatted
values ("₹1,04,13,879 → ₹98,20,000") overflow narrow stat cards — give stat numbers
`min-width: 0` and an auto-shrinking font (measure, step down until it fits) rather
than letting `overflow-wrap` break mid-digit-group, which reads as a typo.

### 3.5 Formula transparency

Under the results, always:

```html
<p class="how">How it's calculated: your monthly expenses are inflated to retirement age
at the inflation rate, then we compute the corpus that funds a 30-year drawdown at the
<b>real</b> post-retirement return — (1 + post-retirement) / (1 + inflation) − 1 —
so the answer is in tomorrow's money, not today's.</p>
```

Plus derived insight stats that expose the model: interest as % of principal, marginal
vs effective tax rate, purchasing-power halving time (`Math.LN2 / Math.log(1 + r)`).
On charts, plot the **contributions line under the balance line** — the visible gap IS
compound interest, the single most persuasive pixel in a compound calculator.

### 3.6 Shareable URL state (no server)

```js
function encodeState(state) {
  location.hash = btoa(encodeURIComponent(JSON.stringify(state)));
}
function decodeState() {
  if (!location.hash || location.hash.length < 2) return null;
  try { return JSON.parse(decodeURIComponent(atob(location.hash.slice(1)))); }
  catch { return null; }                                 // corrupt hash = fresh start, never a crash
}
```

The URL becomes the save file: shareable, bookmarkable, zero backend. `encodeURIComponent`
before `btoa` keeps non-ASCII (₹, names) from throwing; the try/catch makes tampered
links harmless.

### 3.7 Live wiring

```js
['amount', 'rate', 'years', 'extra'].forEach(id =>
  $(id).addEventListener('input', render));
render();                                                // once at init — the forgotten call
```

`render()` reads all inputs, runs the simulation(s), writes stats/chart/table. One
render function, idempotent, called from anywhere (including the money picker's
currency-change event). The classic bug: state that's only synced inside a click
handler is wrong on first paint — always call the sync once at init (tapdot shipped a
tax tool whose default tab's panel was hidden on load for exactly this reason).

## 4. Anti-patterns

- **`NaN`, `Infinity`, or `undefined` anywhere user-visible.** Each is a trust-ending
  event in a finance tool. The §3.1 clamps + §3.2 guards eliminate them structurally.
- **A Calculate button.** Adds a step, hides the model, and breaks the drag-the-slider
  exploration loop that makes calculators sticky.
- **Deriving the amortisation table from a different code path than the headline EMI.**
  Two implementations WILL disagree in an edge case, in public. One simulation, all
  outputs.
- **`toFixed(2)` string math and float accumulation.** Round at display time only; use
  a `> 0.5` currency-dust threshold to terminate loops, never `=== 0`.
- **Unlabeled assumptions.** If the model assumes 30-year drawdown, monthly compounding,
  or "returns are pre-tax," print it. An unstated assumption is a wrong answer waiting
  to be screenshot-quoted.
- **en-US-only formatting**, or grouping hardcoded to the currency symbol.
- **Charting libraries for one line chart.** 80 lines of SVG is themeable, printable,
  and dependency-free; a library is none of those by default.
- **Sending financial inputs to a backend.** The strongest feature a calculator can have
  in 2026 is "open devtools — nothing leaves this page."

## 5. Usage

1. Write the pure math first: `calcEMI`-style formula functions plus a `simulate()` loop,
   with the §3.2 guards. Unit-check against a known-good source (a bank's published EMI,
   investor.gov's compound calculator) before touching UI.
2. Build one idempotent `render()`; wire every input's `input` event to it; call it once
   at init.
3. Route all money display through the shared money module; test with ₹ + lakh/crore and
   a 9-digit value in a 375px viewport.
4. Add the transparency layer: "how it's calculated" prose, assumption labels, and one
   comparison visual (baseline vs scenario as a dashed overlay).
5. Add URL-hash share state if inputs are worth sharing. Then attack your own tool with
   the §3.2 table: 0% rate, 0 principal, 1-month tenure, prepayment bigger than the
   loan, EMI below interest — every cell must behave.

## 6. Example Output

A LoanCalc built with this skill: EMI, total interest, and interest-as-%-of-loan stats;
unlimited month+amount prepayment rows; a keep-EMI-reduce-tenure vs keep-tenure-reduce-EMI
strategy toggle; an impact card (interest saved, paid off X years earlier, new payoff)
computed as baseline-minus-scenario from two runs of one simulation loop; a dashed
overlay chart of both balance curves; a yearly amortisation table with an interest-share
column; ₹/$/€ symbol + lakh-crore/million-billion toggles persisted suite-wide; a hard
iteration cap and an explicit "EMI doesn't cover monthly interest" message instead of a
frozen tab. Roughly 160 lines of logic, zero dependencies, zero requests.
