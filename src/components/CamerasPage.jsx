import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { RefreshCw, VideoOff, Maximize2, PictureInPicture2 } from "lucide-react";
import { EmptyStateIllustration } from "./illustrations.jsx";
import Modal from "./Modal.jsx";

const ASPECT_OPTIONS = [
  // Bu kameraların gerçek görüntüsü dikey (944×1080) — "Orijinal" seçilince
  // kutu tam görüntüyle eşleşir, hiç kırpılma ya da boşluk kalmaz. 16:9/4:3
  // yatay kutulardır, dikey görüntüyü doldururken üstten/alttan kırpar.
  { id: "native", label: "Orijinal", value: "944 / 1080" },
  { id: "16/9", label: "16:9", value: "16 / 9" },
  { id: "4/3", label: "4:3", value: "4 / 3" },
];

function CameraTile({ dvrId, channel, aspectRatio, large, onExpand, zoom = 1, brightness = 1, pan = { x: 0, y: 0 }, onPan, onRequestPip }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const containerRef = useRef(null);
  const dragState = useRef(null);
  const [status, setStatus] = useState("connecting"); // connecting | playing | error
  const [errorMsg, setErrorMsg] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [now, setNow] = useState(() => new Date());

  // Görüntünün altında akan bir saat — DVR'ın kendi görüntüye bastığı zaman
  // damgasından ayrı olarak, akışın gerçekten canlı/güncel olduğunu (donmadığını)
  // uygulama içinden de teyit etmek için.
  useEffect(() => {
    if (status !== "playing") return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    setStatus("connecting");
    setErrorMsg("");

    window.api
      .startCamera(dvrId, channel.id)
      .then((streamUrl) => {
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;

        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 3,
            liveSyncDurationCount: 1,
            liveMaxLatencyDurationCount: 3,
            // Ufak bir ağ tıkanıklığında oynatıcı canlı noktanın gerisinde
            // kalıp hep öyle kalabiliyordu (gecikme zamanla birikiyordu) —
            // geride kaldığında normalden hızlı oynatarak kendini toparlar.
            maxLiveSyncPlaybackRate: 1.5,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            setStatus("playing");
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (cancelled) return;
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
              return;
            }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            setStatus("error");
            setErrorMsg(`Akış koptu (${data.details || data.type}).`);
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = streamUrl;
          video.addEventListener("loadedmetadata", () => {
            if (cancelled) return;
            setStatus("playing");
            video.play().catch(() => {});
          });
        } else {
          setStatus("error");
          setErrorMsg("Bu tarayıcı HLS akışını desteklemiyor.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err.message || "Kameraya bağlanılamadı.");
      });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      window.api.stopCamera(dvrId, channel.id);
    };
  }, [dvrId, channel.id, retryKey]);

  // Yakınlaştırılmışken (zoom > 1) görüntüyü sürükleyerek kaydırma — ekran
  // piksellerinde 1:1 hareket etsin diye transform'da translate scale'den
  // önce yazılır (translate() scale()), görüntünün taştığı kadarla sınırlanır.
  function clampPan(next, z) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || z <= 1) return { x: 0, y: 0 };
    const maxX = (rect.width * (z - 1)) / 2;
    const maxY = (rect.height * (z - 1)) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function handlePointerDown(e) {
    if (zoom <= 1 || !onPan) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, startPan: pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    onPan(
      clampPan(
        { x: dragState.current.startPan.x + dx, y: dragState.current.startPan.y + dy },
        zoom
      )
    );
  }
  function handlePointerUp() {
    dragState.current = null;
  }

  // PiP artık App seviyesindeki PipPlayer bileşeni tarafından, bu tile'dan
  // bağımsız kendi bağlantısıyla açılıyor — bu sekmeden ayrılsanız (hatta
  // Kameralar sekmesi kapansa) bile akmaya devam etsin diye.
  function handlePip(e) {
    e.stopPropagation();
    onRequestPip?.(dvrId, channel);
  }

  return (
    <div
      ref={containerRef}
      onClick={() => !dragState.current && status === "playing" && onExpand?.()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        background: "#111",
        position: "relative",
        aspectRatio,
        cursor: zoom > 1 ? "grab" : status === "playing" && onExpand ? "pointer" : "default",
        touchAction: "none",
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          width: "100%",
          height: "100%",
          // "fill": kutuya göre esnetir — hiçbir şey kırpılmaz/kaybolmaz ama
          // kutu oranı görüntünün gerçek oranından farklıysa (16:9/4:3) hafif
          // yatay/dikey gerilme olur. "Orijinal" modunda kutu zaten görüntüyle
          // birebir aynı orana sahip olduğu için hiç gerilme olmaz.
          objectFit: "fill",
          display: status === "playing" ? "block" : "none",
          transform: zoom !== 1 ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : undefined,
          filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
          transition: dragState.current ? "none" : "transform 0.1s ease-out, filter 0.1s ease-out",
          pointerEvents: "none",
        }}
      />
      {status !== "playing" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
            color: "white",
            fontSize: "0.85rem",
            textAlign: "center",
            padding: "0 1rem",
          }}
        >
          {status === "connecting" ? (
            <>
              <RefreshCw size={22} strokeWidth={1.75} className="spin" />
              <span>Bağlanıyor…</span>
            </>
          ) : (
            <>
              <VideoOff size={22} strokeWidth={1.75} />
              <span>{errorMsg}</span>
              <button
                type="button"
                className="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setRetryKey((k) => k + 1);
                }}
              >
                Yeniden Dene
              </button>
            </>
          )}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          color: "white",
          fontSize: large ? "0.95rem" : "0.8rem",
          fontWeight: 600,
          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
        }}
      >
        {channel.name}
      </div>
      {status === "playing" && (
        <div style={{ position: "absolute", top: 8, right: 10, display: "flex", gap: "0.4rem" }}>
          <button
            type="button"
            onClick={handlePip}
            title="Ayrı pencerede izle (diğer uygulamaların üzerinde kalır)"
            aria-label="Ayrı pencerede izle"
            style={{
              background: "rgba(0,0,0,0.4)",
              border: "none",
              borderRadius: 6,
              padding: 4,
              display: "flex",
              cursor: "pointer",
              color: "white",
            }}
          >
            <PictureInPicture2 size={14} strokeWidth={1.75} />
          </button>
          {!large && (
            <span style={{ color: "white", opacity: 0.85, textShadow: "0 1px 3px rgba(0,0,0,0.8)", display: "flex", alignItems: "center" }}>
              <Maximize2 size={16} strokeWidth={1.75} />
            </span>
          )}
        </div>
      )}
      {status === "playing" && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 10,
            color: "white",
            fontSize: large ? "0.85rem" : "0.72rem",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          }}
        >
          {now.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" })}
        </div>
      )}
    </div>
  );
}

