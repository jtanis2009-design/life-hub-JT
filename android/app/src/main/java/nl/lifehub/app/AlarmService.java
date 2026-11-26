package nl.lifehub.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import java.io.File;
import org.json.JSONObject;

/** Rings: loud, looping, on the ALARM volume, with vibration, until "I'm up" or Snooze (or 15 minutes). */
public class AlarmService extends Service {
    static final String STOP = "stop", SNOOZE = "snooze";
    private MediaPlayer mp; private Vibrator vib; private PowerManager.WakeLock wl;
    private final Handler h = new Handler(Looper.getMainLooper());
    private JSONObject cur; private float vol = 0.4f;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent in, int flags, int id) {
        String act = in == null ? null : in.getAction();
        if (STOP.equals(act)) { stopAll(); return START_NOT_STICKY; }
        if (SNOOZE.equals(act)) { snooze(); return START_NOT_STICKY; }
        try { cur = new JSONObject(in.getStringExtra("alarm")); } catch (Exception e) { cur = new JSONObject(); }
        stopSound();
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel("alarm", "Alarms", NotificationManager.IMPORTANCE_HIGH);
        ch.setSound(null, null); ch.setBypassDnd(true); ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
        Intent full = new Intent(this, AlarmActivity.class).putExtra("alarm", cur.toString()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent fullPi = PendingIntent.getActivity(this, 0, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent upPi = PendingIntent.getService(this, 1, new Intent(this, AlarmService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent snPi = PendingIntent.getService(this, 2, new Intent(this, AlarmService.class).setAction(SNOOZE), PendingIntent.FLAG_IMMUTABLE);
        String label = cur.optString("label", "Alarm");
        Notification n = new Notification.Builder(this, "alarm").setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("⏰ " + label).setContentText(cur.optString("info", "Wake up!")).setCategory(Notification.CATEGORY_ALARM)
            .setOngoing(true).setFullScreenIntent(fullPi, true).setContentIntent(fullPi)
            .addAction(new Notification.Action.Builder(0, "☀️ I'm up", upPi).build())
            .addAction(new Notification.Action.Builder(0, "😴 Snooze", snPi).build()).build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(42, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK); else startForeground(42, n);
        try { startActivity(full); } catch (Exception ignored) {}            /* allowed for alarm apps; otherwise the full-screen notification does it */
        PowerManager pm = getSystemService(PowerManager.class);
        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lifehub:alarm"); wl.acquire(16 * 60 * 1000L);
        play();
        h.postDelayed(this::stopAll, 15 * 60 * 1000L);                       /* like a Clock app: give up after 15 minutes */
        return START_NOT_STICKY;
    }

    private void play() {
        Uri u = null;
        File f = new File(new File(getFilesDir(), "sounds"), Bridge.safe(cur.optString("sound", "")));
        if (!cur.optString("sound", "").isEmpty() && f.exists()) u = Uri.fromFile(f);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        try {
            mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            mp.setDataSource(this, u); mp.setLooping(true); mp.prepare();
            int start = cur.optInt("start", 0); if (start > 0 && f.exists()) mp.seekTo(start * 1000);
            vol = cur.optInt("fade", 10) > 0 ? 0.4f : 1f; mp.setVolume(vol, vol); mp.start();
            ramp();
        } catch (Exception e) {                                              /* the file didn't play: the phone's own alarm sound */
            try { mp = MediaPlayer.create(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)); mp.setLooping(true); mp.start(); } catch (Exception ignored) {}
        }
        vib = getSystemService(Vibrator.class);
        if (vib != null) vib.vibrate(VibrationEffect.createWaveform(new long[]{0, 700, 400, 700, 400}, 0),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
    }
    private void ramp() { h.postDelayed(() -> { if (mp == null) return; vol = Math.min(1f, vol + 0.06f); try { mp.setVolume(vol, vol); } catch (Exception ignored) {} if (vol < 1f) ramp(); }, 1000); }

    private void snooze() {
        int m = cur == null ? 9 : cur.optInt("snooze", 9);
        try { JSONObject s = new JSONObject(cur.toString()).put("id", "snooze" + System.currentTimeMillis()).put("at", System.currentTimeMillis() + m * 60000L); Store.addAlarm(this, s); } catch (Exception ignored) {}
        stopAll();
    }
    private void stopSound() {
        h.removeCallbacksAndMessages(null);
        if (mp != null) { try { mp.stop(); mp.release(); } catch (Exception ignored) {} mp = null; }
        if (vib != null) vib.cancel();
    }
    private void stopAll() {
        stopSound();
        if (wl != null && wl.isHeld()) wl.release();
        sendBroadcast(new Intent(AlarmActivity.CLOSE).setPackage(getPackageName()));
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf();
    }
    @Override public void onDestroy() { stopSound(); if (wl != null && wl.isHeld()) wl.release(); super.onDestroy(); }
}
