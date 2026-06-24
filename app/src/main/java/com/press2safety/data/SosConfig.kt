package com.press2safety.data

enum class TriggerButton {
    VOLUME_UP,
    VOLUME_DOWN,
    POWER
}

data class SosConfig(
    val enabled: Boolean = false,
    val smsContacts: List<String> = emptyList(),
    val whatsAppContacts: List<String> = emptyList(),
    val locationShareContacts: List<String> = emptyList(),
    val smsMessage: String = DEFAULT_SMS_MESSAGE,
    val recordingDurationSeconds: Int = 60,
    val locationShareIntervalSeconds: Int = 30,
    val locationShareDurationMinutes: Int = 30,
    val triggerButtons: Set<TriggerButton> = setOf(TriggerButton.VOLUME_UP, TriggerButton.VOLUME_DOWN),
    val pressesRequired: Int = 3,
    val pressWindowMs: Long = 2000L,
    val includeLocationInInitialSms: Boolean = true
) {
    companion object {
        const val DEFAULT_SMS_MESSAGE =
            "SOS EMERGENCY: I need help immediately. This is an automated alert from Press2Safety."
    }
}
