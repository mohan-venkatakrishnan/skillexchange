---
title: Push Notifications That Actually Arrive with Capacitor Skill
category: Mobile
description: Wire APNs and FCM into a Capacitor app end to end — entitlements, channels, token lifecycle, tap routing on cold start, and payloads shaped so iOS and Android behave the same instead of almost the same. Covers the failures that only appear in production: silent iOS pushes throttled to nothing, Android 13 permission never requested, and a token that rotated while you weren't watching.
usage: Load this skill before asking your assistant to add or debug push in a Capacitor app. State your platforms, whether you need alerts or silent data delivery, and what a tap should open ("tap opens /orders/:id, must work from cold start"), and it will produce the entitlement and channel setup, the token registration flow, and the exact server payload for both transports.
platforms: [Claude, Cursor]
priceUsd: 7
timeSavedHours: 18
pocUrl: https://github.com/ionic-team/capacitor
---

# Push Notifications That Actually Arrive with Capacitor Skill

## 1. Philosophy

Push is the only part of a mobile app where the delivery mechanism is owned entirely by two companies who are not you, disagree with each other, and reserve the right not to deliver. Everything below follows from taking that seriously.

1. **Delivery is best-effort. Design as if it is.** APNs and FCM both drop messages — device offline past the retention window, silent push deprioritised, Doze mode, aggressive OEM battery managers. A push may trigger a fetch; it may never *be* the data.
2. **The permission prompt is a one-shot asset.** Ask on first launch and roughly two-thirds of iOS users say no, forever. Ask after the user has a reason and you keep the channel. This is a product decision that lives in code.
3. **Data-only payloads, rendered by you.** Let FCM's `notification` block auto-display and you get one behaviour on backgrounded Android, another on iOS, and no control over grouping or tap payload. Own the render and the platforms converge.
4. **Tokens are ephemeral.** They rotate on reinstall, restore-from-backup, and at the platform's discretion. A token stored once at signup is a token that stops working, silently, months later.
5. **Every tap must route from a cold start.** The nine-tenths case is a killed app. If tap routing only works when the app is warm, it doesn't work.

## 2. Tech Stack

- **Capacitor** — https://github.com/ionic-team/capacitor — licensed **MIT**. Native runtime plus the official `@capacitor/push-notifications` and `@capacitor/local-notifications` plugins.
- **Apple Push Notification service (APNs)** and **Firebase Cloud Messaging (FCM)** — vendor services, not open source. You need an APNs auth key (`.p8`) and an FCM project; both are free at this scale.
- **@capacitor-firebase/messaging** — https://github.com/capawesome-team/capacitor-firebase — **MIT**. Needed only if you want a unified FCM token on iOS instead of a raw APNs token.
- Web/JS with TypeScript; native config in Xcode and `AndroidManifest.xml`.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Capacitor maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 The native setup nobody documents in one place

iOS, in Xcode, on the app target:
- **Signing & Capabilities → + Capability → Push Notifications.** This writes the `aps-environment` entitlement. Without it, `PushNotifications.register()` resolves fine and `registration` never fires — a silent no-op that reads as a JS bug for hours.
- **Background Modes → Remote notifications**, only if you need silent/background delivery. Adding it without ever sending a background push is an App Store review question you don't want.
- Upload an **APNs auth key** (`.p8`) to Firebase if you're routing iOS through FCM. Key-based auth covers all your apps and doesn't expire; the older certificate approach expires annually and takes production down on a date nobody diarised.

Android:
- Drop `google-services.json` into `android/app/`.
- API 33+ requires `POST_NOTIFICATIONS` in the manifest **and** at runtime. Miss it and `LocalNotifications` post nothing, with no error in logcat worth reading.

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<application>
  <!-- Without these two, backgrounded Android renders your push with the app icon
       in grey and no accent colour. It looks broken because it is. -->
  <meta-data android:name="com.google.firebase.messaging.default_notification_icon"
             android:resource="@drawable/ic_stat_notify" />
  <meta-data android:name="com.google.firebase.messaging.default_notification_color"
             android:resource="@color/notify_accent" />
