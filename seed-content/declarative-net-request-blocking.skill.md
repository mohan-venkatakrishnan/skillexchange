---
title: Content Blocking with declarativeNetRequest Skill
category: Extension
description: Ship real request blocking under Manifest V3, where webRequest can no longer block and every rule counts against a hard cap. Covers static rulesets vs dynamic vs session rules, the actual limits and regexFilter cost budget, priority resolution between allow and block, redirect and modifyHeaders actions, and debugging matches with testMatchOutcome before a reviewer asks why you need host permissions.
usage: Load this skill when building or porting any blocking, redirecting, or header-rewriting extension to MV3. Describe what you need blocked and the AI will produce the ruleset JSON, manifest, and runtime enable/disable code within the real limits. Paste "my rule doesn't match" or a rejected-rule error and it will diagnose against sections 3.4 and 3.8.
platforms: [Claude, Cursor]
priceUsd: 7
timeSavedHours: 18
pocUrl: https://github.com/GoogleChrome/chrome-extensions-samples
---
# Content Blocking with declarativeNetRequest Skill

Written after porting a blocker from MV2 to MV3, discovering that a rule which worked for
three years is now a rule the browser evaluates without ever telling you, and having a
reviewer ask — reasonably — why a content blocker needs to read every URL the user visits.

## 1. Philosophy

- **You are no longer in the request path.** `declarativeNetRequest` (DNR) is a
  declaration, not a callback. You hand Chrome a rulebook and Chrome applies it in the
  network stack while your extension sleeps. That is the point: it is why blocking
  survives worker eviction, and why you cannot make a decision that depends on runtime
  state.
- **Design for the cap, not the feature.** Rules are a budget with a hard ceiling. An
  architecture needing one dynamic rule per user action hits the wall. Push everything you
  can into static rulesets — cheap, reviewed once, larger allowance.
- **The most specific rule does not win. The highest priority does.** DNR's resolution
  order is its single biggest source of "my rule doesn't work," and it is not the
  intuition you brought from CSS or from filter lists.
- **Every host permission is a paragraph you will write in the review form.** DNR exists
  so a blocker can work without reading page content. Lean on that.
- **If you cannot debug it, you cannot ship it.** DNR fails silently by design. Wire up
  `testMatchOutcome` and `onRuleMatchedDebug` before you write rule number two.

## 2. Tech Stack

- **Project referenced:** Chrome extension samples —
  https://github.com/GoogleChrome/chrome-extensions-samples — license: **Apache-2.0**.
  This skill is an independent, original guide; it is not affiliated with or endorsed by
  the Chrome extension samples maintainers.
- MV3, `declarative_net_request` manifest key, static rulesets as JSON in the package.
- `permissions: ["declarativeNetRequest"]`; `declarativeNetRequestWithHostAccess` when
  rules should apply only where the user granted access; `declarativeNetRequestFeedback`
  for `onRuleMatchedDebug` (unpacked/dev only).
- `updateDynamicRules` / `updateSessionRules` / `updateEnabledRulesets` at runtime.
- `testMatchOutcome` and `isRegexSupported` as the dev loop.
- Redirect stubs shipped as `web_accessible_resources`.
- No `webRequest` blocking. It is gone. Do not design around it returning.

## 3. Patterns

### 3.1 Why webRequest blocking is gone, and what a port costs

Under MV2, `onBeforeRequest` with `"blocking"` ran your JS synchronously in the network
path. Total power, real cost: every request waited on a possibly-evicted extension, and
the extension saw the full URL of everything. MV3 removes the blocking return value —
`onBeforeRequest` still fires as an observer, but `{cancel: true}` does nothing.

The consequence that ends ports: **a rule whose decision depends on data you computed at
runtime cannot be expressed directly.**

```
MV2                                      MV3
onBeforeRequest → {cancel:true}       →  static rule, action.type: 'block'
onBeforeRequest → {redirectUrl}       →  action.type: 'redirect'
onBeforeSendHeaders → mutate          →  modifyHeaders, requestHeaders
onHeadersReceived → mutate            →  modifyHeaders, responseHeaders
"block if user toggled X off"         →  a ruleset per mode + updateEnabledRulesets
"block based on response content"     →  not expressible. Redesign the feature.
```

That last row has no workaround at any price.

### 3.2 Static rulesets in the manifest

```json
{
  "permissions": ["declarativeNetRequest"],
  "host_permissions": ["https://*.example.com/*"],
  "declarative_net_request": {
    "rule_resources": [
      { "id": "core",   "enabled": true,  "path": "rules/core.json" },
      { "id": "strict", "enabled": false, "path": "rules/strict.json" }
    ]
  }
}
```

Rule ids are unique within a ruleset; `priority` defaults to 1 if omitted.

