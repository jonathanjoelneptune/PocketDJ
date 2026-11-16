package androidx.constraintlayout.widget;
import android.content.Context;
import android.util.AttributeSet;
import android.view.ViewGroup;
/** Compile-only class; the actual ConstraintLayout comes from Spotify. */
public class ConstraintLayout extends ViewGroup {
    public ConstraintLayout(Context c, AttributeSet a) { super(c, a); }
    @Override protected void onLayout(boolean c, int l, int t, int r, int b) {}
}
