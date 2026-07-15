---
title: Shipping a Cross-Platform App with Expo Skill
category: Mobile
description: Scaffold an iOS + Android app that actually reaches a store — config-as-code, development builds instead of Expo Go, EAS profiles that separate simulator from TestFlight, and the permission strings Apple rejects you for omitting. Covers the two failure modes that eat a launch week: a project pinned to Expo Go that can't add a native dependency, and a first binary bounced by App Store review for a purpose string nobody wrote.
usage: Load this skill before asking your assistant to scaffold an Expo app, add a native dependency, or set up EAS Build. Tell it the SDK version, whether you need custom native code, and your target stores ("Expo SDK 53, needs BLE, iOS + Android internal testing first") and it will produce app.config.ts, eas.json, and a build path that survives store review rather than a demo that only runs in Expo Go.
platforms: [Claude, Cursor]
priceUsd: 7
timeSavedHours: 16
pocUrl: https://github.com/expo/expo
---

# Shipping a Cross-Platform App with Expo Skill

## 1. Philosophy

Expo is not "React Native with training wheels." It is a build system and a native-configuration compiler, and every mistake below comes from treating it as a sandbox you live inside rather than a toolchain you drive.

1. **Expo Go is a demo client, not your app.** It ships a fixed set of native modules. The day you add a BLE library, a payment SDK, or anything with a `.podspec`, Expo Go cannot load it. Start on a development build from week one, and Expo Go never becomes a migration.
2. **Native config is generated, not edited.** With Continuous Native Generation the `ios/` and `android/` directories are build output. Editing `Info.plist` by hand works until the next `prebuild --clean` silently discards it. Config plugins are the only durable place to express native intent.
3. **The store is a design constraint, not a deploy step.** Permission purpose strings, tracking disclosure, and account deletion are architecture decisions that show up in review two weeks later, when changing them costs a release cycle.
4. **iOS and Android diverge exactly where users notice.** Notification permission, background execution, back navigation, and safe areas differ. A codebase that pretends otherwise ships one good platform and one that feels ported.
5. **Managed vs bare is a false binary.** You are always managed until you run `prebuild` and commit the output. Stay generated as long as you can; the moment you commit `ios/`, you own CocoaPods upgrades forever.

## 2. Tech Stack

- **Expo** — https://github.com/expo/expo — licensed **MIT**. SDK, CLI, config plugin system, and the module APIs (`expo-notifications`, `expo-file-system`, and so on).
- **React Native** — https://github.com/facebook/react-native — **MIT**. The runtime Expo builds on; SDK 52 and later default to the New Architecture.
- **Expo Router** — lives in the Expo repo, **MIT**. File-based routing over React Navigation.
- **Hermes** — ships in the React Native repo, **MIT**. Default JS engine; bytecode precompiled at build time.
- TypeScript throughout. Examples target SDK 52/53-era APIs.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Expo maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 `app.config.ts`, not `app.json`

Static JSON cannot read an environment variable, so every team that starts with `app.json` ends up with three copies of it and a shell script. Go dynamic on day one:

```ts
// app.config.ts
import type { ExpoConfig, ConfigContext } from 'expo/config'

const VARIANT = process.env.APP_VARIANT ?? 'development'
const IS_PROD = VARIANT === 'production'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_PROD ? 'Fieldnote' : `Fieldnote (${VARIANT})`,
  slug: 'fieldnote',
  scheme: IS_PROD ? 'fieldnote' : `fieldnote-${VARIANT}`,
  version: '1.4.0',                       // marketing version; humans read this
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: IS_PROD ? 'org.tapdot.fieldnote' : `org.tapdot.fieldnote.${VARIANT}`,
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        'Fieldnote uses the camera to attach a photo to a site report.',
      NSLocationWhenInUseUsageDescription:
        'Fieldnote tags a report with the site location while you are filling it in.',
      ITSAppUsesNonExemptEncryption: false,   // omit this and every upload waits on a manual answer
    },
  },
  android: {
    package: IS_PROD ? 'org.tapdot.fieldnote' : `org.tapdot.fieldnote.${VARIANT}`,
    permissions: ['CAMERA', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
    edgeToEdgeEnabled: true,
  },
  plugins: [
    'expo-router',
    ['expo-camera', { cameraPermission: 'Attach a photo to a site report.' }],
  ],
  extra: { apiUrl: IS_PROD ? 'https://api.example.org' : 'https://qa.api.example.org' },
})
```

Distinct `bundleIdentifier` per variant is the whole point: it lets QA and production coexist on one device. Sharing one identifier across variants means every QA install stomps the production build, and testers report bugs against the wrong data.

The `ITSAppUsesNonExemptEncryption: false` line looks like trivia. Omit it and every single upload to App Store Connect stalls on an export-compliance question you must answer by hand before TestFlight will process the build.

### 3.2 Development builds, from the first commit

