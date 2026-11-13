import { isOnLeave } from "./format.js";
import { colorForTechnician } from "./techColors.js";

// Bir günün rotaları — TV'ye gönderilen biçimde. Rota Oluştur ekranıyla aynı
// kural: atanabilir teknisyenler + o gün elle iş verilen çıraklar; durak
// olarak yalnız rotalanmış/tamamlanmış randevular, durak sırasına göre.
// "TV'de Yayınla" (RouteBuilder) ve yayındaki rotaların tazelenmesi
// (TvLiveRefresh) aynı fonksiyonu kullanır.
export function routesTvInput(date, appointments, technicians) {
  const day = appointments.filter((a) => a.scheduledDate === date);
  return {
    date,
    technicians: technicians
      .filter((t) => t.assignable !== false || day.some((a) => a.assignedTechnicianId === t.id))
      .map((t) => ({
        name: t.name,
        color: colorForTechnician(t.id, technicians),
        onLeave: isOnLeave(t, date),
        stops: day
          .filter((a) => (a.status === "routed" || a.status === "completed") && a.assignedTechnicianId === t.id)
          .sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0)),
      })),
  };
}
