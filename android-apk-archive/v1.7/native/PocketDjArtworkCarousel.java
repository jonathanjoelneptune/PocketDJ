package com.pocketdj.spotifyexperiment;

import android.content.Context;
import android.app.Dialog;
import android.view.Gravity;
import android.widget.Button;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.view.animation.DecelerateInterpolator;
import android.webkit.WebView;
import android.widget.FrameLayout;

/**
 * A two-page replacement for an *artwork-only* native view.
 *
 *  Album artwork | swipe right -> PocketDJ
 *  PocketDJ      | swipe left  -> album artwork
 *
 * The pager occupies the artwork view's original layout slot. It does not
 * reposition the track title, seek bar, transport controls, or scrolling page.
 *
 * No Spotify classes or resource IDs are referenced here. The APK adapter must
 * independently prove that the target view is exclusively artwork before
 * invoking installVerifiedArtwork(). Do not pass tracks_carousel_view or any
 * composite parent that also owns progress/metadata.
 */
public final class PocketDjArtworkCarousel extends FrameLayout {
    public enum Page { ALBUM, POCKET_DJ }
    public interface PageListener { void onPageChanged(Page page); }

    private final View album;
    private final WebView room;
    private final int touchSlop;
    private final int minimumFlingVelocity;
    private final int maximumFlingVelocity;

    private VelocityTracker velocity;
    private float downX, downY;
    private boolean dragging;
    private Page page = Page.ALBUM;
    private PageListener listener;
    private final Button expandButton;
    private Dialog expandedDialog;

    private PocketDjArtworkCarousel(Context context, View album, WebView room) {
        super(context);
        this.album = album;
        this.room = room;
        ViewConfiguration config = ViewConfiguration.get(context);
        touchSlop = config.getScaledTouchSlop();
        minimumFlingVelocity = config.getScaledMinimumFlingVelocity();
        maximumFlingVelocity = config.getScaledMaximumFlingVelocity();
        setClipChildren(true);
        setClipToPadding(true);
        setClickable(true);
        addView(room, new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        addView(album, new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        room.setVisibility(VISIBLE); // Keeps OAuth/session/renderer alive while hidden off-screen.
        expandButton = new Button(context);
        expandButton.setText("Expand");
        expandButton.setAllCaps(false);
        LayoutParams expandParams = new LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.END | Gravity.BOTTOM);
        expandParams.rightMargin = Math.round(getResources().getDisplayMetrics().density * 6);
        expandParams.bottomMargin = Math.round(getResources().getDisplayMetrics().density * 6);
        addView(expandButton, expandParams);
        expandButton.setVisibility(GONE);
        expandButton.setOnClickListener(v -> openExpanded());
        setPositions(false);
    }

    /**
     * Attaches the carousel in-place using the exact original view layout params.
     * The caller MUST first verify that artworkView is an artwork-only leaf/slot.
     * Returns null without changing the UI when the view cannot be safely wrapped.
     *
     * roomWebView must already be configured and must not be parented elsewhere.
     */
    public static PocketDjArtworkCarousel installVerifiedArtwork(
            View artworkView, WebView roomWebView, boolean artworkOnlyVerified) {
        if (!artworkOnlyVerified || artworkView == null || roomWebView == null) return null;
        if (!(artworkView.getParent() instanceof ViewGroup)) return null;
        if (roomWebView.getParent() != null || artworkView == roomWebView) return null;

        final ViewGroup host = (ViewGroup) artworkView.getParent();
        final int index = host.indexOfChild(artworkView);
        if (index < 0) return null;
        final ViewGroup.LayoutParams originalParams = artworkView.getLayoutParams();
        if (originalParams == null) return null;

        // Never replace the full native Now Playing scroll container.
        if (artworkView instanceof android.widget.ScrollView ||
                artworkView.getClass().getName().contains("NestedScrollView")) return null;

        host.removeViewAt(index);
        try {
            PocketDjArtworkCarousel pager =
                    new PocketDjArtworkCarousel(host.getContext(), artworkView, roomWebView);
            host.addView(pager, index, originalParams);
            return pager;
        } catch (RuntimeException ex) {
            // Fail closed: restore Spotify's original artwork instead of leaving it missing.
            if (artworkView.getParent() instanceof ViewGroup) {
                ((ViewGroup) artworkView.getParent()).removeView(artworkView);
            }
            if (artworkView.getParent() == null) host.addView(artworkView, index, originalParams);
            return null;
        }
    }

    public void setPageListener(PageListener listener) { this.listener = listener; }
    public Page getPage() { return page; }
    public void showAlbum() { settle(Page.ALBUM, true); }
    public void showPocketDj() { settle(Page.POCKET_DJ, true); }

    @Override protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        // Native parent owns artwork bounds across rotation and folding.
        // This method never sets its own height or width.
        setPositions(false);
    }

    private void setPositions(boolean animated) {
        if (expandedDialog != null) return;
        int width = getWidth();
        if (width <= 0) return;
        final float albumX = page == Page.ALBUM ? 0 : width;
        final float roomX = page == Page.ALBUM ? -width : 0;
        album.animate().cancel();
        room.animate().cancel();
        if (animated) {
            album.animate().translationX(albumX).setDuration(200)
                    .setInterpolator(new DecelerateInterpolator()).start();
            room.animate().translationX(roomX).setDuration(200)
                    .setInterpolator(new DecelerateInterpolator()).start();
        } else {
            album.setTranslationX(albumX);
            room.setTranslationX(roomX);
        }
    }