```bash
npx expo install expo-dev-client
eas build --profile development --platform ios --local   # or without --local, on EAS
```

A development build is your own binary with the Expo dev menu compiled in. It loads the same Metro bundle Expo Go would, but it contains *your* native dependencies. The workflow is identical; the ceiling is gone.

Honest cost: you rebuild the native binary whenever native dependencies change — a few minutes on EAS, longer locally on a cold cache. JS changes still hot-reload with zero rebuild. That trade is worth it on any project that will ever ship, and the teams that defer it always defer it until the week they need BLE.

### 3.3 `eas.json` profiles that map to real audiences

```jsonc
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true },            // simulator builds are NOT signed; free and fast
      "env": { "APP_VARIANT": "development" }
    },
    "preview": {
      "distribution": "internal",              // TestFlight-free: install via a QR link
      "channel": "preview",
      "android": { "buildType": "apk" },       // .apk installs directly; .aab does not
      "env": { "APP_VARIANT": "preview" }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,                   // bumps buildNumber / versionCode
      "android": { "buildType": "app-bundle" },
      "env": { "APP_VARIANT": "production" }
    }
  },
  "submit": { "production": { "ios": { "ascAppId": "6478123456" } } }
}
```

The `android.buildType` split is the one that wastes an afternoon. Google Play requires an `.aab`. A tester cannot install an `.aab` — they need an `.apk`. Preview builds APK, production builds app-bundle; get this backwards and you'll send testers a file their phone refuses to open.

`appVersionSource: "remote"` with `autoIncrement` puts the build number on EAS's side. Track it in git instead and two developers will race to the same `versionCode`, which App Store Connect rejects with a flat "the build number has already been used" after a fifteen-minute upload.

### 3.4 Config plugins: the escape hatch that isn't `prebuild --clean`-hostile

You need something in `AndroidManifest.xml` that no library exposes. The wrong answer is editing the file. The right answer is twenty lines:

```ts
// plugins/with-network-security-config.ts
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins'

const withNetworkSecurityConfig: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0]
    if (!app) throw new Error('No <application> node found in AndroidManifest')
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config'
    app.$['android:usesCleartextTraffic'] = 'false'
    return cfg
  })

export default withNetworkSecurityConfig
```

Add `'./plugins/with-network-security-config'` to `plugins` and the change survives every regeneration. This is the difference between a project that can take an SDK upgrade in an afternoon and one that can't.

### 3.5 Permissions: ask late, ask once, explain first

iOS gives you exactly one shot at the system prompt. The user taps "Don't Allow" and your only remaining move is a trip to Settings — a flow roughly nobody completes.

```tsx
// features/reports/useCameraAccess.ts
import { useCameraPermissions } from 'expo-camera'
import { Alert, Linking } from 'react-native'

export function useCameraAccess() {
  const [permission, requestPermission] = useCameraPermissions()

  async function ensureCamera(): Promise<boolean> {
    if (permission?.granted) return true

    // canAskAgain === false means iOS will never show the sheet again.
    if (permission && !permission.canAskAgain) {
      Alert.alert(
        'Camera is off for Fieldnote',
        'Turn it on in Settings to attach photos to a report.',
        [{ text: 'Not now' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
      )
      return false
    }
    const next = await requestPermission()
    return next.granted
  }

  return { ensureCamera, granted: permission?.granted ?? false }
}
```

Call `ensureCamera()` when the user taps "Add photo" — never in a mount effect on the home screen. A cold-start permission wall is both a conversion disaster and a live Guideline 5.1.1 rejection risk, because the reviewer sees a prompt with no context for why you need it.

Android 13 (API 33) added `POST_NOTIFICATIONS` as a runtime permission. Below 33 notifications were granted at install; above it, an app that never requests it simply posts nothing and logs nothing useful. That's the single most common "notifications work on my phone but not on my colleague's" bug in modern Android.

### 3.6 OTA updates: what they can and cannot carry

```bash
eas update --branch production --message "fix: timezone on report timestamps"
```

`expo-updates` swaps the JS bundle and assets. It cannot change native code — new native module, new permission, new SDK version means a new binary, full stop. Ship an update whose JS calls a native module the installed binary lacks and every user crashes on launch, instantly, with no rollback path except a store review.

Apple's Guideline 3.3.2 permits downloading code that doesn't change the app's primary purpose. Bug fixes and copy: fine. Rewriting the app into a different product between reviews: not fine, and this is a real enforcement area, not a theoretical one.

Channel-to-branch mapping is the part people get wrong. The build carries a *channel* (baked in at build time); `eas update` publishes to a *branch*; a channel points at a branch. Publish to `main` while your production binary listens on `production` and your update reaches nobody, with no error anywhere.

## 4. Anti-patterns

