package com.pocketdj.spotifyexperiment;

import android.graphics.Rect;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.webkit.WebView;
import java.util.WeakHashMap;

/**
 * Captures only horizontal artwork-page gestures *before* Spotify's native
 * swipe-to-skip carousel sees ACTION_DOWN. Non-artwork touches are forwarded
 * untouched. Vertical gestures, ordinary taps and opposite-direction swipes
 * are replayed with a synthetic original ACTION_DOWN and handed back to Spotify.
 *
 * This does not mutate/reparent any Spotify native view. It intentionally
 * reuses the existing v1.6 WebView and toggle as a safe first-stage gesture
 * bridge while we verify the native artwork hierarchy on physical devices.
 */
public final class SwipeRouter {
    private static final String TAG = "PocketDJ-Swipe";
    public static final int FORWARD = 0;
    public static final int CONSUME = 1;
    public static final int REPLAY_DOWN = 2;
    public static final int SHOW_ROOM = 3;
    public static final int HIDE_ROOM = 4;
    private static final int CAROUSEL_ID = 0x7f0b1043; // tracks_carousel_view
    private static final WeakHashMap<ViewGroup, Gesture> states = new WeakHashMap<>();
    private static final class Gesture {
        float x, y;
        long start;
        int mode; // 0 inactive, 1 pending, 2 own swipe, 3 delegate native
        boolean roomInitiallyShown;
    }
    private static final class ArtworkBounds {
        Rect rect;
        int score;
        ArtworkBounds(Rect rect, int score) { this.rect = rect; this.score = score; }
    }
    private SwipeRouter() {}

