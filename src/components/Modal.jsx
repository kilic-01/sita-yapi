import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// document.body'nin altına doğrudan render edilir (React Portal) — normal
// DOM konumuna render edilseydi, react-grid-layout gibi kendi elemanlarına
// "transform" uygulayan bir atanın İÇİNDEN açılan bir Modal, position:fixed
// yerine o atanın sınırlarına sıkışıp görünmez/bozuk olurdu (CSS'in
// "transform'lu ata, fixed torunlar için containing block olur" kuralı).
// İç içe Modal'lar (ör. bir kayıt formunun üstünde açılan fotoğraf
// lightbox'ı) her biri kendi "keydown" dinleyicisini window'a eklerse, Esc'e
// basınca HEPSİ aynı anda tetiklenip ikisini birden kapatıyordu — kullanıcı
// sadece üsttekini kapatmak isterken formun kendisi de kapanıyordu. Açık
// modal'ların bir yığınını tutup Esc'i SADECE en üsttekine (en son açılana)
// yönlendiriyoruz.
let modalStack = [];

export default function Modal({ onClose, children, maxWidth = 720 }) {
  // Bir kutudaki metni sürükleyerek seçerken (ör. "tümünü seç") fare bazen
  // popup içeriğinin dışına taşıyor; bırakma (mouseup) arka plana denk
  // gelince tarayıcı "click" olayını arka planın üzerinde üretiyor ve bu,
  // "dışarı tıklandı" sanılıp popup'ı kapatıyordu. Düzeltme: sadece hem
  // BASMA hem BIRAKMA aynı anda doğrudan arka plana denk gelirse kapat —
  // içeride başlayıp dışarıda biten bir sürükleme artık kapatmıyor.
  const mouseDownOnBackdrop = useRef(false);

  useEffect(() => {
    modalStack.push(onClose);
    function handleKey(e) {
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === onClose) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      modalStack = modalStack.filter((fn) => fn !== onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14, 42, 59, 0.32)",
        backdropFilter: "blur(8px) saturate(150%)",
        WebkitBackdropFilter: "blur(8px) saturate(150%)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "2rem 1rem",
        zIndex: 1000,
      }}
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{ width: "100%", maxWidth }}>{children}</div>
    </div>,
    document.body
  );
}
