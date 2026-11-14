package com.pocketdj.spotifyexperiment;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;
import androidx.constraintlayout.widget.ConstraintLayout;

/**
 * Tablet-only replacement for SwipeHostConstraintLayout in activity_now_playing_duo.xml.
 *
 * Uses the UNMODIFIED v3.3.33 SwipeRouter to preserve gesture ownership,
 * Spotify controls, PocketDJ login, and the phone carousel. The only new
 * responsibility is a temporary album-art overlay during tablet page changes.
 * This class does not alter the shared SwipePageEffects or SwipeRouter DEX.
 */
public final class TabletCarouselHost extends ConstraintLayout {
    private float downX;

    public TabletCarouselHost(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        super.onLayout(changed, left, top, right, bottom);
        TabletCarouselAnimator.onLayout(this);
        SwipeRouter.afterLayout(this);
    }

    @Override
    protected void onDetachedFromWindow() {
        TabletCarouselAnimator.onDetached(this);
        SwipeRouter.onDetached(this);
        super.onDetachedFromWindow();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (TabletCarouselAnimator.isCapturing(this)) return true;
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) downX = event.getX();
        int result = SwipeRouter.route(this, event);
        if (result == SwipeRouter.CONSUME) return true;
        if (result == SwipeRouter.SHOW_ROOM || result == SwipeRouter.HIDE_ROOM) {
            int direction = event.getX() < downX ? -1 : 1;
            return TabletCarouselAnimator.transition(this,
                    result == SwipeRouter.SHOW_ROOM, direction);
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
}
