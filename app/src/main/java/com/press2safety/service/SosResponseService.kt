package com.press2safety.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.press2safety.MainActivity
import com.press2safety.Press2SafetyApp
import com.press2safety.R
import com.press2safety.data.ConfigRepository
import com.press2safety.sos.SosState
import com.press2safety.util.LocationHelper
import com.press2safety.util.SmsSender
import com.press2safety.util.WhatsAppSender
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SosResponseService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var locationJob: Job? = null
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SOS -> startSosResponse()
            ACTION_STOP_SOS -> stopSosResponse()
        }
        return START_STICKY
    }

    private fun startSosResponse() {
        startForeground(NOTIFICATION_ID, buildNotification(getString(R.string.notification_sos_active)))

        val config = ConfigRepository(this).load()
        startLocationUpdates(config)
        serviceScope.launch {
            recordAndDispatch(config)
            stopSosResponse()
        }
    }

    private fun startLocationUpdates(config: com.press2safety.data.SosConfig) {
        locationJob?.cancel()
        locationJob = serviceScope.launch {
            val endTime = System.currentTimeMillis() + config.locationShareDurationMinutes * 60_000L
            var updateIndex = 1

            while (isActive && System.currentTimeMillis() < endTime) {
                val location = LocationHelper.getCurrentLocation(this@SosResponseService)
                if (location != null) {
                    val message = LocationHelper.formatLocationMessage(
                        location,
                        "SOS location update #$updateIndex:"
                    )
                    val recipients = config.locationShareContacts.ifEmpty { config.smsContacts }
                    SmsSender.sendToAll(this@SosResponseService, recipients, message)
                    updateIndex++
                }
                delay(config.locationShareIntervalSeconds * 1000L)
            }
        }
    }

    private suspend fun recordAndDispatch(config: com.press2safety.data.SosConfig) {
        val file = createRecordingFile()
        recordingFile = file

        if (!startRecording(file)) {
            notifyRecordingFailed(config)
            return
        }

        delay(config.recordingDurationSeconds * 1000L)
        stopRecording()

        if (!file.exists() || file.length() == 0L) {
            notifyRecordingFailed(config)
            return
        }

        dispatchRecording(config, file)
    }

    private fun createRecordingFile(): File {
        val dir = File(filesDir, "sos_recordings").apply { mkdirs() }
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        return File(dir, "sos_$timestamp.m4a")
    }

    @Suppress("DEPRECATION")
    private fun startRecording(file: File): Boolean {
        return runCatching {
            recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                MediaRecorder()
            }.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128_000)
                setAudioSamplingRate(44_100)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            true
        }.getOrDefault(false)
    }

    private fun stopRecording() {
        runCatching {
            recorder?.stop()
        }
        runCatching {
            recorder?.release()
        }
        recorder = null
    }

    private fun notifyRecordingFailed(config: com.press2safety.data.SosConfig) {
        val message = "SOS follow-up: environment audio could not be captured. Please respond urgently."
        SmsSender.sendToAll(this, config.smsContacts, message)
    }

    private fun dispatchRecording(config: com.press2safety.data.SosConfig, file: File) {
        val caption = buildString {
            append("SOS voice recording from Press2Safety.")
            append(" Duration: ${config.recordingDurationSeconds}s.")
            append(" Listen to assess emergency level.")
        }

        SmsSender.sendToAll(
            this,
            config.smsContacts,
            "SOS audio captured (${config.recordingDurationSeconds}s). Sending via WhatsApp where configured."
        )

        config.whatsAppContacts.forEach { contact ->
            WhatsAppSender.shareVoiceNote(this, contact, file, caption)
            Thread.sleep(1500)
        }
    }

    private fun stopSosResponse() {
        locationJob?.cancel()
        stopRecording()
        SosState.markCompleted()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun buildNotification(content: String): Notification {
        val openAppIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, Press2SafetyApp.NOTIFICATION_CHANNEL_SOS)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(content)
            .setSmallIcon(R.drawable.ic_sos)
            .setOngoing(true)
            .setContentIntent(openAppIntent)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .build()
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START_SOS = "com.press2safety.action.START_SOS"
        const val ACTION_STOP_SOS = "com.press2safety.action.STOP_SOS"
        private const val NOTIFICATION_ID = 2001
    }
}