</application>
```

The notification icon must be a **white-on-transparent silhouette**. Ship your full-colour app icon and Android renders a solid grey square. Every project does this once.

### 3.2 Config: take control of the foreground

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'org.tapdot.fieldnote',
  appName: 'Fieldnote',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      // iOS only. [] means: never auto-present in foreground — you decide.
      // Include 'badge','sound','alert' and iOS shows the system banner over your UI.
      presentationOptions: [],
    },
  },
}
export default config
```

Empty `presentationOptions` is the opinionated choice. A system banner appearing over the screen the user is already looking at, describing the thing they're already doing, is noise. Handle `pushNotificationReceived` and decide: in-app toast, badge, or nothing.

Android has no equivalent switch. Data-only payloads never auto-display there, which is one more reason to standardise on them.

### 3.3 Permission, registration, and the token lifecycle

```ts
// push/register.ts
import { PushNotifications, type Token } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'

export async function enablePush(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!Capacitor.isNativePlatform()) return 'unsupported'

  let perm = await PushNotifications.checkPermissions()
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    // Call this from a button the user pressed for a reason — never on app boot.
    perm = await PushNotifications.requestPermissions()
  }
  if (perm.receive !== 'granted') return 'denied'

  // register() only asks the OS for a token; the token arrives on the listener below.
  await PushNotifications.register()
  return 'granted'
}

export function watchToken(userId: string) {
  // Fires on first registration AND on every rotation — reinstall, restore, OS refresh.
  PushNotifications.addListener('registration', async (token: Token) => {
    await fetch(`${API}/devices`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        userId,
        token: token.value,
        platform: Capacitor.getPlatform(),      // your server needs to know APNs vs FCM
        installId: await stableInstallId(),     // dedupe: one row per install, not per boot
      }),
    })
  })

  PushNotifications.addListener('registrationError', (err) => {
    // On iOS this almost always means the aps-environment entitlement is missing.
    reportError('push_registration_failed', err)
  })
}
```

Register the listener **before** calling `register()`. The token can arrive fast enough that a listener attached afterwards misses the only event you'll get until the next rotation.

Server-side, key device rows by `installId`, not by token. Tokens rotate; when the old one returns `Unregistered` from APNs or `UNREGISTERED` from FCM, delete that row. Skip this and your fan-out slowly fills with dead tokens, your send latency climbs, and FCM eventually starts complaining about your error rate.

### 3.4 Tap routing that survives a cold start

```ts
// push/routing.ts
import { PushNotifications, type ActionPerformed } from '@capacitor/push-notifications'

let pendingRoute: string | null = null
let routerReady = false

PushNotifications.addListener('pushNotificationActionPerformed', (a: ActionPerformed) => {
  // On a cold start this fires before the web view's router exists. Queue, don't navigate.
  const route = routeFromData(a.notification.data)
  if (!route) return
  if (routerReady) navigate(route)
  else pendingRoute = route
})

export function markRouterReady() {
  routerReady = true
  if (pendingRoute) { navigate(pendingRoute); pendingRoute = null }
}

function routeFromData(data: Record<string, unknown>): string | null {
  // FCM stringifies every data value. Never trust these as numbers or booleans.
  const type = String(data.type ?? '')
  const id = String(data.entityId ?? '')
  if (!id) return null
  return type === 'report' ? `/reports/${id}` : type === 'site' ? `/sites/${id}` : null
}
```

The queue is the whole pattern. `pushNotificationActionPerformed` fires during startup; calling `navigate()` then either throws or lands on a router that promptly replaces your route with the home screen. The bug reproduces only from a fully killed app, which is why it reaches production.

Also: FCM data values are **always strings**. `data.count` arrives as `"3"`, and `if (data.isUrgent)` is true for `"false"`. This costs an afternoon exactly once.

### 3.5 Channels on Android, and the setting you can never change

```ts
// push/channels.ts
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'

export async function ensureChannels() {
  if (Capacitor.getPlatform() !== 'android') return

  // API 26+. Importance is FIXED at creation — a later change is ignored, forever,
  // for every user who already has the channel. Deleting and recreating with the same
  // id does not reset it. Get this right the first time or ship a new channel id.
  await PushNotifications.createChannel({
    id: 'alerts_v2',
    name: 'Site alerts',                 // user-visible in system settings; write it carefully
    description: 'Urgent issues at sites you follow',
    importance: 5,                       // 5 = heads-up banner + sound
    visibility: 1,                       // show content on the lock screen
    vibration: true,
  })
  await PushNotifications.createChannel({
    id: 'digest_v1',
    name: 'Weekly digest',
    importance: 2,                       // quiet: no sound, no banner
    visibility: 0,
  })
}
```

