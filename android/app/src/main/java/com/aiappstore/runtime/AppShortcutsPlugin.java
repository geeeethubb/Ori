package com.aiappstore.runtime;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Pinned launcher shortcuts into individual personal apps.
 *
 * - pin(): asks the launcher to pin a shortcut (the user confirms in the launcher UI; we only
 *   report whether the request was accepted, never "installed").
 * - Launch handling: a shortcut intent carries a validated app ID. On a cold start MainActivity
 *   stores it and the web layer reads it with getLaunchAppId(); when the app is already running
 *   (warm start) an "appLaunch" event is emitted. The web layer navigates only to /apps/{id}/.
 */
@CapacitorPlugin(name = "AppShortcuts")
public class AppShortcutsPlugin extends Plugin {
    static final String EXTRA_APP_ID = "com.aiappstore.runtime.APP_ID";
    private static final Pattern APP_ID = Pattern.compile("^[A-Za-z0-9_-]{8,32}$");
    private static final int MAX_LABEL = 25;

    private static final String TAG = "AppShortcuts";
    private static volatile AppShortcutsPlugin instance;
    private static volatile String pendingLaunchAppId;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject r = new JSObject();
        r.put("supported", ShortcutManagerCompat.isRequestPinShortcutSupported(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void pin(PluginCall call) {
        final String appId = call.getString("appId");
        final String label = call.getString("label");
        final String iconBase64 = call.getString("iconBase64");
        final String iconUrl = call.getString("iconUrl");
        if (appId == null || !APP_ID.matcher(appId).matches()) {
            call.reject("Invalid app id");
            return;
        }
        final Context ctx = getContext();
        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(ctx)) {
            JSObject r = new JSObject();
            r.put("requested", false);
            r.put("supported", false);
            r.put("message", "This launcher does not support pinned shortcuts.");
            call.resolve(r);
            return;
        }
        // Fetch/decode the icon off the main thread, then request the pin on the main thread.
        io.execute(() -> {
            Bitmap bmp = decodeBase64(iconBase64);
            String source = bmp != null ? "base64" : "none";
            if (bmp == null && iconUrl != null && iconUrl.startsWith("http")) {
                bmp = download(iconUrl);
                if (bmp != null) source = "url";
            }
            final Bitmap finalBmp = bmp;
            final String iconSource = source;
            getActivity().runOnUiThread(() -> {
                String shortLabel = (label == null || label.trim().isEmpty()) ? "My app" : label.trim();
                if (shortLabel.length() > MAX_LABEL) shortLabel = shortLabel.substring(0, MAX_LABEL);

                Intent intent = new Intent(ctx, MainActivity.class);
                intent.setAction(Intent.ACTION_VIEW);
                // A distinct data URI per app keeps each shortcut's intent unique (extras are not compared).
                intent.setData(Uri.parse("aiappstore://apps/" + appId + "/"));
                intent.putExtra(EXTRA_APP_ID, appId);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

                IconCompat icon = finalBmp != null
                        ? IconCompat.createWithAdaptiveBitmap(finalBmp)
                        : IconCompat.createWithResource(ctx, R.mipmap.ic_launcher);
                Log.i(TAG, "pin " + appId + " icon=" + iconSource);

                ShortcutInfoCompat info = new ShortcutInfoCompat.Builder(ctx, "app-" + appId)
                        .setShortLabel(shortLabel)
                        .setLongLabel(label == null ? shortLabel : label.trim())
                        .setIcon(icon)
                        .setIntent(intent)
                        .build();
                boolean requested = ShortcutManagerCompat.requestPinShortcut(ctx, info, null);
                JSObject r = new JSObject();
                r.put("requested", requested);
                r.put("supported", true);
                r.put("iconSource", iconSource);
                r.put("message", requested ? "Confirm the shortcut in your launcher." : "The launcher declined the request.");
                call.resolve(r);
            });
        });
    }

    private static Bitmap decodeBase64(String b64) {
        if (b64 == null || b64.isEmpty()) return null;
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Download a square PNG icon from the API server (cleartext allowed for the prototype). */
    private static Bitmap download(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setInstanceFollowRedirects(true);
            if (conn.getResponseCode() != 200) {
                Log.w(TAG, "icon download HTTP " + conn.getResponseCode() + " for " + url);
                return null;
            }
            try (InputStream in = conn.getInputStream()) {
                return BitmapFactory.decodeStream(in);
            }
        } catch (Exception e) {
            Log.w(TAG, "icon download failed: " + e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Cold-start app ID (consumed on read). */
    @PluginMethod
    public void getLaunchAppId(PluginCall call) {
        JSObject r = new JSObject();
        String id = pendingLaunchAppId;
        pendingLaunchAppId = null;
        if (id != null) r.put("appId", id); else r.put("appId", JSObject.NULL);
        call.resolve(r);
    }

    static String extractAppId(Intent intent) {
        if (intent == null) return null;
        String id = intent.getStringExtra(EXTRA_APP_ID);
        if (id == null && intent.getData() != null && "aiappstore".equals(intent.getData().getScheme())) {
            String path = intent.getData().getPath(); // "/<id>/" when host is "apps"
            if (path != null) {
                String[] parts = path.split("/");
                for (String p : parts) if (!p.isEmpty()) { id = p; break; }
            }
        }
        return (id != null && APP_ID.matcher(id).matches()) ? id : null;
    }

    /** Called by MainActivity for both cold (onCreate) and warm (onNewIntent) launches. */
    static void handleLaunchIntent(Intent intent, boolean warm) {
        String id = extractAppId(intent);
        if (id == null) return;
        AppShortcutsPlugin p = instance;
        if (warm && p != null && p.getBridge() != null) {
            JSObject data = new JSObject();
            data.put("appId", id);
            p.notifyListeners("appLaunch", data, true);
        } else {
            pendingLaunchAppId = id;
        }
    }
}