    public static synchronized int route(ViewGroup host, MotionEvent e) {
        if (host == null || e == null) return FORWARD;
        int action = e.getActionMasked();
        Gesture state = states.get(host);
        if (state == null) {
            state = new Gesture();
            states.put(host, state);
        }
        if (action == MotionEvent.ACTION_DOWN) {
            state.mode = 0;
            View target = locateGestureTarget(host);
            if (target == null) return FORWARD;
            Rect art = artworkRect(host, target);
            if (art == null || !art.contains((int)e.getRawX(), (int)e.getRawY())) return FORWARD;
            state.x = e.getX();
            state.y = e.getY();
            state.start = e.getDownTime();
            state.roomInitiallyShown = isRoomShown(host);
            state.mode = 1;
            // Capture DOWN before any nested Spotify RecyclerView/pager can
            // reserve the swipe. We replay it if this isn't our gesture.
            return CONSUME;
        }
        if (state.mode == 0 || state.mode == 3) return FORWARD;
        if (action == MotionEvent.ACTION_POINTER_DOWN || action == MotionEvent.ACTION_POINTER_UP) {
            if (state.mode == 1) { state.mode = 3; return REPLAY_DOWN; }
            return CONSUME;
        }
        float dx = e.getX() - state.x;
        float dy = e.getY() - state.y;
        float density = host.getResources().getDisplayMetrics().density;
        float slop = Math.max(12f * density, 12f);
        if (action == MotionEvent.ACTION_MOVE) {
            if (state.mode == 2) return CONSUME;
            if (Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx) * 1.05f) {
                state.mode = 3;
                return REPLAY_DOWN;
            }
            if (Math.abs(dx) > slop && Math.abs(dx) > Math.abs(dy) * 1.25f) {
                boolean desired = state.roomInitiallyShown ? dx < 0 : dx > 0;
                if (!desired) {
                    state.mode = 3;
                    return REPLAY_DOWN;
                }
                state.mode = 2;
                return CONSUME;
            }
            return CONSUME;
        }
        if (action == MotionEvent.ACTION_UP) {
            int previous = state.mode;
            state.mode = 0;
            if (previous == 2) {
                float threshold = Math.max(40f * density, host.getWidth() * 0.085f);
                if (Math.abs(dx) >= threshold) {
                    Log.i(TAG, "Recognized artwork swipe; display room=" + !state.roomInitiallyShown);
                    return state.roomInitiallyShown ? HIDE_ROOM : SHOW_ROOM;
                }
                // Do not let a partial captured swipe trigger native track skip.
                return CONSUME;
            }
            return REPLAY_DOWN;
        }
        if (action == MotionEvent.ACTION_CANCEL) {
            state.mode = 0;
            return CONSUME;
        }
        return CONSUME;
    }

    /** Called only for REPLAY_DOWN. The parent forwards the synthetic DOWN
     * to the real native subtree via super.dispatchTouchEvent(), followed by
     * the current MOVE or UP. No nested dispatch recursion occurs. */
    public static synchronized MotionEvent syntheticDown(ViewGroup host, MotionEvent current) {
        Gesture s = states.get(host);
        if (s == null) return null;
        return MotionEvent.obtain(s.start, current.getEventTime(), MotionEvent.ACTION_DOWN,
                s.x, s.y, current.getMetaState());
    }

    /** Native v1.6 mode button: no new OAuth client or detached WebView. */
    public static boolean activate(ViewGroup host, boolean show) {
        Button toggle = findToggle(host);
        if (toggle == null) {
            Log.w(TAG, "No PocketDJ toggle available; preserving Spotify state");
            return false;
        }
        boolean currentlyShown = "Spotify".contentEquals(toggle.getText());
        if (currentlyShown == show) return true;
        boolean clicked = toggle.performClick();
        if (!clicked) return false;
        if (show) {
            View web = findWebView(host);
            if (web != null && web.getVisibility() == View.VISIBLE) {
                // Reveal from the left, but leave all vertical translation/scroll
                // synchronization to the existing v1.6 native Hook.
                web.animate().cancel();
                web.setTranslationX(-web.getWidth());
                web.animate().translationX(0).setDuration(240).start();
            }
        }
        return true;
    }

    private static boolean isRoomShown(ViewGroup host) {
        Button toggle = findToggle(host);
        return toggle != null && "Spotify".contentEquals(toggle.getText());
    }
    private static Button findToggle(View view) {
        if (view instanceof Button) {
            Button b=(Button) view;
            CharSequence label=b.getText();
            if ("PocketDJ".contentEquals(label) || "Spotify".contentEquals(label)) return b;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group=(ViewGroup)view;
            for(int i=group.getChildCount()-1;i>=0;i--) {
                Button child=findToggle(group.getChildAt(i));
                if(child!=null) return child;
            }
        }
        return null;
    }
    private static View findWebView(View view) {
        if (view instanceof WebView) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group=(ViewGroup)view;
            for(int i=group.getChildCount()-1;i>=0;i--) {
                View child=findWebView(group.getChildAt(i));
                if(child!=null) return child;
            }
        }
        return null;
    }

    private static View locateGestureTarget(ViewGroup host) {
        // When PocketDJ is shown, the WebView is the visible artwork page.
        if (isRoomShown(host)) {
            View web = findWebView(host);
            if (web != null && web.getVisibility() == View.VISIBLE &&
                web.getWidth() > 40 && web.getHeight() > 40) return web;
        }
        View carousel=host.findViewById(CAROUSEL_ID);
        if (carousel != null && carousel.getVisibility() == View.VISIBLE &&
            carousel.getWidth() > 100 && carousel.getHeight() > 100) return carousel;
        // Album images are often inside a RecyclerView. Previous v1.7 code
        // skipped RecyclerViews entirely, so it failed to identify them.
        ArtworkBounds best=findArtworkImage(host, null);
        if (best != null) {
            Log.d(TAG, "Artwork image located; rect=" + best.rect);
            return findImageAt(host,best.rect);
        }
        Log.d(TAG, "Artwork not found; native gestures unchanged");
        return null;
    }
    private static ArtworkBounds findArtworkImage(View view, ArtworkBounds best) {
        if (view == null || view.getVisibility() != View.VISIBLE) return best;
        if (view instanceof ImageView) {
            Rect box=new Rect();
            if (view.getGlobalVisibleRect(box) && box.width()>120 && box.height()>120) {
                float ratio=box.width()/(float)Math.max(1,box.height());
                int screenHeight=view.getResources().getDisplayMetrics().heightPixels;
                if (ratio>0.68f && ratio<1.48f && box.top < screenHeight*0.70f) {
                    int score=box.width()*box.height();
                    if (best==null || score>best.score) best=new ArtworkBounds(box,score);
                }
            }
        }
        if (view instanceof ViewGroup) {
            ViewGroup group=(ViewGroup)view;
            for(int i=0;i<group.getChildCount();i++) best=findArtworkImage(group.getChildAt(i),best);
        }
        return best;
    }
    private static View findImageAt(View view, Rect coords) {
        if (view instanceof ImageView) {
            Rect r=new Rect();
            if(view.getGlobalVisibleRect(r) && r.equals(coords)) return view;
        }
        if(view instanceof ViewGroup) {
            ViewGroup group=(ViewGroup)view;
            for(int i=0;i<group.getChildCount();i++) {
                View found=findImageAt(group.getChildAt(i),coords);
                if(found!=null) return found;
            }
        }
        return null;
    }
    private static Rect artworkRect(ViewGroup host, View target) {
        int[] loc=new int[2];
        target.getLocationOnScreen(loc);
        int w=target.getWidth(), h=target.getHeight();
        if(w<70 || h<70) return null;
        int windowHeight=host.getResources().getDisplayMetrics().heightPixels;
        int maxHeight=Math.min(h, Math.min(w,Math.round(windowHeight*0.65f)));
        int left=loc[0], top=loc[1];
        return new Rect(left, top, left+w, top+maxHeight);
    }
}