```json
[
  { "id": 1, "priority": 1,
    "action": { "type": "block" },
    "condition": { "urlFilter": "||tracker.example.net^",
                   "resourceTypes": ["script", "xmlhttprequest", "image"] } },

  { "id": 2, "priority": 1,
    "action": { "type": "block" },
    "condition": { "urlFilter": "/analytics/collect",
                   "initiatorDomains": ["shop.example.com"],
                   "resourceTypes": ["xmlhttprequest", "ping"] } }
]
```

Learn `urlFilter` properly — every character here is regex budget you don't spend (§3.5):
`||host^` matches the host and subdomains (`^` = any non-alphanumeric separator);
`|https://` anchors the start, trailing `|` the end; `*` wildcards. **No filter at all
matches every URL** — combine with `resourceTypes` and domains or you have written a rule
that blocks the internet.

**`resourceTypes` is not optional in practice.** Omit it and the rule matches `main_frame`
too, so a rule meant for a tracking pixel also blocks the user *navigating* to that
domain — with a raw network error page. If you want a friendly block page, redirect
(§3.6); don't block.

Also note `domains` was deprecated for `initiatorDomains` / `requestDomains`. Mixing them
up ("who requested" vs "who is being requested") is the most common condition bug there
is.

### 3.3 Dynamic vs session rules

```js
// Dynamic: persists across restarts AND extension updates. Survives everything.
await chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1001],                       // remove-then-add is how you "update"
  addRules: [{ id: 1001, priority: 2,
    action: { type: 'block' },
    condition: { urlFilter: '||ads.example.org^', resourceTypes: ['script', 'image'] } }],
});

// Session: dies with the browser. tabIds conditions are session-only.
await chrome.declarativeNetRequest.updateSessionRules({
  addRules: [{ id: 2001, priority: 1000,
    action: { type: 'allowAllRequests' },
    condition: { tabIds: [tab.id], resourceTypes: ['main_frame', 'sub_frame'] } }],
});
```

Choose by lifetime. **Dynamic** = user's saved custom filters and permanent allowlist —
and critically it *survives an extension update*, so a bad dynamic rule written by your
v1.2 logic outlives v1.3. **Session** = "pause on this tab," per-tab temporary allows;
cheaper because a restart cleans up your mess. `tabIds`/`excludedTabIds` are valid **only**
in session rules, which is what makes a pause button a three-line feature with no cleanup.

Both calls are atomic: `removeRuleIds` runs before `addRules`, and **if any rule in the
batch is invalid the whole call rejects and nothing changes**. Do not batch a user's 400
imported filters into one call and hope — validate, then chunk, so one bad line rejects
one chunk instead of the import.

### 3.4 Priority resolution — the actual algorithm

Where the hours go:

1. Collect every matching rule across all enabled rulesets, dynamic, and session.
2. Take the **highest `priority`** value. Ties broken by action type: `allow` /
   `allowAllRequests` > `block` > `redirect` / `upgradeScheme`.
3. Still tied? Earlier-listed rulesets win, then lower rule `id`. Never rely on this.

The counter-intuitive part: **`allow` does not universally beat `block`.** A block at
priority 3 beats an allow at priority 1; `allow` only wins the *tiebreak at equal
priority*. So an allowlist must be authored strictly above your blocklist:

```json
[
  { "id": 1, "priority": 1, "action": { "type": "block" },
    "condition": { "urlFilter": "||cdn.example.net^", "resourceTypes": ["script"] } },

  { "id": 2, "priority": 100, "action": { "type": "allow" },
    "condition": { "urlFilter": "||cdn.example.net/player.js",
                   "initiatorDomains": ["video.example.com"], "resourceTypes": ["script"] } }
]
```

`allowAllRequests` is different in kind: applied to a `main_frame`/`sub_frame` request it
exempts that frame and **everything under it**, including requests that start later. It is
how you build "disable on this site" without enumerating subresources.

`modifyHeaders` plays by its own rules: it does not win or lose, it **accumulates**. All
matching header rules apply in descending priority, and a higher-priority `allow`/`block`
short-circuits them. Two rules appending the same header both run — which is how you get
a doubled `Accept-Language`.

### 3.5 The limits, precisely

| Limit | Value | What happens |
|---|---|---|
| `GUARANTEED_MINIMUM_STATIC_RULES` | 30,000 | Always yours |
| Global static pool | ~330,000, browser-wide | Beyond your guarantee: first-come, shared |
| `MAX_NUMBER_OF_ENABLED_STATIC_RULESETS` | 50 | `updateEnabledRulesets` rejects |
| `MAX_NUMBER_OF_STATIC_RULESETS` | 100 | Manifest fails to load |
| `MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES` | 5,000 combined | Update rejects |
| `MAX_NUMBER_OF_REGEX_RULES` | 1,000 | Across static + dynamic + session |
| Per-rule regex compile cost | budgeted | Rule dropped at load with an error you won't see |

