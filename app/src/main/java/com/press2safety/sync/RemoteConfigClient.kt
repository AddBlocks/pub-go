package com.press2safety.sync

import android.content.Context
import com.press2safety.data.ConfigRepository
import com.press2safety.data.SosConfig
import com.press2safety.data.TriggerButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

data class SyncSettings(
    val serverUrl: String,
    val deviceToken: String,
    val remoteManaged: Boolean,
    val tenantName: String?,
    val lastSyncAt: Long
)

data class SyncResult(
    val success: Boolean,
    val message: String,
    val config: SosConfig? = null
)

class RemoteConfigClient(private val context: Context) {

    private val configRepository = ConfigRepository(context)

    fun loadSyncSettings(): SyncSettings {
        return configRepository.loadSyncSettings()
    }

    fun saveSyncSettings(serverUrl: String, deviceToken: String, remoteManaged: Boolean) {
        configRepository.saveSyncSettings(serverUrl.trim(), deviceToken.trim(), remoteManaged)
    }

    suspend fun syncNow(): SyncResult = withContext(Dispatchers.IO) {
        val settings = loadSyncSettings()
        if (settings.serverUrl.isBlank() || settings.deviceToken.isBlank()) {
            return@withContext SyncResult(false, "Server URL and device token are required")
        }

        val baseUrl = settings.serverUrl.trimEnd('/')
        val endpoint = "$baseUrl/api/device/config"

        runCatching {
            val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 15_000
                readTimeout = 15_000
                setRequestProperty("X-Device-Token", settings.deviceToken)
                setRequestProperty("Accept", "application/json")
            }

            val code = connection.responseCode
            val body = readStream(connection, code in 200..299)
            connection.disconnect()

            if (code !in 200..299) {
                val error = runCatching { JSONObject(body).optString("error") }.getOrNull()
                return@withContext SyncResult(false, error ?: "Server error ($code)")
            }

            val json = JSONObject(body)
            val config = parseConfig(json)
            configRepository.save(config)
            configRepository.saveSyncMetadata(
                tenantName = json.optString("tenantName", null),
                lastSyncAt = System.currentTimeMillis()
            )

            SyncResult(
                success = true,
                message = "Configuration synced from ${json.optString("tenantName", "server")}",
                config = config
            )
        }.getOrElse { error ->
            SyncResult(false, error.message ?: "Sync failed")
        }
    }

    private fun parseConfig(json: JSONObject): SosConfig {
        val triggerNames = json.optJSONArray("triggerButtons") ?: org.json.JSONArray()
        val triggers = buildSet {
            for (i in 0 until triggerNames.length()) {
                runCatching { add(TriggerButton.valueOf(triggerNames.getString(i))) }
            }
        }

        fun jsonStringList(key: String): List<String> {
            val array = json.optJSONArray(key) ?: return emptyList()
            return buildList {
                for (i in 0 until array.length()) add(array.getString(i))
            }
        }

        return SosConfig(
            enabled = json.optBoolean("enabled", false),
            smsContacts = jsonStringList("smsContacts"),
            whatsAppContacts = jsonStringList("whatsAppContacts"),
            locationShareContacts = jsonStringList("locationShareContacts"),
            smsMessage = json.optString("smsMessage", SosConfig.DEFAULT_SMS_MESSAGE),
            recordingDurationSeconds = json.optInt("recordingDurationSeconds", 60),
            locationShareIntervalSeconds = json.optInt("locationShareIntervalSeconds", 30),
            locationShareDurationMinutes = json.optInt("locationShareDurationMinutes", 30),
            triggerButtons = triggers.ifEmpty { setOf(TriggerButton.VOLUME_UP, TriggerButton.VOLUME_DOWN) },
            pressesRequired = json.optInt("pressesRequired", 3),
            pressWindowMs = json.optLong("pressWindowMs", 2000L),
            includeLocationInInitialSms = json.optBoolean("includeLocationInInitialSms", true)
        )
    }

    private fun readStream(connection: HttpURLConnection, success: Boolean): String {
        val stream = if (success) connection.inputStream else connection.errorStream
        return stream?.bufferedReader()?.use(BufferedReader::readText) ?: ""
    }
}
