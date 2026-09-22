import { useEffect, useRef, useState } from "react";

const ROTATE_MS = 20000;

function formatClock(date) {
  return date.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
}

function formatDate(date) {
  return date.toLocaleDateString("tr-TR", {
    timeZone: "Europe/Istanbul",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Fotoğraf çok açık (ör. kar, beyaz duvar) renkteyse beyaz yazı/logo
// kayboluyordu — küçük bir canvas'a çizip ortalama parlaklığı ölçerek
// yazı/logo rengini siyaha çeviriyoruz, koyu fotoğraflarda beyaz kalıyor.
// Wikimedia'nın CDN'i CORS'a izin verdiği için canvas "kirlenmiyor"; yine
// de bir sorun çıkarsa (ör. yavaş ağ) güvenli varsayılan olarak "koyu arka
// plan" (beyaz yazı) kabul edilir — mevcut davranış hiç bozulmaz.
function computeIsLight(imgEl) {
  try {
    const w = 24;
    const h = 24;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return total / (w * h) > 150;
  } catch {
    return false;
  }
}

// Google TV'deki ambient ekran koruyucular gibi — hareketsizlikte tam
// ekranı kaplar, birkaç saniyede bir farklı bir Wikimedia Commons görseli
// gösterir, sağ altta logo + canlı saat/tarih. Herhangi bir fare/klavye
// etkileşiminde onWake() çağrılır (App.jsx bunu oturumu kapatıp kullanıcı
// adı/şifre ekranına düşürmek için kullanır).
export default function ScreensaverLock({ onWake, messages = [], users = [], currentUser }) {
  const [image, setImage] = useState(null); // { url, credit }
  const [isLight, setIsLight] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const nextImageRef = useRef(null);

  const textColor = isLight ? "#141414" : "#ffffff";
  const textShadow = isLight ? "0 2px 10px rgba(255,255,255,0.75)" : "0 2px 12px rgba(0,0,0,0.6)";

  // Her ekran/pencere aynı boyutta değil — sabit piksel/rem yerine "vmin"
  // (ekranın kısa kenarına göre) kullanılıp clamp() ile bir alt/üst sınır
  // konularak logo, saat, tarih ve kenar boşlukları büyük ekranda orantılı
  // büyüyor, küçük ekranda orantılı küçülüyor. Yüzdeler, sıradan bir
  // 1920×1080 ekranda (vmin=1080) önceki onaylanan sabit boyutlarla (110px
  // logo, 3.4rem saat, 1.4rem tarih, 1.25rem/2.5rem boşluk) EŞLEŞECEK
  // şekilde hesaplandı — o yüzden normal ekranda hiçbir şey küçülmüyor,
  // sadece daha büyük/küçük ekranlarda gerçekten ölçekleniyor.
  const cornerGap = "clamp(1rem, 1.85vmin, 2.5rem)";
  const cornerGapWide = "clamp(1.75rem, 3.7vmin, 4.5rem)";
  const logoHeight = "clamp(105px, 15.3vmin, 355px)";
  const clockSize = "clamp(3.3rem, 7.4vmin, 8rem)";
  const dateSize = "clamp(1.5rem, 3.2vmin, 3.2rem)";
  const noticeSize = "clamp(0.9rem, 1.5vmin, 1.4rem)";
  const creditSize = "clamp(0.7rem, 1.1vmin, 1.05rem)";

  // Ekran koruyucu açılırken o ana kadar var olan mesajları "görülmüş"
  // sayıyoruz — sadece BUNDAN SONRA gelenleri (kullanıcı ekran başında
  // değilken) "yeni" olarak bildiriyoruz. İçerik ASLA gösterilmez, sadece
  // kimden geldiği ve kaç tane olduğu — kilit ekranı yanından geçen biri
  // mesaj metnini görmesin diye.
  const seenIdsRef = useRef(null);
  if (seenIdsRef.current === null) {
    seenIdsRef.current = new Set(messages.map((m) => m.id));
  }
  const newMessages = messages.filter(
    (m) => m.recipientId === currentUser?.id && !seenIdsRef.current.has(m.id)
  );
  const senderNames = [...new Set(newMessages.map((m) => users.find((u) => u.id === m.senderId)?.name).filter(Boolean))];

  useEffect(() => {
    let cancelled = false;

    async function loadNext() {
      const result = await window.api.getScreensaverImage();
      if (cancelled || !result?.url) return;
      // Ani zıplama olmasın diye görseli görünmeden önce ön-yüklüyoruz.
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        setIsLight(computeIsLight(img));
        setImage(result);
      };
      img.src = result.url;
    }

    loadNext();
    const interval = setInterval(loadNext, ROTATE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  return (
    <div
      tabIndex={-1}
      autoFocus
      onMouseMove={onWake}
      onMouseDown={onWake}
      onKeyDown={onWake}
      onWheel={onWake}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflow: "hidden",
        background: "linear-gradient(135deg, #0e2a3b, #163449)",
        cursor: "pointer",
      }}
    >
      {image?.url && (
        <img
          key={image.url}
          ref={nextImageRef}
          src={image.url}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            animation: "screensaver-fade-in 1.2s ease",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 30%)",
        }}
      />

      <img
        src={isLight ? "./logo.svg" : "./logo-white.svg"}
        alt="Sita Yapı"
        style={{
          position: "absolute",
          left: cornerGap,
          top: cornerGap,
          height: logoHeight,
          width: "auto",
          opacity: 0.95,
        }}
      />

      {newMessages.length > 0 && (
        <div
          style={{
            position: "absolute",
            right: cornerGap,
            top: cornerGap,
            textAlign: "right",
            color: textColor,
            textShadow,
            fontSize: noticeSize,
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {newMessages.length} yeni mesaj{senderNames.length ? ` — ${senderNames.join(", ")}` : ""}
          </div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          right: cornerGapWide,
          bottom: cornerGapWide,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "0.5rem",
          color: textColor,
        }}
      >
        <div
          style={{
            fontSize: clockSize,
            fontWeight: 300,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatClock(now)}
        </div>
        <div style={{ fontSize: dateSize, opacity: 0.9, textTransform: "capitalize", textAlign: "right" }}>
          {formatDate(now)}
        </div>
      </div>

      {image?.credit && (
        <div
          style={{
            position: "absolute",
            left: cornerGap,
            bottom: cornerGap,
            color: isLight ? "rgba(20,20,20,0.7)" : "rgba(255,255,255,0.65)",
            fontSize: creditSize,
            textShadow,
          }}
        >
          {image.credit} — Wikimedia Commons
        </div>
      )}

      <style>{`
        @keyframes screensaver-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
