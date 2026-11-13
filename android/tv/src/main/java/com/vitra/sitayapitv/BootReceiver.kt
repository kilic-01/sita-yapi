package com.vitra.sitayapitv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** TV/Stick açıldığında uygulamayı kendiliğinden ön plana getirir. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Açılışta ve uzaktan güncelleme kurulduktan sonra (MY_PACKAGE_REPLACED) uygulama yeniden açılır.
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
