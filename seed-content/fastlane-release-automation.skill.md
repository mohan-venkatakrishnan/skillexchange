---
title: Automating App Store Releases with Fastlane Skill
category: Mobile
description: Turn a two-hour manual release ritual into one green CI job — API-key auth instead of expiring 2FA sessions, shared signing that doesn't require a designated laptop, and staged rollouts on both stores. Written around the things that break at 6pm on a Friday: an expired session, a keychain prompt on a headless runner, and a build number App Store Connect has already seen.
usage: Load this skill before asking your assistant to set up or repair Fastlane lanes. Give it your platforms, your CI, and what a release means to you ("tag → TestFlight + Play internal, manual promote to production") and it will produce Fastfile, Appfile, Matchfile, and the CI job with credential handling that works headlessly rather than only on your machine.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 24
pocUrl: https://github.com/fastlane/fastlane
---

# Automating App Store Releases with Fastlane Skill

## 1. Philosophy

Every manual release step is a step that will be performed wrong, at the worst possible time, by whoever happens to be awake. Fastlane's value isn't speed — it's that the release stops depending on one person's laptop, one person's memory, and one person's Apple session.

1. **A release is a lane, not a checklist.** If any step lives in a wiki page rather than a Ruby file, that step is the one that gets skipped during the hotfix.
2. **Credentials belong to the org, not the runner.** App Store Connect API keys and Play service accounts authenticate without a human. Any flow that needs someone to type a 2FA code cannot run at 3am and therefore cannot be trusted.
3. **CI must be able to build unattended.** A keychain prompt, an Xcode signing dialog, or an interactive `match` password means the automation only works where it was written.
4. **Build numbers come from an authority, never from git.** The stores are the authority on what they've already accepted. Ask them.
5. **The store's rules are part of the pipeline.** Metadata, purpose strings, and export compliance fail *after* a fifteen-minute upload. Validate before you spend the time.

## 2. Tech Stack

- **Fastlane** — https://github.com/fastlane/fastlane — licensed **MIT**. Lane runner plus the actions used below (`match`, `gym`, `pilot`, `supply`, `precheck`).
- **App Store Connect API key** and **Google Play service account** — vendor credentials, not open source. Both are free and both remove humans from auth.
- **CocoaPods** — https://github.com/CocoaPods/CocoaPods — **MIT**. Dependency manager for the iOS build.
- Ruby 3.x. CI examples target GitHub Actions with a macOS runner for iOS and Linux for Android.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Fastlane maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 API key auth: the single change that fixes most CI failures

`fastlane` can log in as you, with your Apple ID, and it works — until the session expires (roughly a month, sooner if Apple decides otherwise), and then every release job fails at 6pm with a 2FA prompt no runner can answer. The App Store Connect API key does not expire and does not prompt.

```ruby
# fastlane/Fastfile
def asc_key
  app_store_connect_api_key(
    key_id: ENV.fetch('ASC_KEY_ID'),
    issuer_id: ENV.fetch('ASC_ISSUER_ID'),
    key_content: ENV.fetch('ASC_KEY_P8'),   # the .p8 body, base64'd in CI secrets
    is_key_content_base64: true,
    duration: 1200,                          # seconds; 1200 is Apple's ceiling
    in_house: false
  )
end
```

The key downloads exactly once from App Store Connect and never again. Losing it means minting a new one and updating every secret store. Base64 it before putting it in a CI secret — the raw `.p8` has newlines, and most secret stores will mangle them into a key that parses as garbage.

`duration: 1200` matters on slow uploads: the token is minted at lane start, and a long `gym` followed by a long upload can outlive a shorter duration. The failure reads as a 401 twenty minutes into a job that was working.

### 3.2 `match`: signing that isn't a person

```ruby
# fastlane/Matchfile
git_url("git@github.com:tapdot/certificates.git")
storage_mode("git")
type("appstore")
app_identifier(["org.tapdot.fieldnote", "org.tapdot.fieldnote.preview"])
username("release@tapdot.org")   # ignored when an API key is in play, kept for local use
```

`match` keeps certificates and profiles in an encrypted git repo so every machine and every runner resolves the same identity. The rule that keeps it working:

```ruby
lane :certs do
  # Local, once, by a human who understands the consequences:
  match(type: 'appstore', readonly: false)
end

lane :ci_certs do
  setup_ci                                 # creates a temporary, unlocked keychain on the runner
  match(type: 'appstore', readonly: true)  # NEVER let CI mint certificates
end
```

