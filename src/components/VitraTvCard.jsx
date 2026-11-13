import { useState } from "react";
import { Airplay } from "lucide-react";
import TvTargetPicker from "./TvTargetPicker.jsx";

// Ofisteki TV'de vitrin ürünü göstermek için — satıcı sadece VitrA ürün kodunu
// (ya da ürünün vitra.com.tr linkini) girer; ad, kategori ve tüm fotoğraflar
// siteden alınır, TV'de fotoğraflar slider olarak döner. Fiyat gösterilmez
// (bkz. electron/vitraCatalog.js, handlers.broadcastVitraProductToTv).
export default function VitraTvCard({ currentUser, showToast }) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  if (!window.api?.broadcastVitraProductToTv) return null;

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      const payload = await window.api.broadcastVitraProductToTv(text, currentUser?.id);
      showToast?.("success", `TV'de yayınlandı: ${payload?.product?.name || text}`);
      setInput("");
    } catch (err) {
      // IPC hataları "Error invoking remote method …: Error: <mesaj>" şeklinde geliyor.
      showToast?.("error", (err.message || "TV'ye gönderilemedi.").replace(/^.*Error: /, ""));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Airplay size={18} strokeWidth={1.75} />
        VitrA ürününü TV'de göster
        <span style={{ marginLeft: "auto", fontWeight: "normal" }}>
          <TvTargetPicker />
        </span>
      </h3>
      <p style={{ marginTop: 0 }}>
        Ürün kodunu (ör. 7231B403-6216) ya da ürünün vitra.com.tr linkini girin. Ürün adı ve tüm
        fotoğrafları siteden alınır; TV'de fiyat gösterilmez.
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ürün kodu ya da vitra.com.tr linki"
          style={{ flex: 1 }}
          disabled={isSending}
        />
        <button type="button" onClick={send} disabled={isSending || !input.trim()}>
          {isSending ? "Gönderiliyor…" : "TV'de Göster"}
        </button>
      </div>
    </div>
  );
}
