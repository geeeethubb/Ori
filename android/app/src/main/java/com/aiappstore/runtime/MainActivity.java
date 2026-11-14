package com.aiappstore.runtime;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppShortcutsPlugin.class);
        super.onCreate(savedInstanceState);
        // Cold start from a pinned shortcut: remember the target until the web layer asks for it.
        AppShortcutsPlugin.handleLaunchIntent(getIntent(), false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Warm start (app already running, launchMode=singleTask): tell the web layer to navigate.
        AppShortcutsPlugin.handleLaunchIntent(intent, true);
    }
}
