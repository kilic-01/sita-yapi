package com.vitra.sitayapitv

import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

// VitrA Türkiye YouTube kanalı (youtube.com/@VitrATürkiye). "UULF" önekli
// liste, kanalın "Videolar" sekmesindekilerin (Shorts ve canlı yayınlar
// hariç) otomatik oluşturulan oynatma listesi — kanala yeni video eklendikçe
// burada da kendiliğinden görünür.
private const val VITRA_PLAYLIST = "UULF2Sx8rluV2hdSLs5UnIqs_A"

// Kanalda 2 saate varan uzun videolar (canlı yayın kayıtları, seminerler)
// da var — vitrinde sadece kısa ürün videoları dönsün diye bundan uzunları
// atlanır. YouTube listeyi süreye göre filtrelemeye izin vermediği için kontrol,
// her video başladığında oynatıcının bildirdiği süreye bakılarak yapılır.
private const val MAX_VIDEO_SECONDS = 5 * 60

// Ofiste müşteriyle konuşurken sürekli ses rahatsız etmesin diye sessiz.
// Sesli istenirse false yapılması yeterli.
private const val VIDEO_MUTED = true

// YouTube gömülü oynatıcısı, sayfanın geçerli bir https kökeni (Referer)
// olmasını istiyor; yoksa "Hata 153" veriyor. Sayfa yerelde üretildiği için
// sabit bir köken veriliyor.
private const val PAGE_ORIGIN = "https://tv.sitayapi.local"

