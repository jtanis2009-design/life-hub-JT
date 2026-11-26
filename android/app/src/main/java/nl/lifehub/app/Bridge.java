package nl.lifehub.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileOutputStream;

/** window.LifeHubNative in the Life Hub pages */
final class Bridge {
    private final Activity a;
    Bridge(Activity a) { this.a = a; }

    @JavascriptInterface public int version() { return 1; }
    @JavascriptInterface public void setAlarms(String json) { Store.setAlarms(a, json); }
    @JavascriptInterface public void setReminders(String json) { Store.setReminders(a, json); }
    @JavascriptInterface public void notify(String title, String body, String url) { NotifyReceiver.show(a, ("now" + title).hashCode(), title, body, url); }

    /** your own sound file, kept in the app so the alarm can play it offline */
    @JavascriptInterface public boolean saveSound(String name, String base64) {
        try { File d = new File(a.getFilesDir(), "sounds"); d.mkdirs(); try (FileOutputStream o = new FileOutputStream(new File(d, safe(name)))) { o.write(Base64.decode(base64, Base64.DEFAULT)); } return true; }
        catch (Exception e) { return false; }
    }
    @JavascriptInterface public boolean hasSound(String name) { return new File(new File(a.getFilesDir(), "sounds"), safe(name)).exists(); }
    static String safe(String n) { return n.replaceAll("[^A-Za-z0-9_.-]", "_"); }

    /** Android 14+: may the alarm take over the screen? */
    @JavascriptInterface public boolean canFullScreen() {
        if (Build.VERSION.SDK_INT < 34) return true;
        return a.getSystemService(NotificationManager.class).canUseFullScreenIntent();
    }
    @JavascriptInterface public void openFullScreenSettings() {
        a.runOnUiThread(() -> { try {
            Intent i = Build.VERSION.SDK_INT >= 34 ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + a.getPackageName()))
                : new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, a.getPackageName());
            a.startActivity(i);
        } catch (Exception e) { a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()))); } });
    }
    @JavascriptInterface public boolean notificationsOn() { return a.getSystemService(NotificationManager.class).areNotificationsEnabled(); }
    @JavascriptInterface public void openNotificationSettings() {
        a.runOnUiThread(() -> a.startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, a.getPackageName())));
    }
    @JavascriptInterface public void testAlarm() {
        try { org.json.JSONObject t = new org.json.JSONObject().put("id", "snooze-test" + System.currentTimeMillis()).put("at", System.currentTimeMillis() + 10000).put("label", "Test alarm").put("group", "test").put("snooze", 5);
            Store.addAlarm(a, t); } catch (Exception ignored) {}
    }
}
