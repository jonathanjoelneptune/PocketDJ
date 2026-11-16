package com.pocketdj.spotifyexperiment;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.graphics.drawable.BitmapDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import java.util.WeakHashMap;

/**
 * Tablet-only peer-surface animator. Copies the *rendered artwork viewport*,
 * not a guessed native ImageView, before Spotify's toggle hides/recycles it.
 * The snapshot moves opposite the persistent PocketDJ WebView. Neither native
 * playback controls nor Spotify's artwork container are reparented/moved.
 *
 * PixelCopy handles Compose/Texture/Surface-backed artwork when available.
 * A bounded View.draw fallback is used if capture is unsupported/unavailable.
 * Capture is always finished before SwipeRouter.activate() hides artwork.
 */
public final class TabletCarouselAnimator {
    private static final String TAG = "PocketDJ-TabletCarousel";
    private static final long SLIDE_MS = 260L; // Match v3.3.33 SwipePageEffects.
    private static final long CAPTURE_TIMEOUT_MS = 180L;
    private static final int MAX_BITMAP_EDGE = 1200;
    private static final WeakHashMap<ViewGroup, State> states = new WeakHashMap<>();
    private static final Handler main = new Handler(Looper.getMainLooper());

    private static final class State {
        Bitmap cachedArtwork;
        BitmapDrawable overlay;
        ValueAnimator animation;
        Rect localRect;
        boolean capturing;
        int token;
        int width, height;
    }

    private TabletCarouselAnimator() {}

    private static State state(ViewGroup host) {
        State state = states.get(host);
        if (state == null) {
            state = new State();
            state.width = host.getWidth();
            state.height = host.getHeight();
            states.put(host, state);
        }
        return state;
    }

    static boolean isCapturing(ViewGroup host) {
        State state = states.get(host);
        return state != null && state.capturing;
    }

    static void onLayout(ViewGroup host) {
        State state = states.get(host);
        if (state == null) return;
        if (state.width != host.getWidth() || state.height != host.getHeight()) {
            // A fold or rotation invalidates screenshot coordinates. Discard
            // snapshots rather than showing album art in the wrong viewport.
            state.token++;
            state.capturing = false;
            stopOverlay(host, state);
            clearCache(state);
            state.width = host.getWidth();
            state.height = host.getHeight();
        }
    }

    static void onDetached(ViewGroup host) {
        State state = states.remove(host);
        if (state == null) return;
        state.token++;
        state.capturing = false;
        stopOverlay(host, state);
        clearCache(state);
    }

    static boolean transition(ViewGroup host, boolean show, int direction) {
        if (SwipePageEffects.busy(host)) return true;
        State state = state(host);
        if (state.capturing || state.animation != null) return true;
        final int sign = direction < 0 ? -1 : 1;
        if (!show) return hide(host, state, sign);

        WebView room = findPocketDjWebView(host, 0);
        Rect bounds = room == null ? null : viewportInsideHost(host, room);
        if (bounds == null || bounds.width() < 100 || bounds.height() < 100) {
            Log.w(TAG, "No stable tablet viewport; using original carousel");
            return SwipeRouter.activate(host, true);
        }

        // Snapshot happens BEFORE toggle, so Spotify cannot recycle/hide the
        // source page while PixelCopy is reading it. Never block the UI thread.
        stopOverlay(host, state);
        clearCache(state);
        state.capturing = true;
        state.localRect = bounds;
        final int token = ++state.token;
        final Rect captureRect = new Rect(bounds);
        final Runnable fallback = () -> {
            if (!isCurrent(host, state, token)) return;
            Bitmap image = captureFromHost(host, captureRect);
            completeShow(host, state, token, image, sign);
        };
        main.postDelayed(fallback, CAPTURE_TIMEOUT_MS);
        if (!requestWindowCapture(host, captureRect, image -> {
            main.removeCallbacks(fallback);
            if (!isCurrent(host, state, token)) {
                if (image != null) image.recycle();
                return;
            }
            if (image == null) image = captureFromHost(host, captureRect);
            completeShow(host, state, token, image, sign);
        })) {
            main.removeCallbacks(fallback);
            fallback.run();
        }
        return true;
    }

