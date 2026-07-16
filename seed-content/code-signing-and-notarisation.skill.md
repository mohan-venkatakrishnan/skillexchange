---
title: Code Signing & Notarisation Skill
category: Desktop
description: Get a desktop app past Gatekeeper and SmartScreen without losing a week to certificate portals and opaque rejection emails. Covers Developer ID vs App Store certs, hardened runtime and the entitlements Electron actually needs, notarytool, stapling, deep signing, Windows EV vs OV and the SmartScreen reputation ramp, cloud signing, CI secrets, and what each path really costs in money and calendar days.
usage: Load this skill when a desktop app must be distributed outside an app store without triggering malware warnings. Work section 3 in order — the certificate decisions in 3.1 and 3.7 have multi-week lead times and gate everything else. Use 3.9 to decode real signing errors and section 4 as the pre-release checklist.
platforms: [Claude, Cursor]
priceUsd: 0
timeSavedHours: 30
pocUrl: https://github.com/electron-userland/electron-builder
---
# Code Signing & Notarisation Skill

## 1. Philosophy

Code signing is the only part of shipping a desktop app you cannot debug your way out of
on a Sunday night. The certificate takes days to issue. The notary answers when it
answers. SmartScreen reputation cannot be bought with effort — only with downloads and
time. Everything else in your pipeline is under your control; this is not.

1. **Start the paperwork on day one,** not the week before launch. Apple enrolment: 1–14
   days (a D-U-N-S check can dominate). Windows OV: 1–5 business days. EV: 1–3 weeks plus
   a physical token in the post. These timelines are the critical path.
2. **Signing is not notarisation is not stapling.** Three steps, three failure modes.
   Most "notarisation is broken" threads are a signing problem the notary is reporting.
3. **The error strings are the documentation.** Apple's rejection JSON names the exact
   binary and reason. Read it before changing anything. Half the internet's advice is
   "add more entitlements," which is how you ship `allow-unsigned-executable-memory` for
   no reason.
4. **Never hand-sign a release on a laptop.** If a release needs a human with a keychain,
   releases stop when that human is on a train. It goes in CI from the first signed build.
5. **Unsigned is legitimate; silently unsigned is not.** Can't justify the money yet? Ship
   unsigned and document the exact dialog users will see and why it's safe. Overclaiming
   trust is worse than admitting you're small.

## 2. Tech Stack

- **Project:** electron-builder — https://github.com/electron-userland/electron-builder —
  **MIT** licensed. This skill is an independent, original guide; it is not affiliated
  with or endorsed by the electron-builder maintainers.
- **macOS:** Apple Developer Program ($99/yr), a **Developer ID Application** certificate,
  `codesign` + `notarytool` + `stapler` (Xcode CLI Tools), `spctl` to verify.
- **Windows:** an OV or EV code-signing cert (Sectigo, DigiCert, SSL.com, Certum) or
  **Azure Trusted Signing**; `signtool` underneath.
- **Linux:** nothing. No Gatekeeper equivalent — packaging conventions instead (§3.10).
- **CI:** GitHub Actions, a macOS runner (`codesign` is not portable) + a Windows runner.
- electron-builder is the reference because it automates the most of this, but every
  concept below is `codesign`/`notarytool`/`signtool`. Tauri
  (`bundle.macOS.signingIdentity`) and `@electron/notarize` follow the same sequence.

## 3. Patterns

### 3.1 Pick the right macOS certificate (where people lose a day)

| Certificate | Use for | Wrong if |
|---|---|---|
| **Developer ID Application** | Apps distributed from **your own site** | Used for App Store — rejected |
| Developer ID Installer | `.pkg` installers you distribute yourself | You ship a dmg only |
| Apple Development | Local dev on registered machines | You ship it — users blocked |
| Mac App Store / 3rd Party Mac Developer | Submitting **to the App Store** | You distribute directly |

Shipping a dmg from your download page means **Developer ID Application**, full stop. The
error for choosing wrong is the one that started this skill:
`The binary is not signed with a valid Developer ID certificate.` — meaning you signed
with *something*, often an Apple Development cert, because it was first in the keychain
and `codesign` happily used it.

