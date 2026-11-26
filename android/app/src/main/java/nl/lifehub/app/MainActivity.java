package nl.lifehub.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Life Hub itself (the same site as always), plus window.LifeHubNative for real alarms and notifications. */
public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> fileCb;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#0d0f14"));
        getWindow().setNavigationBarColor(Color.parseColor("#0d0f14"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0d0f14"));
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " LifeHubApp/1");
        web.addJavascriptInterface(new Bridge(this), "LifeHubNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl(); String host = u.getHost() == null ? "" : u.getHost(), sc = u.getScheme() == null ? "" : u.getScheme();
                if (sc.startsWith("http") && (host.endsWith("github.io") || host.equals("accounts.spotify.com"))) return false;   /* Life Hub + Spotify login stay in the app */
                try { startActivity(sc.equals("intent") ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;                                                                                                  /* everything else: its own app or the browser */
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { startActivityForResult(p.createIntent(), 7); } catch (Exception e) { fileCb = null; return false; }
                return true;
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 3);
                cb.invoke(origin, true, false);
            }
        });
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        if (b != null) web.restoreState(b); else web.loadUrl(startUrl(getIntent()));
    }

    private String startUrl(Intent i) {
        String u = i == null ? null : i.getStringExtra("url");
        if (u != null && u.startsWith(Store.HOME)) return u;
        String shared = i == null ? null : i.getStringExtra(Intent.EXTRA_TEXT);      /* Share → Life Hub (YouTube/Spotify songs) */
        if (shared != null && shared.matches("(?s).*(youtube\\.com|youtu\\.be|open\\.spotify\\.com).*")) return Store.HOME + "alarm/#addsong=" + Uri.encode(shared.trim());
        return Store.HOME;
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); if (i.hasExtra("url") || i.hasExtra(Intent.EXTRA_TEXT)) web.loadUrl(startUrl(i)); }
    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == 7 && fileCb != null) { fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); fileCb = null; return; }
        super.onActivityResult(req, res, data);
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
