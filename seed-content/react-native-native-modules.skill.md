---
title: Writing Native Modules for React Native Skill
category: Mobile
description: Bridge real platform capability into JavaScript with Turbo Native Modules — a typed spec that generates both sides, correct threading on iOS and Android, and events that don't leak listeners. Written for the moment a JS library isn't enough and you have to open Xcode and Android Studio without turning your app into two divergent codebases.
usage: Load this skill before asking your assistant to write, port, or debug a React Native native module. Name the platform API and the JS surface you want ("expose the iOS keychain and Android EncryptedSharedPreferences as getSecret/setSecret"), and it will emit the TypeScript spec first, then the Objective-C++ and Kotlin implementations, with threading and nullability that survive the New Architecture's codegen.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 20
pocUrl: https://github.com/facebook/react-native
---

# Writing Native Modules for React Native Skill

## 1. Philosophy

A native module is an API contract that happens to be written in three languages. Treat it as a contract and it stays maintainable for years; treat it as "some Kotlin I need to call" and it rots into a pile of platform-specific special cases within a quarter.

1. **The spec is the source of truth.** Under the New Architecture, codegen reads a TypeScript spec and generates the C++ interfaces both platforms must satisfy. Write the spec first, and the compiler tells you when iOS and Android have drifted. Write it last and you're maintaining three parallel truths.
2. **Cross the boundary rarely, and in bulk.** Every call marshals data between JS and native. One call returning fifty rows costs a fraction of fifty calls returning one row. Design coarse, chatty-free APIs — this is the single biggest perf lever in a native module.
3. **The module must be reachable from JS without knowing the platform.** If callers write `Platform.OS === 'ios' ? a() : b()`, the abstraction failed. Absorb the divergence in native code and expose one honest API — including honest "unsupported here" errors.
4. **Threads are not a detail.** iOS UIKit is main-thread-only; Android's main thread is where ANRs are born. Getting this wrong produces crashes and freezes that never reproduce on a fast device on Wi-Fi in the office.
5. **Every native resource you take, you must give back.** Listeners, observers, `CLLocationManager`, `BroadcastReceiver`, file handles. JS garbage collection knows nothing about your Kotlin object graph.

## 2. Tech Stack

- **React Native** — https://github.com/facebook/react-native — licensed **MIT**. Turbo Native Modules, codegen, JSI, and the Fabric renderer live here.
- **Hermes** — ships in the React Native repo, **MIT**. Default engine; hosts the JSI runtime your module binds into.
- **create-react-native-library** (react-native-builder-bob) — https://github.com/callstack/react-native-builder-bob — **MIT**. Scaffolds a module package with codegen wiring already correct.
- Objective-C++ and Swift on iOS; Kotlin on Android. Examples target React Native 0.76+ with the New Architecture enabled.

This skill is an independent, original guide; it is not affiliated with or endorsed by the React Native maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Scaffold the package, don't hand-roll it

```bash
npx create-react-native-library@latest react-native-secure-store
# choose: Turbo module, Kotlin & Objective-C
```

Hand-assembling a `.podspec`, a Gradle module, the codegen block, and an example app is a day of yak-shaving that produces the same result with more mistakes. What matters is the block the generator puts in `package.json`, because this is what autolinking and codegen key off:

```jsonc
"codegenConfig": {
  "name": "RNSecureStoreSpec",           // becomes the generated C++ class name
  "type": "modules",                     // "modules" | "components" | "all"
  "jsSrcsDir": "src",                    // codegen scans here for Native*.ts specs
  "android": { "javaPackageName": "org.tapdot.securestore" }
}
```

Codegen only picks up files named `Native<Something>.ts` in `jsSrcsDir`. Name it `SecureStore.ts` and you get no generated interfaces and a link error you'll read as a build system problem for an hour.

### 3.2 The spec: narrow types, coarse calls

```ts
// src/NativeSecureStore.ts
import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
  // Coarse on purpose: one crossing for many keys beats one crossing per key.
  getMany(keys: string[]): Promise<{ [key: string]: string | null }>
  setMany(entries: { [key: string]: string }, requireBiometry: boolean): Promise<void>
  remove(key: string): Promise<void>
  // Sync is available and almost always the wrong call — see 3.5.
  isBiometryAvailable(): boolean
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNSecureStore')
```

Codegen's type support is deliberately small: `string`, `number`, `boolean`, `object`, arrays, `Promise`, `void`, and object literals. No unions of object types, no enums, no `Date`, no optional-with-default. Reach for something clever and the failure is a C++ compile error pointing at generated code that doesn't resemble anything you wrote. Keep the surface boring.

`getEnforcing` throws at import time if the native side isn't registered — which is exactly what you want. The non-enforcing `get` returns `null` and defers the failure to a random screen weeks later.

### 3.3 iOS: Objective-C++ shell, real work off the main thread

