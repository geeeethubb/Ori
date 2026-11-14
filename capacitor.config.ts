import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Shared Android runtime. The web bundle is packaged once; each personal app is reached through
 * a pinned launcher shortcut that carries a validated app ID (see android/.../AppShortcutsPlugin).
 * Server secrets never live in this bundle; the API base URL is baked at build time via
 * VITE_API_BASE_URL and can be overridden in the app's settings.
 */
const config: CapacitorConfig = {
  appId: 'com.aiappstore.runtime',
  // Temporary label until the product name is chosen (shared/brand.ts); the package id stays stable.
  appName: 'Your Playground',
  // scripts/build-apk.mjs builds a separate bundle (with the API base baked in) into dist/android so
  // the browser bundle in dist/client never carries a phone-only API address.
  webDir: process.env.AAS_ANDROID_WEBDIR ?? 'dist/client',
  server: {
    // http origin + cleartext so the shell can talk to a LAN/emulator-host server during the
    // prototype (http://10.0.2.2:8787 on the emulator). A production deployment uses HTTPS.
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
