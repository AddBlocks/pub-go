package com.press2safety

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.press2safety.data.ConfigRepository

class Press2SafetyApp : Application() {

    lateinit var configRepository: ConfigRepository
        private set

    override fun onCreate() {
        super.onCreate()
        configRepository = ConfigRepository(this)
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java)

        val monitorChannel = NotificationChannel(
            NOTIFICATION_CHANNEL_MONITOR,
            getString(R.string.channel_monitor_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.channel_monitor_description)
        }

        val sosChannel = NotificationChannel(
            NOTIFICATION_CHANNEL_SOS,
            getString(R.string.channel_sos_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.channel_sos_description)
        }

        manager.createNotificationChannel(monitorChannel)
        manager.createNotificationChannel(sosChannel)
    }

    companion object {
        const val NOTIFICATION_CHANNEL_MONITOR = "monitor"
        const val NOTIFICATION_CHANNEL_SOS = "sos_active"
    }
}