function ExpandedCameraView({ dvrId, channel, initialAspectId, onRequestPip }) {
  const [aspectId, setAspectId] = useState(initialAspectId);
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const aspectRatio = ASPECT_OPTIONS.find((o) => o.id === aspectId)?.value || "944 / 1080";

  function changeZoom(z) {
    setZoom(z);
    if (z === 1) setPan({ x: 0, y: 0 });
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={aspectId === opt.id ? "primary" : "secondary"}
              onClick={() => setAspectId(opt.id)}
              style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
          Yakınlaştır
          <input
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
          />
          <span style={{ opacity: 0.7, minWidth: 30 }}>{zoom.toFixed(1)}x</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
          Parlaklık
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
          />
          <span style={{ opacity: 0.7, minWidth: 30 }}>{brightness.toFixed(1)}x</span>
        </label>
        {(zoom !== 1 || brightness !== 1) && (
          <button
            type="button"
            className="secondary"
            style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
            onClick={() => {
              setZoom(1);
              setBrightness(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Sıfırla
          </button>
        )}
      </div>
      <CameraTile
        dvrId={dvrId}
        channel={channel}
        aspectRatio={aspectRatio}
        zoom={zoom}
        brightness={brightness}
        pan={pan}
        onPan={setPan}
        onRequestPip={onRequestPip}
        large
      />
    </div>
  );
}

function DvrSection({ dvr, aspectId, aspectRatio, onExpand, onRequestPip }) {
  const channels = dvr.channels || [];
  if (channels.length === 0) return null;
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ margin: "0 0 0.75rem" }}>{dvr.locationLabel || "Kameralar"}</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          alignItems: "start",
          gap: "0.75rem",
        }}
      >
        {channels.map((ch) => (
          <CameraTile
            key={ch.id}
            dvrId={dvr.id}
            channel={ch}
            aspectRatio={aspectRatio}
            onExpand={() => onExpand(dvr, ch)}
            onRequestPip={onRequestPip}
          />
        ))}
      </div>
    </div>
  );
}

export default function CamerasPage({ cameras, onRequestPip }) {
  const [aspectId, setAspectId] = useState(() => localStorage.getItem("camerasAspectRatio") || "native");
  const [expanded, setExpanded] = useState(null); // { dvr, channel }
  const aspectRatio = ASPECT_OPTIONS.find((o) => o.id === aspectId)?.value || "16 / 9";

  function changeAspect(id) {
    setAspectId(id);
    localStorage.setItem("camerasAspectRatio", id);
  }

  const hasAnyChannel = (cameras || []).some((d) => (d.channels || []).length > 0);

  if (!hasAnyChannel) {
    return (
      <div className="card">
        <h3>Kameralar</h3>
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <EmptyStateIllustration />
          <p>
            Kamera bağlantısı henüz yapılandırılmadı. Yönetici, Ayarlar &gt; Kameralar
            bölümünden DVR bilgilerini girmelidir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={aspectId === opt.id ? "primary" : "secondary"}
              onClick={() => changeAspect(opt.id)}
              style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {cameras.map((dvr) => (
        <DvrSection
          key={dvr.id}
          dvr={dvr}
          aspectId={aspectId}
          aspectRatio={aspectRatio}
          onExpand={(d, ch) => setExpanded({ dvr: d, channel: ch })}
          onRequestPip={onRequestPip}
        />
      ))}

      {expanded && (
        <Modal onClose={() => setExpanded(null)} maxWidth={960}>
          <ExpandedCameraView
            dvrId={expanded.dvr.id}
            channel={expanded.channel}
            initialAspectId={aspectId}
            onRequestPip={onRequestPip}
          />
        </Modal>
      )}
    </div>
  );
}
