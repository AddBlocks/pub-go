package com.press2safety.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

object WhatsAppSender {

    private const val WHATSAPP_PACKAGE = "com.whatsapp"
    private const val WHATSAPP_BUSINESS_PACKAGE = "com.whatsapp.w4b"

    fun isInstalled(context: Context): Boolean {
        return isPackageInstalled(context, WHATSAPP_PACKAGE) ||
            isPackageInstalled(context, WHATSAPP_BUSINESS_PACKAGE)
    }

    fun resolvePackage(context: Context): String? {
        return when {
            isPackageInstalled(context, WHATSAPP_PACKAGE) -> WHATSAPP_PACKAGE
            isPackageInstalled(context, WHATSAPP_BUSINESS_PACKAGE) -> WHATSAPP_BUSINESS_PACKAGE
            else -> null
        }
    }

    /**
     * Opens WhatsApp with a voice note attached for the given contact.
     * WhatsApp does not allow fully silent multi-contact delivery without user confirmation
     * on consumer accounts; this uses the official share intent per contact.
     */
    fun shareVoiceNote(context: Context, phoneNumber: String, audioFile: File, caption: String): Boolean {
        val packageName = resolvePackage(context) ?: return false
        val jid = normalizePhoneForWhatsApp(phoneNumber)

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            audioFile
        )

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "audio/*"
            setPackage(packageName)
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra("jid", "$jid@s.whatsapp.net")
            putExtra(Intent.EXTRA_TEXT, caption)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        return runCatching {
            context.startActivity(intent)
            true
        }.getOrDefault(false)
    }

    fun openChatWithText(context: Context, phoneNumber: String, message: String): Boolean {
        val packageName = resolvePackage(context) ?: return false
        val digits = phoneNumber.filter { it.isDigit() }
        val uri = Uri.parse("https://wa.me/$digits?text=${Uri.encode(message)}")

        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage(packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        return runCatching {
            context.startActivity(intent)
            true
        }.getOrDefault(false)
    }

    private fun normalizePhoneForWhatsApp(phone: String): String {
        return phone.filter { it.isDigit() }
    }

    private fun isPackageInstalled(context: Context, packageName: String): Boolean {
        return runCatching {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        }.getOrDefault(false)
    }
}
