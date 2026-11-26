package nl.lifehub.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/** a Life Hub reminder (to-do, homework, morning brief, ...) as a normal notification */
public class NotifyReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent in) {
        try { JSONObject r = new JSONObject(in.getStringExtra("r")); show(c, r.optString("id").hashCode(), r.optString("title"), r.optString("body"), r.optString("url")); } catch (Exception ignored) {}
    }
    static void show(Context c, int id, String title, String body, String url) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("reminders", "Reminders", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(c, MainActivity.class).putExtra("url", url == null || url.isEmpty() ? Store.HOME : url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        nm.notify(id, new Notification.Builder(c, "reminders").setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle(title)
            .setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(pi).setAutoCancel(true).build());
    }
}
