package com.press2safety.sos

import android.content.Context
import android.content.Intent
import com.press2safety.data.ConfigRepository
import com.press2safety.service.SosResponseService
import com.press2safety.util.LocationHelper
import com.press2safety.util.SmsSender
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object SosOrchestrator {

    fun trigger(context: Context) {
        if (SosState.isActive) return

        val appContext = context.applicationContext
        val config = ConfigRepository(appContext).load()
        if (!config.enabled) return

        SosState.markTriggered()

        CoroutineScope(Dispatchers.IO).launch {
            val location = if (config.includeLocationInInitialSms) {
                LocationHelper.getCurrentLocation(appContext)
            } else {
                null
            }

            val initialMessage = buildString {
                append(config.smsMessage)
                append("\n\nTime: ${java.text.SimpleDateFormat.getDateTimeInstance().format(java.util.Date())}")
                if (location != null) {
                    append("\n")
                    append(LocationHelper.formatLocationMessage(location, "Current position:"))
                }
                append("\n\nAudio recording and live location updates will follow.")
            }

            SmsSender.sendToAll(appContext, config.smsContacts, initialMessage)

            val serviceIntent = Intent(appContext, SosResponseService::class.java).apply {
                action = SosResponseService.ACTION_START_SOS
            }
            appContext.startForegroundService(serviceIntent)
        }
    }
}
