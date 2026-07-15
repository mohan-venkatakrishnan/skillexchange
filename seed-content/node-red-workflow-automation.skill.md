---
title: Automation with Node-RED Skill
category: DevOps
description: Turn Node-RED from a toy for blinking LEDs into a maintainable automation layer for webhooks, integrations, and ops glue. Covers flow architecture, message design, error handling with catch nodes, custom function nodes, and version-controlled deployment.
usage: Load this skill before asking your AI assistant to design or debug Node-RED automations. Describe the trigger, the systems involved, and the desired outcome; the assistant will produce flow structure, function-node code, and error/retry wiring that follow these conventions instead of a spaghetti canvas.
platforms: [Claude, ChatGPT, Gemini]
priceUsd: 4
timeSavedHours: 10
pocUrl: https://github.com/node-red/node-red
---

# Automation with Node-RED Skill

## 1. Philosophy

Visual programming fails the same way textual programming fails — through unbounded complexity — except on a canvas you can *see* the spaghetti. This skill treats Node-RED as what it actually is: an event-driven runtime with a visual editor on top, deserving the same engineering discipline as any service.

1. **A flow is a function.** One trigger, one responsibility, one clearly named output. "Handle Stripe webhook" is a flow. "All the billing stuff" is a landfill.
2. **The message is the API.** Everything between nodes travels on `msg`. Design `msg.payload` shapes deliberately, document them in comment nodes, and never let intermediate nodes stuff junk onto `msg` that downstream nodes must know to ignore.
3. **Every flow that talks to the outside world has explicit failure wiring.** A catch node, a retry policy, and a dead-letter path are not optional decorations — an automation platform that fails silently is worse than no automation, because everyone believes the work happened.
4. **Function nodes are for logic; nodes are for IO.** Ten chained change/switch nodes doing what eight lines of JavaScript would do is not "low-code," it's obfuscation. Inversely, hand-rolling HTTP calls inside a function node when an `http request` node exists throws away built-in TLS, proxy, and timeout handling.
5. **If it isn't in git, it doesn't exist.** Flows are JSON. Export them, commit them, deploy them through the projects feature or CI — a production automation that lives only in one browser's editor is an outage with a delay timer.

## 2. Tech Stack

- **Node-RED** — https://github.com/node-red/node-red — licensed **Apache-2.0**. Flow-based programming runtime on Node.js with a browser editor, built by the OpenJS Foundation community.
- **Node.js 18+** — the runtime underneath; function nodes are plain JavaScript.
- Useful first-party pieces: the **projects** feature (git integration), `node-red-admin` (CLI), and the built-in `http in`, `http request`, `switch`, `change`, `catch`, `status`, and `link` nodes — most automations need nothing else.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Node-RED maintainers or the OpenJS Foundation. All example code is original to this skill.

## 3. Patterns

### 3.1 Canvas architecture: tabs as modules, links as imports

- One **tab per domain** ("Billing", "Alerts", "Sync: CRM"), not per experiment.
- Within a tab, flows read **left to right**: trigger → validate → transform → act → confirm. If wires cross more than twice, restructure.
- Shared sub-flows (e.g., "post to ops channel", "sign request to internal API") become **subflows** or **link in/out** pairs — the function-extraction of the canvas. Name link nodes like functions: `to: notify-ops`, `from: notify-ops`.
- Every non-obvious cluster gets a **comment node** stating the msg contract: what arrives, what leaves.

### 3.2 Webhook intake: validate at the door

The pattern for every `http in` endpoint — respond fast, verify, then process asynchronously:

```
[http in POST /hooks/orders] → [function: verify signature] → [http response 202]
                                        ↓ (second output)
                                  [link out: process-order]
```

```javascript
// function node: verify signature (2 outputs: ok, reject)
const crypto = require('crypto'); // enable via functionGlobalContext or setup tab

const secret = env.get("ORDER_HOOK_SECRET");
const given = msg.req.headers['x-hook-signature'] || '';
const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(msg.payload))
    .digest('hex');

const a = Buffer.from(given), b = Buffer.from(expected);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    msg.statusCode = 401;
    msg.payload = { error: 'bad signature' };
    return [null, msg];      // second wire → http response 401
}
msg.order = msg.payload;      // promote to a named property; payload will be reused
return [msg, null];
```