```objc
// ios/RNSecureStore.mm
#import "RNSecureStore.h"
#import <Security/Security.h>

@implementation RNSecureStore
RCT_EXPORT_MODULE()

// Default is NO. Return YES only if init touches UIKit — YES blocks app startup
// on the main thread while your module initialises, and that cost is measurable.
+ (BOOL)requiresMainQueueSetup { return NO; }

- (void)getMany:(NSArray<NSString *> *)keys
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
  // Keychain reads with biometry present a system sheet and can block. Never on main.
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSMutableDictionary *out = [NSMutableDictionary dictionaryWithCapacity:keys.count];
    for (NSString *key in keys) {
      NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: @"org.tapdot.fieldnote",
        (__bridge id)kSecAttrAccount: key,
        (__bridge id)kSecReturnData: @YES,
      };
      CFTypeRef item = NULL;
      OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &item);

      if (status == errSecSuccess) {
        NSData *data = (__bridge_transfer NSData *)item;
        out[key] = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
      } else if (status == errSecItemNotFound) {
        out[key] = [NSNull null];               // absent is a value, not an error
      } else {
        // Reject once, with a stable machine-readable code. Never reject in a loop.
        reject(@"keychain_error", [NSString stringWithFormat:@"OSStatus %d", (int)status], nil);
        return;
      }
    }
    resolve(out);
  });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSecureStoreSpecJSI>(params);
}
@end
```

Two details that bite. A promise block may be called **exactly once** — resolve twice, or resolve then reject, and you get a hard crash in release rather than a warning. And `requiresMainQueueSetup` returning `YES` unnecessarily is a real startup regression: every such module initialises serially on the main thread before your first frame.

Swift is supported but costs you a bridging header and an `@objc` shim; a `.mm` file that calls into Swift is usually less friction than making the whole module Swift.

### 3.4 Android: Kotlin, coroutines, and the `@ReactModule` name that must match

```kotlin
// android/src/main/java/org/tapdot/securestore/SecureStoreModule.kt
package org.tapdot.securestore

import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.*

@ReactModule(name = SecureStoreModule.NAME)
class SecureStoreModule(reactContext: ReactApplicationContext) :
  NativeSecureStoreSpec(reactContext) {                 // generated by codegen

  companion object { const val NAME = "RNSecureStore" } // MUST equal the spec's module name

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val prefs by lazy {
    val key = MasterKey.Builder(reactApplicationContext)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
    EncryptedSharedPreferences.create(
      reactApplicationContext, "fieldnote_secure", key,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  override fun getName() = NAME

  override fun getMany(keys: ReadableArray, promise: Promise) {
    scope.launch {                                       // keystore init is slow; keep it off main
      try {
        val out = Arguments.createMap()
        for (i in 0 until keys.size()) {
          val k = keys.getString(i) ?: continue
          prefs.getString(k, null)?.let { out.putString(k, it) } ?: out.putNull(k)
        }
        promise.resolve(out)
      } catch (t: Throwable) {
        promise.reject("keystore_error", t.message, t)   // same code string as iOS
      }
    }
  }

  override fun invalidate() {                            // module teardown — cancel everything
    scope.cancel()
    super.invalidate()
  }
}
```

The `NAME` constant, the `@ReactModule` annotation, and the string in `TurboModuleRegistry.getEnforcing` must be byte-identical. A mismatch surfaces as "RNSecureStore could not be found" — which reads like a linking failure and is actually a typo.

Error codes must match across platforms. Ship `keychain_error` on iOS and `KEYSTORE_FAILURE` on Android and every caller writes a platform check, which is precisely the abstraction leak you built the module to prevent.

### 3.5 Sync methods, JSI, and when the temptation is right

Turbo Modules can be synchronous — the JS thread blocks until native returns. It's the right call for a cheap, pure lookup (`isBiometryAvailable`, a build flag, a device class) where a promise's microtask hop costs more than the work. It is the wrong call for anything touching disk, network, IPC, or a system sheet: you have frozen the JS thread, and on a mid-range Android device a 40ms keystore init becomes three dropped frames.

The honest rule: sync if it's constant-time and in-memory; async otherwise. "It's only a few milliseconds on my iPhone" is not a measurement of your users' devices.

### 3.6 Events: emit sparingly, unsubscribe always

```kotlin
private var listenerCount = 0

override fun addListener(eventName: String) {
  if (listenerCount == 0) startWatchingKeystore()       // start the native resource lazily
  listenerCount += 1
}

override fun removeListeners(count: Double) {
  listenerCount -= count.toInt()
  if (listenerCount <= 0) { listenerCount = 0; stopWatchingKeystore() }
}
```

`addListener`/`removeListeners` are required for the emitter contract; a module that ignores them holds its native observer forever after the last JS subscriber goes away. On iOS the mirrored hooks are `startObserving`/`stopObserving`.

And do not stream. An emitter firing at 60Hz serialises a payload per tick and will flatten the JS thread on a low-end device. Batch to a sensible cadence in native, or expose a pull API and let JS ask.

## 4. Anti-patterns

