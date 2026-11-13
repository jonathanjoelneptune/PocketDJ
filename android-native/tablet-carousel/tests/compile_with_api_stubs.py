#!/usr/bin/env python3
"""Local syntax/contract smoke test with compile-only Android API stubs.
NOT an Android build, ART verifier test, emulator test or APK validation.
Actual release must compile with Android SDK and D8 and run Now Playing on device.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
BASE=Path(__file__).resolve().parents[1]
STUBS={
'android/content/Context.java': 'package android.content; public class Context {}',
'android/content/ContextWrapper.java': 'package android.content; public class ContextWrapper extends Context {public Context getBaseContext(){return null;}}',
'android/util/AttributeSet.java': 'package android.util; public interface AttributeSet {}',
'android/util/Log.java': 'package android.util; public class Log {public static int w(String t,String s){return 0;} public static int w(String t,String s,Throwable x){return 0;} public static int d(String t,String s){return 0;}}',
'android/content/res/Resources.java':'package android.content.res; public class Resources {}',
'android/graphics/Rect.java':'''package android.graphics; public class Rect {public int left,top,right,bottom; public Rect(){} public Rect(Rect r){} public Rect(int a,int b,int c,int d){} public int width(){return 0;} public int height(){return 0;} public void offset(int x,int y){} public boolean intersect(int a,int b,int c,int d){return true;}}''',
'android/graphics/Bitmap.java':'''package android.graphics; public class Bitmap {public enum Config {ARGB_8888} public static Bitmap createBitmap(int a,int b,Config c){return null;} public int getWidth(){return 1;} public int getHeight(){return 1;} public void recycle(){} public boolean isRecycled(){return false;}}''',
'android/graphics/Canvas.java':'''package android.graphics; public class Canvas {public Canvas(Bitmap b){} public void scale(float x,float y){} public void translate(float x,float y){} public void clipRect(Rect r){} }''',
'android/graphics/drawable/BitmapDrawable.java':'''package android.graphics.drawable; import android.content.res.Resources;import android.graphics.Bitmap;import android.graphics.Rect; public class BitmapDrawable {public BitmapDrawable(Resources r,Bitmap b){}public void setFilterBitmap(boolean x){}public void setBounds(Rect b){} }''',
'android/os/Build.java':'''package android.os;public class Build {public static class VERSION {public static int SDK_INT=35;}}''',
'android/os/Looper.java':'''package android.os;public class Looper {public static Looper getMainLooper(){return null;}}''',
'android/os/Handler.java':'''package android.os;public class Handler {public Handler(Looper l){} public boolean postDelayed(Runnable r,long m){return true;} public void removeCallbacks(Runnable r){} }''',
'android/app/Activity.java':'''package android.app;import android.content.Context;import android.view.Window;public class Activity extends Context {public Window getWindow(){return null;}}''',
'android/view/ViewParent.java':'''package android.view;public interface ViewParent {}''',
'android/view/View.java':'''package android.view;import android.content.Context;import android.content.res.Resources;import android.graphics.Canvas; public class View implements ViewParent { public ViewParent getParent(){return null;} public int getWidth(){return 1;}public int getHeight(){return 1;}public void getLocationInWindow(int[] p){}public boolean isAttachedToWindow(){return true;}public Context getContext(){return null;}public Resources getResources(){return null;} public void invalidate(){}public void draw(Canvas c){} }''',
'android/view/ViewGroup.java':'''package android.view;import android.content.Context;import android.util.AttributeSet; public class ViewGroup extends View {public ViewGroup(Context c,AttributeSet a){}public int getChildCount(){return 0;} public View getChildAt(int i){return null;} public ViewGroupOverlay getOverlay(){return null;} protected void onLayout(boolean c,int l,int t,int r,int b){}protected void onDetachedFromWindow(){}public boolean dispatchTouchEvent(MotionEvent e){return false;}}''',
'android/view/ViewGroupOverlay.java':'''package android.view;import android.graphics.drawable.BitmapDrawable;public class ViewGroupOverlay {public void add(BitmapDrawable d){} public void remove(BitmapDrawable d){}}''',
'android/view/Window.java':'''package android.view;public class Window {public View getDecorView(){return null;}}''',
'android/view/MotionEvent.java':'''package android.view;public class MotionEvent {public static int ACTION_DOWN=0;public int getActionMasked(){return 0;} public float getX(){return 0;}public void recycle(){}}''',
'android/view/PixelCopy.java':'''package android.view; import android.graphics.Bitmap;import android.graphics.Rect;import android.os.Handler; public class PixelCopy {public static final int SUCCESS=0; public interface OnPixelCopyFinishedListener{void onPixelCopyFinished(int result);} public static void request(Window w,Rect r,Bitmap b,OnPixelCopyFinishedListener l,Handler h){} }''',
'android/webkit/WebView.java':'''package android.webkit;import android.view.View; public class WebView extends View {}''',
'android/animation/Animator.java':'''package android.animation;public class Animator {}''',
'android/animation/AnimatorListenerAdapter.java':'''package android.animation;public class AnimatorListenerAdapter {public void onAnimationEnd(Animator a){} }''',
'android/animation/ValueAnimator.java':'''package android.animation;public class ValueAnimator extends Animator { public interface AnimatorUpdateListener {void onAnimationUpdate(ValueAnimator v);} public static ValueAnimator ofFloat(float a,float b){return null;}public void setDuration(long d){}public void addUpdateListener(AnimatorUpdateListener l){}public void addListener(AnimatorListenerAdapter l){}public Object getAnimatedValue(){return 0f;}public void start(){}public void cancel(){} }''',
'androidx/constraintlayout/widget/ConstraintLayout.java':'''package androidx.constraintlayout.widget;import android.content.Context;import android.util.AttributeSet;import android.view.ViewGroup;public class ConstraintLayout extends ViewGroup{public ConstraintLayout(Context c,AttributeSet a){super(c,a);}protected void onLayout(boolean c,int l,int t,int r,int b){} }''',
'com/pocketdj/spotifyexperiment/SwipeRouter.java':'''package com.pocketdj.spotifyexperiment;import android.view.*;public class SwipeRouter {public static final int CONSUME=1,SHOW_ROOM=3,HIDE_ROOM=4,OPEN_DEVELOPER=5,REPLAY_DOWN=2;public static int route(ViewGroup h,MotionEvent e){return 0;}public static boolean activate(ViewGroup h,boolean s){return false;}public static boolean openDeveloper(ViewGroup h){return false;}public static MotionEvent syntheticDown(ViewGroup h,MotionEvent e){return null;}public static void afterLayout(ViewGroup h){} public static void onDetached(ViewGroup h){} }''',
'com/pocketdj/spotifyexperiment/SwipePageEffects.java':'''package com.pocketdj.spotifyexperiment;import android.view.*;public class SwipePageEffects {public static boolean busy(ViewGroup h){return false;} }''',
}
with TemporaryDirectory(prefix='pocketdj-compile-') as temp:
    root=Path(temp)
    files=[]
    for path,content in STUBS.items():
        full=root/'stubs'/path
        full.parent.mkdir(parents=True,exist_ok=True)
        full.write_text(content)
        files.append(str(full))
    out=root/'build';out.mkdir()
    sources=list((BASE/'src').rglob('*.java'))
    cmd=['javac','-Xlint:all','-encoding','UTF-8','-source','8','-target','8','-d',str(out),*files,*map(str,sources)]
    p=subprocess.run(cmd,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    print(p.stdout,p.stderr)
    if p.returncode:
        raise SystemExit(f'FAILED: javac exit {p.returncode}')
    compiled=[p.relative_to(out).as_posix() for p in out.rglob('*.class') if 'TabletCarousel' in p.name]
    print('SYNTAX+STUB API COMPILE PASSED:',compiled)