    private void settle(Page next, boolean animated) {
        Page previous = page;
        page = next;
        setPositions(animated);
        expandButton.setVisibility(next == Page.POCKET_DJ ? VISIBLE : GONE);
        if (previous != next && listener != null) listener.onPageChanged(next);
    }

    /**
     * Temporary full-screen WebView using the SAME browser session.
     * Android Back or Compact closes the dialog and reattaches the WebView
     * inside its artwork slot. No Spotify private credentials are accessed.
     */
    private void openExpanded() {
        if (expandedDialog != null || room.getParent() != this) return;
        removeView(room);
        final Dialog dialog = new Dialog(getContext(),
                android.R.style.Theme_DeviceDefault_NoActionBar_Fullscreen);
        final FrameLayout shell = new FrameLayout(getContext());
        shell.addView(room, new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        Button compact = new Button(getContext());
        compact.setText("Compact");
        compact.setAllCaps(false);
        LayoutParams action = new LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.END | Gravity.BOTTOM);
        action.rightMargin = Math.round(getResources().getDisplayMetrics().density * 12);
        action.bottomMargin = Math.round(getResources().getDisplayMetrics().density * 12);
        shell.addView(compact, action);
        compact.setOnClickListener(v -> dialog.dismiss());
        dialog.setContentView(shell);
        expandedDialog = dialog;
        dialog.setOnDismissListener(d -> {
            room.evaluateJavascript(
                    "window.pocketDjSpotifySetCompact && window.pocketDjSpotifySetCompact(true)", null);
            shell.removeView(room);
            addView(room, 0, new LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            expandedDialog = null;
            setPositions(false);
        });
        room.evaluateJavascript(
                "window.pocketDjSpotifySetCompact && window.pocketDjSpotifySetCompact(false)", null);
        dialog.show();
    }

    @Override public boolean onInterceptTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = event.getX();
                downY = event.getY();
                dragging = false;
                obtainVelocity(event);
                return false;
            case MotionEvent.ACTION_MOVE:
                float dx = event.getX() - downX;
                float dy = event.getY() - downY;
                // A vertical gesture remains available for Spotify's own scroll view.
                if (Math.abs(dy) > touchSlop && Math.abs(dy) > Math.abs(dx)) {
                    recycleVelocity();
                    return false;
                }
                boolean rightFromAlbum = page == Page.ALBUM && dx > touchSlop;
                boolean leftFromDj = page == Page.POCKET_DJ && dx < -touchSlop;
                if ((rightFromAlbum || leftFromDj) && Math.abs(dx) > Math.abs(dy) * 1.25f) {
                    dragging = true;
                    ViewParent parent = getParent();
                    if (parent != null) parent.requestDisallowInterceptTouchEvent(true);
                    return true;
                }
                return false;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                recycleVelocity();
                dragging = false;
                return false;
            default:
                return false;
        }
    }

    @Override public boolean onTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = event.getX();
                downY = event.getY();
                obtainVelocity(event);
                return true;
            case MotionEvent.ACTION_MOVE:
                if (!dragging) return true;
                if (velocity != null) velocity.addMovement(event);
                float delta = event.getX() - downX;
                float width = Math.max(1, getWidth());
                float restricted = page == Page.ALBUM
                        ? Math.max(0, Math.min(width, delta))
                        : Math.min(0, Math.max(-width, delta));
                float base = page == Page.ALBUM ? 0 : width;
                album.setTranslationX(base + restricted);
                room.setTranslationX(base + restricted - width);
                return true;
            case MotionEvent.ACTION_UP:
                if (velocity != null) {
                    velocity.addMovement(event);
                    velocity.computeCurrentVelocity(1000, maximumFlingVelocity);
                }
                float v = velocity == null ? 0 : velocity.getXVelocity();
                float d = event.getX() - downX;
                boolean complete = Math.abs(d) >= getWidth() * 0.18f ||
                        Math.abs(v) >= Math.max(600, minimumFlingVelocity * 3);
                if (dragging && complete) {
                    if (page == Page.ALBUM && d > 0) settle(Page.POCKET_DJ, true);
                    else if (page == Page.POCKET_DJ && d < 0) settle(Page.ALBUM, true);
                    else setPositions(true);
                } else {
                    setPositions(true);
                }
                recycleVelocity();
                dragging = false;
                return true;
            case MotionEvent.ACTION_CANCEL:
                recycleVelocity();
                dragging = false;
                setPositions(true);
                return true;
            default:
                return super.onTouchEvent(event);
        }
    }

    private void obtainVelocity(MotionEvent event) {
        recycleVelocity();
        velocity = VelocityTracker.obtain();
        velocity.addMovement(event);
    }

    private void recycleVelocity() {
        if (velocity != null) {
            velocity.recycle();
            velocity = null;
        }
    }

    /** Utility for the host adapter: reject any candidate containing known transport controls. */
    public static boolean hasDescendantWithId(View parent, int resourceId) {
        if (parent == null || resourceId == 0) return false;
        if (parent.getId() == resourceId) return true;
        if (!(parent instanceof ViewGroup)) return false;
        ViewGroup group = (ViewGroup) parent;
        for (int i = 0; i < group.getChildCount(); i++) {
            if (hasDescendantWithId(group.getChildAt(i), resourceId)) return true;
        }
        return false;
    }
}
