package com.pocketdj.spotifyexperiment;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A private, origin-scoped recovery copy of PocketDJ's refresh grant.
 *
 * WebView DOM storage normally survives restarts, but Spotify may invalidate
 * the embedded WebView profile across process launches. Save a separate
 * AES-GCM sealed copy in application-private SharedPreferences with an
 * AndroidKeyStore-backed key. The secret never goes through a Javascript
 * interface, query string, cookie, log, or GitHub artifact.
 *
 * The only Javascript interaction is the Android-owned evaluateJavascript
 * ValueCallback, and ONLY at our exact PocketDJ HTTPS origin. A missing
 * browser token is restored once and the webpage reloaded to run normal
 * Spotify PKCE refresh logic. A user-initiated logout clears this backup on
 * the next scheduled probe. No native Spotify tokens are accessed.
 */
public final class PocketDjSessionWebViewClient extends WebViewClient {
    private static final String TAG = "PocketDJ-session";
    private static final String HOST = "jonathanjoelneptune.github.io";
    private static final String PREFS = "pocketdj_web_session_v21";
    private static final String KEY_ALIAS = "PocketDJ_Web_Refresh_v21";
    private static final String PREF_SESSION = "encrypted_pocketdj";
    private static final String TOKEN_KEY = "pocket_dj_spotify_tokens";
    private static final String CLIENT_KEY = "pocket_dj_spotify_client_id";
    private static final long POLL_MS = 14000;
    private final Context appContext;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean started;
    private boolean restoreAttempted;
    private boolean everSawBrowserSession;
    private boolean requestOutstanding;

    public PocketDjSessionWebViewClient(Context context) {
        appContext = context.getApplicationContext();
    }

    private static boolean trusted(String url) {
        if (url == null) return false;
        try {
            Uri uri = Uri.parse(url);
            String path = uri.getPath();
            return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) &&
                    ("/PocketDJ".equals(path) || (path != null && path.startsWith("/PocketDJ/")));
        } catch (RuntimeException e) {
            return false;
        }
    }

    @Override public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (!trusted(url)) return;
        if (!started) {
            started = true;
            final WeakReference<WebView> web = new WeakReference<>(view);
            main.postDelayed(() -> pollAndReschedule(web), 700);
        }
    }

    private void pollAndReschedule(WeakReference<WebView> webRef) {
        WebView view = webRef.get();
        if (view == null) return;
        if (trusted(view.getUrl())) probe(view);
        // WeakReference avoids keeping a destroyed Now Playing Activity alive.
        main.postDelayed(() -> pollAndReschedule(webRef), POLL_MS);
    }

    private void probe(WebView web) {
        if (requestOutstanding) return;
        requestOutstanding = true;
        final WeakReference<WebView> target = new WeakReference<>(web);
        final String js = "(function(){try{return JSON.stringify({t:localStorage.getItem('" +
            TOKEN_KEY + "'),c:localStorage.getItem('" + CLIENT_KEY +
            "')});}catch(e){return '';}})()";
        try {
            web.evaluateJavascript(js, raw -> {
                requestOutstanding = false;
                WebView current = target.get();
                if (current == null || !trusted(current.getUrl())) return;
                try {
                    if (raw == null || raw.equals("null")) return;
                    String inner = new JSONArray("[" + raw + "]").getString(0);
                    if (inner.length() == 0) return;
                    JSONObject data = new JSONObject(inner);
                    String tokens = data.optString("t", "");
                    String client = data.optString("c", "");
                    if (hasRefreshGrant(tokens) && !client.isEmpty()) {
                        everSawBrowserSession = true;
                        saveEncrypted(new JSONObject().put("t", tokens).put("c", client).toString());
                    } else if (everSawBrowserSession) {
                        // Explicit disconnect: browser storage changed while our
                        // page was open. Never resurrect deliberately cleared auth.
                        clearEncrypted();
                        restoreAttempted = true;
                        everSawBrowserSession = false;
                    } else if (!restoreAttempted && !hasPendingOAuth(current.getUrl())) {
                        restoreAttempted = true;
                        restoreBrowserIfNeeded(current);
                    }
                } catch (Exception ignored) {
                    Log.w(TAG, "Session probe could not read browser metadata");
                }
            });
        } catch (RuntimeException e) {
            requestOutstanding = false;
        }
    }

    private static boolean hasPendingOAuth(String url) {
        return url != null && (url.contains("code=") || url.contains("state="));
    }

    private static boolean hasRefreshGrant(String json) {
        try {
            JSONObject value = new JSONObject(json);
            return value.optString("refreshToken", "").length() > 12;
        } catch (Exception e) {
            return false;
        }
    }

    private void restoreBrowserIfNeeded(WebView web) {
        try {
            String saved = loadEncrypted();
            if (saved == null) return;
            JSONObject payload = new JSONObject(saved);
            String tokens = payload.optString("t", "");
            String client = payload.optString("c", "");
            if (!hasRefreshGrant(tokens) || client.isEmpty()) return;
            String script = "(function(){try{if(!localStorage.getItem('" + TOKEN_KEY +
                "')){localStorage.setItem('" + TOKEN_KEY + "'," + JSONObject.quote(tokens) +
                ");localStorage.setItem('" + CLIENT_KEY + "'," + JSONObject.quote(client) +
                ");location.reload();return 'restored';}return 'existing';}catch(e){return 'failed';}})()";
            web.evaluateJavascript(script, result -> {
                if (result != null && result.contains("restored")) {
                    everSawBrowserSession = true;
                    Log.i(TAG, "Recovered encrypted PocketDJ session on app reopening");
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "Secure session recovery unavailable; standard login remains usable");
        }
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build();
        gen.init(spec);
        return gen.generateKey();
    }

    private void saveEncrypted(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        JSONObject blob = new JSONObject()
                .put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .put("data", Base64.encodeToString(encrypted, Base64.NO_WRAP));
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(PREF_SESSION, blob.toString()).apply();
    }

    private String loadEncrypted() throws Exception {
        SharedPreferences p = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = p.getString(PREF_SESSION, null);
        if (raw == null) return null;
        JSONObject blob = new JSONObject(raw);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128,
                Base64.decode(blob.getString("iv"), Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(blob.getString("data"), Base64.NO_WRAP)),
                StandardCharsets.UTF_8);
    }

    private void clearEncrypted() {
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove(PREF_SESSION).apply();
    }
}