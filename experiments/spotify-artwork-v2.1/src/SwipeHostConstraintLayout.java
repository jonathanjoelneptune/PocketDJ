package com.pocketdj.spotifyexperiment;

import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;
import androidx.constraintlayout.widget.ConstraintLayout;

/** Unfolded / dual-pane Now Playing root; intercepts BEFORE the artwork pager. */
public final class SwipeHostConstraintLayout extends ConstraintLayout {
    public SwipeHostConstraintLayout(Context c, AttributeSet a) { super(c,a); }

    @Override protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        super.onLayout(changed, left, top, right, bottom);
        SwipeRouter.afterLayout(this);
    }

    @Override protected void onDetachedFromWindow() {
        SwipeRouter.onDetached(this);
        super.onDetachedFromWindow();
    }

    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        int result=SwipeRouter.route(this,event);
        if(result==SwipeRouter.CONSUME) return true;
        if(result==SwipeRouter.SHOW_ROOM) return SwipeRouter.activate(this,true);
        if(result==SwipeRouter.HIDE_ROOM) return SwipeRouter.activate(this,false);
        if(result==SwipeRouter.REPLAY_DOWN) {
            MotionEvent down=SwipeRouter.syntheticDown(this,event);
            if(down!=null) { super.dispatchTouchEvent(down); down.recycle(); }
        }
        return super.dispatchTouchEvent(event);
    }
}