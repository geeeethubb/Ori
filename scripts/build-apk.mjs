#!/usr/bin/env node
/**
 * Build the debug APK for the shared Android runtime.
 *   node scripts/build-apk.mjs [--api-base https://your-server.example]
 * Finds a JDK (JAVA_HOME, or Android Studio's bundled JBR) and the Android SDK (ANDROID_HOME /
 * ANDROID_SDK_ROOT / %LOCALAPPDATA%\Android\Sdk), builds the web bundle with VITE_API_BASE_URL,
 * syncs Capacitor, runs Gradle, and prints the APK path. Never prints secrets.
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const apiBaseIdx = args.indexOf('--api-base');
const apiBase = apiBaseIdx >= 0 ? args[apiBaseIdx + 1] : process.env.VITE_API_BASE_URL ?? '';

function findJava() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const candidates = [
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr',
    '/usr/lib/jvm/java-21-openjdk-amd64',
  ];
  return candidates.find((c) => fs.existsSync(c));
}

function findSdk() {
  for (const v of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) if (v && fs.existsSync(v)) return v;
  const candidates = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c));
}

const java = findJava();
const sdk = findSdk();
if (!java) { console.error('No JDK found. Install Android Studio (bundles JDK 21) or set JAVA_HOME.'); process.exit(2); }
if (!sdk) { console.error('No Android SDK found. Install it with Android Studio or set ANDROID_HOME.'); process.exit(2); }
if (!apiBase) {
  console.warn('WARNING: VITE_API_BASE_URL / --api-base not set. The APK will try same-origin API calls, which do not work inside the shell. Pass --api-base http://<laptop-lan-ip>:8787 (emulator: http://10.0.2.2:8787).');
}

console.log(`JDK: ${java}\nSDK: ${sdk}\nAPI base baked into the bundle: ${apiBase || '(none)'}`);
fs.writeFileSync(path.join(root, 'android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`);

const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, VITE_API_BASE_URL: apiBase, AAS_ANDROID_WEBDIR: 'dist/android', PATH: `${path.join(java, 'bin')}${path.delimiter}${process.env.PATH}` };
const run = (cmd, cwd = root) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd, env, shell: true });
};

run('npx vite build --outDir ../dist/android --emptyOutDir'); // separate from the browser bundle in dist/client
run('npx cap sync android');
// Absolute path: some Windows shells do not resolve a bare .bat from the current directory.
const gradlew = path.join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const gradle = spawnSync(`"${gradlew}"`, ['assembleDebug', '--no-daemon', '--console=plain'], { cwd: path.join(root, 'android'), env, stdio: 'inherit', shell: true });
if (gradle.status !== 0) { console.error(`\nGradle failed with status ${gradle.status}.`); process.exit(gradle.status ?? 1); }

const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (fs.existsSync(apk)) {
  const kb = Math.round(fs.statSync(apk).size / 1024);
  console.log(`\nAPK built: ${apk} (${kb} KB)`);
  console.log('Install on a connected device/emulator: adb install -r "' + apk + '"');
} else {
  console.error('Gradle finished but the APK was not found at the expected path.');
  process.exit(1);
}
