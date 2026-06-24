package com.press2safety.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class ConfigRepository(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(): SosConfig {
        val triggerNames = prefs.getStringSet(KEY_TRIGGER_BUTTONS, null)
            ?: setOf(TriggerButton.VOLUME_UP.name, TriggerButton.VOLUME_DOWN.name)
        val triggers = triggerNames.mapNotNull { runCatching { TriggerButton.valueOf(it) }.getOrNull() }.toSet()

        return SosConfig(
            enabled = prefs.getBoolean(KEY_ENABLED, false),
            smsContacts = prefs.getStringSet(KEY_SMS_CONTACTS, emptySet())?.toList()?.sorted() ?: emptyList(),
            whatsAppContacts = prefs.getStringSet(KEY_WHATSAPP_CONTACTS, emptySet())?.toList()?.sorted() ?: emptyList(),
            locationShareContacts = prefs.getStringSet(KEY_LOCATION_CONTACTS, emptySet())?.toList()?.sorted()
                ?: prefs.getStringSet(KEY_SMS_CONTACTS, emptySet())?.toList()?.sorted()
                ?: emptyList(),
            smsMessage = prefs.getString(KEY_SMS_MESSAGE, SosConfig.DEFAULT_SMS_MESSAGE) ?: SosConfig.DEFAULT_SMS_MESSAGE,
            recordingDurationSeconds = prefs.getInt(KEY_RECORDING_SECONDS, 60).coerceIn(10, 600),
            locationShareIntervalSeconds = prefs.getInt(KEY_LOCATION_INTERVAL, 30).coerceIn(15, 300),
            locationShareDurationMinutes = prefs.getInt(KEY_LOCATION_DURATION, 30).coerceIn(5, 120),
            triggerButtons = triggers.ifEmpty { setOf(TriggerButton.VOLUME_UP, TriggerButton.VOLUME_DOWN) },
            pressesRequired = prefs.getInt(KEY_PRESSES_REQUIRED, 3).coerceIn(2, 5),
            pressWindowMs = prefs.getLong(KEY_PRESS_WINDOW_MS, 2000L).coerceIn(1000L, 5000L),
            includeLocationInInitialSms = prefs.getBoolean(KEY_INCLUDE_LOCATION, true)
        )
    }

    fun save(config: SosConfig) {
        prefs.edit()
            .putBoolean(KEY_ENABLED, config.enabled)
            .putStringSet(KEY_SMS_CONTACTS, config.smsContacts.toSet())
            .putStringSet(KEY_WHATSAPP_CONTACTS, config.whatsAppContacts.toSet())
            .putStringSet(KEY_LOCATION_CONTACTS, config.locationShareContacts.toSet())
            .putString(KEY_SMS_MESSAGE, config.smsMessage)
            .putInt(KEY_RECORDING_SECONDS, config.recordingDurationSeconds)
            .putInt(KEY_LOCATION_INTERVAL, config.locationShareIntervalSeconds)
            .putInt(KEY_LOCATION_DURATION, config.locationShareDurationMinutes)
            .putStringSet(KEY_TRIGGER_BUTTONS, config.triggerButtons.map { it.name }.toSet())
            .putInt(KEY_PRESSES_REQUIRED, config.pressesRequired)
            .putLong(KEY_PRESS_WINDOW_MS, config.pressWindowMs)
            .putBoolean(KEY_INCLUDE_LOCATION, config.includeLocationInInitialSms)
            .apply()
    }

    fun exportJson(): String {
        val config = load()
        return JSONObject().apply {
            put("enabled", config.enabled)
            put("smsContacts", JSONArray(config.smsContacts))
            put("whatsAppContacts", JSONArray(config.whatsAppContacts))
            put("locationShareContacts", JSONArray(config.locationShareContacts))
            put("smsMessage", config.smsMessage)
            put("recordingDurationSeconds", config.recordingDurationSeconds)
            put("locationShareIntervalSeconds", config.locationShareIntervalSeconds)
            put("locationShareDurationMinutes", config.locationShareDurationMinutes)
            put("triggerButtons", JSONArray(config.triggerButtons.map { it.name }))
            put("pressesRequired", config.pressesRequired)
            put("pressWindowMs", config.pressWindowMs)
            put("includeLocationInInitialSms", config.includeLocationInInitialSms)
        }.toString(2)
    }

    fun loadSyncSettings(): com.press2safety.sync.SyncSettings {
        return com.press2safety.sync.SyncSettings(
            serverUrl = prefs.getString(KEY_SERVER_URL, "") ?: "",
            deviceToken = prefs.getString(KEY_DEVICE_TOKEN, "") ?: "",
            remoteManaged = prefs.getBoolean(KEY_REMOTE_MANAGED, false),
            tenantName = prefs.getString(KEY_TENANT_NAME, null),
            lastSyncAt = prefs.getLong(KEY_LAST_SYNC_AT, 0L)
        )
    }

    fun saveSyncSettings(serverUrl: String, deviceToken: String, remoteManaged: Boolean) {
        prefs.edit()
            .putString(KEY_SERVER_URL, serverUrl)
            .putString(KEY_DEVICE_TOKEN, deviceToken)
            .putBoolean(KEY_REMOTE_MANAGED, remoteManaged)
            .apply()
    }

    fun saveSyncMetadata(tenantName: String?, lastSyncAt: Long) {
        prefs.edit()
            .putString(KEY_TENANT_NAME, tenantName)
            .putLong(KEY_LAST_SYNC_AT, lastSyncAt)
            .apply()
    }

    fun isRemoteManaged(): Boolean = prefs.getBoolean(KEY_REMOTE_MANAGED, false)

    companion object {
        private const val PREFS_NAME = "press2safety_config"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_SMS_CONTACTS = "sms_contacts"
        private const val KEY_WHATSAPP_CONTACTS = "whatsapp_contacts"
        private const val KEY_LOCATION_CONTACTS = "location_contacts"
        private const val KEY_SMS_MESSAGE = "sms_message"
        private const val KEY_RECORDING_SECONDS = "recording_seconds"
        private const val KEY_LOCATION_INTERVAL = "location_interval"
        private const val KEY_LOCATION_DURATION = "location_duration"
        private const val KEY_TRIGGER_BUTTONS = "trigger_buttons"
        private const val KEY_PRESSES_REQUIRED = "presses_required"
        private const val KEY_PRESS_WINDOW_MS = "press_window_ms"
        private const val KEY_INCLUDE_LOCATION = "include_location"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_REMOTE_MANAGED = "remote_managed"
        private const val KEY_TENANT_NAME = "tenant_name"
        private const val KEY_LAST_SYNC_AT = "last_sync_at"
    }
}