Separate channels are not politeness — they're retention. A user annoyed by your digest can mute *the digest* instead of muting your app. One channel means one decision, and that decision is off.

iOS has no channels. The equivalent is Notification Summary and Focus, which you influence through `interruption-level` in the payload (`passive`, `active`, `time-sensitive`, `critical`). `time-sensitive` requires the Time Sensitive Notifications entitlement; `critical` requires an Apple-approved entitlement you will not get for a business app.

### 3.6 One payload shape, two transports

```jsonc
// APNs — alert push. Note: NO "notification" key exists here; that's an FCM concept.
{
  "aps": {
    "alert": { "title": "Cracked beam reported", "body": "Site 14 · North wall" },
    "sound": "default",
    "badge": 3,
    "thread-id": "site-14",              // groups the notification list
    "interruption-level": "time-sensitive"
  },
  "type": "report", "entityId": "rep_8812"   // custom data sits beside aps, not inside it
}
// Headers: apns-push-type: alert, apns-priority: 10, apns-topic: org.tapdot.fieldnote
```

```jsonc
// FCM v1 — data-only on purpose, so nothing auto-displays and the client renders it.
{
  "message": {
    "token": "<device token>",
    "data": { "type": "report", "entityId": "rep_8812", "title": "Cracked beam reported",
              "body": "Site 14 · North wall" },
    "android": { "priority": "high" },   // "normal" gets held in Doze until a maintenance window
    "apns": {
      "headers": { "apns-priority": "10", "apns-push-type": "alert" },
      "payload": { "aps": { "alert": { "title": "Cracked beam reported", "body": "Site 14 · North wall" },
                            "sound": "default" } }
    }
  }
}
```

Silent push, and the honest version of it: on iOS, `"content-available": 1` with `apns-push-type: background` and `apns-priority: 5` is a *hint*. iOS throttles background pushes by app usage and battery state; a rarely-opened app may see a fraction of them, and low power mode drops them entirely. There is no setting that makes this reliable. Silent push is a nudge to fetch, and every screen must still work if the nudge never lands.

App Store review, Guideline 4.5.4, states this plainly: push must be optional, the app must function without it, and you may not use it for advertising without explicit consent. An app that shows an onboarding wall demanding notification permission before it will do anything is a rejection, not a growth tactic.

## 4. Anti-patterns

- **Prompting for notifications on first launch.** iOS gives you one prompt. Spending it on a stranger buys a permanent "no" and, if you gate the app behind it, a 4.5.4 rejection as a bonus.
- **Forgetting the Push Notifications capability.** `register()` resolves, `registration` never fires, and you debug JavaScript for three hours over a missing entitlement.
- **Attaching the `registration` listener after `register()`.** The token event races you and you lose it until the next rotation.
- **Storing one token per user.** Users have a phone and a tablet, reinstall, restore backups. Key on install id, prune on `Unregistered`.
- **Treating FCM `data` values as typed.** Everything is a string. `"false"` is truthy. Coerce at the boundary, every time.
- **Navigating directly in `pushNotificationActionPerformed`.** From a cold start the router doesn't exist yet. Queue the route and flush when it's ready.
- **A colour app icon as the Android notification icon.** Grey square. Silhouette PNG, transparent background, or nothing.
- **Setting channel importance and expecting to change it later.** It's frozen at creation for every existing install. New behaviour needs a new channel id.
- **FCM `android.priority: "normal"` for anything urgent.** Doze holds it for a maintenance window that can be hours away.
- **Depending on silent push for correctness.** iOS throttles it, low power mode kills it, and Android OEM battery managers kill it harder. Fetch on foreground too.
- **Letting FCM's `notification` block auto-display.** You lose foreground control, tap payload fidelity, and cross-platform parity in one line.

## 5. Usage