    private interface CaptureResult { void onCaptured(Bitmap image); }

    private static boolean requestWindowCapture(ViewGroup host, Rect local, CaptureResult callback) {
        if (Build.VERSION.SDK_INT < 26 || !host.isAttachedToWindow()) return false;
        Activity activity = unwrapActivity(host.getContext());
        if (activity == null || activity.getWindow() == null) return false;
        int[] xy = new int[2];
        host.getLocationInWindow(xy);
        Rect src = new Rect(local);
        src.offset(xy[0], xy[1]);
        View decor = activity.getWindow().getDecorView();
        if (decor == null || src.left < 0 || src.top < 0 ||
                src.right > decor.getWidth() || src.bottom > decor.getHeight()) return false;
        Bitmap bitmap = createBitmap(src.width(), src.height());
        if (bitmap == null) return false;
        try {
            PixelCopy.request(activity.getWindow(), src, bitmap, result -> {
                if (result == PixelCopy.SUCCESS) callback.onCaptured(bitmap);
                else {
                    bitmap.recycle();
                    callback.onCaptured(null);
                }
            }, main);
            return true;
        } catch (RuntimeException ex) {
            bitmap.recycle();
            Log.w(TAG, "PixelCopy unavailable; falling back to View.draw", ex);
            return false;
        }
    }

    private static Bitmap createBitmap(int w, int h) {
        if (w <= 0 || h <= 0) return null;
        float scale = Math.min(1f, (float) MAX_BITMAP_EDGE / Math.max(w, h));
        try {
            return Bitmap.createBitmap(Math.max(1, Math.round(w * scale)),
                    Math.max(1, Math.round(h * scale)), Bitmap.Config.ARGB_8888);
        } catch (OutOfMemoryError error) {
            Log.w(TAG, "Artwork snapshot allocation failed", error);
            return null;
        }
    }

    private static Bitmap captureFromHost(ViewGroup host, Rect local) {
        Bitmap bitmap = createBitmap(local.width(), local.height());
        if (bitmap == null) return null;
        try {
            Canvas canvas = new Canvas(bitmap);
            canvas.scale(bitmap.getWidth() / (float) local.width(),
                    bitmap.getHeight() / (float) local.height());
            canvas.translate(-local.left, -local.top);
            canvas.clipRect(local);
            host.draw(canvas);
            return bitmap;
        } catch (RuntimeException exception) {
            bitmap.recycle();
            Log.w(TAG, "View.draw snapshot failed", exception);
            return null;
        }
    }

    private static void completeShow(ViewGroup host, State state, int token, Bitmap artwork, int sign) {
        if (!isCurrent(host, state, token)) {
            if (artwork != null) artwork.recycle();
            return;
        }
        state.capturing = false;
        state.cachedArtwork = artwork;
        boolean activated = SwipeRouter.activate(host, true);
        if (!activated) {
            clearCache(state);
            return;
        }
        if (artwork != null) slideSnapshot(host, state, 0f, sign * slideDistance(state), false);
        Log.d(TAG, "Show room: snapshot=" + (artwork != null) + " viewport=" + state.localRect);
    }

    private static boolean hide(ViewGroup host, State state, int sign) {
        boolean hasSnapshot = state.cachedArtwork != null && !state.cachedArtwork.isRecycled()
                && state.localRect != null;
        if (hasSnapshot) installOverlay(host, state);
        boolean activated = SwipeRouter.activate(host, false);
        if (!activated) {
            stopOverlay(host, state);
            return false;
        }
        if (hasSnapshot) slideSnapshot(host, state, -sign * slideDistance(state), 0f, true);
        else clearCache(state);
        Log.d(TAG, "Return to album: snapshot=" + hasSnapshot);
        return true;
    }

