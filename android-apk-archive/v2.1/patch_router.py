from pathlib import Path
p=Path('/mnt/data/pdj_v21/src/SwipeRouter.java')
s=p.read_text()
a='''            if (art == null || !art.contains((int)e.getRawX(), (int)e.getRawY())) return FORWARD;
            Log.d(TAG, "artwork gesture region=" + art.toShortString() +
                    " room=" + showingRoom);'''
b='''            // Suppress Spotify's horizontal swipe-to-skip anywhere across the
            // artwork/title region, not just the shorter embedded WebView.
            // Do not capture the seekbar or transport area, so seeking and
            // ordinary playback controls retain their original gestures.
            art = artworkGestureRegion(host, art);
            if (art == null || !art.contains((int)e.getRawX(), (int)e.getRawY())) return FORWARD;
            Log.d(TAG, "artwork gesture region=" + art.toShortString() +
                    " room=" + showingRoom);'''
assert s.count(a)==1;s=s.replace(a,b)
anchor='''    private static boolean isRoomShown(ViewGroup host) {'''
insert='''    /**
     * The original album canvas can be square while PocketDJ's viewport is
     * 16:9, so a touch at the bottom of the square must still belong to the
     * artwork pager. Intercept ALL horizontal swipes above the native timeline,
     * including video canvases and the background gap below the scene.
     * Vertical scrolling, taps, and gestures below the seekbar are forwarded.
     */
    private static Rect artworkGestureRegion(ViewGroup host, Rect detected) {
        int[] origin = new int[2];
        host.getLocationOnScreen(origin);
        int h = host.getHeight();
        int w = host.getWidth();
        if (h <= 0 || w <= 0) return detected;
        int top = detected == null
                ? origin[1] + Math.round(h * 0.12f)
                : Math.min(detected.top, origin[1] + Math.round(h * 0.19f));
        int bottom = origin[1] + Math.round(h * 0.70f);
        if (detected != null) bottom = Math.max(bottom, detected.bottom);
        // Visible seekbar, when exposed as a native widget, bounds the region
        // more accurately on Samsung foldable layouts.
        int seekY = findNativeSeekbarTop(host, top, origin[1] + h, 0);
        if (seekY > top) bottom = Math.min(bottom, seekY -
                Math.round(36f * host.getResources().getDisplayMetrics().density));
        bottom = Math.min(bottom, origin[1] + Math.round(h * 0.79f));
        if (bottom <= top) return detected;
        return new Rect(origin[0], top, origin[0] + w, bottom);
    }

    private static int findNativeSeekbarTop(View view, int minY, int maxY, int depth) {
        if (depth > 24 || view == null || view.getVisibility() != View.VISIBLE) return -1;
        String name = view.getClass().getName();
        boolean seek = view instanceof android.widget.SeekBar ||
                name.endsWith("SeekBar") || name.contains("Slider");
        if (seek && view.getWidth() > 180) {
            int[] xy = new int[2];
            view.getLocationOnScreen(xy);
            if (xy[1] > minY && xy[1] < maxY) return xy[1];
        }
        if (!(view instanceof ViewGroup)) return -1;
        ViewGroup group = (ViewGroup)view;
        int best = -1;
        for (int i=0; i<group.getChildCount(); i++) {
            int found=findNativeSeekbarTop(group.getChildAt(i),minY,maxY,depth+1);
            if (found>0 && (best<0 || found<best)) best=found;
        }
        return best;
    }

'''
assert s.count(anchor)==1;s=s.replace(anchor,insert+anchor)
p.write_text(s)