package com.press2safety

import android.os.Bundle
import android.text.InputType
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.press2safety.data.ConfigRepository
import com.press2safety.data.SosConfig
import com.press2safety.data.TriggerButton
import com.press2safety.databinding.ActivityMainBinding
import com.press2safety.service.SosMonitorService
import com.press2safety.sos.SosOrchestrator
import com.press2safety.sync.RemoteConfigClient
import com.press2safety.util.PermissionHelper
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var configRepository: ConfigRepository
    private lateinit var remoteConfigClient: RemoteConfigClient
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        updateSetupStatus()
        if (results.values.any { !it }) {
            Toast.makeText(this, R.string.permissions_required, Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        configRepository = (application as Press2SafetyApp).configRepository
        remoteConfigClient = RemoteConfigClient(this)
        bindUi()
        requestNeededPermissions()
        SosMonitorService.start(this)
    }

    override fun onResume() {
        super.onResume()
        loadSyncIntoUi()
        loadConfigIntoUi()
        updateSetupStatus()
        applyRemoteManagedState()
    }

    private fun bindUi() {
        binding.btnSave.setOnClickListener { saveFromUi() }
        binding.btnSyncNow.setOnClickListener { syncFromServer() }
        binding.switchRemoteManaged.setOnCheckedChangeListener { _, checked ->
            remoteConfigClient.saveSyncSettings(
                binding.editServerUrl.text.toString(),
                binding.editDeviceToken.text.toString(),
                checked
            )
            applyRemoteManagedState()
        }        binding.btnTestSos.setOnClickListener {
            SosOrchestrator.trigger(this)
            Toast.makeText(this, R.string.test_sos_started, Toast.LENGTH_LONG).show()
        }
        binding.btnEnableAccessibility.setOnClickListener {
            PermissionHelper.openAccessibilitySettings(this)
        }
        binding.btnGrantPermissions.setOnClickListener {
            requestNeededPermissions()
        }
        binding.btnBackgroundLocation.setOnClickListener {
            PermissionHelper.openBackgroundLocationSettings(this)
        }

        binding.btnAddSmsContact.setOnClickListener {
            showAddContactDialog(R.string.dialog_add_sms_contact) { number ->
                val current = parseLines(binding.editSmsContacts.text.toString())
                binding.editSmsContacts.setText((current + number).distinct().joinToString("\n"))
            }
        }

        binding.btnAddWhatsappContact.setOnClickListener {
            showAddContactDialog(R.string.dialog_add_whatsapp_contact) { number ->
                val current = parseLines(binding.editWhatsappContacts.text.toString())
                binding.editWhatsappContacts.setText((current + number).distinct().joinToString("\n"))
            }
        }

        binding.btnAddLocationContact.setOnClickListener {
            showAddContactDialog(R.string.dialog_add_location_contact) { number ->
                val current = parseLines(binding.editLocationContacts.text.toString())
                binding.editLocationContacts.setText((current + number).distinct().joinToString("\n"))
            }
        }

        binding.sliderRecording.addOnChangeListener { _, value, _ ->
            binding.labelRecording.text = getString(R.string.label_recording, value.toInt())
        }
        binding.sliderLocationInterval.addOnChangeListener { _, value, _ ->
            binding.labelLocationInterval.text = getString(R.string.label_location_interval, value.toInt())
        }
        binding.sliderLocationDuration.addOnChangeListener { _, value, _ ->
            binding.labelLocationDuration.text = getString(R.string.label_location_duration, value.toInt())
        }
        binding.sliderPresses.addOnChangeListener { _, value, _ ->
            binding.labelPresses.text = getString(R.string.label_presses, value.toInt())
        }
        binding.sliderPressWindow.addOnChangeListener { _, value, _ ->
            binding.labelPressWindow.text = getString(R.string.label_press_window, value.toInt())
        }
    }

    private fun loadConfigIntoUi() {
        val config = configRepository.load()
        binding.switchEnabled.isChecked = config.enabled
        binding.editSmsContacts.setText(config.smsContacts.joinToString("\n"))
        binding.editWhatsappContacts.setText(config.whatsAppContacts.joinToString("\n"))
        binding.editLocationContacts.setText(
            config.locationShareContacts.joinToString("\n").ifEmpty {
                config.smsContacts.joinToString("\n")
            }
        )
        binding.editSmsMessage.setText(config.smsMessage)
        binding.sliderRecording.value = config.recordingDurationSeconds.toFloat()
        binding.sliderLocationInterval.value = config.locationShareIntervalSeconds.toFloat()
        binding.sliderLocationDuration.value = config.locationShareDurationMinutes.toFloat()
        binding.sliderPresses.value = config.pressesRequired.toFloat()
        binding.sliderPressWindow.value = (config.pressWindowMs / 1000f)
        binding.checkVolumeUp.isChecked = TriggerButton.VOLUME_UP in config.triggerButtons
        binding.checkVolumeDown.isChecked = TriggerButton.VOLUME_DOWN in config.triggerButtons
        binding.checkPower.isChecked = TriggerButton.POWER in config.triggerButtons
        binding.switchIncludeLocation.isChecked = config.includeLocationInInitialSms
        updateLabels()
    }

    private fun loadSyncIntoUi() {
        val sync = remoteConfigClient.loadSyncSettings()
        binding.editServerUrl.setText(sync.serverUrl)
        binding.editDeviceToken.setText(sync.deviceToken)
        binding.switchRemoteManaged.isChecked = sync.remoteManaged

        val lastSync = if (sync.lastSyncAt > 0L) {
            DateFormat.getDateTimeInstance().format(Date(sync.lastSyncAt))
        } else {
            getString(R.string.sync_status_never)
        }

        binding.textSyncStatus.text = getString(
            R.string.sync_status,
            sync.tenantName ?: "-",
            lastSync,
            if (sync.remoteManaged) "ON" else "OFF"
        )
    }

    private fun syncFromServer() {
        remoteConfigClient.saveSyncSettings(
            binding.editServerUrl.text.toString(),
            binding.editDeviceToken.text.toString(),
            binding.switchRemoteManaged.isChecked
        )

        binding.btnSyncNow.isEnabled = false
        lifecycleScope.launch {
            val result = remoteConfigClient.syncNow()
            binding.btnSyncNow.isEnabled = true
            if (result.success) {
                loadSyncIntoUi()
                loadConfigIntoUi()
                updateSetupStatus()
                applyRemoteManagedState()
                SosMonitorService.refresh(this@MainActivity)
                com.press2safety.accessibility.SosAccessibilityService.instance?.refreshDetector()
                Toast.makeText(this@MainActivity, R.string.sync_success, Toast.LENGTH_LONG).show()
            } else {
                Toast.makeText(
                    this@MainActivity,
                    getString(R.string.sync_failed, result.message),
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun applyRemoteManagedState() {
        val remoteManaged = configRepository.isRemoteManaged()
        val configFields = listOf(
            binding.switchEnabled,
            binding.editSmsContacts,
            binding.editWhatsappContacts,
            binding.editLocationContacts,
            binding.editSmsMessage,
            binding.sliderRecording,
            binding.sliderLocationInterval,
            binding.sliderLocationDuration,
            binding.sliderPresses,
            binding.sliderPressWindow,
            binding.checkVolumeUp,
            binding.checkVolumeDown,
            binding.checkPower,
            binding.switchIncludeLocation,
            binding.btnAddSmsContact,
            binding.btnAddWhatsappContact,
            binding.btnAddLocationContact,
            binding.btnSave
        )

        configFields.forEach { it.isEnabled = !remoteManaged }
    }

    private fun saveFromUi() {
        if (configRepository.isRemoteManaged()) {
            Toast.makeText(this, R.string.remote_managed_hint, Toast.LENGTH_LONG).show()
            return
        }        val triggers = buildSet {
            if (binding.checkVolumeUp.isChecked) add(TriggerButton.VOLUME_UP)
            if (binding.checkVolumeDown.isChecked) add(TriggerButton.VOLUME_DOWN)
            if (binding.checkPower.isChecked) add(TriggerButton.POWER)
        }

        if (triggers.isEmpty()) {
            Toast.makeText(this, R.string.error_select_button, Toast.LENGTH_SHORT).show()
            return
        }

        val smsContacts = parseLines(binding.editSmsContacts.text.toString())
        if (smsContacts.isEmpty()) {
            Toast.makeText(this, R.string.error_sms_contact_required, Toast.LENGTH_SHORT).show()
            return
        }

        val config = SosConfig(
            enabled = binding.switchEnabled.isChecked,
            smsContacts = smsContacts,
            whatsAppContacts = parseLines(binding.editWhatsappContacts.text.toString()),
            locationShareContacts = parseLines(binding.editLocationContacts.text.toString()).ifEmpty { smsContacts },
            smsMessage = binding.editSmsMessage.text.toString().trim().ifEmpty { SosConfig.DEFAULT_SMS_MESSAGE },
            recordingDurationSeconds = binding.sliderRecording.value.toInt(),
            locationShareIntervalSeconds = binding.sliderLocationInterval.value.toInt(),
            locationShareDurationMinutes = binding.sliderLocationDuration.value.toInt(),
            triggerButtons = triggers,
            pressesRequired = binding.sliderPresses.value.toInt(),
            pressWindowMs = (binding.sliderPressWindow.value * 1000).toLong(),
            includeLocationInInitialSms = binding.switchIncludeLocation.isChecked
        )

        configRepository.save(config)
        SosMonitorService.refresh(this)
        com.press2safety.accessibility.SosAccessibilityService.instance?.refreshDetector()
        Toast.makeText(this, R.string.config_saved, Toast.LENGTH_SHORT).show()
        updateSetupStatus()
    }

    private fun updateSetupStatus() {
        val missing = PermissionHelper.missingPermissions(this)
        val accessibilityEnabled = PermissionHelper.isAccessibilityServiceEnabled(this)
        val config = configRepository.load()

        binding.textSetupStatus.text = buildString {
            append(getString(R.string.setup_status_title))
            append("\n")
            append(getString(R.string.setup_sms, if (PermissionHelper.hasSmsPermission(this@MainActivity)) "OK" else "MISSING"))
            append("\n")
            append(getString(R.string.setup_mic, if (PermissionHelper.hasMicPermission(this@MainActivity)) "OK" else "MISSING"))
            append("\n")
            append(getString(R.string.setup_location, if (PermissionHelper.hasLocationPermission(this@MainActivity)) "OK" else "MISSING"))
            append("\n")
            append(getString(R.string.setup_background_location, if (PermissionHelper.hasBackgroundLocationPermission(this@MainActivity)) "OK" else "MISSING"))
            append("\n")
            append(getString(R.string.setup_accessibility, if (accessibilityEnabled) "OK" else "MISSING"))
            append("\n")
            append(getString(R.string.setup_monitoring, if (config.enabled) "ON" else "OFF"))
            if (missing.isNotEmpty()) {
                append("\n\n")
                append(getString(R.string.setup_missing_count, missing.size))
            }
        }

        binding.btnEnableAccessibility.isEnabled = !accessibilityEnabled
    }

    private fun requestNeededPermissions() {
        val missing = PermissionHelper.missingPermissions(this)
        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    private fun updateLabels() {
        binding.labelRecording.text = getString(R.string.label_recording, binding.sliderRecording.value.toInt())
        binding.labelLocationInterval.text = getString(R.string.label_location_interval, binding.sliderLocationInterval.value.toInt())
        binding.labelLocationDuration.text = getString(R.string.label_location_duration, binding.sliderLocationDuration.value.toInt())
        binding.labelPresses.text = getString(R.string.label_presses, binding.sliderPresses.value.toInt())
        binding.labelPressWindow.text = getString(R.string.label_press_window, binding.sliderPressWindow.value.toInt())
    }

    private fun showAddContactDialog(titleRes: Int, onAdd: (String) -> Unit) {
        val input = android.widget.EditText(this).apply {
            inputType = InputType.TYPE_CLASS_PHONE
            hint = getString(R.string.hint_phone_number)
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(titleRes)
            .setView(input)
            .setPositiveButton(R.string.add) { _, _ ->
                val number = input.text.toString().trim()
                if (number.isNotEmpty()) onAdd(number)
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun parseLines(text: String): List<String> {
        return text.lines()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
    }
}
