package nl.lifehub.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** after a restart, an update or a clock change: set everything again */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent in) { Store.scheduleAlarms(c); Store.scheduleReminders(c); }
}