- **Building the whole app in Expo Go.** It runs until the first native dependency, then you rebuild the project under deadline. Development build on day one, always.
- **Editing `ios/` or `android/` under CNG.** `prebuild --clean` erases it. The bug arrives weeks later as "the entitlement disappeared."
- **Committing `ios/` and `android/` to unblock one hack.** You've traded a config plugin for permanent ownership of CocoaPods, Gradle, and every SDK upgrade. Do it deliberately or not at all.
- **One bundle identifier for every variant.** QA installs overwrite production, testers file bugs against the wrong environment, and the fix is a fresh build for everyone.
- **Requesting notification permission on first launch.** Best case, dismal opt-in. On iOS the "no" is permanent, and no amount of later product work gets it back.
- **Shipping without `ITSAppUsesNonExemptEncryption`.** Every upload waits on a manual compliance answer. One line in `infoPlist` removes the step forever.
- **A generic purpose string.** "This app needs camera access" is what Guideline 5.1.1 rejections are made of. State what the feature does with the data.
- **Uploading an `.aab` to testers or an `.apk` to Play.** Different artifacts, different audiences; getting it backwards costs a build cycle each time.
- **OTA-ing a JS bundle that needs new native code.** Universal crash on launch, recoverable only through review.
- **`expo install` skipped in favour of `npm install`.** `expo install` pins the version matched to your SDK. Raw npm gives you the latest, which is how you get a red screen about a native module version mismatch.

## 5. Usage

1. Load this skill with your Expo SDK version stated up front — API surface moves between majors, and an assistant guessing SDK 49 idioms into an SDK 53 project produces plausible, broken config.
2. Ask in terms of capability and audience: "Add camera capture to the report screen, dev build only for now, TestFlight next week." Say whether custom native code is in scope; that single fact decides half the architecture.
3. Expect output in this order: `app.config.ts` changes (including purpose strings), `eas.json` profile, any config plugin, then the React code. Native config first is the tell that the assistant understood the model.
4. Reject any output that edits `ios/` or `android/` directly while CNG is in play, requests permission in a top-level effect, or writes a purpose string that doesn't name the feature.
5. When an update "doesn't reach devices," give the assistant your `eas.json` channel and the branch you published to. It's a channel-to-branch mismatch far more often than a bug in your code.

## 6. Example Output

Prompt with this skill loaded: *"Add optional photo attachment to the report form. SDK 53, dev build already working. Ship to preview testers this week."*

```ts
// app.config.ts — excerpt: purpose strings say what the feature does, not what the API needs
ios: {
  bundleIdentifier: IS_PROD ? 'org.tapdot.fieldnote' : `org.tapdot.fieldnote.${VARIANT}`,
  infoPlist: {
    NSCameraUsageDescription:
      'Fieldnote uses the camera so you can attach a photo to a site report.',
    NSPhotoLibraryUsageDescription:
      'Fieldnote lets you pick an existing photo to attach to a site report.',
    ITSAppUsesNonExemptEncryption: false,
  },
},
android: { permissions: ['CAMERA', 'READ_MEDIA_IMAGES'] },   // API 33+ replaced READ_EXTERNAL_STORAGE
plugins: [
  'expo-router',
  ['expo-camera', { cameraPermission: 'Attach a photo to a site report.' }],
],
```

```tsx
// features/reports/PhotoField.tsx
import { useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useCameraAccess } from './useCameraAccess'

export function PhotoField({ onChange }: { onChange: (uri: string | null) => void }) {
  const [uri, setUri] = useState<string | null>(null)
  const { ensureCamera } = useCameraAccess()

  // Permission is requested here — at the tap, with the reason on screen — never at mount.
  async function capture() {
    if (!(await ensureCamera())) return
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, exif: false })
    if (result.canceled) return
    setUri(result.assets[0].uri)
    onChange(result.assets[0].uri)
  }

  return (
    <View accessibilityRole="none">
      <Text>Photo (optional)</Text>
      {uri ? (
        <Image source={{ uri }} style={{ width: 120, height: 120, borderRadius: 8 }} />
      ) : null}
      <Pressable onPress={capture} accessibilityRole="button" accessibilityLabel="Add a photo">
        <Text>{uri ? 'Retake photo' : 'Add photo'}</Text>
      </Pressable>
    </View>
  )
}
```

```jsonc
// eas.json — preview ships an installable APK; production ships the bundle Play requires
"preview": {
  "distribution": "internal",
  "channel": "preview",
  "android": { "buildType": "apk" },
  "env": { "APP_VARIANT": "preview" }
}
```

Markers of skill-compliant output: purpose strings name the user-facing feature rather than the API, so Guideline 5.1.1 has nothing to catch; `exif: false` strips GPS metadata you never asked for and would have to disclose; permission is requested at the tap and behind a `canAskAgain` check rather than on mount; `READ_MEDIA_IMAGES` replaces the pre-33 storage permission instead of sitting beside it; the preview profile emits an APK a tester can actually install; and the whole change is JS plus config, so it reaches testers through the existing dev build with no native rebuild.