```bash
security find-identity -v -p codesigning
#   1) A1B2C3... "Apple Development: You (TEAMID)"
#   2) D4E5F6... "Developer ID Application: Your Company (TEAMID)"   ← this one
```

Certs expire (5 years) but **already-notarised apps keep working after expiry** — the
ticket is what Gatekeeper checks. Revocation is different: it kills every app signed with
that cert. Don't revoke to "clean up."

### 3.2 Hardened runtime and entitlements

Notarisation **requires** the hardened runtime: protections (no code injection, no DYLD
overrides, no writable+executable memory) that you opt out of selectively.

```jsonc
"mac": {
  "hardenedRuntime": true, "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "target": [{ "target": "dmg", "arch": ["x64", "arm64"] }],
  "notarize": { "teamId": "ABCDE12345" }
}
```

```xml
<dict>
  <!-- V8 JITs JavaScript. Without this the renderer is killed on launch under
       hardened runtime. This is the one Electron genuinely needs. -->
  <key>com.apple.security.cs.allow-jit</key><true/>
  <!-- Only if V8 needs W+X beyond allow-jit. Try WITHOUT it and test the SIGNED app. -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <!-- Add only what your app uses. Each is an attack surface. -->
  <key>com.apple.security.device.audio-input</key><true/>
</dict>
```

`entitlementsInherit` is not decorative. Electron's helpers (Renderer, GPU, Plugin)
inherit from the parent; without `allow-jit` the app launches, shows a window, and the
renderer dies — reaching you as a blank window and the user as "it doesn't work on my
Mac." Console.app shows `EXC_BAD_ACCESS (SIGKILL (Code Signature Invalid))`, and it never
reproduces in dev because dev builds aren't hardened.

Resist `disable-library-validation` (only for genuinely unsigned third-party dylibs) and
`allow-dyld-environment-variables` — each is a protection you turned off. Skip hardened
runtime entirely and the notary says:
`The executable does not have the hardened runtime enabled.`

### 3.3 Deep signing: nested helpers, frameworks, inside-out order

An Electron `.app` is not one binary:

```
Notebook.app/Contents/
  MacOS/Notebook                                 ← main executable
  Frameworks/Electron Framework.framework/
  Frameworks/Notebook Helper (GPU|Plugin|Renderer).app/
  Frameworks/Squirrel.framework/  Mantle.framework/  ReactiveObjC.framework/
  Resources/app.asar.unpacked/**/*.node          ← native modules
  Resources/bin/ffmpeg                           ← sidecars
```

**Every** Mach-O must be signed, **inside-out**: nested first, container last. Sign the
outer `.app` then touch anything inside and you invalidate it — that's the
`code object is not signed at all` family pointing at a path you thought was handled.

electron-builder does this correctly alone. You break it by: adding files **after** the
sign step (anything copied in `afterSign` is unsigned); shipping a `.node` or sidecar and
assuming it's "just a resource" (it's a Mach-O, and inside an asar it can't be signed —
hence `asarUnpack`); or copying `--deep` from StackOverflow. Apple explicitly discourages
`codesign --deep`: it signs nested code with the *parent's* entitlements, usually wrong,
and hides the real problem. Verify before submitting — 90 seconds that saves a round trip:

```bash
codesign --verify --deep --strict --verbose=2 "dist/mac-arm64/Notebook.app"
codesign -dv --entitlements :- "dist/mac-arm64/Notebook.app"       # what did I grant?
codesign -dvvv "dist/mac-arm64/Notebook.app" 2>&1 | grep Authority # which cert signed it?
```

### 3.4 Notarisation with notarytool (altool is dead)

`altool` was decommissioned — a guide using `xcrun altool --notarize-app` fails with an
auth error that looks like a credentials problem and isn't. `notarytool` takes minutes,
not the old 30–60. Notarisation is an automated malware scan of your **already-signed**
app; no human, but it rejects signing mistakes.

```bash
# App-specific password from appleid.apple.com — NOT your Apple ID password.
xcrun notarytool store-credentials "notary-profile" \
  --apple-id "you@example.com" --team-id "ABCDE12345" --password "abcd-efgh-ijkl-mnop"
xcrun notarytool submit "dist/Notebook-1.2.0-arm64.dmg" \
  --keychain-profile "notary-profile" --wait
# On "status: Invalid" — the command nobody runs, and it is the whole game:
xcrun notarytool log <submission-id> --keychain-profile "notary-profile" log.json
```

