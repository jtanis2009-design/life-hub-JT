package nl.lifehub.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/** The full-screen alarm, over the lock screen. */
public class AlarmActivity extends Activity {
    static final String CLOSE = "nl.lifehub.app.CLOSE_ALARM";
    private JSONObject a;
    private final BroadcastReceiver closer = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { finish(); } };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        setShowWhenLocked(true); setTurnScreenOn(true);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try { a = new JSONObject(getIntent().getStringExtra("alarm")); } catch (Exception e) { a = new JSONObject(); }
        int dp = (int) getResources().getDisplayMetrics().density;
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#0d0f14")); root.setPadding(28 * dp, 28 * dp, 28 * dp, 28 * dp);
        TextView clock = new TextView(this); clock.setText(new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date()));
        clock.setTextSize(88); clock.setTextColor(Color.WHITE); clock.setGravity(Gravity.CENTER);
        TextView label = new TextView(this); label.setText(a.optString("label", "Wake up!")); label.setTextSize(24); label.setTextColor(Color.parseColor("#c8c2ff")); label.setGravity(Gravity.CENTER);
        root.addView(clock); root.addView(label);
        String info = a.optString("info", "");
        if (!info.isEmpty()) { TextView t = new TextView(this); t.setText(info); t.setTextSize(16); t.setTextColor(Color.parseColor("#ffd36b")); t.setGravity(Gravity.CENTER); t.setPadding(0, 18 * dp, 0, 0); root.addView(t); }
        root.addView(space(28 * dp));
        root.addView(button("☀️  I'm up", "#9b8cff", "#0d0f14", dp, v -> { stop(); openLifeHub(); }));
        root.addView(space(14 * dp));
        root.addView(button("😴  Snooze " + a.optInt("snooze", 9) + " min", "#2a2740", "#ffffff", dp, v -> { startService(new Intent(this, AlarmService.class).setAction(AlarmService.SNOOZE)); finish(); }));
        String group = a.optString("group", "");
        if (!group.isEmpty() && Store.hasBackupsLeft(this, group)) {
            root.addView(space(14 * dp));
            root.addView(button("✅  I'm really awake (no back-ups)", "#1f3a2c", "#7dffb2", dp, v -> { Store.skipGroup(this, group); stop(); openLifeHub(); }));
        }
        setContentView(root);
        registerReceiver(closer, new IntentFilter(CLOSE), Context.RECEIVER_NOT_EXPORTED);
    }
    private void stop() { startService(new Intent(this, AlarmService.class).setAction(AlarmService.STOP)); finish(); }
    private void openLifeHub() { startActivity(new Intent(this, MainActivity.class).putExtra("url", Store.HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
    private TextView space(int h) { TextView v = new TextView(this); v.setHeight(h); return v; }
    private Button button(String text, String bg, String fg, int dp, android.view.View.OnClickListener l) {
        Button btn = new Button(this); btn.setText(text); btn.setTextSize(20); btn.setAllCaps(false); btn.setTextColor(Color.parseColor(fg));
        GradientDrawable d = new GradientDrawable(); d.setColor(Color.parseColor(bg)); d.setCornerRadius(22 * dp); btn.setBackground(d);
        btn.setPadding(0, 22 * dp, 0, 22 * dp); btn.setOnClickListener(l);
        btn.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return btn;
    }
    @Override public void onBackPressed() { /* an alarm can't be swiped away: tap a button */ }
    @Override protected void onDestroy() { try { unregisterReceiver(closer); } catch (Exception ignored) {} super.onDestroy(); }
}
