package com.nailuxe.studio;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                // High-priority channel for instant chat & studio alerts
                NotificationChannel channel = new NotificationChannel(
                    "nailuxe_alerts",
                    "Nailuxe Alerts & Messages",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Instant alerts for chat messages, voice notes, and studio updates");
                channel.enableVibration(true);
                channel.enableLights(true);
                channel.setShowBadge(true);
                notificationManager.createNotificationChannel(channel);

                // Fallback channel just in case
                NotificationChannel fallback = new NotificationChannel(
                    "fcm_fallback_notification_channel",
                    "General Notifications",
                    NotificationManager.IMPORTANCE_HIGH
                );
                fallback.enableVibration(true);
                notificationManager.createNotificationChannel(fallback);
            }
        }
    }
}
