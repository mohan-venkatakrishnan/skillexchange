---
title: Cutting Startup Time with react-native-mmkv Skill
category: Mobile
description: Kill the logged-out flash and shave real milliseconds off time-to-interactive by replacing async storage reads with synchronous JSI ones — plus a migration that can't lose data and a measurement discipline that proves it worked. For teams whose app "feels slow to open" and who need numbers, not vibes, before touching a line of code.
usage: Load this skill before asking your assistant to migrate off AsyncStorage, fix a hydration flash, or reduce startup time in a React Native app. Give it your current storage layer and what you see on a cold start ("logged-out screen flashes for ~400ms on a Pixel 6a") and it will produce the measurement first, then the MMKV wiring, a resumable migration, and synchronous state hydration.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 12
pocUrl: https://github.com/mrousavy/react-native-mmkv
---

# Cutting Startup Time with react-native-mmkv Skill

## 1. Philosophy

Startup is the only performance number every user measures, every session, subconsciously. And it's the one most teams optimise by feel — on a flagship phone, on the office Wi-Fi, from a warm start. That's how you spend a week making an app that was already fast on your device slightly faster on your device.

1. **Measure a cold start on a bad device, or you're guessing.** A four-year-old mid-range Android is your real target. Your iPhone is a fantasy.
2. **The logged-out flash is not a design problem.** It's an async read blocking the first frame. It's fixed at the storage layer, never with a smarter spinner.
3. **Synchronous is not a dirty word for a memory-mapped read.** A 2KB read from a page already in memory costs microseconds. Making that async doesn't protect the JS thread; it just moves the answer to the frame after the one that needed it.
4. **Storage size is a startup cost.** A memory-mapped store loads its file. A 40MB blob store is 40MB you pay for on every launch, forever.
5. **You must be able to prove the win.** "Feels snappier" is how a regression ships. TTI, before and after, same device, same build type, five runs, median.

## 2. Tech Stack

- **react-native-mmkv** — https://github.com/mrousavy/react-native-mmkv — licensed **MIT**. Synchronous JSI key-value storage over Tencent's MMKV core.
- **MMKV (core)** — https://github.com/Tencent/MMKV — **BSD-3-Clause**. The memory-mapped C++ engine underneath; you never call it directly.
- **React Native** — https://github.com/facebook/react-native — **MIT**. v3 of the JS library requires the New Architecture; v2 is the old-architecture line.
- **Zustand** — https://github.com/pmndrs/zustand — **MIT**. Used in examples for synchronous store hydration.
- TypeScript throughout.

This skill is an independent, original guide; it is not affiliated with or endorsed by the react-native-mmkv maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Measure first, and measure the right thing

```bash
# Android: cold start, release build, five runs. TotalTime is the number that matters.
adb shell am force-stop org.tapdot.fieldnote
adb shell am start -W -n org.tapdot.fieldnote/.MainActivity
# → ThisTime: 812  TotalTime: 812  WaitTime: govern
```

`TotalTime` is process launch to first frame drawn. It does not include your JS hydration, which is exactly where the logged-out flash lives — so pair it with a marker from JS:

```ts
// index.js — first line of the bundle, before any import that does work
import { performance } from 'react-native'
const JS_START = performance.now()

// In your root component, after the first real screen commits:
export function markInteractive(reason: string) {
  const ms = performance.now() - JS_START
  // Release builds only. Debug is 3-10x slower and its numbers mean nothing.
  if (!__DEV__) track('tti', { ms: Math.round(ms), reason })
}
```

