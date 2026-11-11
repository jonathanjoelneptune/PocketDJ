package com.pocketdj.spotifyexperiment;

import android.content.Context;
import android.graphics.Rect;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageView;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import java.util.WeakHashMap;
import java.lang.ref.WeakReference;

/**
 * Attaches PocketDJ only to a proven artwork-only ImageView.
 *
 * Dynamic Spotify views differ between phone, tablet, and Now Playing layouts.
 * A candidate must be a large, visible, approximately square image in the
 * upper half of Now Playing. The exact image is moved into a two-page native
 * pager with its original parent LayoutParams. Never wrap a carousel, scroll
 * container, track-progress, or metadata parent.
 *
 * Returning false leaves Spotify's original content and the prior experimental
 * PocketDJ toggle intact as a fallback.
 */
public final class PocketDjArtworkInstaller {
    private static final String TAG = "PocketDJ-artwork";
    private static final String URL =
            "https://jonathanjoelneptune.github.io/PocketDJ/#spotify-embed";
    private static final WeakHashMap<View, WeakReference<PocketDjArtworkCarousel>> installed =
            new WeakHashMap<>();

    private PocketDjArtworkInstaller() {}

    /**
     * Must be called on the Android UI thread after native layout. It is safe
     * to call repeatedly from an OnGlobalLayoutListener; successful roots are
     * registered and never patched twice.
     */
    public static synchronized boolean maybeInstall(View anyView) {
        if (anyView == null) return false;
        View root = anyView.getRootView();
        if (root == null || root.getWidth() <= 0 || root.getHeight() <= 0) return false;

        WeakReference<PocketDjArtworkCarousel> existingRef = installed.get(root);
        PocketDjArtworkCarousel existing = existingRef == null ? null : existingRef.get();
        if (existing != null) {
            // A stale entry after an activity recreation must not hide fallback.
            if (existing.getParent() != null) return true;
            installed.remove(root);
        }
        Candidate candidate = find(root, root, null);
        if (candidate == null || candidate.view == null) return false;
        ImageView artwork = candidate.view;
        Context context = artwork.getContext();
        WebView web = null;
        try {
            web = new WebView(context);
            web.setBackgroundColor(0);
            WebSettings settings = web.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            // Use the existing Web PKCE login; never read Spotify's private
            // account tokens or cookies.
            web.setWebViewClient(new WebViewClient());
            PocketDjArtworkCarousel pager =
                    PocketDjArtworkCarousel.installVerifiedArtwork(artwork, web, true);
            if (pager == null) {
                web.destroy();
                return false;
            }
            installed.put(root, new WeakReference<>(pager));
            web.loadUrl(URL);
            Log.i(TAG, "Attached to artwork view: " + candidate.description);
            return true;
        } catch (RuntimeException e) {
            Log.w(TAG, "Unable to install, leaving Spotify layout intact", e);
            if (web != null && web.getParent() == null) web.destroy();
            return false;
        }
    }

    private static class Candidate {
        final ImageView view;
        final double score;
        final String description;
        Candidate(ImageView view, double score, String description) {
            this.view = view;
            this.score = score;
            this.description = description;
        }
    }

    private static Candidate find(View view, View root, Candidate best) {
        if (view == null || view.getVisibility() != View.VISIBLE) return best;
        if (view instanceof PocketDjArtworkCarousel) return best;
        if (view instanceof ScrollView || view instanceof SeekBar) return best;
        if (view.getClass().getName().contains("NestedScrollView")) return best;
        if (view.getClass().getName().contains("RecyclerView")) return best;
        // Exclude text and controls before any candidate scoring.
        if (view instanceof TextView) return best;

        if (view instanceof ImageView && view.getParent() instanceof ViewGroup) {
            ImageView image = (ImageView) view;
            int w = image.getWidth();
            int h = image.getHeight();
            int rw = root.getWidth();
            int rh = root.getHeight();
            if (w > rw / 3 && h > Math.min(rw, rh) / 4 &&
                    w < rw * 0.98 && h < rh * 0.80) {
                int[] pt = new int[2];
                int[] origin = new int[2];
                image.getLocationInWindow(pt);
                root.getLocationInWindow(origin);
                int x = pt[0] - origin[0];
                int y = pt[1] - origin[1];
                float ratio = (float) w / Math.max(h, 1);
                // Avoid small thumbnails, off-screen images and fullscreen
                // animated backgrounds. Must be in the artwork region.
                if (ratio >= 0.72f && ratio <= 1.38f &&
                        y >= rh * 0.055 && y < rh * 0.65 &&
                        x >= -rw * 0.05 && x < rw * 0.9) {
                    ViewGroup parent = (ViewGroup) image.getParent();
                    if (!(parent instanceof ScrollView) &&
                            !parent.getClass().getName().contains("RecyclerView") &&
                            !containsNativeControls(parent, image)) {
                        double area = (double) w * h;
                        double centered = 1.0 - Math.min(1.0,
                                Math.abs(x + w / 2.0 - rw / 2.0) / Math.max(1.0, rw));
                        // Favor cover art close to the center of the window.
                        double score = area * (0.65 + centered * 0.35);
                        String label = "image " + w + "x" + h + " at " + x + "," + y;
                        if (best == null || score > best.score) {
                            best = new Candidate(image, score, label);
                        }
                    }
                }
            }
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                best = find(group.getChildAt(i), root, best);
            }
        }
        return best;
    }

    /**
     * Refuse to replace a parent carrying any playback controls. The original
     * image leaf is kept and moved into the pager; its parent remains untouched.
     */
    private static boolean containsNativeControls(ViewGroup parent, View candidate) {
        for (int i = 0; i < parent.getChildCount(); i++) {
            View child = parent.getChildAt(i);
            if (child == candidate) continue;
            if (child instanceof SeekBar) return true;
            if (child instanceof TextView && child.getVisibility() == View.VISIBLE) return true;
            if (child.getClass().getName().contains("SeekBar")) return true;
        }
        return false;
    }
}
