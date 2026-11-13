package com.pocketdj.spotifyexperiment;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.graphics.Rect;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.TransitionDrawable;
import android.os.SystemClock;
import android.util.Log;
import android.view.SurfaceView;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewPropertyAnimator;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.ImageView;
import android.graphics.drawable.BitmapDrawable;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;
import java.util.WeakHashMap;

/**
 * Visually couples native album artwork and the existing persistent PocketDJ
 * WebView. The native carousel/seekbar/transport layout is never reparented.
 * Artwork-only IMAGE leaves move out as the WebView slides in, then stay hidden
 * until a return gesture. This makes the two surfaces mutually exclusive.
 *
 * This is a conservative visual bridge, NOT a full ViewPager implementation.
 * It intentionally avoids translating Spotify's tracks_carousel_view or any
 * ViewGroup, because those containers sometimes own the native seekbar.
 */
public final class SwipePageEffects {
    private static final String TAG = "PocketDJ-Pages";
    private static final long SLIDE_MS = 260L;
    private static final WeakHashMap<ViewGroup, Scene> scenes = new WeakHashMap<>();

    private static final class SavedImage {
        final WeakReference<View> view;
        final float alpha;
        final float translation;
        SavedImage(View image) {
            this.view = new WeakReference<>(image);
            this.alpha = image.getAlpha();
            this.translation = image.getTranslationX();
        }
    }
    private static final class Scene {
        final List<SavedImage> images = new ArrayList<>();
        boolean transitioning;
        long lastUpdateMs;
        Drawable originalBackdrop;
        boolean backdropSaved;
        ImageView artworkGhost;
    }
    private SwipePageEffects() {}

    private static Scene scene(ViewGroup host) {
        Scene state = scenes.get(host);
        if (state == null) {
            state = new Scene();
            scenes.put(host, state);
        }
        return state;
    }

    public static synchronized boolean busy(ViewGroup host) {
        Scene state = scenes.get(host);
        return state != null && state.transitioning;
    }

    /**
     * The WebView and Spotify artwork must both exist during the 260ms swap.
     * A temporary, artwork-only bitmap proxy survives Spotify recycling or
     * hiding its ImageView when the existing toggle is clicked. Do not copy
     * the entire Now Playing root: it includes controls and metadata.
     */
    public static synchronized boolean flip(ViewGroup host, Button toggle,
                                            WebView web, boolean show, int direction) {
        if (toggle == null || busy(host)) return false;
        final Scene state = scene(host);
        final int sign = direction < 0 ? -1 : 1;
        final float distance = Math.max(1f, web == null || web.getWidth() <= 0
                ? host.getWidth() : web.getWidth());
        state.transitioning = true;
        if (show) {
            findAndRememberArtwork(host, state);
            // Create the outgoing proxy BEFORE the native toggle can recycle
            // or instantly hide Spotify's artwork leaf.
            ImageView proxy = createArtworkProxy(host, state);
            darkenRootBackground(host, state);
            if (!toggle.performClick()) {
                disposeProxy(host, state);
                restoreRootBackground(host, state);
                state.transitioning = false;
                return false;
            }
            if (web != null && web.getVisibility() == View.VISIBLE) {
                web.animate().cancel();
                web.setTranslationX(-sign * distance);
                web.animate().translationX(0f).setDuration(SLIDE_MS).start();
            }
            // Native artwork is hidden immediately; only the proxy moves.
            // This avoids races with RecyclerView replacement/layout passes.
            for (SavedImage image : state.images) {
                View v = image.view.get();
                if (v != null && v.getParent() != null) {
                    v.animate().cancel();
                    v.setAlpha(0f);
                    v.setTranslationX(image.translation);
                }
            }
            if (proxy != null) {
                proxy.animate().translationX(sign * distance)
                        .setDuration(SLIDE_MS).start();
            }
            host.postDelayed(() -> {
                synchronized (SwipePageEffects.class) {
                    disposeProxy(host, state);
                    state.transitioning = false;
                    reconcile(host, true);
                }
            }, SLIDE_MS + 30L);
        } else {
            // While the WebView still occupies its native position, move a
            // temporary image of the artwork into view. Calling the toggle at
            // the start would hide the room before its exit animation.
            findAndRememberArtwork(host, state);
            ImageView proxy = createArtworkProxy(host, state);
            if (proxy != null) {
                proxy.setTranslationX(-sign * distance);
                proxy.animate().translationX(0f).setDuration(SLIDE_MS).start();
            }
            if (web != null && web.getVisibility() == View.VISIBLE) {
                web.animate().cancel();
                web.animate().translationX(sign * distance)
                        .setDuration(SLIDE_MS).start();
            }
            host.postDelayed(() -> {
                synchronized (SwipePageEffects.class) {
                    // Reveal the real native page only after its proxy reaches
                    // the destination, so there is no one-frame artwork pop.
                    toggle.performClick();
                    restoreArtworkImmediately(state);
                    if (web != null) web.setTranslationX(0f);
                    restoreRootBackground(host, state);
                    disposeProxy(host, state);
                    state.transitioning = false;
                }
            }, SLIDE_MS);
        }
        return true;
    }