Read the static story carefully. Enabled static rules past your guaranteed 30,000 compete
in a pool shared with **every other installed extension** — on a machine with three
blockers your ruleset can fail to fully enable through no fault of your own. Check before
you enable:

```js
const room = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
if (room < RULESET_SIZES.regional) return showNotice('Not enough rule capacity.');
await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['regional'] });
```

**regexFilter cost.** Each regex is compiled and scored; exceed the per-rule budget and the
rule is silently dropped at load. It is RE2 — no backreferences, no lookarounds. The
practical rule: `urlFilter` handles ~95% of what people reach for regex for, at zero
budget. Write `||ads.example.net^`, not
`regexFilter: "^https?://([a-z0-9-]+\\.)*ads\\.example\\.net/"`. Validate before shipping
a thousand:

```js
const { isSupported, reason } = await chrome.declarativeNetRequest.isRegexSupported({
  regex: '^https://cdn\\.example\\.com/px/[0-9a-f]{16}\\.gif$', isCaseSensitive: false,
});   // reason: 'syntaxError' | 'memoryLimitExceeded'
```

### 3.6 Redirect and modifyHeaders in anger

```json
[
  { "id": 10, "priority": 2,
    "action": { "type": "redirect", "redirect": { "extensionPath": "/stubs/noop.js" } },
    "condition": { "urlFilter": "||metrics.example.net/sdk.js", "resourceTypes": ["script"] } },

  { "id": 11, "priority": 2,
    "action": { "type": "redirect", "redirect": { "transform": { "queryTransform": {
      "removeParams": ["utm_source", "utm_medium", "fbclid", "gclid"] } } } },
    "condition": { "urlFilter": "*", "resourceTypes": ["main_frame"] } },

  { "id": 12, "priority": 1,
    "action": { "type": "modifyHeaders",
      "requestHeaders":  [{ "header": "referer", "operation": "remove" }],
      "responseHeaders": [{ "header": "set-cookie", "operation": "remove" }] },
    "condition": { "requestDomains": ["ads.example.org"], "resourceTypes": ["xmlhttprequest"] } }
]
```

Rule 10 is the classic "neuter the tracker without breaking the page that awaits its
callback." The stub **must** be in `web_accessible_resources` matched to the sites that
load it, or the redirect resolves to a blocked URL and you have turned a working page into
a broken one:

```json
"web_accessible_resources": [{ "resources": ["/stubs/noop.js"], "matches": ["https://*/*"] }]
```

`transform` beats `regexSubstitution` whenever it fits — no regex budget, no escaping,
cannot produce a malformed URL. If you do need substitution, groups are `\\1`, not `$1`;
getting that wrong puts a literal `$1` in the URL.

The `modifyHeaders` trap: it requires host permissions for the request URL **and** its
initiator. Without both, the rule matches and silently does nothing — no error, no log —
which looks exactly like a broken condition. Hours disappear here.

### 3.7 Enabling rulesets at runtime

```js
async function setStrict(on) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds:  on ? ['strict'] : [],
    disableRulesetIds: on ? [] : ['strict'],
  });
}
const enabled = await chrome.declarativeNetRequest.getEnabledRulesets(); // ['core', ...]
```

Ruleset enablement **persists across restarts and updates** and stops following your
manifest's `"enabled"` flag once the user touches it. So a manifest default is only ever a
first-install value: a user who disabled `strict` in v1.3 keeps it disabled in v1.4, which
is correct. Render your options UI from `getEnabledRulesets()`, never from your own stored
boolean, which drifts.

### 3.8 Debugging: testMatchOutcome and onRuleMatchedDebug

`testMatchOutcome` is the fastest loop in this skill — it answers the only question that
matters first, with no page load:

```js
const { matchedRules } = await chrome.declarativeNetRequest.testMatchOutcome({
  url: 'https://tracker.example.net/pixel.gif?id=1',
  initiator: 'https://news.example.com', type: 'image', method: 'get',
});
```

Empty array = condition bug (§3.2 — usually `resourceTypes`, or `initiatorDomains` vs
`requestDomains`). Non-empty but wrong outcome = priority bug (§3.4).

For the firehose, in unpacked mode with `declarativeNetRequestFeedback`:

```js
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {          // guard: dev-only API
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(({ rule, request }) => {
    console.log('[dnr]', rule.rulesetId, '#' + rule.ruleId, request.type, request.url);
  });
}
```

This never fires in a store-installed extension — the permission is unpacked-only — so
guard it and strip the permission from release builds. Finally, confirm your rulesets even
loaded: a single malformed rule invalidates an entire static ruleset at install, and the
only signal is a warning on the card in `chrome://extensions` that you will not notice.
`getEnabledRulesets()` missing an id means your JSON is bad.