Rules that make the numbers real: release builds only (Hermes runs bytecode; debug runs a dev bundle through Metro and is several times slower), force-stop between runs (a warm start hides everything you're trying to see), five runs and take the median, and airplane mode if you want to isolate startup from network.

Typical shape on a mid-range Android, release: native launch 300-600ms, JS bundle eval 150-400ms, then your hydration. If your hydration is adding 300ms of `await AsyncStorage.getItem`, that's the biggest single number on the list and it's the easiest to delete.

### 3.2 The instance, configured once

```ts
// storage/mmkv.ts
import { MMKV, Mode } from 'react-native-mmkv'

// One instance per concern. Separate ids mean a cache purge can't touch auth.
export const authStore = new MMKV({
  id: 'auth',
  encryptionKey: getDeviceEncryptionKey(),   // see the honesty note below
})

export const cacheStore = new MMKV({ id: 'cache' })

export const prefsStore = new MMKV({ id: 'prefs' })
```

Separate instances are separate files. That matters because MMKV memory-maps the whole file: a bloated cache instance is a startup cost paid by every launch, including launches that never read the cache. Keeping it separate means you can `cacheStore.clearAll()` without a moment's thought about the session.

On encryption, plainly: `encryptionKey` encrypts the file at rest, and the key has to live somewhere. Hardcode it in the bundle and it's decoration — anyone with the APK has it. The real pattern is a random key generated on first launch and stored in the iOS Keychain / Android Keystore, which is what makes the encryption mean anything. If you're not doing that, don't pretend; use the OS keychain directly for the handful of secrets that need it and leave MMKV unencrypted for everything else.

`Mode.MULTI_PROCESS` exists for Android when a widget or a foreground service touches the same store. It costs a file lock on every access. Don't enable it "just in case" — you're paying for a scenario you don't have.

### 3.3 The API that removes the `await`

```ts
// storage/session.ts
import { authStore } from './mmkv'

type Session = { userId: string; token: string; expiresAt: number }

export function readSession(): Session | null {
  // No await. No promise. This runs before the first frame, not after it.
  const raw = authStore.getString('session')
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Session
    return s.expiresAt > Date.now() ? s : null
  } catch {
    authStore.delete('session')   // corrupt entry: drop it, don't crash the launch path
    return null
  }
}

export function writeSession(s: Session | null) {
  if (!s) return authStore.delete('session')
  authStore.set('session', JSON.stringify(s))   // returns void; the write is already durable
}
```

`getString` returns `string | undefined`, never `null`, and there is no `getJSON` — you own the parse and therefore you own the corrupt-value case. Wrap it once, here, rather than sprinkling `try/catch` across the app.

The types are `string | number | boolean | ArrayBuffer` and nothing else. Store an object without stringifying and you'll write `"[object Object]"` and read it back forever.

### 3.4 Hydration without the flash

```ts
// state/session-store.ts
import { create } from 'zustand'
import { readSession, writeSession } from '../storage/session'

type State = {
  session: Session | null
  signIn: (s: Session) => void
  signOut: () => void
}

export const useSession = create<State>((set) => ({
  // The whole point: the initial state IS the persisted state. There is no
  // "hydrating" phase, so there is no logged-out frame to flash.
  session: readSession(),
  signIn: (s) => { writeSession(s); set({ session: s }) },
  signOut: () => { writeSession(null); set({ session: null }) },
}))
```

Compare with the async version everyone starts with: `session: null` at first render, an effect fires, `await AsyncStorage.getItem` resolves 200-400ms later, and the user has already seen your sign-in screen. No amount of splash-screen tuning fixes that; the state was genuinely wrong for those frames.

If you're on `redux-persist` or `zustand/persist`, MMKV drops into the storage adapter slot, but understand what you get: the middleware's hydration is still asynchronous by design, so the flash may survive the migration. For anything on the launch path — session, theme, onboarding-complete — read it synchronously into the initial state and skip the middleware entirely.

### 3.5 Migrating off AsyncStorage without losing anyone's data

```ts
// storage/migrate.ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { prefsStore } from './mmkv'

const FLAG = '__migrated_v1'

export async function migrateFromAsyncStorage() {
  if (prefsStore.getBoolean(FLAG)) return         // idempotent: this runs on every launch

  const keys = await AsyncStorage.getAllKeys()
  const pairs = await AsyncStorage.multiGet(keys)

  for (const [k, v] of pairs) {
    if (v != null) prefsStore.set(k, v)           // AsyncStorage is strings-only; copy verbatim
  }

  // Set the flag ONLY after every write. A kill mid-loop just re-runs the whole thing.
  prefsStore.set(FLAG, true)

  // Do NOT clear AsyncStorage here. Leave the old data for at least one release:
  // if you have to roll back, that data is the only thing standing between you
  // and every user being signed out at once.
}
```

Two hard rules. The flag is written last, so an interrupted migration is simply repeated rather than half-applied. And the old store is not cleared in the same release that adds the new one — a rollback with the source data deleted is a mass logout event, and there's no fixing it after the fact.

Run this before your first render, not in a `useEffect`. It's the one async thing that legitimately belongs on the launch path, and it only runs once per install.

### 3.6 What MMKV won't fix, and where the rest of the time goes

MMKV deletes storage latency. If your app still opens slowly, the time is somewhere in this list:

- **Bundle evaluation.** Every top-level import in your entry graph runs at launch, including the analytics SDK nobody calls for ninety seconds. `inlineRequires` in the Metro config defers module bodies to first use and is usually worth 50-150ms for one line of config.
- **Debug vs release.** If you're measuring in debug, you're measuring Metro. Stop.
- **A network call on the launch path.** A blocking config fetch means your startup time is your user's LTE latency. Cache the last config in MMKV, launch with it, refresh in the background.
- **Font and asset loading.** `await Font.loadAsync` before the first frame is a real, visible cost. Preload the one font your first screen needs, not all nine.
- **Native module init.** Modules requiring main-queue setup on iOS initialise serially before the first frame.
- **Massive images in the first screen.** A 4MB PNG decoded on the UI thread is a stall no storage layer touches.

Honest ceiling: replacing AsyncStorage with MMKV typically buys 100-400ms on a cold start on a mid-range Android, most of it the hydration flash. It does not turn a 3-second launch into a 1-second one. If you're at 3 seconds, the problem is your bundle or your launch-path network call, and MMKV is a rounding error.

## 4. Anti-patterns

- **Optimising without a baseline.** No number before means no proof after, and the "improvement" gets reverted by the next refactor with nobody noticing.
- **Measuring in a debug build.** Debug is several times slower and weighted completely differently. The conclusions transfer to nothing.
- **Measuring a warm start.** `force-stop` between runs or you're timing a process that never died.
- **Using MMKV as a blob store.** It memory-maps the whole file. Cached images and API responses belong on the filesystem with a key in MMKV, not *in* MMKV.
- **One instance for everything.** You can't purge a cache without risking the session, so you never purge, so the file grows, so every launch is slower.
- **A hardcoded `encryptionKey`.** It's in the APK. This is theatre with a performance cost. Random key in Keychain/Keystore, or don't encrypt.
- **`Mode.MULTI_PROCESS` by default.** A file lock on every read for a multi-process scenario you don't have.
- **Keeping the persist middleware for launch-path state.** Its hydration is async, so the flash you migrated to fix is still there and now you're confused as well as slow.
- **Setting the migration flag before the copy finishes.** A kill mid-migration leaves half the data behind and the flag says it's done. Forever.
- **Clearing AsyncStorage in the migration release.** A rollback signs out your entire user base with no recovery.
- **Storing an object without `JSON.stringify`.** `"[object Object]"`, persisted, on every device, until you ship a fix.

## 5. Usage

1. Load this skill and lead with a measurement, not a request: "Cold start on a Pixel 6a, release build, median of five: TotalTime 780ms, TTI marker at 1420ms, logged-out screen visible for ~350ms."
2. Ask for the sequence: baseline, then change, then the same measurement again. If the assistant jumps straight to `new MMKV()`, you'll get a migration with no evidence it helped.
3. Expect the migration to be resumable and to leave AsyncStorage intact for a release. Anything else is a data-loss bug wearing a performance hat.
4. Reject output that puts blobs in MMKV, hardcodes an encryption key, keeps async persist middleware on the launch path, or writes the migration flag before the copy completes.
5. If the flash survives the migration, hand over your root component and store setup. The persisted read is almost always still behind an effect or a middleware, so the initial state is still `null` for the frames that matter.

## 6. Example Output

Prompt with this skill loaded: *"Sign-in screen flashes for ~350ms on every cold start before the home screen appears. We're on AsyncStorage + zustand/persist. Pixel 6a, release build."*

```ts
// storage/mmkv.ts — split by lifetime, not by convenience
import { MMKV } from 'react-native-mmkv'

export const authStore = new MMKV({ id: 'auth' })    // small, hot, read at launch
export const cacheStore = new MMKV({ id: 'cache' })  // disposable; clearAll() must be safe
```

```ts
// storage/session.ts
import { authStore } from './mmkv'
export type Session = { userId: string; token: string; expiresAt: number }

export function readSession(): Session | null {
  const raw = authStore.getString('session')         // synchronous mmap read: microseconds
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Session
    return s.expiresAt > Date.now() ? s : null       // expiry checked here, not in a screen
  } catch {
    authStore.delete('session')                      // corrupt value never blocks a launch
    return null
  }
}

export function writeSession(s: Session | null) {
  s ? authStore.set('session', JSON.stringify(s)) : authStore.delete('session')
}
```

```ts
// storage/migrate.ts — runs before render, once per install, resumable
import AsyncStorage from '@react-native-async-storage/async-storage'
import { authStore } from './mmkv'

export async function migrateSession() {
  if (authStore.getBoolean('__migrated_v1')) return
  const legacy = await AsyncStorage.getItem('persist:root')
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy)
      const session = JSON.parse(parsed.session ?? 'null')
      if (session?.token) authStore.set('session', JSON.stringify(session))
    } catch { /* unreadable legacy blob: user signs in again, once. Never crash the launch. */ }
  }
  authStore.set('__migrated_v1', true)   // last, so an interrupted run simply repeats
  // AsyncStorage deliberately NOT cleared — that lands two releases from now, after rollback risk passes.
}
```

```ts
// state/session-store.ts — no hydration phase, therefore no flash
import { create } from 'zustand'
import { readSession, writeSession, type Session } from '../storage/session'

export const useSession = create<{
  session: Session | null
  signIn: (s: Session) => void
  signOut: () => void
}>((set) => ({
  session: readSession(),                            // initial state IS persisted state
  signIn: (s) => { writeSession(s); set({ session: s }) },
  signOut: () => { writeSession(null); cacheStore.clearAll(); set({ session: null }) },
}))
```

```tsx
// index.tsx
import { performance } from 'react-native'
const JS_START = performance.now()

import { AppRegistry } from 'react-native'
import { migrateSession } from './storage/migrate'
import { App } from './App'

// The one legitimate await on the launch path: it runs once per install, then never again.
migrateSession().finally(() => AppRegistry.registerComponent('Fieldnote', () => App))

export const markInteractive = () => {
  if (!__DEV__) track('tti', { ms: Math.round(performance.now() - JS_START) })
}
```

Measured on the same Pixel 6a, release build, `force-stop` between runs, median of five:

```
before  TotalTime 780ms · TTI 1420ms · sign-in screen visible 350ms
after   TotalTime 775ms · TTI 1065ms · sign-in screen visible 0ms
```

Markers of skill-compliant output: `TotalTime` barely moves — correctly, since native launch was never the problem — and the win is entirely in TTI and the flash, which is what was actually measured; the session read is synchronous and feeds the store's initial state, so no frame ever renders a logged-out app; `zustand/persist` is removed from the launch path rather than re-pointed at MMKV, because its async hydration was the flash; auth and cache are separate instances so `signOut` can nuke the cache without touching the session file; the migration writes its flag last and leaves AsyncStorage intact for a release, so a rollback doesn't sign out every user; a corrupt legacy blob costs one sign-in rather than a launch crash; and the number is stated as before/after on a named device with a stated method, not as "feels faster."
