import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { WhatsAppIcon } from "./icons.jsx";

// MessagesDock ile aynı "sağ altta sabit duran, tıklayınca yukarı açılan"
// çubuk deseni — ama içeriği kendi yazdığımız bir sohbet arayüzü değil,
// gerçek web.whatsapp.com'un uygulama içine gömülmüş hali (Electron'un
// WebContentsView'i, elektron/main.js'teki "whatsapp:*" uçları üzerinden
// yönetiliyor). Oturum (QR kod ile giriş) kalıcı — bir kez taranınca
// uygulama yeniden başlatılsa da açık kalır.

const SIZE_KEY = "sita-whatsapp-dock-size";
const DEFAULT_SIZE = { width: 1000, height: 720 };

function loadSize() {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    const parsed = raw && JSON.parse(raw);
    if (parsed?.width && parsed?.height) return parsed;
  } catch {
    // localStorage okunamazsa (ör. gizli pencere) varsayılana düş
  }
  return DEFAULT_SIZE;
}

export default function WhatsAppDock() {
  const [open, setOpen] = useState(false);
  const dockRef = useRef(null);
  const bodyRef = useRef(null);
  const sizeRef = useRef(loadSize());
  const dragRef = useRef(null);

  function getBounds() {
    const el = bodyRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  useEffect(() => {
    if (!open) {
      window.api.hideWhatsApp();
      return;
    }
    const bounds = getBounds();
    if (bounds) window.api.showWhatsApp(bounds);

    // Her bilgisayarın ekranı farklı olduğu için sabit bir boyut yerine,
    // kullanıcının sağ-alt köşeden elle sürükleyerek yaptığı (native CSS
    // "resize") ayarı ResizeObserver ile yakalıyoruz — hem gömülü
    // WhatsApp görünümünün sınırlarını anlık günceller hem de seçilen
    // boyutu bir dahaki açılışta hatırlanması için localStorage'a yazar.
    const el = dockRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const b = getBounds();
      if (b) window.api.setWhatsAppBounds(b);
      const rect = el.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      sizeRef.current = next;
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(next));
      } catch {
        // yazılamazsa sorun değil, sadece bir sonraki açılışta hatırlanmaz
      }
    });
    observer.observe(el);

    // ResizeObserver SADECE dock'un KENDİ boyutu değişince tetiklenir.
    // Dock, konumunu "right"/"bottom" ile viewport kenarına göre sabitliyor
    // (position: fixed) — pencere büyütülüp küçültülünce dock'un boyutu
    // aynı kalsa bile EKRANDAKİ konumu kayıyor, bunu ResizeObserver hiç
    // görmüyor. O yüzden pencere "resize" olayını da ayrıca dinleyip
    // gömülü WhatsApp görünümünün konumunu/boyutunu yeniden hesaplıyoruz.
    function handleWindowResize() {
      const b = getBounds();
      if (b) window.api.setWhatsAppBounds(b);
    }
    window.addEventListener("resize", handleWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [open]);

  // Panel sağ-altta (right/bottom) sabitlendiği için native CSS "resize"
  // her zaman sağ-alt köşede görünmez bir tutamak bırakıyor ve büyütmeyi
  // "sol/yukarı" hissettirmiyordu — bunun yerine sol-üst köşedeki kendi
  // tutamağımızdan mouseX/Y farkını genişlik/yüksekliğe ekleyerek panel her
  // zaman sol ve yukarı yönde büyüyüp küçülüyor. Gerçek boyutu (min/max CSS
  // sınırlarına göre TARAYICININ kırptığı hali) ve localStorage'a kaydetme
  // işini zaten var olan ResizeObserver efekti üstleniyor — burada sadece
  // stil genişlik/yüksekliğini elle güncelliyoruz.
  function handleResizeStart(e) {
    e.preventDefault();
    const el = dockRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startWidth: rect.width, startHeight: rect.height };
    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", handleResizeEnd);
  }

  function handleResizeMove(e) {
    const drag = dragRef.current;
    const el = dockRef.current;
    if (!drag || !el) return;
    el.style.width = `${drag.startWidth + (drag.startX - e.clientX)}px`;
    el.style.height = `${drag.startHeight + (drag.startY - e.clientY)}px`;
  }

  function handleResizeEnd() {
    dragRef.current = null;
    window.removeEventListener("mousemove", handleResizeMove);
    window.removeEventListener("mouseup", handleResizeEnd);
  }

  // Panelin DIŞINA tıklanınca kapansın — WhatsApp Web içeriği ayrı bir
  // native görünüm (WebContentsView) olduğu için oradaki tıklamalar bu
  // sayfanın document'ine hiç ulaşmaz, o yüzden sadece başlık/kenar gibi
  // gerçek DOM alanlarının dışına tıklanınca tetiklenir.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (dockRef.current && !dockRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Dock, sabit (fixed) konumlu olduğu için sayfa içeriği kaydırılsa bile
  // yeri değişmez — ayrı bir kapatma/temizleme efekti yeterli.
  useEffect(() => {
    return () => {
      window.api.hideWhatsApp();
    };
  }, []);

  return (
    <div
      ref={dockRef}
      className={`whatsapp-dock${open ? " is-open" : ""}`}
      style={open ? { width: sizeRef.current.width, height: sizeRef.current.height } : { width: "fit-content" }}
    >
      {open && (
        <div
          className="whatsapp-dock-resize-handle"
          onMouseDown={handleResizeStart}
          title="Sürükleyerek büyüt/küçült"
        />
      )}
      <div
        className="messages-dock-header"
        title="WhatsApp"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={open ? undefined : { paddingLeft: "0.85rem", paddingRight: "0.85rem" }}
      >
        <WhatsAppIcon size={17} />
        {open && <span style={{ flex: 1, textAlign: "left" }}>WhatsApp</span>}
        {open && (
          <button
            type="button"
            className="icon-btn"
            title="Yenile (çıkış yaptıktan sonra takılı kalırsa kullanın)"
            aria-label="WhatsApp'ı yenile"
            onClick={(e) => {
              e.stopPropagation();
              window.api.reloadWhatsApp();
            }}
          >
            <RefreshCw size={14} strokeWidth={1.75} />
          </button>
        )}
        {open ? <ChevronDown size={16} strokeWidth={1.75} /> : <ChevronUp size={16} strokeWidth={1.75} />}
      </div>

      <div
        ref={bodyRef}
        className="whatsapp-dock-body"
        style={{ display: open ? "block" : "none" }}
      />
    </div>
  );
}