1. Load this skill and state your platforms, Capacitor major version, and whether you need alerts, silent delivery, or both. Silent-only changes the entitlements and the honesty of what you can promise.
2. Ask for the whole loop: "Push for new site alerts — permission at the right moment, token registration with rotation, tap opens `/reports/:id` from cold start, plus the exact APNs and FCM payloads."
3. Expect native config first (capability, manifest, channels), then permission and token flow, then tap routing, then server payloads for both transports. Payload-first answers usually skip the entitlement that's actually broken.
4. Reject output that prompts on boot, attaches listeners after `register()`, reads FCM data values as non-strings, or promises reliable background delivery on iOS.
5. When push "works on Android but not iOS," give the assistant your entitlements file and the APNs headers you're sending. It's a missing `aps-environment` or a wrong `apns-push-type` far more often than a code bug.

## 6. Example Output

Prompt with this skill loaded: *"New-alert push. Permission asked when the user follows their first site. Tap opens the report from a killed app. Capacitor 6, iOS + Android."*

```ts
// push/index.ts
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'

let pendingRoute: string | null = null
let routerReady = false

// Called once at boot: listeners only. No permission prompt, no register().
export async function initPush() {
  if (!Capacitor.isNativePlatform()) return

  PushNotifications.addListener('registration', (t) => upsertDevice(t.value))
  PushNotifications.addListener('registrationError', (e) =>
    reportError('push_registration_failed', e))   // iOS: check the aps-environment entitlement

  // Foreground: presentationOptions is [] on iOS, so nothing auto-shows. Our call.
  PushNotifications.addListener('pushNotificationReceived', async (n) => {
    const d = n.data as Record<string, string>
    if (isViewing(d.entityId)) return refreshInPlace(d.entityId)   // already looking at it
    await LocalNotifications.schedule({
      notifications: [{
        id: hash32(d.entityId),                   // stable id: a re-send replaces, not stacks
        title: d.title, body: d.body,
        channelId: 'alerts_v2',
        extra: d,
      }],
    })
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const route = routeFrom(a.notification.data as Record<string, string>)
    if (!route) return
    routerReady ? navigate(route) : (pendingRoute = route)   // cold start: queue it
  })

  await ensureChannels()
  // Already granted from a previous run? Refresh the token silently, no prompt.
  const perm = await PushNotifications.checkPermissions()
  if (perm.receive === 'granted') await PushNotifications.register()
}

export function markRouterReady() {
  routerReady = true
  if (pendingRoute) { navigate(pendingRoute); pendingRoute = null }
}

// Called from the "Follow site" success path — the moment the value is obvious.
export async function offerAlerts(siteName: string): Promise<boolean> {
  const perm = await PushNotifications.checkPermissions()
  if (perm.receive === 'granted') return true
  if (perm.receive === 'denied') return false     // iOS will not re-prompt; Settings only

  const ok = await confirmInApp(`Get alerts for ${siteName}?`)   // our sheet first, OS sheet second
  if (!ok) return false                                          // a "no" here is recoverable

  const next = await PushNotifications.requestPermissions()
  if (next.receive !== 'granted') return false
  await PushNotifications.register()
  return true
}

const routeFrom = (d: Record<string, string>) =>
  d.entityId ? `/reports/${String(d.entityId)}` : null   // FCM data is always strings
```

Server sends, per platform:

```jsonc
// FCM v1 (Android) — data-only; the client renders it, so foreground and background match.
{ "message": { "token": "<fcm>", "data": { "type": "report", "entityId": "rep_8812",
    "title": "Cracked beam reported", "body": "Site 14 · North wall" },
    "android": { "priority": "high" } } }

// APNs (iOS) — alert payload, custom keys beside aps, grouped by site.
// headers: apns-push-type: alert, apns-priority: 10, apns-topic: org.tapdot.fieldnote
{ "aps": { "alert": { "title": "Cracked beam reported", "body": "Site 14 · North wall" },
           "sound": "default", "thread-id": "site-14", "interruption-level": "time-sensitive" },
  "type": "report", "entityId": "rep_8812" }
```

Markers of skill-compliant output: the OS prompt is spent at the moment the user follows a site, behind an in-app sheet whose "no" is recoverable — the system's "no" is not; listeners are attached at boot before any `register()` call, so no token event is lost; a previously granted permission re-registers silently instead of re-prompting; the cold-start tap is queued rather than navigated into a router that doesn't exist; `LocalNotifications` uses a stable id derived from the entity, so a duplicate send replaces instead of stacking; data values are read as strings throughout; and the app never treats push as a data source — the alert is a nudge, and the screen fetches its own truth.