```json
{ "status": "Invalid", "issues": [
  { "severity": "error", "path": "Notebook.dmg/Notebook.app/Contents/Resources/bin/ffmpeg",
    "message": "The binary is not signed with a valid Developer ID certificate." },
  { "severity": "error", "path": "Notebook.dmg/Notebook.app/Contents/MacOS/Notebook",
    "message": "The executable does not have the hardened runtime enabled." } ] }
```

Two errors, two exact paths, two obvious fixes: the sidecar wasn't in the signing set, and
`hardenedRuntime` wasn't true. No guessing. In electron-builder the flow is the `notarize`
block above plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

### 3.5 Stapling, and why an un-stapled app fails offline

Notarisation puts a ticket on Apple's servers. **Stapling** attaches a copy so Gatekeeper
verifies with no network call.

```bash
xcrun stapler staple "dist/Notebook-1.2.0-arm64.dmg"
spctl -a -vvv -t install "dist/Notebook-1.2.0-arm64.dmg"
# source=Notarized Developer ID   ← this exact string is the goal
```

Skip it and the app works — on every machine you test, because they're online. Then a user
on a plane, or behind a proxy blocking `ocsp.apple.com`, double-clicks and gets *"Notebook
can't be opened because Apple cannot check it for malicious software"* — identical to the
unsigned dialog. You will chase this as a signing bug for hours. It is one missing
command. electron-builder staples automatically; by hand, staple the **dmg**, and if you
ship a zip staple the `.app` before zipping, since zips can't hold a ticket.
`source=Developer ID` without "Notarized" means signed but not notarised/stapled.

### 3.6 Windows: EV vs OV and the SmartScreen reputation ramp

Windows has no notarisation. It has **SmartScreen reputation**, which is worse, because
you can't complete it — only accumulate it.

| | **OV** | **EV** |
|---|---|---|
| Cost | ~$200–400/yr | ~$300–600/yr |
| Vetting | 1–5 business days | 1–3 weeks |
| Key storage | HSM/token (mandated since 2023) | Token or cloud HSM |
| SmartScreen | Starts at zero — must earn it | **Immediate** |

With a fresh **OV** cert users still get *"Windows protected your PC — Microsoft Defender
SmartScreen prevented an unrecognized app from starting"*, with "Run anyway" hidden behind
"More info." It clears after enough downloads-without-complaints — weeks to a couple of
months for a small app, and nobody at Microsoft will tell you the threshold. Reputation
attaches to the **certificate**, so it survives version bumps but resets if you change CAs
or renew into a new key. **EV** is trusted from the first download; that is its entire
value proposition, and for a paid product it usually justifies the delta. Note the 2023
CA/B Forum change: OV keys must now live on hardware or an HSM too, so the old "put the
.pfx in CI" workflow is dead for newly issued certs. Which leads to:

### 3.7 Azure Trusted Signing (the modern Windows path)

A physical USB token is fundamentally incompatible with CI. The workarounds — an always-on
signing box with the token plugged in, a self-hosted runner in a drawer — are exactly as
fragile as they sound.