`readonly: true` on CI is non-negotiable. A CI run with write access that decides your certificate is stale will **revoke it** — instantly breaking every other developer, every other pipeline, and any build in flight. Apple also caps you at a small number of distribution certificates; a revoke-and-recreate loop burns through them.

`setup_ci` is the line people omit. Without it, `match` installs certificates into a login keychain that doesn't exist on a fresh runner, and `gym` fails with a codesign error that names no keychain at all.

### 3.3 Build numbers from the store, not from git

```ruby
platform :ios do
  lane :beta do
    setup_ci
    match(type: 'appstore', readonly: true)
    key = asc_key

    # The store is the authority on what it has already accepted. git tags are not:
    # two branches, two CI runs, one number, and a fifteen-minute upload rejected at the end.
    latest = latest_testflight_build_number(api_key: key, initial_build_number: 0)
    increment_build_number(build_number: latest + 1, xcodeproj: 'ios/App/App.xcodeproj')

    build_app(
      workspace: 'ios/App/App.xcworkspace',
      scheme: 'App',
      configuration: 'Release',
      export_method: 'app-store',
      export_options: { uploadSymbols: true },
      clean: true,
      output_directory: 'build',
      xcargs: '-allowProvisioningUpdates -skipPackagePluginValidation'
    )

    upload_to_testflight(
      api_key: key,
      skip_waiting_for_build_processing: true,   # don't burn 20 min of runner on Apple's queue
      distribute_external: false,                # external groups need Beta App Review
      changelog: last_git_commit[:message]
    )
  end
end
```

`skip_waiting_for_build_processing: true` is nearly always right — Apple's processing takes 5 to 30 unpredictable minutes, and paying a macOS runner to watch it is money for nothing. The exception: with `distribute_external: true` you must wait, because you can't distribute a build that isn't processed.

`upload_to_testflight` will also silently do nothing useful if your `Info.plist` lacks `ITSAppUsesNonExemptEncryption`. The build lands, then sits waiting on an export compliance answer that only a human clicking in App Store Connect can give. One plist key removes it forever.

### 3.4 Android: service account, tracks, staged rollout

```ruby
platform :android do
  lane :internal do
    # versionCode from the store, same reasoning as iOS.
    codes = google_play_track_version_codes(
      track: 'internal',
      json_key_data: ENV.fetch('PLAY_SERVICE_ACCOUNT_JSON')
    )
    next_code = (codes.max || 0) + 1

    gradle(task: 'clean')
    gradle(
      task: 'bundle',                       # AAB — Play rejects APKs for new apps
      build_type: 'Release',
      properties: { 'versionCode' => next_code, 'android.injected.signing.store.password' => ENV['KEYSTORE_PASSWORD'] }
    )

    upload_to_play_store(
      track: 'internal',                    # internal → alpha → beta → production
      json_key_data: ENV.fetch('PLAY_SERVICE_ACCOUNT_JSON'),
      release_status: 'completed',
      skip_upload_apk: true,
      skip_upload_metadata: true,           # metadata lives in its own lane; don't couple them
      skip_upload_images: true,
      skip_upload_screenshots: true
    )
  end

  lane :promote_prod do |options|
    upload_to_play_store(
      track: 'production',
      version_code: options[:code],
      skip_upload_aab: true,                # promoting an existing artifact, not uploading one
      track_promote_to: 'production',
      release_status: 'inProgress',
      rollout: '0.1'                        # 10%. Watch crash-free rate before widening.
    )
  end
end
```

Google Play's most annoying rule: the **first** upload to a new app must be done manually through the console. The service account has no permission to create the initial release, and `supply` fails with a permissions error that sends people to re-check IAM for an hour. Upload one build by hand, then automate everything after it.

Staged rollout has no iOS equivalent worth relying on — App Store phased release exists but drips over seven days and can't be steered by a metric. On Play you can hold at 10%, read crash-free users, and halt. Use it.

### 3.5 Fail before the upload, not after it

```ruby
lane :release do
  precheck(api_key: asc_key)   # scans metadata for the things review rejects mechanically
  ios_beta
end
```

