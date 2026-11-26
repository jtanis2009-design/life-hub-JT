package nl.lifehub.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Android says: it's time. Start the ringing. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent in) {
        String a = in.getStringExtra("alarm"); if (a == null) return;
        try { String group = new org.json.JSONObject(a).optString("group"); if (Store.skipped(c).contains(group)) return; } catch (Exception ignored) {}
        c.startForegroundService(new Intent(c, AlarmService.class).putExtra("alarm", a));
    }
}