/**
 * Bekleme ekranında belirli süre kalındığında gösterilen tam ekran video
 * döngüsü. YouTube'un resmi IFrame oynatıcısı bir WebView içinde çalışır.
 * Liste hiç açılamazsa (internet yok, YouTube erişilemez) [onFailed]
 * çağrılır ve TvApp bekleme ekranına geri döner.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun VideoScreen(onFailed: () -> Unit) {
    val failed = rememberUpdatedState(onFailed)
    var webView by remember { mutableStateOf<WebView?>(null) }
    // Kumanda: Oynat-Durdur videoyu durdurur ya da sürdürür; sağ/sol
    // önceki/sonraki videoya geçer. OK menüyü açar (FlowMenu.kt); menü açıkken tuşlar yok sayılır.
    LaunchedEffect(webView) {
        val view = webView ?: return@LaunchedEffect
        RemoteKeys.events.collect { key ->
            if (RemoteKeys.menuOpen) return@collect
            val js = when (key) {
                RemoteKey.PLAY_PAUSE -> "player && (player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo())"
                RemoteKey.RIGHT -> "player && player.nextVideo()"
                RemoteKey.LEFT -> "player && player.previousVideo()"
                else -> return@collect
            }
            view.evaluateJavascript(js, null)
        }
    }
    AndroidView(
        modifier = Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black),
        factory = { context ->
            WebView(context).apply {
                setBackgroundColor(Color.BLACK)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                // Kumandayla odaklanıp oynatıcı kontrollerine girilmesin.
                isFocusable = false
                isFocusableInTouchMode = false
                webChromeClient = WebChromeClient()
                val main = Handler(Looper.getMainLooper())
                addJavascriptInterface(object {
                    @JavascriptInterface
                    fun failed() {
                        main.post { failed.value() }
                    }
                }, "SitaTv")
                webViewClient = object : WebViewClient() {
                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                        if (request.isForMainFrame || request.url.host == "www.youtube.com") {
                            main.post { failed.value() }
                        }
                    }
                }
                loadDataWithBaseURL(PAGE_ORIGIN, playerHtml(), "text/html", "utf-8", null)
            }.also { webView = it }
        },
        onRelease = { webView ->
            webView.stopLoading()
            webView.destroy()
        },
    )
}

private fun playerHtml(): String = """
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #player { position: fixed; inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity 0.4s; }
  #player.visible { opacity: 1; }
</style>
</head>
<body>
<div id="player"></div>
<script>
  // Arka arkaya bu kadar video açılamazsa (bölge kısıtı, kaldırılmış video
  // değil; büyük ihtimalle bağlantı sorunu) vazgeçip bekleme ekranına dönülür.
  var MAX_CONSECUTIVE_ERRORS = 5;
  var MAX_SECONDS = $MAX_VIDEO_SECONDS;
  var errors = 0;
  var skipped = 0;
  var checkedId = null;
  var player;
  // Sessiz oynatılan videolarda YouTube otomatik altyazıyı ("[Music]") kendiliğinden
  // açabiliyor; vitrinde altyazı istenmiyor — her video başladığında kapatılır.
  function hideCaptions() {
    try { player.unloadModule('captions'); player.unloadModule('cc'); } catch (e) {}
  }
  function fail() { if (window.SitaTv) SitaTv.failed(); }
  function frame() { return document.getElementById('player'); }
  function show(visible) { frame().classList.toggle('visible', visible); }

  // Süresi uzun olan video bir an bile görünmesin diye oynatıcı, her yeni
  // video başladığında gizlenir; süre kontrolünü geçen video görünür olur.
  // Süre bazen oynatma başladıktan biraz sonra gelir (0 döner) — kısa
  // aralıklarla tekrar bakılır.
  function checkDuration(attempt) {
    var d = player.getDuration();
    if (!d && attempt < 10) { setTimeout(function () { checkDuration(attempt + 1); }, 300); return; }
    if (d > MAX_SECONDS) {
      skipped++;
      var total = (player.getPlaylist() || []).length;
      // Listedeki her video uzun çıktıysa sonsuz atlamaya girmeden vazgeç.
      if (total && skipped > total) { fail(); return; }
      player.nextVideo();
      return;
    }
    skipped = 0;
    checkedId = (player.getVideoData() || {}).video_id;
    show(true);
  }
  // YouTube API'si hiç yüklenemezse (internet yok) beklemede kalmasın.
  var loadTimeout = setTimeout(fail, 20000);
  function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      playerVars: {
        listType: 'playlist',
        list: '$VITRA_PLAYLIST',
        autoplay: 1,
        mute: ${if (VIDEO_MUTED) 1 else 0},
        controls: 0,
        rel: 0,
        iv_load_policy: 3,
        disablekb: 1,
        playsinline: 1,
        loop: 1,
        cc_load_policy: 0,
        origin: '$PAGE_ORIGIN'
      },
      events: {
        onReady: function (e) {
          clearTimeout(loadTimeout);
          e.target.setShuffle(true);
          e.target.setLoop(true);
          // Karıştırma ilk videoyu etkilemiyor; her açılışta aynı video
          // başlamasın diye başlangıç da rastgele seçilir.
          var list = e.target.getPlaylist() || [];
          e.target.playVideoAt(list.length ? Math.floor(Math.random() * list.length) : 0);
        },
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.UNSTARTED || e.data === YT.PlayerState.ENDED) show(false);
          if (e.data === YT.PlayerState.PLAYING) {
            hideCaptions();
            errors = 0;
            var id = (player.getVideoData() || {}).video_id;
            if (id !== checkedId) { show(false); checkDuration(0); }
          }
        },
        onError: function (e) {
          errors++;
          if (errors >= MAX_CONSECUTIVE_ERRORS) { fail(); return; }
          e.target.nextVideo();
        }
      }
    });
  }
</script>
<script src="https://www.youtube.com/iframe_api" onerror="fail()"></script>
</body>
</html>
""".trimIndent()

/**
 * Ürün ekranındaki tek video slaytı (VitrA kanalındaki seri tanıtım videosu).
 * Sessiz, kontrolsüz oynar; bitince, açılamazsa ya da MAX_VIDEO_SECONDS'tan
 * uzunsa [onEnded] çağrılır ve sıradaki slayta geçilir.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ProductVideo(videoId: String, onEnded: () -> Unit, modifier: Modifier = Modifier) {
    val ended = rememberUpdatedState(onEnded)
    AndroidView(
        modifier = modifier.background(androidx.compose.ui.graphics.Color.Black),
        factory = { context ->
            WebView(context).apply {
                setBackgroundColor(Color.BLACK)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                isFocusable = false
                isFocusableInTouchMode = false
                webChromeClient = WebChromeClient()
                val main = Handler(Looper.getMainLooper())
                addJavascriptInterface(object {
                    @JavascriptInterface
                    fun failed() {
                        main.post { ended.value() }
                    }
                }, "SitaTv")
                loadDataWithBaseURL(PAGE_ORIGIN, singleVideoHtml(videoId), "text/html", "utf-8", null)
            }
        },
        onRelease = { webView ->
            webView.stopLoading()
            webView.destroy()
        },
    )
}

private fun singleVideoHtml(videoId: String): String = """
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #player { position: fixed; inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity 0.4s; }
  #player.visible { opacity: 1; }
</style>
</head>
<body>
<div id="player"></div>
<script>
  var player;
  // Sessiz oynatılan videolarda YouTube otomatik altyazıyı ("[Music]") kendiliğinden
  // açabiliyor; vitrinde altyazı istenmiyor — her video başladığında kapatılır.
  function hideCaptions() {
    try { player.unloadModule('captions'); player.unloadModule('cc'); } catch (e) {}
  }
  function done() { if (window.SitaTv) SitaTv.failed(); }
  var loadTimeout = setTimeout(done, 20000);
  function checkDuration(attempt) {
    var d = player.getDuration();
    if (!d && attempt < 10) { setTimeout(function () { checkDuration(attempt + 1); }, 300); return; }
    if (d > $MAX_VIDEO_SECONDS) { done(); return; }
    document.getElementById('player').classList.add('visible');
  }
  function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      videoId: '${videoId.filter { it.isLetterOrDigit() || it == '-' || it == '_' }}',
      playerVars: { autoplay: 1, mute: 1, controls: 0, rel: 0, iv_load_policy: 3, disablekb: 1, playsinline: 1, cc_load_policy: 0, origin: '$PAGE_ORIGIN' },
      events: {
        onReady: function (e) { clearTimeout(loadTimeout); e.target.playVideo(); },
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.PLAYING) { hideCaptions(); checkDuration(0); }
          if (e.data === YT.PlayerState.ENDED) done();
        },
        onError: done
      }
    });
  }
</script>
<script src="https://www.youtube.com/iframe_api" onerror="done()"></script>
</body>
</html>
""".trimIndent()
