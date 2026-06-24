package com.press2safety.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.press2safety.service.SosMonitorService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED ||
            intent?.action == Intent.ACTION_LOCKED_BOOT_COMPLETED
        ) {
            SosMonitorService.start(context.applicationContext)
        }
    }
}