**Azure Trusted Signing** is Microsoft's managed service: no token, no cert purchase, keys
in an Azure-managed HSM, signing via API, and **SmartScreen reputation comparable to EV**.
Roughly $10/month (Basic tier, ample for a small app's volume) versus $400/yr for EV, with
organisation validation in days rather than weeks. Honest catches: it wants a registered
legal entity with 3+ years of verifiable history, it's Azure-account-shaped, and certs
rotate every 3 days — fine, because signatures are timestamped (§3.8) and stay valid after
rotation. SSL.com and DigiCert ONE sell equivalent cloud-HSM signing at higher prices.

For a solo developer starting today: **Trusted Signing > EV > OV > unsigned.** The only
reason to buy a token-based EV cert now is failing the entity checks.

### 3.8 CI signing with secrets

**macOS** — base64 the cert into Actions secrets, build a throwaway keychain per run:

```bash
base64 -i DeveloperID.p12 | pbcopy     # → repo secret MACOS_CERT_P12_BASE64
```

```yaml
- name: Import signing certificate
  env:
    P12_BASE64: ${{ secrets.MACOS_CERT_P12_BASE64 }}
    P12_PASSWORD: ${{ secrets.MACOS_CERT_PASSWORD }}
    KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
  run: |
    echo "$P12_BASE64" | base64 --decode > /tmp/cert.p12
    security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    security default-keychain -s build.keychain
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    security set-keychain-settings -t 3600 -u build.keychain   # don't relock mid-build
    security import /tmp/cert.p12 -k build.keychain -P "$P12_PASSWORD" \
      -T /usr/bin/codesign -T /usr/bin/security
    # Without this line codesign hangs forever on a GUI password prompt no one will
    # ever click. This is the classic "CI job times out at 6 hours".
    security set-key-partition-list -S apple-tool:,apple:,codesign: \
      -s -k "$KEYCHAIN_PASSWORD" build.keychain
    rm /tmp/cert.p12
```

**Windows** — always timestamp:

```jsonc
"win": { "target": [{ "target": "nsis", "arch": ["x64", "arm64"] }],
         "signtoolOptions": { "publisherName": "Your Company Ltd",
                              "timeStampServer": "http://timestamp.digicert.com" } }
```

A timestamped signature stays valid forever; an untimestamped one becomes invalid the day
the cert expires, retroactively breaking every installed copy. Free and non-optional.
Secrets hygiene: gate signing on `github.event_name == 'push'` and a `v*` tag — never
`pull_request` from forks (secrets are absent and the job fails confusingly; or you
enabled `pull_request_target` and handed your cert to a stranger). Never `echo` a secret.

### 3.9 The error-message field guide

| What you see | What it actually is |
|---|---|
| `The binary is not signed with a valid Developer ID certificate.` | Signed with Apple Development, or an unsigned nested binary/sidecar. Check the log's `path`. |
| `The executable does not have the hardened runtime enabled.` | `hardenedRuntime: true` missing, or a helper packed after signing. |
| `The signature of the binary is invalid.` | The app was modified after signing — a copy step, asar repack, `afterSign` hook. |
| `code object is not signed at all` | A `.node` or sidecar was missed. Usually needs `asarUnpack`. |
| `"App" can't be opened because Apple cannot check it…` | Not notarised — **or notarised but not stapled and the user is offline**. |
| `errSecInternalComponent` in CI | Missing `set-key-partition-list`; codesign can't reach the key non-interactively. |
| CI hangs for hours at the sign step | Same cause: an invisible GUI keychain prompt. |
| `A required agreement is missing or has expired.` | Apple changed the developer agreement. Log in and accept. Not your code. |
| `Team is not yet configured for notarization` | New-account propagation or an unfinished entity check. Wait; don't rebuild. |
| SmartScreen warning on a signed OV build | Working as designed. Reputation ramp (§3.6). Rebuilding won't fix it. |

### 3.10 Linux, and the cost/timeline reality

Linux has no signing requirement, only packaging expectations: an **AppImage** must be
`chmod +x`-able and self-contained (say so on the download page), and a **deb** should
declare dependencies honestly and drop a `.desktop` file so it appears in the launcher. An
apt/rpm repo gets GPG-signed — but that's *repository* signing, optional for direct
downloads.

| Item | Money | Calendar |
|---|---|---|
| Apple Developer Program | $99/yr | 1–14 days (D-U-N-S can dominate) |
| Developer ID cert | included | minutes, once enrolled |
| First notarisation | $0 | 2–10 min per submit; budget a day for the first |
| Azure Trusted Signing | ~$10/mo | days (entity validation) |
| Windows OV cert | $200–400/yr | 1–5 days + a reputation ramp of weeks |
| Windows EV cert | $300–600/yr | 1–3 weeks (token shipping included) |
| Linux | $0 | 0 |

Properly signed cross-platform: roughly **$220/year** via Trusted Signing, ~$500/year via
traditional EV. Plan **three to four weeks of lead time** from "I should do signing" to "a
signed build comes out of CI." Almost none of that is engineering time — it's waiting on
other organisations, which is exactly why it goes first, in parallel with the build.

## 4. Anti-patterns

- **Starting the certificate process near launch.** Enrolment, vetting, and token shipping
  are calendar weeks you cannot compress. Day one, in parallel.
- **Signing with an "Apple Development" cert** because it was first in
  `security find-identity`. Pin the identity explicitly.
- **Not reading `notarytool log`.** The JSON names the failing path. Every hour guessing at
  entitlements is an hour that command would have saved.
- **Entitlement shotgunning** — `disable-library-validation` +
  `allow-dyld-environment-variables` + `allow-unsigned-executable-memory` until it works.
  You just disabled the protections notarisation exists to verify. Start with `allow-jit`.
- **Forgetting `entitlementsInherit`.** Helpers lose `allow-jit`, the renderer is killed,
  and you get a blank window that never reproduces in dev.
- **Skipping `stapler staple`.** Works on every machine you own; fails for the user on a
  plane, with a dialog identical to "unsigned."
- **`codesign --deep`** from a forum answer. Apple discourages it; it applies the parent's
  entitlements to nested code and hides the real problem.
- **Adding files after the signing step** (a stray `afterSign` copy, an asar repack) —
  "The signature of the binary is invalid."
- **Untimestamped Windows signatures.** Every installed copy breaks the day the cert
  expires. One config line, permanently free.
- **Expecting an OV cert to kill the SmartScreen warning** immediately. It doesn't. Budget
  EV or Trusted Signing if the first-run experience matters.
- **Signing by hand on one person's laptop.** Bus-factor-1 releases, undocumented keychain.

## 5. Usage

1. **Day one:** enrol in the Apple Developer Program; start the Windows path (Trusted
   Signing unless entity requirements block you). These run while you build.
2. Issue a **Developer ID Application** cert; confirm with `security find-identity -v -p
   codesigning` and pin that identity — never let tooling choose.
3. Configure `hardenedRuntime`/`entitlements`/`entitlementsInherit` (§3.2) with `allow-jit`
   **only**. Build, run the signed `.app`, see if the renderer survives before adding more.
4. Get every nested binary into the signing set: `asarUnpack` for `.node`, sidecars as
   declared resources. Verify with `codesign --verify --deep --strict` before submitting.
5. `notarytool submit --wait`. On `Invalid`, run `notarytool log` and fix the named paths.
6. `stapler staple`, then require the literal `source=Notarized Developer ID` from `spctl`.
7. Windows: sign with a timestamp server, always. If OV, plan the reputation ramp and write
   the download page accordingly.
8. Move it into CI (§3.8) — throwaway keychain, `set-key-partition-list`, secrets gated to
   tag pushes. The first signed build a user downloads should come from CI.
9. Review against §4. Test the **downloaded** artifact on a machine that has never seen the
   app, once with the network off.

## 6. Example Output

A cross-platform Electron note-taking app taken from unsigned to fully trusted over three
calendar weeks (about 6 hours of actual work):

- **macOS:** Developer ID Application cert; `hardenedRuntime: true` with a two-key
  entitlements plist — `allow-jit`, plus `allow-unsigned-executable-memory` added only
  after a signed build's renderer died and Console.app showed
  `SIGKILL (Code Signature Invalid)` — and `entitlementsInherit` on the same file so the
  four helper apps inherit it. First submission came back `Invalid` in 4 minutes;
  `notarytool log` named `app.asar.unpacked/.../better_sqlite3.node` as unsigned. Fixed
  with `asarUnpack`; accepted on the second try. Stapled; `spctl` reports
  `source=Notarized Developer ID` and the dmg opens with the network disabled.
- **Windows:** Azure Trusted Signing at ~$10/month instead of a $450/yr EV token, validated
  in 4 business days. NSIS installer signed with `timeStampServer` set. No SmartScreen
  warning on the first public download — the reason EV-equivalent reputation was worth it.
- **Linux:** unsigned AppImage + deb, with a download-page line explaining `chmod +x` and a
  `.desktop` entry in the deb.
- **CI:** one tag-triggered workflow, 3-OS matrix. The mac job base64-decodes the p12 into a
  throwaway keychain and runs `set-key-partition-list` — added after the first attempt hung
  for 51 minutes on an invisible password prompt before being cancelled. Signing gated to
  `push` on `v*`, never `pull_request`. Recurring cost: $99/yr Apple + ~$120/yr Azure =
  **$219/year** for an app that triggers zero warnings on either platform.