- **Chatty APIs.** `getSecret(key)` called in a loop over forty keys pays forty crossings. `getMany(keys)` pays one. This is the difference between 4ms and 200ms on real hardware.
- **Blocking the main thread.** Keychain with biometry, keystore init, file I/O, or a `SharedPreferences` first-touch on the main thread is a freeze on iOS and an ANR on Android — reported by users, never reproduced in the office.
- **`requiresMainQueueSetup` returning `YES` by reflex.** It serialises your module's init into app startup. Return `NO` unless init literally touches UIKit.
- **Resolving a promise twice.** Two resolves, or a resolve after a reject, crashes the app in release. Every branch of every callback must end in exactly one settle.
- **Different error codes per platform.** Callers write `Platform.OS` checks and your abstraction is now decoration.
- **A spec with union or enum types.** Codegen doesn't support them; the error is a C++ compile failure in a generated file 200 lines from anything you wrote.
- **Mismatched module names.** `@ReactModule(name = "SecureStore")` against `getEnforcing('RNSecureStore')` produces a not-found error that looks like broken autolinking.
- **Never implementing `invalidate` / `removeListeners`.** Native observers outlive their JS subscribers, and the leak shows up as battery drain no profiler on the JS side can see.
- **Swift for a module that doesn't need it.** Bridging header, `@objc` annotations, and slower incremental builds bought you syntax you liked.
- **Testing only on a current iPhone.** iOS main-thread cost is forgiving; a four-year-old Android device with a cold keystore is where your assumptions die.

## 5. Usage

1. Load this skill inside the module package (or the app that hosts it) and state your React Native version and whether the New Architecture is on. Pre-0.68 bridge modules and Turbo Modules are different enough that a mixed answer is worse than either.
2. Ask for the JS surface, not the implementation: "Expose secure key-value storage with `getMany`/`setMany`, biometry-gated on both platforms." Say explicitly which platform APIs you want underneath if you care.
3. Expect the spec file first, then `codegenConfig`, then iOS, then Android — with matching error codes called out. Any other order means the assistant is writing platform code and inventing the contract afterwards.
4. Reject output that does I/O on the main queue, resolves in a loop, uses a sync method for anything touching the keychain or disk, or invents `enum` types in the spec.
5. For a "module could not be found" error, hand over `package.json`'s `codegenConfig`, the spec filename, and the native `NAME` constant. It's a name or filename mismatch nearly every time — check that before touching Gradle or Pods.

## 6. Example Output

Prompt with this skill loaded: *"I need battery level and low-power mode in JS, live-updating. RN 0.76, New Arch on."*

```ts
// src/NativePowerState.ts
import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
  // One coarse read: both fields in a single crossing, not two calls.
  getPowerState(): Promise<{ level: number; lowPowerMode: boolean; charging: boolean }>
  addListener(eventName: string): void
  removeListeners(count: number): void
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNPowerState')
```

```kotlin
@ReactModule(name = PowerStateModule.NAME)
class PowerStateModule(ctx: ReactApplicationContext) : NativePowerStateSpec(ctx) {
  companion object { const val NAME = "RNPowerState" }
  private var receiver: BroadcastReceiver? = null

  override fun getName() = NAME

  override fun getPowerState(promise: Promise) {
    try {
      val bm = reactApplicationContext.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
      val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      promise.resolve(Arguments.createMap().apply {
        putDouble("level", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) / 100.0)
        putBoolean("lowPowerMode", pm.isPowerSaveMode)   // Android's analogue of iOS Low Power Mode
        putBoolean("charging", bm.isCharging)
      })
    } catch (t: Throwable) {
      promise.reject("power_state_unavailable", t.message, t)   // identical code on iOS
    }
  }

  // Registered only while JS is listening — the receiver never outlives its subscriber.
  override fun addListener(eventName: String) {
    if (receiver != null) return
    receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, i: Intent?) = emitThrottled()
    }.also {
      reactApplicationContext.registerReceiver(it, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    }
  }

  override fun removeListeners(count: Double) = teardown()
  override fun invalidate() { teardown(); super.invalidate() }

  private fun teardown() {
    receiver?.let { reactApplicationContext.unregisterReceiver(it) }
    receiver = null
  }
}
```

```ts
// src/index.ts — the only surface app code ever sees
import { NativeEventEmitter } from 'react-native'
import PowerState from './NativePowerState'

export type PowerSnapshot = { level: number; lowPowerMode: boolean; charging: boolean }

export function subscribeToPower(onChange: (s: PowerSnapshot) => void) {
  const emitter = new NativeEventEmitter(PowerState as never)
  const sub = emitter.addListener('powerStateChanged', onChange)
  PowerState.getPowerState().then(onChange)      // seed immediately; don't wait for a change
  return () => sub.remove()                      // callers get a disposer, not a promise
}
```

Markers of skill-compliant output: the spec is one coarse read rather than three getters, so a poll costs one crossing; `ACTION_BATTERY_CHANGED` fires every few seconds on Android and is throttled in native rather than serialised to JS at full rate; the receiver registers on first listener and unregisters in both `removeListeners` and `invalidate`, so nothing survives a reload; the error code `power_state_unavailable` is identical on both platforms so no caller writes a `Platform.OS` branch; the module `NAME` constant, the annotation, and `getEnforcing` all agree; and the public API hands back a disposer, which is the only shape that composes with a `useEffect` cleanup.
