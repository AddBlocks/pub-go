package com.press2safety.sos

import android.content.Context
import com.press2safety.data.TriggerButton

class ButtonPressDetector(
    private val pressesRequired: Int,
    private val pressWindowMs: Long,
    private val allowedButtons: Set<TriggerButton>,
    private val onSosTriggered: () -> Unit
) {
    private val pressTimestamps = ArrayDeque<Long>()

    fun onButtonPressed(button: TriggerButton) {
        if (button !in allowedButtons) return

        val now = System.currentTimeMillis()
        pressTimestamps.addLast(now)
        trimOldPresses(now)

        if (pressTimestamps.size >= pressesRequired) {
            pressTimestamps.clear()
            onSosTriggered()
        }
    }

    private fun trimOldPresses(now: Long) {
        while (pressTimestamps.isNotEmpty() && now - pressTimestamps.first() > pressWindowMs) {
            pressTimestamps.removeFirst()
        }
    }
}

object SosState {
    @Volatile
    var isActive: Boolean = false
        private set

    @Volatile
    var lastTriggeredAt: Long = 0L
        private set

    fun markTriggered() {
        isActive = true
        lastTriggeredAt = System.currentTimeMillis()
    }

    fun markCompleted() {
        isActive = false
    }
}
