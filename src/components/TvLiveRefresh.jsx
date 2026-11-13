import { useEffect, useState } from "react";
import { computeTotals } from "../lib/orderTotals.js";
import { routesTvInput } from "../lib/tvRoutes.js";

// Bu bilgisayar TV'de rota ya da teklif yayınlarken veri değişirse (randevu
// atandı/tamamlandı, teklif düzenlendi) TV'deki içerik sessizce tazelenir —
// yoksa TV yeniden "TV'de Yayınla"ya basılana kadar eski hali gösterirdi.
// Günlük özet ana süreçte dakikada bir tazeleniyor (handlers.broadcastDashboardToTv).
const DEBOUNCE_MS = 1000;

export default function TvLiveRefresh({ appointments, technicians, quotes }) {
  const [onAir, setOnAir] = useState(null);

  useEffect(() => {
    if (!window.api?.onTvStateChange) return undefined;
    window.api.getCurrentTvPayload?.().then((p) => setOnAir(p || null)).catch(() => {});
    return window.api.onTvStateChange(({ payload }) => setOnAir(payload || null));
  }, []);

  const routesDate = onAir?.kind === "routes" ? onAir.routes?.date : null;
  useEffect(() => {
    if (!routesDate) return undefined;
    const timer = setTimeout(() => {
      window.api.refreshRoutesOnTv(routesTvInput(routesDate, appointments, technicians)).catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [routesDate, appointments, technicians]);

  const quoteNo = onAir?.kind === "quote" ? onAir.quote?.quoteNo : null;
  useEffect(() => {
    if (!quoteNo) return undefined;
    const quote = quotes.find((q) => q.quoteNo === quoteNo);
    if (!quote) return undefined;
    const timer = setTimeout(() => {
      window.api.refreshQuoteOnTv(quote, computeTotals(quote.items || [], quote.discountRate)).catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [quoteNo, quotes]);

  return null;
}
