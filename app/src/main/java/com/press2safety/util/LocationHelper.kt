package com.press2safety.util

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

object LocationHelper {

    fun formatMapsLink(location: Location): String {
        return "https://maps.google.com/?q=${location.latitude},${location.longitude}"
    }

    fun formatLocationMessage(location: Location, prefix: String): String {
        val accuracy = location.accuracy
        val speed = if (location.hasSpeed()) " Speed: ${"%.1f".format(location.speed)} m/s." else ""
        return buildString {
            append(prefix)
            append("\nLocation: ${formatMapsLink(location)}")
            append("\nAccuracy: ~${accuracy.toInt()} m.")
            append(speed)
            if (location.hasAltitude()) {
                append(" Altitude: ${"%.0f".format(location.altitude)} m.")
            }
        }
    }

    @SuppressLint("MissingPermission")
    suspend fun getCurrentLocation(context: Context): Location? {
        val client = LocationServices.getFusedLocationProviderClient(context)
        val cancellation = CancellationTokenSource()

        return suspendCancellableCoroutine { continuation ->
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token)
                .addOnSuccessListener { location ->
                    if (continuation.isActive) continuation.resume(location)
                }
                .addOnFailureListener {
                    if (continuation.isActive) continuation.resume(null)
                }

            continuation.invokeOnCancellation {
                cancellation.cancel()
            }
        }
    }
}