    private static ImageView createArtworkProxy(ViewGroup host, Scene state) {
        disposeProxy(host, state);
        for (int i = state.images.size() - 1; i >= 0; i--) {
            View artwork = state.images.get(i).view.get();
            if (!(artwork instanceof ImageView) || artwork.getParent() == null ||
                    artwork.getWidth() < 80 || artwork.getHeight() < 80 ||
                    artwork.getWidth() > 2048 || artwork.getHeight() > 2048) continue;
            try {
                // draw() uses the leaf drawable, not Spotify's composite page.
                // Temporarily neutralize alpha solely for bitmap capture.
                float originalAlpha = artwork.getAlpha();
                Bitmap bitmap = Bitmap.createBitmap(artwork.getWidth(),
                        artwork.getHeight(), Bitmap.Config.ARGB_8888);
                try {
                    artwork.setAlpha(1f);
                    artwork.draw(new Canvas(bitmap));
                } finally {
                    artwork.setAlpha(originalAlpha);
                }
                int[] position = new int[2];
                int[] origin = new int[2];
                artwork.getLocationOnScreen(position);
                host.getLocationOnScreen(origin);
                ImageView proxy = new ImageView(host.getContext());
                proxy.setImageDrawable(new BitmapDrawable(host.getResources(), bitmap));
                proxy.setScaleType(ImageView.ScaleType.FIT_XY);
                proxy.layout(position[0] - origin[0], position[1] - origin[1],
                        position[0] - origin[0] + artwork.getWidth(),
                        position[1] - origin[1] + artwork.getHeight());
                host.getOverlay().add(proxy);
                state.artworkGhost = proxy;
                return proxy;
            } catch (RuntimeException ex) {
                Log.w(TAG, "Artwork proxy unavailable; preserving native fallback", ex);
            }
        }
        return null;
    }

    private static void disposeProxy(ViewGroup host, Scene state) {
        if (state.artworkGhost != null) {
            state.artworkGhost.animate().cancel();
            host.getOverlay().remove(state.artworkGhost);
            state.artworkGhost = null;
        }
    }

    private static void restoreArtworkImmediately(Scene state) {
        for (SavedImage image : state.images) {
            View v = image.view.get();
            if (v != null) {
                v.animate().cancel();
                v.setAlpha(image.alpha);
                v.setTranslationX(image.translation);
            }
        }
        state.images.clear();
    }

    /** Hide newly recycled album leaves while PocketDJ is visible. */
    public static synchronized void reconcile(ViewGroup host, boolean roomShown) {
        Scene state = scene(host);
        if (state.transitioning) return;
        if (!roomShown) return;
        long now = SystemClock.uptimeMillis();
        if (now - state.lastUpdateMs < 140) return;
        state.lastUpdateMs = now;
        findAndRememberArtwork(host, state);
        for (SavedImage image : state.images) {
            View v = image.view.get();
            if (v != null && v.getParent() != null) {
                v.animate().cancel();
                v.setAlpha(0f);
                v.setTranslationX(image.translation);
            }
        }
    }

