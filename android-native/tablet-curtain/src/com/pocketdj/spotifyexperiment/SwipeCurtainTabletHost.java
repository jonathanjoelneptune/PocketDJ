package com.pocketdj.spotifyexperiment;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.util.AttributeSet;
import android.util.Log;
import android.view.MotionEvent;
import android.view.ViewGroup;
import androidx.constraintlayout.widget.ConstraintLayout;

/**
 * Tablet-only visual shutter on top of the existing, unchanged native carousel.
 *
 * We do not search for an album-art ImageView, move a native Spotify view,
 * snapshot a bitmap, or replace the working SwipeRouter/SwipePageEffects code.
 * The curtain covers the artwork during the native page switch and is removed.
 * It is never added as a real view and cannot intercept playback controls.
 *
 * The phone XML still uses SwipeHostFrameLayout from classes19.dex.
 */
public final class SwipeCurtainTabletHost extends ConstraintLayout {
    private static final String TAG = "PocketDJ-Curtain";
    private static final long COVER_MS = 100L;
    private static final long NATIVE_SETTLE_MS = 300L; // v3.3.33 native slide: 260ms + 30ms cleanup
    private static final long UNCOVER_MS = 100L;
    private float downX;
    private boolean transitioning;
    private int generation;
    private int priorWidth, priorHeight;
    private ColorDrawable curtain;
    private ValueAnimator animator;
    private Runnable stage;

    public SwipeCurtainTabletHost(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        super.onLayout(changed, left, top, right, bottom);
        int width = getWidth(), height = getHeight();
        if (transitioning && (priorWidth != width || priorHeight != height)) stopCurtain();
        priorWidth = width;
        priorHeight = height;
        SwipeRouter.afterLayout(this);
    }

    @Override
    protected void onDetachedFromWindow() {
        stopCurtain();
        SwipeRouter.onDetached(this);
        super.onDetachedFromWindow();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (transitioning) return true;
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) downX = event.getX();
        int result = SwipeRouter.route(this, event);
        if (result == SwipeRouter.CONSUME) return true;
        if (result == SwipeRouter.SHOW_ROOM || result == SwipeRouter.HIDE_ROOM) {
            int direction = event.getX() < downX ? -1 : 1;
            return beginCurtain(result == SwipeRouter.SHOW_ROOM, direction);
        }
        if (result == SwipeRouter.OPEN_DEVELOPER)
            return SwipeRouter.openDeveloper(this);
        if (result == SwipeRouter.REPLAY_DOWN) {
            MotionEvent down = SwipeRouter.syntheticDown(this, event);
            if (down != null) {
                super.dispatchTouchEvent(down);
                down.recycle();
            }
        }
        return super.dispatchTouchEvent(event);
    }

    private boolean beginCurtain(boolean show, int direction) {
        if (SwipePageEffects.busy(this)) return true;
        if (transitioning) return true;
        final Rect viewport = artworkViewport();
        if (viewport == null) return SwipeRouter.activate(this, show);
        transitioning = true;
        final int token = ++generation;
        final int width = viewport.width();
        final int from = -direction * width;
        curtain = new ColorDrawable(Color.rgb(9, 12, 19));
        getOverlay().add(curtain);
        moveCurtain(viewport, from);
        Log.d(TAG, "Beginning curtain: show=" + show + " viewport=" + viewport.toShortString());
        animateCurtain(viewport, from, 0, COVER_MS, token, () -> {
            if (generation != token || !isAttachedToWindow()) return;
            boolean activated;
            try {
                activated = SwipeRouter.activate(this, show);
            } catch (RuntimeException exception) {
                Log.e(TAG, "Native carousel switch failed", exception);
                stopCurtain();
                return;
            }
            if (!activated) {
                stopCurtain();
                return;
            }
            stage = () -> {
                if (generation != token || !isAttachedToWindow()) return;
                animateCurtain(viewport, 0, direction * width, UNCOVER_MS, token,
                        this::stopCurtain);
            };
            postDelayed(stage, NATIVE_SETTLE_MS);
        });
        return true;
    }

    /** Restrict the opaque transition to album art and title region, not the controls. */
    private Rect artworkViewport() {
        int w = getWidth(), h = getHeight();
        if (w < 120 || h < 150) return null;
        int top = Math.max(0, Math.round(h * 0.06f));
        int bottom = Math.min(h, Math.round(h * 0.72f));
        if (bottom <= top + 100) return null;
        return new Rect(0, top, w, bottom);
    }

    private void moveCurtain(Rect base, int offsetX) {
        if (curtain == null) return;
        Rect moved = new Rect(base);
        moved.offset(offsetX, 0);
        curtain.setBounds(moved);
        invalidate();
    }

    private void animateCurtain(Rect viewport, int from, int to, long duration, int token,
                                Runnable done) {
        ValueAnimator next = ValueAnimator.ofInt(from, to);
        animator = next;
        next.setDuration(duration);
        next.addUpdateListener(a -> {
            if (generation != token || animator != next) return;
            moveCurtain(viewport, (Integer) a.getAnimatedValue());
        });
        next.addListener(new AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(Animator animation) {
                if (generation != token || animator != next) return;
                animator = null;
                done.run();
            }
        });
        next.start();
    }

    private void stopCurtain() {
        generation++;
        transitioning = false;
        if (stage != null) { removeCallbacks(stage); stage = null; }
        ValueAnimator current = animator;
        animator = null;
        if (current != null) current.cancel();
        if (curtain != null) { getOverlay().remove(curtain); curtain = null; }
    }
}