package com.vitra.sitayapitv

import android.view.KeyEvent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

/**
 * Mi Box kumandası: OK menüyü açar (FlowMenu.kt), yukarı/aşağı menüde gezer;
 * sağ/sol ürün fotoğrafları, teklif sayfaları ve videolar arasında gezinir;
 * Oynat/Durdur videoyu durdurur/başlatır. Etkinlik (MainActivity.dispatchKeyEvent)
 * tuşları buraya yollar; o an açık ekran dinler. Menü açıkken ([menuOpen])
 * ekranlar tuşları yok sayar — tuşlar yalnız menüye gider.
 */
enum class RemoteKey { LEFT, RIGHT, UP, DOWN, SELECT, PLAY_PAUSE }

object RemoteKeys {
    private val _events = MutableSharedFlow<RemoteKey>(extraBufferCapacity = 8)
    val events: SharedFlow<RemoteKey> = _events

    @Volatile
    var menuOpen: Boolean = false

    /** Tuş bu uygulama için anlamlıysa yayınlar ve true döner (sistem işlemesin). */
    fun handle(event: KeyEvent): Boolean {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_PREVIOUS -> RemoteKey.LEFT
            KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_NEXT -> RemoteKey.RIGHT
            KeyEvent.KEYCODE_DPAD_UP -> RemoteKey.UP
            KeyEvent.KEYCODE_DPAD_DOWN -> RemoteKey.DOWN
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> RemoteKey.SELECT
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> RemoteKey.PLAY_PAUSE
            else -> return false
        }
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) _events.tryEmit(key)
        return true
    }
}
