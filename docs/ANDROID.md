# Android: shared runtime APK with per-app pinned shortcuts

**Design (weekend scope):** one APK packages the same web runtime. From inside any personal app, the user taps **Add shortcut**; the launcher asks them to confirm a pinned shortcut whose intent carries that app's ID. Tapping the icon opens the shell directly in `/apps/{id}/`. Separate APKs per generated app and Play Store distribution are later work.

**State:** see the *Verification* table at the bottom. An Android source folder is not a compiled package, and a compiled package is not a device-tested one; the table says which is which.

## Pieces

| Piece | Where |
| --- | --- |
| Capacitor config (`appId com.aiappstore.runtime`, `webDir dist/client`, https scheme) | `capacitor.config.ts` |
| Native plugin: `isSupported`, `pin`, `getLaunchAppId`, `appLaunch` event; validates the app ID with `^[A-Za-z0-9_-]{8,32}$`; distinct intent data URI per app | `android/app/src/main/java/com/aiappstore/runtime/AppShortcutsPlugin.java` |
| Cold start (`onCreate`) and warm start (`onNewIntent`, `launchMode=singleTask`) | `android/app/src/main/java/com/aiappstore/runtime/MainActivity.java` |
| Web bridge (no-ops in browsers) + navigation to validated internal routes only | `client/src/native/shortcuts.ts`, wired in `client/src/App.tsx` |
| Server address screen (phones cannot reach the laptop's localhost) | `client/src/components/NativeServerSetup.tsx` |
| Bearer-token auth for the cross-origin WebView (`X-Client: native`) | `client/src/api.ts`, `server/routes/auth.ts`, CORS in `server/index.ts` (`https://localhost`, `capacitor://localhost`) |
| Build script (finds JDK/SDK, bakes `VITE_API_BASE_URL`, runs Gradle) | `scripts/build-apk.mjs` |

Secrets: none are in the bundle. The server keeps the AI key; the shell only knows the server URL and the user's session token.

## Build the debug APK

Prerequisites: Android Studio (bundles JDK 21 and the SDK) or `JAVA_HOME` + `ANDROID_HOME`. compileSdk/targetSdk 36 (installed here), Gradle 8.14.3 (wrapper), AGP 8.13.

```bash
# API base must be reachable FROM THE PHONE. Same Wi-Fi: your laptop's LAN IP. Emulator: 10.0.2.2.
node scripts/build-apk.mjs --api-base http://192.168.1.20:8787
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Windows note: `scripts/build-apk.mjs` uses `C:\Program Files\Android\Android Studio\jbr` as the JDK when `JAVA_HOME` is unset and `%LOCALAPPDATA%\Android\Sdk` as the SDK.

Server side for phones: run `npm run build && npm start` with `PUBLIC_ORIGIN=http://<laptop-lan-ip>:8787` and `HOST=0.0.0.0` (default) so the phone can reach it; add the phone-facing origin to `CORS_ORIGINS` only if you serve the web app from a different host than the API.

## Install and verify

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.aiappstore.runtime/.MainActivity        # open the shell, enter the server address, sign in
```

In the shell, open an app → **Settings → On your phone → Add shortcut** (Android) → confirm the launcher dialog. Then:

- **Warm launch:** with the shell still running, tap the pinned icon → the running shell navigates to that app (`onNewIntent` → `appLaunch` event).
- **Cold launch:** swipe the shell away (or `adb shell am force-stop com.aiappstore.runtime`), tap the icon → the shell starts, reads the pending app ID, authenticates with the stored token, and opens `/apps/{id}/` with its records.

Scriptable equivalents (replace `<id>`):

```bash
adb shell am force-stop com.aiappstore.runtime
adb shell am start -n com.aiappstore.runtime/.MainActivity -a android.intent.action.VIEW -d "aiappstore://apps/<id>/" --es com.aiappstore.runtime.APP_ID <id>   # cold
adb shell am start -n com.aiappstore.runtime/.MainActivity -a android.intent.action.VIEW -d "aiappstore://apps/<id>/" --es com.aiappstore.runtime.APP_ID <id>   # warm (run again)
```

Emulator available on this machine: AVD `Pixel_9_Pro` (`%LOCALAPPDATA%\Android\Sdk\emulator\emulator -avd Pixel_9_Pro`).

## Verification

| Check | Status | Environment / notes |
| --- | --- | --- |
| Android source project present (`android/`) | ✅ | Generated with `npx cap add android` (Capacitor 8.6.2) |
| Shortcut plugin + MainActivity intent handling written | ✅ | Compiles only once Gradle runs (see next rows) |
| Debug APK compiled | ⚠️ compiled with a placeholder web bundle (2026-11-14, Gradle 8.14.3 / AGP 8.13 / JDK 21 JBR, 1m12s) → `android/app/build/outputs/apk/debug/app-debug.apk` (4.0 MB). Shortcut plugin compiles. Rebuild with the real bundle: `node scripts/build-apk.mjs --api-base …` | |
| Installed on emulator/device | ⏳ pending | |
| Pinned shortcut cold launch opens the intended app | ⏳ pending | |
| Pinned shortcut warm launch opens the intended app | ⏳ pending | |
