package com.pocketdj.spotifyexperiment;
import android.view.MotionEvent;
import android.view.ViewGroup;
/** Compile-only API verified in the working v3.3.33 classes19.dex. */
public final class SwipeRouter {
    public static final int CONSUME=1, REPLAY_DOWN=2, SHOW_ROOM=3, HIDE_ROOM=4, OPEN_DEVELOPER=5;
    public static int route(ViewGroup host, MotionEvent event) { throw new AssertionError(); }
    public static MotionEvent syntheticDown(ViewGroup host, MotionEvent event) { throw new AssertionError(); }
    public static boolean activate(ViewGroup host, boolean show) { throw new AssertionError(); }
    public static boolean openDeveloper(ViewGroup host) { throw new AssertionError(); }
    public static void afterLayout(ViewGroup host) { throw new AssertionError(); }
    public static void onDetached(ViewGroup host) { throw new AssertionError(); }
}
