import { forwardRef, useImperativeHandle, useRef } from "react";
import Hls from "hls.js";

const PIP_W = 640;
const PIP_H = 360;

// Kameralar sekmesinden ayrı, App seviyesinde HER ZAMAN mount edilmiş bir
// bileşen — Picture-in-Picture aktifken kullanıcı başka bir sekmeye (Kameralar
// sekmesi kapanıp CameraTile yok olsa bile) ya da başka bir uygulamaya geçse
// dahi görüntü akmaya devam etsin diye. Kendi bağımsız RTSP/HLS bağlantısını
// tutar (camera.js'teki referans sayımı sayesinde aynı kanalın ızgaradaki
// akışıyla çakışmaz).
//
// `start()` dışarıya imperative handle olarak açılıyor ve butona tıklanınca
// SENKRON biçimde çağrılıyor — requestPictureInPicture() tarayıcı tarafından
// sadece kullanıcı eyleminin (click) hemen ardından izin veriliyor; bir React
// state güncellemesiyle bir sonraki render'a ertelenirse tarayıcı sessizce
// reddediyordu (önceki sürümdeki hata buydu).
const PipPlayer = forwardRef(function PipPlayer(_props, ref) {
  const sourceVideoRef = useRef(null);
  const pipVideoRef = useRef(null);
  const hlsRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const currentRef = useRef(null); // { dvrId, channelId }
  const startIdRef = useRef(0);

  function teardown() {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (currentRef.current) {
      window.api.stopCamera(currentRef.current.dvrId, currentRef.current.channelId);
      currentRef.current = null;
    }
  }

  function connectSource(dvrId, channelId) {
    window.api
      .startCamera(dvrId, channelId)
      .then((streamUrl) => {
        if (currentRef.current?.dvrId !== dvrId || currentRef.current?.channelId !== channelId) return;
        const video = sourceVideoRef.current;
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 3,
            liveSyncDurationCount: 1,
            liveMaxLatencyDurationCount: 3,
            maxLiveSyncPlaybackRate: 1.5,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = streamUrl;
          video.play().catch(() => {});
        }
      })
      .catch(() => {});
  }

  useImperativeHandle(ref, () => ({
    async start(dvrId, channel) {
      // Üst üste/çift tıklamada önceki denemenin play()/PiP zincirini
      // sessizce iptal ediyoruz ki "Uncaught AbortError" konsolu kirletmesin
      // ve gerçek hatayı görmemizi engellemesin.
      const myId = ++startIdRef.current;
      teardown();
      currentRef.current = { dvrId, channelId: channel.id };

      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      const canvas = canvasRef.current;
      canvas.width = PIP_W;
      canvas.height = PIP_H;
      const ctx = canvas.getContext("2d");
      // Akışın en az bir gerçek kare içermesiyle başlaması bazı Chromium
      // sürümlerinde play()'in "interrupted" hatasıyla başarısız olmasını
      // engelliyor — tamamen boş bir canvas'tan captureStream() almak yerine.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, PIP_W, PIP_H);
      const sourceVideo = sourceVideoRef.current;
      const pipVideo = pipVideoRef.current;

      async function playWithRetry() {
        try {
          await pipVideo.play();
        } catch (err) {
          if (err?.name !== "AbortError") throw err;
          // Chromium'un ara sıra rastladığı geçici "interrupted by a new
          // load request" hatası — bir kez daha denemek genelde yeterli.
          await new Promise((r) => setTimeout(r, 50));
          await pipVideo.play();
        }
      }

      try {
        pipVideo.pause();
        pipVideo.srcObject = null;
        // Kullanıcının tıklamasıyla aynı çağrı zincirinde, senkrona en yakın
        // şekilde PiP'i aç — içerik henüz gelmemiş olsa bile (canvas boş/siyah
        // başlar, RTSP bağlantısı kurulunca birkaç yüz ms içinde dolar).
        pipVideo.srcObject = canvas.captureStream(20);
        await playWithRetry();
        if (startIdRef.current !== myId) return; // bu arada yeni bir istek geldi
        await pipVideo.requestPictureInPicture();
        if (startIdRef.current !== myId) return;
      } catch (err) {
        console.error("PiP açılamadı:", err?.name, err?.message);
        return;
      }

      function handleLeave() {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      pipVideo.addEventListener("leavepictureinpicture", handleLeave, { once: true });

      intervalRef.current = setInterval(() => {
        if (sourceVideo.videoWidth && sourceVideo.videoHeight) {
          ctx.drawImage(sourceVideo, 0, 0, PIP_W, PIP_H);
        }
      }, 50);

      // Gerçek RTSP/HLS bağlantısı PiP açıldıktan sonra, ayrı olarak kurulur
      // — requestPictureInPicture çağrısını beklemesine gerek yok.
      connectSource(dvrId, channel.id);
    },
  }));

  return (
    <>
      <video
        ref={sourceVideoRef}
        muted
        playsInline
        style={{ position: "fixed", top: -9999, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      <video
        ref={pipVideoRef}
        muted
        playsInline
        style={{ position: "fixed", top: -9999, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
    </>
  );
});

export default PipPlayer;