### 3.9 Surviving review

- **Prefer `declarativeNetRequestWithHostAccess`** with `optional_host_permissions`. It
  requires no broad up-front grant and reviewers read it as a narrower ask, because it is.
- **`<all_urls>` needs a product reason,** not a convenience reason. A tracker blocker
  genuinely needs it — write that sentence and mean it.
- **Static beats dynamic in a reviewer's eyes.** Your JSON is in the zip; they can read
  exactly what it blocks. Ship your baseline static, reserve dynamic for user-authored.
- **Never fetch rules from a server and install them as dynamic rules.** That is remotely
  hosted behavior change and the fastest rejection available. Lists update by shipping a
  version. This is the constraint MV3 exists to impose; arguing in the form does not work.
- **Redirects to a URL you control** read as exfiltration. Redirect to `extensionPath`.

## 4. Anti-patterns

- **Omitting `resourceTypes`.** The rule matches `main_frame`, so your pixel rule blocks
  the user's navigation and shows a raw error page. Always enumerate.
- **Assuming `allow` beats `block`.** It only wins at *equal* priority. A same-priority
  allowlist works by luck and breaks the next time you add a rule.
- **`regexFilter` where `urlFilter` would do.** Burns the 1,000-regex budget, risks silent
  complexity rejection, and is slower. `||host^` already covers subdomains.
- **One `updateDynamicRules` call for a whole imported list.** One invalid rule rejects the
  batch and the user's import silently does nothing. Validate, then chunk.
- **`modifyHeaders` without host permissions for both URL and initiator.** Matches, does
  nothing, logs nothing.
- **Redirecting to a bundled file that isn't in `web_accessible_resources`.** The target
  itself gets blocked; the page is now worse than before you started.
- **Rendering options from your own "strict enabled" boolean.** Enablement persists in the
  browser independently and drifts after any update. Read `getEnabledRulesets()`.
- **Shipping `declarativeNetRequestFeedback`.** Unpacked-only, unjustifiable in review, and
  `onRuleMatchedDebug` won't fire anyway.
- **Porting a "block based on response content" feature.** Not expressible at any price.

## 5. Usage

Give the AI this skill plus what you need blocked, redirected, or rewritten. Ask for:

1. **Feasibility pass** — the feature through §3.1's table. Anything needing runtime state
   or response bodies gets flagged before code exists.
2. **Rule inventory** — a table: id range, priority, action, condition, static/dynamic/
   session, and the §3.5 budget consumed. Assign a layered priority scheme up front
   (blocklist 1, stubs 2, allowlist 100, site-disable 1000).
3. **Ruleset JSON + manifest** — per §3.2, with `web_accessible_resources` for any stub and
   the narrowest host permissions you can defend.
4. **Runtime layer** — `updateEnabledRulesets` with a capacity check, session rules for
   per-tab pause, dev-only `onRuleMatchedDebug`.
5. **Review justification** — one sentence per permission, written as if for the form.

For debugging: "rule doesn't fire" → `testMatchOutcome` first (§3.8). "Fires but the
request goes through" → priority (§3.4). "Header rule does nothing" → initiator host
permission (§3.6). "Some rules stopped working after adding a list" → static pool
exhaustion (§3.5).

## 6. Example Output

A tracker blocker with a per-site pause button, built with this skill:

- **Three static rulesets:** `core.json` (~4,200 block rules, all `urlFilter`, zero regex,
  `resourceTypes` enumerated per rule), `strict.json` (~900, off by default), `stubs.json`
  (31 redirects to bundled no-ops). Total well under the 30,000 guarantee, so the global
  pool is never a factor — the design decision that mattered most.
- **Priority scheme** documented at the top of every file: blocks 1, stubs 2, publisher
  allowlist 100, `allowAllRequests` site-disable 1000. The one real bug during development
  was an allowlist entry authored at priority 1; `testMatchOutcome` found it in ninety
  seconds.
- **Pause button** = one session rule with `tabIds: [tab.id]` and `allowAllRequests`. No
  cleanup code, because a restart clears it — which is what users expect anyway.
- **Custom filters** = dynamic rules in the 10,000+ id range, each validated with
  `isRegexSupported`, chunked 50 per call so one bad line rejects one chunk.
- **Options page** renders from `getEnabledRulesets()` and calls
  `getAvailableStaticRuleCount()` before enabling `strict`, showing a real sentence when
  another extension has eaten the pool.
- **Review:** `declarativeNetRequestWithHostAccess` + `optional_host_permissions`, no
  `<all_urls>` in the base manifest, every redirect an `extensionPath`, and
  `declarativeNetRequestFeedback` stripped by the release script. Passed first submission.