`precheck` catches placeholder text, broken URLs, mentions of other platforms ("also on Android" in your description is a real rejection), and profanity. It takes seconds and it saves a review cycle — which is a day at best.

The rejections it can't catch, and which you should therefore encode as review checks rather than hope:
- **Guideline 2.3.3** — screenshots must show the app actually in use. Marketing collateral with a slogan and a floating phone gets bounced.
- **Guideline 5.1.1(v)** — an app with account creation must offer in-app account deletion. Not an email link. In the app.
- **Guideline 4.2** — a thin wrapper around your website is "minimum functionality." This is the most common rejection for a first mobile app, and no lane can fix it.
- **Guideline 2.1** — a demo account that doesn't work, or a login wall with no credentials in the review notes. Put the credentials in `App Review Information` and keep the account alive.

### 3.6 CI: the whole job, unattended

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    tags: ['v*']

jobs:
  ios:
    runs-on: macos-14
    timeout-minutes: 45          # a hung signing prompt otherwise burns your whole quota
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
        with: { ruby-version: '3.3', bundler-cache: true }
      - uses: webfactory/ssh-agent@v0.9.0
        with: { ssh-private-key: ${{ secrets.MATCH_GIT_DEPLOY_KEY }} }   # read-only deploy key
      - run: bundle exec fastlane ios beta
        env:
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_P8: ${{ secrets.ASC_KEY_P8_BASE64 }}
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          FASTLANE_SKIP_UPDATE_CHECK: 'true'
          FASTLANE_HIDE_CHANGELOG: 'true'
```

Pin the runner image (`macos-14`, not `macos-latest`). GitHub rotates `latest` to a new Xcode without asking, and your release breaks on a day you changed nothing — the worst debugging session in mobile.

Use a **read-only deploy key** for the match repo. A CI runner that can push to your certificates repo is a runner that can corrupt every developer's signing on a bad day.

## 4. Anti-patterns

- **Apple ID + 2FA on CI.** The session expires on Apple's schedule and the failure lands mid-release. API key, always.
- **`match(readonly: false)` on CI.** One run decides your cert is stale, revokes it, and breaks every machine in the company at once. There is no undo.
- **Omitting `setup_ci`.** `match` writes to a keychain the runner doesn't have and `gym` fails with a codesign error that mentions no keychain.
- **Build numbers derived from git.** Two branches produce the same number; App Store Connect rejects the second after a full upload.
- **A raw `.p8` in a CI secret.** Newlines get mangled and the key parses as garbage. Base64 in, `is_key_content_base64: true` out.
- **`skip_waiting_for_build_processing: false` by default.** You're paying a macOS runner to poll Apple's queue for half an hour.
- **Shipping without `ITSAppUsesNonExemptEncryption`.** Every build stalls on an export compliance question that only a human can dismiss.
- **Expecting `supply` to create the first Play release.** It can't. One manual upload, then automate.
- **`macos-latest`.** The image rotates Xcode under you and the break arrives on an unrelated commit.
- **A CI deploy key with write access to the certs repo.** All the risk of `readonly: false` with an extra step.
- **Screenshots as marketing art.** Guideline 2.3.3 wants the app in use. A slogan and a floating device is a rejection with a two-day cost.

## 5. Usage

1. Load this skill with your platforms, CI provider, and release shape stated: "tag → TestFlight + Play internal; production is a manual promote." Fastlane's shape follows entirely from that sentence.
2. Ask for lanes, not commands: "A beta lane for both platforms, unattended, build numbers from the stores." Say whether the app already exists in each store — the first Play release is a manual step nothing can automate around.
3. Expect Appfile/Matchfile/Fastfile plus the CI job and the exact secret names. An answer with no CI half is half an answer; that's where the signing breaks.
4. Reject output using Apple ID auth, `readonly: false` on CI, git-derived build numbers, or `macos-latest`.
5. When CI fails on codesign but your laptop builds fine, hand over the lane and the runner setup. It's a missing `setup_ci` or a login-keychain assumption nearly every time — check that before regenerating a single profile.

## 6. Example Output

Prompt with this skill loaded: *"Tag push should ship both platforms to internal testers, unattended. App exists in both stores already."*

```ruby
# fastlane/Fastfile
default_platform(:ios)

