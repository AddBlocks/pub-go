package com.press2safety.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.press2safety.MainActivity
import com.press2safety.Press2SafetyApp
import com.press2safety.R
import com.press2safety.accessibility.SosAccessibilityService
import com.press2safety.data.ConfigRepository

class SosMonitorService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_REFRESH -> SosAccessibilityService.instance?.refreshDetector()
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        val config = ConfigRepository(this).load()
        val openAppIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val status = if (config.enabled) {
            getString(R.string.notification_monitoring_on)
        } else {
            getString(R.string.notification_monitoring_off)
        }

        return NotificationCompat.Builder(this, Press2SafetyApp.NOTIFICATION_CHANNEL_MONITOR)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(status)
            .setSmallIcon(R.drawable.ic_sos)
            .setOngoing(true)
            .setContentIntent(openAppIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        const val ACTION_REFRESH = "com.press2safety.action.REFRESH_MONITOR"
        private const val NOTIFICATION_ID = 1001

        fun start(context: android.content.Context) {
            val intent = Intent(context, SosMonitorService::class.java)
            context.startForegroundService(intent)
        }

        fun refresh(context: android.content.Context) {
            val intent = Intent(context, SosMonitorService::class.java).apply {
                action = ACTION_REFRESH
            }
            context.startForegroundService(intent)
        }
    }
}