Note the conventions: secrets from `env.get()` (never hardcoded in the node), timing-safe comparison, and multiple outputs used as typed branches instead of a downstream switch on an ad-hoc flag.

### 3.3 Message design: payload is a workbench, named properties are the record

`msg.payload` gets overwritten by nearly every node (`http request` replaces it with the response body). So:

- Park anything you need later on a named property **before** the node that clobbers: `msg.order`, `msg.customerEmail`.
- Never park data in flow/global context just to pass it between two nodes — context is shared state across *all* concurrent messages and will interleave under load. Context is for genuinely shared, slowly-changing data (a cached token, a feature flag), always accessed with care.

```javascript
// function node: build enrichment request (order already on msg.order)
msg.url = `https://internal-api.example.com/customers/${msg.order.customerId}`;
msg.headers = { authorization: `Bearer ${env.get("INTERNAL_API_TOKEN")}` };
return msg; // http request node fills msg.payload with the customer record
```

### 3.4 Error handling: catch, classify, retry, dead-letter

Every tab gets a standard error rig:

```
[catch: all on this tab] → [function: classify] →(retryable)→ [delay 30s, rate-limited] → [link out: retry entry]
                                               →(fatal)→ [function: build alert] → [link out: notify-ops]
```

```javascript
// function node: classify (2 outputs: retryable, fatal)
msg.retries = (msg.retries || 0) + 1;
const status = msg.error?.source ? (msg.statusCode || 0) : 0;
const transient = [429, 502, 503, 504].includes(status) ||
                  /ETIMEDOUT|ECONNRESET|EAI_AGAIN/.test(msg.error?.message || '');

if (transient && msg.retries <= 3) return [msg, null];

msg.alert = {
    flow: 'billing',
    error: msg.error?.message,
    after: `${msg.retries} attempt(s)`,
    sample: msg.order?.id ?? msg._msgid,
};
return [null, msg];
```

Rules: retries are counted **on the message**, not in context; retry delays go through a `delay` node in rate-limit mode so a burst of failures doesn't hammer a struggling dependency; the fatal path always ends somewhere a human looks (chat webhook, email, ticket) — never at an unwired output.

### 3.5 Function nodes worth writing

Keep function nodes under ~40 lines with one job. For async work, use the returned-promise style and `node.done()` semantics:

```javascript
// function node: fan out line items (1 msg in → N msgs out)
const items = msg.order.lineItems || [];
node.status({ fill: 'blue', shape: 'dot', text: `fanning out ${items.length}` });