def asc_key
  app_store_connect_api_key(
    key_id: ENV.fetch('ASC_KEY_ID'),
    issuer_id: ENV.fetch('ASC_ISSUER_ID'),
    key_content: ENV.fetch('ASC_KEY_P8'),
    is_key_content_base64: true,
    duration: 1200            # ceiling; a slow upload must not outlive the token
  )
end

platform :ios do
  desc 'Build and ship to TestFlight internal testers'
  lane :beta do
    key = asc_key
    setup_ci                                   # temporary keychain — without this, codesign fails on CI
    match(type: 'appstore', readonly: true)    # CI never mints or revokes certificates

    build = latest_testflight_build_number(api_key: key, initial_build_number: 0) + 1
    increment_build_number(build_number: build, xcodeproj: 'ios/App/App.xcodeproj')

    cocoapods(podfile: 'ios/App/Podfile', repo_update: false)
    build_app(
      workspace: 'ios/App/App.xcworkspace',
      scheme: 'App',
      configuration: 'Release',
      export_method: 'app-store',
      clean: true,
      xcargs: '-skipPackagePluginValidation'
    )

    upload_to_testflight(
      api_key: key,
      skip_waiting_for_build_processing: true, # internal testers don't need Beta App Review
      distribute_external: false,
      changelog: "#{git_branch} · #{last_git_commit[:abbreviated_commit_hash]}"
    )
    upload_symbols_to_crashlytics(dsym_path: lane_context[SharedValues::DSYM_OUTPUT_PATH])
  end

  error do |lane, exception|
    slack_notify("iOS #{lane} failed: #{exception.message}")   # a silent failed release is worse
  end
end

platform :android do
  desc 'Build an AAB and ship to the Play internal track'
  lane :beta do
    codes = google_play_track_version_codes(track: 'internal', json_key_data: ENV.fetch('PLAY_JSON'))
    next_code = (codes.max || 0) + 1           # the store knows; git does not

    gradle(task: 'clean', project_dir: 'android/')
    gradle(
      task: 'bundle', build_type: 'Release', project_dir: 'android/',
      properties: {
        'versionCode' => next_code,
        'android.injected.signing.store.file' => ENV.fetch('KEYSTORE_PATH'),
        'android.injected.signing.store.password' => ENV.fetch('KEYSTORE_PASSWORD'),
        'android.injected.signing.key.alias' => ENV.fetch('KEY_ALIAS'),
        'android.injected.signing.key.password' => ENV.fetch('KEY_PASSWORD')
      }
    )

    upload_to_play_store(
      track: 'internal',
      json_key_data: ENV.fetch('PLAY_JSON'),
      release_status: 'completed',
      skip_upload_apk: true,                   # we built an AAB; never both
      skip_upload_metadata: true,              # metadata is a separate, human-reviewed lane
      skip_upload_images: true,
      skip_upload_screenshots: true
    )
  end
end
```

```yaml
# .github/workflows/release.yml  (excerpt)
jobs:
  ios:
    runs-on: macos-14              # pinned: macos-latest rotates Xcode and breaks releases
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
        with: { ruby-version: '3.3', bundler-cache: true }
      - uses: webfactory/ssh-agent@v0.9.0
        with: { ssh-private-key: ${{ secrets.MATCH_GIT_DEPLOY_KEY }} }   # read-only
      - run: bundle exec fastlane ios beta
        env:
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_P8: ${{ secrets.ASC_KEY_P8_BASE64 }}
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
  android:
    runs-on: ubuntu-latest         # no Xcode, no image roulette
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '17' }
      - run: echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > /tmp/release.keystore
      - run: bundle exec fastlane android beta
        env:
          PLAY_JSON: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
          KEYSTORE_PATH: /tmp/release.keystore
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
```

Markers of skill-compliant output: auth is an API key with a 1200-second duration, so no session expires mid-release and no 2FA prompt can hang a runner; `setup_ci` precedes `match`, and `match` is `readonly` so CI can never revoke a certificate out from under the team; both build numbers are read from their store rather than derived from git, so parallel tags can't collide; `skip_waiting_for_build_processing` frees the macOS runner instead of paying it to poll Apple's queue; the AAB path explicitly skips the APK path so only one artifact is ever in play; metadata upload is decoupled from binary upload, so a copy change can't accidentally ride a release; the macOS runner is pinned to an image; the match repo is reached with a read-only deploy key; and the `error` block makes a failed release loud, because the only thing worse than a broken release is a quiet one.
