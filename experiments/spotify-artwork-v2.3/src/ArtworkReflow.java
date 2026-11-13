package com.pocketdj.spotifyexperiment;

import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.SeekBar;
import com.pocketdj.Hook;
import java.lang.ref.WeakReference;
import java.util.WeakHashMap;

/**
 * Conservative tablet layout probe. Spotify owns the Now Playing hierarchy.
 * We may only enlarge the native artwork slot if its surrounding layout
 * actually moves the timeline down. Otherwise restore the original height.
 * Never translate the seekbar, buttons or track text independently: doing so
 * can move them outside their clickable parent's bounds.
 *
 * Called on the UI thread from PocketDJ's existing updateLayout() method.
 */
public final class ArtworkReflow {
    private static final String TAG = "PocketDJ-Reflow";
    private static final int CAROUSEL_ID = 0x7f0b1043;
    private static final WeakHashMap<View, Probe> probes = new WeakHashMap<>();
    private static final class Probe {
        WeakReference<View> carousel;
        int originalParamHeight, originalMeasuredHeight, oldSeekbarY;
        int candidateHeight, intendedViewportHeight;
        int width, height, phase;
        // phase: 0 idle, 1 next layout validation, 2 verified, 3 rejected
    }
    private ArtworkReflow() {}

    /** Returns the approved full-width scene viewport height or zero for fallback. */
    public static synchronized int approvedHeight(View hook, int width, int height) {
        if (hook == null || width < 600 || height < 600) return 0;
        // Phone portrait is intentionally square, with the 16:9 scene centered.
        if (width < height * 0.72f) return 0;
        View root = hook.getRootView();
        if (!(root instanceof ViewGroup)) return 0;
        Probe p = probes.get(root);
        if (p == null) { p = new Probe(); probes.put(root,p); }
        if (p.phase != 0 && (p.width != width || p.height != height)) {
            restore(p); p.phase = 0;
        }
        p.width = width; p.height = height;
        if (p.phase == 3) return 0;
        if (p.phase == 2) {
            View slot = p.carousel == null ? null : p.carousel.get();
            if (slot != null && slot.getParent() != null) return p.intendedViewportHeight;
            p.phase = 3;
            return 0;
        }
        if (p.phase == 1) {
            View slot = p.carousel == null ? null : p.carousel.get();
            int movedSeek = findSeekbarY(root, 0);
            int movedBy = movedSeek - p.oldSeekbarY;
            int requested = p.candidateHeight - p.originalMeasuredHeight;
            boolean reflowed = slot != null && movedSeek > 0 &&
                    slot.getHeight() >= p.candidateHeight - 10 &&
                    requested >= 24 && movedBy >= requested * 0.60f;
            if (reflowed) {
                p.phase = 2;
                Log.i(TAG, "Native artwork slot reflow verified; timeline moved " + movedBy + "px");
                return p.intendedViewportHeight;
            }
            Log.w(TAG, "Native slot did not reflow player; restoring original layout");
            restore(p); p.phase = 3;
            return 0;
        }
        View slot = root.findViewById(CAROUSEL_ID);
        if (slot == null || slot.getWidth() < 100 || slot.getHeight() < 100 ||
                !(slot.getLayoutParams() instanceof ViewGroup.MarginLayoutParams)) {
            p.phase=3; return 0;
        }
        int seekY = findSeekbarY(root, 0);
        if (seekY < 0) { p.phase=3; return 0; }
        int[] pos = new int[2]; slot.getLocationOnScreen(pos);
        if (seekY <= pos[1] || seekY - pos[1] > height * 0.85f) {
            p.phase=3; return 0;
        }
        // Keep the 16:9 room exactly proportional. The extra 10.5% of width
        // exposes the already existing extended ceiling above the base room.
        int base = Math.round(width * 9f / 16f);
        int desired = base + Math.round(width * 0.105f);
        desired = Math.min(desired, Math.round(height * 0.76f));
        int oldH = slot.getHeight();
        if (desired <= oldH + 24) { p.phase=3; return 0; }
        int delta = desired - oldH;
        if (delta > height * 0.37f) { p.phase=3; return 0; }
        ViewGroup.LayoutParams params = slot.getLayoutParams();
        p.originalParamHeight=params.height;
        p.originalMeasuredHeight=oldH;
        p.oldSeekbarY=seekY;
        p.candidateHeight=desired;
        p.intendedViewportHeight=desired;
        p.carousel=new WeakReference<>(slot);
        p.phase=1;
        params.height = desired;
        slot.setLayoutParams(params);
        Log.i(TAG, "Probing native artwork reflow delta=" + delta + "px");
        // A layout pass may not resize the activity root; schedule explicit
        // revalidation rather than relying on a root-size change callback.
        final WeakReference<View> weak = new WeakReference<>(hook);
        slot.postDelayed(() -> {
            View live=weak.get();
            if (live instanceof Hook && live.isAttachedToWindow())
                ((Hook)live).updateLayout();
        }, 100L);
        return 0;
    }

    private static void restore(Probe p) {
        View slot = p.carousel == null ? null : p.carousel.get();
        if (slot != null && slot.getParent() != null) {
            ViewGroup.LayoutParams params = slot.getLayoutParams();
            if (params != null && params.height != p.originalParamHeight) {
                params.height=p.originalParamHeight;
                slot.setLayoutParams(params);
            }
        }
    }
    private static int findSeekbarY(View v, int depth) {
        if (v == null || depth > 22 || v.getVisibility() != View.VISIBLE) return -1;
        String name=v.getClass().getName();
        boolean slider = v instanceof SeekBar || name.endsWith("SeekBar") ||
                name.contains("Slider");
        if (slider && v.getWidth() > 140) {
            int[] xy=new int[2];v.getLocationOnScreen(xy);return xy[1];
        }
        if (!(v instanceof ViewGroup)) return -1;
        ViewGroup group=(ViewGroup)v;
        int best=-1;
        for (int i=0;i<group.getChildCount();i++) {
            int y=findSeekbarY(group.getChildAt(i),depth+1);
            if (y>0 && (best<0||y<best)) best=y;
        }
        return best;
    }
}