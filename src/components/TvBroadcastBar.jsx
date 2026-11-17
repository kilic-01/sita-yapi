import { useEffect, useState } from "react";
import { Square, Airplay } from "lucide-react";

// TV'de yayın varken ekranın altında görünen küçük şerit.
//  • Yayını BU bilgisayar yaptıysa: ne yayında olduğu + "Durdur".
//  • Başka bir bilgisayar ya da telefon yaptıysa: ne yayında olduğu ve kimin
//    yayınladığı — durdurma düğmesi YOK (yayını yalnız yapan durdurur).
// Main process "tv:state" (kendi yayını) ve "tv:remote" (başkasınınki) gönderir
// (bkz. electron/db.js TV Yayını).
export default function TvBroadcastBar({ showToast }) {
  const [own, setOwn] = useState(null);
  const [remote, setRemote] = useState(null);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    if (!window.api?.onTvStateChange) return undefined;
    window.api.getCurrentTvPayload?.().then((p) => setOwn(p || null)).catch(() => {});
    window.api.getRemoteTvPayload?.().then((p) => setRemote(p || null)).catch(() => {});
    const offOwn = window.api.onTvStateChange(({ payload: p }) => setOwn(p || null));
    const offRemote = window.api.onTvRemoteStateChange?.(({ payload: p }) => setRemote(p || null));
    return () => {
      offOwn?.();
      offRemote?.();
    };
  }, []);

  const payload = own || remote;
  const isMine = Boolean(own);
  if (!payload) return null;
  const by = [payload.sentBy, payload.sentFrom].filter(Boolean).join(" · ");
  const { product, quote, routes, dashboard } = payload;

  async function stop() {
    setIsStopping(true);
    try {
      await window.api.clearTv();
    } catch (err) {
      showToast?.("error", err.message || "Yayın durdurulamadı.");
    } finally {
      setIsStopping(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1500,
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        maxWidth: "min(560px, calc(100vw - 32px))",
        padding: isMine ? "0.45rem 0.5rem 0.45rem 0.9rem" : "0.55rem 1rem 0.55rem 0.9rem",
        borderRadius: 999,
        background: "color-mix(in srgb, var(--accent) 14%, var(--card-bg))",
        border: "1px solid var(--accent)",
        color: "var(--text)",
        fontSize: "0.85rem",
        boxShadow: "var(--shadow)",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <Airplay size={16} strokeWidth={1.75} style={{ color: "var(--accent)", flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        TV'de yayında: <strong>{dashboard ? "Günlük özet" : routes ? `Rotalar ${routes.date}` : quote ? `Teklif ${quote.quoteNo}` : product?.code}</strong>
        {quote
          ? quote.customerName && <span style={{ opacity: 0.75 }}> — {quote.customerName}</span>
          : product?.name && <span style={{ opacity: 0.75 }}> — {product.name}</span>}
        {!isMine && by && <span style={{ opacity: 0.6 }}> · Yayınlayan: {by}</span>}
      </span>
      {isMine && (
      <button
        type="button"
        className="danger"
        onClick={stop}
        disabled={isStopping}
        // Dolgu kırmızı: yayını kesen eylem, accent renkli şeritte net seçilsin.
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          borderRadius: 999,
          flexShrink: 0,
          background: "var(--danger)",
          color: "#fff",
          padding: "0.4rem 0.8rem",
        }}
      >
        <Square size={12} strokeWidth={2} />
        {isStopping ? "Durduruluyor…" : "Durdur"}
      </button>
      )}
    </div>
  );
}
