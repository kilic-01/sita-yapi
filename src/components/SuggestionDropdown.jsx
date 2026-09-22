import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Öneri/otomatik-tamamlama açılır listesi — kod arayan HER satırda (Fiyat
// Teklifi, Gelen Sipariş, Parça Zimmeti, Satış, Randevu formu) aynı hataya
// yol açan "position: absolute" yerine kullanılır.
//
// Sorun neydi: bu listeler genelde kendi scroll alanı olan bir tablo/modal
// İÇİNDE açılıyordu. position:absolute, en yakın konumlanmış ataya göre
// yerleşir ve o atanın (tablonun overflowX:auto sarmalayıcısı, Modal.jsx'in
// overflowY:auto arka planı gibi) scroll alanına HAPSOLUR — input ekranın alt
// kısımlarındaysa liste görünür alanın dışında kalıyor, kullanıcı fark
// etmeden elle aşağı kaydırması gerekiyordu, o zaman bile üstteki satırların
// arkasında/altında görünüyordu.
//
// Çözüm: document.body altına PORTAL ile, "position: fixed" ve input'un
// gerçek ekran koordinatlarından (getBoundingClientRect) hesaplanmış bir
// konumla render edilir — hiçbir atanın scroll/overflow alanına
// hapsolmadan, her zaman input'un tam altında (aşağıda yer yoksa otomatik
// olarak ÜSTÜNDE) ve her şeyin önünde açılır.
export default function SuggestionDropdown({ anchorRef, children, minWidth }) {
  const [style, setStyle] = useState(null);

  useEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 4;
      const maxListHeight = 240;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUpward = spaceBelow < 120 && spaceAbove > spaceBelow;
      setStyle({
        position: "fixed",
        left: rect.left,
        minWidth: minWidth || rect.width,
        maxHeight: Math.max(120, Math.min(maxListHeight, openUpward ? spaceAbove : spaceBelow)),
        ...(openUpward ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchorRef, minWidth]);

  if (!style) return null;

  return createPortal(
    <div
      style={{
        ...style,
        zIndex: 2000,
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
        overflowY: "auto",
      }}
    >
      {children}
    </div>,
    document.body
  );
}
