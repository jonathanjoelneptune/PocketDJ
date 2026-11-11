from pathlib import Path
p=Path('/mnt/data/pdj_v21/src/SwipePageEffects.java')
s=p.read_text()
def r(a,b):
 global s
 assert s.count(a)==1,('missing',a[:60],s.count(a))
 s=s.replace(a,b)
r('import android.graphics.Rect;', '''import android.graphics.Rect;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.TransitionDrawable;''')
r('''        long lastUpdateMs;
    }''','''        long lastUpdateMs;
        Drawable originalBackdrop;
        boolean backdropSaved;
    }''')
r('''        if (show) {
            findAndRememberArtwork(host, state);''','''        if (show) {
            darkenRootBackground(host, state);
            findAndRememberArtwork(host, state);''')
r('''        } else {
            // Restore native album images''','''        } else {
            restoreRootBackground(host, state);
            // Restore native album images''')
r('''    public static synchronized void restoreAll(ViewGroup host) {
        Scene state = scenes.remove(host);
        if (state == null) return;''','''    public static synchronized void restoreAll(ViewGroup host) {
        Scene state = scenes.remove(host);
        if (state == null) return;
        restoreRootBackground(host, state);''')
a='''    private static void restoreArtwork(Scene state, int sign, float distance) {'''
b='''    /**
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

'''+a
r(a,b)
p.write_text(s)