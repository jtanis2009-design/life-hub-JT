package nl.lifehub.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Keeps the alarms and reminders Life Hub hands over, and schedules them with Android. */
final class Store {
    static final String HOME = "https://jtanis2009-design.github.io/life-hub-JT/";
    private Store() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("lifehub", Context.MODE_PRIVATE); }

    static JSONArray read(Context c, String key) {
        try { return new JSONArray(prefs(c).getString(key, "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    /* ---------- alarms ---------- */
    static synchronized void setAlarms(Context c, String json) {
        try {
            JSONArray fresh = new JSONArray(json), keep = new JSONArray();
            for (int i = 0; i < fresh.length(); i++) keep.put(fresh.getJSONObject(i));
            JSONArray old = read(c, "alarms");          /* snoozes are made here, not in Life Hub: keep them */
            for (int i = 0; i < old.length(); i++) { JSONObject a = old.getJSONObject(i); if (a.optString("id").startsWith("snooze") && a.optLong("at") > System.currentTimeMillis()) keep.put(a); }
            cancelAll(c, "alarms", AlarmReceiver.class);
            prefs(c).edit().putString("alarms", keep.toString()).apply();
            scheduleAlarms(c);
        } catch (Exception ignored) {}
    }

    static synchronized void addAlarm(Context c, JSONObject a) {
        try { JSONArray all = read(c, "alarms"); cancelAll(c, "alarms", AlarmReceiver.class); all.put(a); prefs(c).edit().putString("alarms", all.toString()).apply(); scheduleAlarms(c); } catch (Exception ignored) {}
    }

    static void scheduleAlarms(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        JSONArray all = read(c, "alarms"); Set<String> skip = skipped(c); long now = System.currentTimeMillis();
        for (int i = 0; i < all.length(); i++) {
            JSONObject a = all.optJSONObject(i); if (a == null) continue;
            long at = a.optLong("at"); if (at <= now || skip.contains(a.optString("group"))) continue;
            Intent in = new Intent(c, AlarmReceiver.class).putExtra("alarm", a.toString());
            PendingIntent pi = PendingIntent.getBroadcast(c, a.optString("id").hashCode(), in, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            PendingIntent show = PendingIntent.getActivity(c, 1, new Intent(c, MainActivity.class).putExtra("url", HOME + "alarm/"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            try { am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), pi); }      /* a real alarm clock: rings in Doze, shows in the status bar */
            catch (SecurityException e) { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); }
        }
    }

    /** "I'm really awake": the back-up alarms of this morning stay quiet */
    static void skipGroup(Context c, String group) {
        Set<String> s = new HashSet<>(skipped(c)); s.add(group);
        prefs(c).edit().putStringSet("skip", s).apply();
        cancelAll(c, "alarms", AlarmReceiver.class); scheduleAlarms(c);
    }
    static Set<String> skipped(Context c) { return prefs(c).getStringSet("skip", new HashSet<>()); }

    static boolean hasBackupsLeft(Context c, String group) {
        JSONArray all = read(c, "alarms"); long now = System.currentTimeMillis();
        for (int i = 0; i < all.length(); i++) { JSONObject a = all.optJSONObject(i); if (a != null && group.equals(a.optString("group")) && a.optLong("at") > now) return true; }
        return false;
    }

    /* ---------- reminders (to-dos, homework, brief, ...) as notifications ---------- */
    static synchronized void setReminders(Context c, String json) {
        try {
            cancelAll(c, "reminders", NotifyReceiver.class);
            prefs(c).edit().putString("reminders", new JSONArray(json).toString()).apply();
            scheduleReminders(c);
        } catch (Exception ignored) {}
    }

    static void scheduleReminders(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        JSONArray all = read(c, "reminders"); long now = System.currentTimeMillis();
        for (int i = 0; i < all.length(); i++) {
            JSONObject r = all.optJSONObject(i); if (r == null || r.optLong("at") <= now) continue;
            PendingIntent pi = PendingIntent.getBroadcast(c, ("r" + r.optString("id")).hashCode(), new Intent(c, NotifyReceiver.class).putExtra("r", r.toString()), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.optLong("at"), pi); else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.optLong("at"), pi);
        }
    }

    private static void cancelAll(Context c, String key, Class<?> cls) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        JSONArray all = read(c, key);
        for (int i = 0; i < all.length(); i++) {
            JSONObject a = all.optJSONObject(i); if (a == null) continue;
            int code = key.equals("alarms") ? a.optString("id").hashCode() : ("r" + a.optString("id")).hashCode();
            PendingIntent pi = PendingIntent.getBroadcast(c, code, new Intent(c, cls), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pi != null) { am.cancel(pi); pi.cancel(); }
        }
    }
}