    /** Return every original image to the exact state found before PocketDJ. */
    public static synchronized void restoreAll(ViewGroup host) {
        Scene state = scenes.remove(host);
        if (state == null) return;
        restoreRootBackground(host, state);
        disposeProxy(host, state);
        for (SavedImage image : state.images) {
            View v = image.view.get();
            if (v != null) {
                v.animate().cancel();
                v.setAlpha(image.alpha);
                v.setTranslationX(image.translation);
            }
        }
    }

    /**
     * Tint only the native root BACKGROUND drawable, never its children.
     * Spotify's native text, seeking, transport, and page scroll stay above it.
     * If Spotify owns its gradient in a separate child, do not risk hiding that
     * child: the native tint is intentionally best effort.
     */
    private static void darkenRootBackground(ViewGroup host, Scene state) {
        if (state.backdropSaved) return;
        state.originalBackdrop = host.getBackground();
        state.backdropSaved = true;
        Drawable from = state.originalBackdrop != null
                ? state.originalBackdrop : new ColorDrawable(Color.TRANSPARENT);
        TransitionDrawable fade = new TransitionDrawable(new Drawable[] {
                from, new ColorDrawable(Color.BLACK)
        });
        fade.setCrossFadeEnabled(true);
        host.setBackground(fade);
        fade.startTransition(320);
    }

    private static void restoreRootBackground(ViewGroup host, Scene state) {
        if (!state.backdropSaved) return;
        host.setBackground(state.originalBackdrop);
        state.originalBackdrop = null;
        state.backdropSaved = false;
    }

    private static void restoreArtwork(Scene state, int sign, float distance) {
        for (SavedImage image : state.images) {
            final View v = image.view.get();
            if (v == null || v.getParent() == null) continue;
            v.animate().cancel();
            v.setAlpha(image.alpha);
            v.setTranslationX(image.translation - sign * distance);
            v.animate().translationX(image.translation).setDuration(SLIDE_MS).start();
        }
        state.images.clear();
    }

    private static void findAndRememberArtwork(ViewGroup host, Scene state) {
        final Rect artwork = SwipeRouter.nativeArtworkRect(host);
        if (artwork == null) return;
        List<View> result = new ArrayList<>();
        collectImages(host, artwork, result, 0);
        for (View candidate : result) {
            boolean known = false;
            for (SavedImage existing : state.images) {
                if (existing.view.get() == candidate) { known = true; break; }
            }
            if (!known) state.images.add(new SavedImage(candidate));
        }
        if (state.images.isEmpty()) Log.d(TAG, "No album image leaf; leaving Spotify hierarchy untouched");
    }

    private static void collectImages(View view, Rect artwork, List<View> out, int depth) {
        if (depth > 22 || view == null || view.getVisibility() != View.VISIBLE) return;
        if (view instanceof WebView) return;
        if (view instanceof ImageView) {
            Rect r = new Rect();
            if (view.getGlobalVisibleRect(r) &&
                    r.width() >= Math.min(artwork.width() * 0.52f, 180f) &&
                    r.height() >= Math.min(artwork.height() * 0.52f, 180f)) {
                Rect overlap = new Rect(r);
                if (overlap.intersect(artwork) &&
                        overlap.width() * overlap.height() >= r.width() * r.height() * 0.65f &&
                        out.size() < 8) out.add(view);
            }
            return;
        }
        // Never mutate or move video surfaces: Spotify's Content and display
        // settings control them, and surface lifecycle is independent of audio.
        if (view instanceof SurfaceView || view instanceof TextureView) return;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup)view;
            for (int i = 0; i < group.getChildCount(); i++) {
                collectImages(group.getChildAt(i), artwork, out, depth + 1);
            }
        }
    }
}