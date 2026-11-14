package com.aiappstore.runtime;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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

    private static volatile AppShortcutsPlugin instance;
    private static volatile String pendingLaunchAppId;

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
        String appId = call.getString("appId");
        String label = call.getString("label");
        String iconBase64 = call.getString("iconBase64");
        if (appId == null || !APP_ID.matcher(appId).matches()) {
            call.reject("Invalid app id");
            return;
        }
        Context ctx = getContext();
        JSObject r = new JSObject();
        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(ctx)) {
            r.put("requested", false);
            r.put("supported", false);
            r.put("message", "This launcher does not support pinned shortcuts.");
            call.resolve(r);
            return;
        }
        String shortLabel = (label == null || label.trim().isEmpty()) ? "My app" : label.trim();
        if (shortLabel.length() > MAX_LABEL) shortLabel = shortLabel.substring(0, MAX_LABEL);

        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        // A distinct data URI per app keeps each shortcut's intent unique (extras are not compared).
        intent.setData(Uri.parse("aiappstore://apps/" + appId + "/"));
        intent.putExtra(EXTRA_APP_ID, appId);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        IconCompat icon = null;
        if (iconBase64 != null && !iconBase64.isEmpty()) {
            try {
                byte[] bytes = Base64.decode(iconBase64, Base64.DEFAULT);
                Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bmp != null) icon = IconCompat.createWithAdaptiveBitmap(bmp);
            } catch (IllegalArgumentException ignored) {
                // fall through to the launcher icon
            }
        }
        if (icon == null) icon = IconCompat.createWithResource(ctx, R.mipmap.ic_launcher);

        ShortcutInfoCompat info = new ShortcutInfoCompat.Builder(ctx, "app-" + appId)
                .setShortLabel(shortLabel)
                .setLongLabel(label == null ? shortLabel : label.trim())
                .setIcon(icon)
                .setIntent(intent)
                .build();
        boolean requested = ShortcutManagerCompat.requestPinShortcut(ctx, info, null);
        r.put("requested", requested);
        r.put("supported", true);
        r.put("message", requested ? "Confirm the shortcut in your launcher." : "The launcher declined the request.");
        call.resolve(r);
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
