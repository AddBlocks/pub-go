package com.press2safety.accessibility

import android.accessibilityservice.AccessibilityService
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import com.press2safety.data.ConfigRepository
import com.press2safety.data.TriggerButton
import com.press2safety.sos.ButtonPressDetector
import com.press2safety.sos.SosOrchestrator

class SosAccessibilityService : AccessibilityService() {

    private var detector: ButtonPressDetector? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        refreshDetector()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.action != KeyEvent.ACTION_DOWN) return false

        val button = when (event.keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> TriggerButton.VOLUME_UP
            KeyEvent.KEYCODE_VOLUME_DOWN -> TriggerButton.VOLUME_DOWN
            KeyEvent.KEYCODE_POWER -> TriggerButton.POWER
            else -> return false
        }

        detector?.onButtonPressed(button)
        return false
    }

    fun refreshDetector() {
        val config = ConfigRepository(this).load()
        detector = ButtonPressDetector(
            pressesRequired = config.pressesRequired,
            pressWindowMs = config.pressWindowMs,
            allowedButtons = config.triggerButtons,
            onSosTriggered = { SosOrchestrator.trigger(this) }
        )
    }

    companion object {
        @Volatile
        var instance: SosAccessibilityService? = null
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