    private static float slideDistance(State state) {
        return state.localRect == null ? 1f : Math.max(1f, state.localRect.width());
    }

    private static void slideSnapshot(ViewGroup host, State state,
                                      float fromX, float toX, boolean releaseAtEnd) {
        if (state.cachedArtwork == null || state.localRect == null) return;
        installOverlay(host, state);
        final int token = state.token;
        final BitmapDrawable drawable = state.overlay;
        ValueAnimator animator = ValueAnimator.ofFloat(fromX, toX);
        state.animation = animator;
        animator.setDuration(SLIDE_MS);
        animator.addUpdateListener(value -> {
            if (state.token != token || state.overlay != drawable) return;
            float x = (Float) value.getAnimatedValue();
            Rect rect = new Rect(state.localRect);
            rect.offset(Math.round(x), 0);
            drawable.setBounds(rect);
            host.invalidate();
        });
        animator.addListener(new AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(Animator animation) {
                if (state.token != token || state.animation != animator) return;
                state.animation = null;
                host.getOverlay().remove(drawable);
                state.overlay = null;
                if (releaseAtEnd) clearCache(state);
            }
        });
        animator.start();
    }

    private static void installOverlay(ViewGroup host, State state) {
        if (state.overlay != null || state.cachedArtwork == null) return;
        BitmapDrawable drawable = new BitmapDrawable(host.getResources(), state.cachedArtwork);
        drawable.setFilterBitmap(true);
        drawable.setBounds(state.localRect);
        state.overlay = drawable;
        host.getOverlay().add(drawable);
    }

    private static void stopOverlay(ViewGroup host, State state) {
        ValueAnimator anim = state.animation;
        state.animation = null;
        if (anim != null) anim.cancel();
        if (state.overlay != null) {
            host.getOverlay().remove(state.overlay);
            state.overlay = null;
        }
    }

    private static void clearCache(State state) {
        if (state.cachedArtwork != null && !state.cachedArtwork.isRecycled())
            state.cachedArtwork.recycle();
        state.cachedArtwork = null;
    }

    private static boolean isCurrent(ViewGroup host, State state, int token) {
        return states.get(host) == state && state.token == token && state.capturing
                && host.isAttachedToWindow();
    }

    private static Activity unwrapActivity(Context context) {
        for (int depth = 0; depth < 12 && context != null; depth++) {
            if (context instanceof Activity) return (Activity) context;
            if (!(context instanceof ContextWrapper)) return null;
            Context next = ((ContextWrapper) context).getBaseContext();
            if (next == context) return null;
            context = next;
        }
        return null;
    }

    private static WebView findPocketDjWebView(View view, int depth) {
        if (view == null || depth > 24) return null;
        if (view instanceof WebView) {
            // The injected WebView is hosted under com.pocketdj.Hook; don't
            // accidentally capture a Spotify-owned web advertisement or login.
            View parent = view;
            for (int i = 0; i < 8 && parent != null; i++) {
                if (parent.getClass().getName().equals("com.pocketdj.Hook")) return (WebView) view;
                if (!(parent.getParent() instanceof View)) break;
                parent = (View) parent.getParent();
            }
            return null;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView candidate = findPocketDjWebView(group.getChildAt(i), depth + 1);
                if (candidate != null) return candidate;
            }
        }
        return null;
    }

    private static Rect viewportInsideHost(ViewGroup host, WebView web) {
        if (web.getWidth() < 100 || web.getHeight() < 100) return null;
        int[] hostXY = new int[2], webXY = new int[2];
        host.getLocationInWindow(hostXY);
        web.getLocationInWindow(webXY);
        Rect r = new Rect(webXY[0] - hostXY[0], webXY[1] - hostXY[1],
                webXY[0] - hostXY[0] + web.getWidth(),
                webXY[1] - hostXY[1] + web.getHeight());
        if (!r.intersect(0, 0, host.getWidth(), host.getHeight())) return null;
        return r;
    }
}