for (const [i, item] of items.entries()) {
    node.send({
        _msgid: RED.util.generateId(),
        order: msg.order,
        item,
        parts: { id: msg._msgid, index: i, count: items.length }, // join node compatible
    });
}
node.done();
return null;
```

Setting `msg.parts` by hand keeps the built-in `join` node usable at the other end — split/work/join without custom aggregation code. `node.status()` turns the canvas into a live dashboard for free; use it in any node that does real work.

### 3.6 Deployment: flows are code

- Enable the **projects** feature (`editorTheme.projects.enabled: true` in `settings.js`); every deploy becomes a git commit with `flows.json` and `flows_cred.json` (encrypted with `credentialSecret` — set it explicitly, or the default key locks your credentials to one machine).
- Environment-specific values (URLs, secrets) come from **environment variables** referenced as `${VAR}` in node config or `env.get()` in functions — the same flow JSON must deploy unchanged to staging and prod.
- Run under a process supervisor or a container; pin the Node-RED version in `package.json`. A reasonable minimal `Dockerfile`:

```dockerfile
FROM nodered/node-red:4.0
COPY --chown=node-red:node-red settings.js /data/settings.js
COPY --chown=node-red:node-red flows.json flows_cred.json /data/
ENV NODE_RED_CREDENTIAL_SECRET="" 
# supply real secret + env vars at runtime, never baked into the image
```

- Lock down the editor in production: `adminAuth` enabled, `httpNodeAuth` or upstream auth on `http in` endpoints, and ideally editor access only over an internal network. An open Node-RED editor is remote code execution with a friendly UI.

## 4. Anti-patterns

- **The thousand-node tab.** If a tab needs horizontal scrolling in both directions, it's several flows wearing a trenchcoat. Split by trigger/domain; connect with link nodes.
- **Global context as a message bus.** Two concurrent messages read/write `global.currentOrder` and corrupt each other. Data that belongs to a request rides on `msg`, full stop.
- **Unwired catch-less HTTP calls.** An `http request` node with no catch coverage fails into the void. Every IO node is inside some catch node's scope.
- **Secrets in function-node source or inject-node payloads.** They end up in `flows.json`, then in git. `env.get()` and credential fields only.
- **Blocking loops in function nodes.** A `while` loop polling for a condition freezes the entire runtime — Node-RED is single-threaded like any Node app. Use delay/trigger nodes or async patterns.
- **`Deploy: Full` reflex.** Full deploy restarts every flow, dropping in-flight messages and re-triggering inject-on-start nodes. Use *Modified Nodes* deploys in production.
- **Change-node archaeology.** Six chained change nodes renaming properties one at a time. One function node with an explicit object literal is readable and diffable.
- **Treating the editor as the source of truth.** No projects/git means no review, no rollback, no disaster recovery. Flows are code; version them.
- **One giant "utils" subflow with mode switches.** A subflow that behaves differently based on `msg.mode` is an untestable god-function. One subflow, one job.

## 5. Usage

1. Load this skill into your assistant's context.
2. Describe the automation as trigger → systems → outcome, e.g. "When a GitHub release is published (webhook), post release notes to our chat, update the changelog page via API, and open a follow-up ticket if the release is a major version."
3. Ask for, in order: (a) the flow architecture as a text diagram (tabs, nodes, wires, link nodes), (b) each function node's code with its msg contract stated in a comment, (c) the error rig wiring, (d) required env vars.
4. Import: the assistant can emit a flow as importable JSON, but review function-node code *before* importing — treat generated flow JSON like a generated pull request.
5. Reject any design where a failure path ends at an unwired output or where request data lives in flow/global context.

## 6. Example Output

Prompt with this skill loaded: *"When our uptime monitor webhook reports a service down, page on-call via our chat webhook, but only once per service per 15 minutes."*

Expected flow architecture (text form):

```
Tab: Alerts
[http in POST /hooks/uptime]
  → [function: verify signature]        (reject → http response 401)
  → [http response 202]
  ↳ [function: debounce per service]    (suppressed → end, with node.status)
  → [function: build chat message]
  → [http request POST $CHAT_WEBHOOK_URL]
  → [status/debug: sent]

[catch: all] → [function: classify] → retry rig → [link out: notify-ops-fallback]
```

Key function node — the one piece with real logic:

```javascript
// function node: debounce per service (1 output)
// in:  msg.payload = { service: "api-gateway", status: "down", checkedAt: "..." }
// out: same msg, only if this service hasn't alerted in the last 15 min
const WINDOW_MS = 15 * 60 * 1000;
const now = Date.now();

// context here is legitimately shared state: last-alert timestamps per service
const lastAlerts = flow.get('lastAlerts') || {};
const last = lastAlerts[msg.payload.service] || 0;

if (now - last < WINDOW_MS) {
    node.status({ fill: 'grey', shape: 'ring',
                  text: `suppressed ${msg.payload.service}` });
    return null;
}

lastAlerts[msg.payload.service] = now;
flow.set('lastAlerts', lastAlerts);
node.status({ fill: 'red', shape: 'dot', text: `alerting ${msg.payload.service}` });
return msg;
```

Markers of skill-compliant output: instant 202 to the monitor before any downstream work, signature verification at the door, context used only for the genuinely shared debounce table (with the reasoning stated), `node.status()` making suppression visible on the canvas, and a catch rig so a failed chat post pages through a fallback instead of vanishing.
