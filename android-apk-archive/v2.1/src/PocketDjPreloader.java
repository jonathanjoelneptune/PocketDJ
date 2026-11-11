package com.pocketdj.spotifyexperiment;

import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import java.lang.ref.WeakReference;

/**
 * Build and load PocketDJ after Spotify's native Now Playing view measures,
 * while native artwork is still on screen. The existing v1.6 Hook owns
 * the WebView; we simply exercise the same show/hide path once before the
 * user's first swipe. Keeping it invisible lets the browser load and warm
 * the sprite cache without intercepting Spotify touches.
 */
public final class PocketDjPreloader {
    public PocketDjPreloader() {}
    public void schedule(View hook) {
        final WeakReference<View> weak = new WeakReference<>(hook);
        hook.post(() -> {
            View root = weak.get();
            if (root == null || !root.isAttachedToWindow()) return;
            if (containsWebView(root)) return; // Already created: never reload.
            Button button = findToggle(root);
            if (button != null && "PocketDJ".contentEquals(button.getText())) {
                button.performClick(); // Creates/configures and starts web load.
                button.performClick(); // Keeps album art visible while loading.
            }
        });
    }
    private static boolean containsWebView(View view) {
        if (view instanceof WebView) return true;
        if (!(view instanceof ViewGroup)) return false;
        ViewGroup group = (ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i++) {
            if (containsWebView(group.getChildAt(i))) return true;
        }
        return false;
    }
    private static Button findToggle(View view) {
        if (view instanceof Button && "PocketDJ".contentEquals(((Button) view).getText())) {
            return (Button) view;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                Button result = findToggle(group.getChildAt(i));
                if (result != null) return result;
            }
        }
        return null;
    }
}