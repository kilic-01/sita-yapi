// Electron'un IPC hata mesajları ham/İngilizce geliyor (ör. "Error invoking
// remote method 'quotes:add': Error: TypeError: fetch failed") — bu, backend
// (handlers.js/db.js) zaten Türkçe bir mesajla fırlattığı hatalardan farklı:
// o durumda err.message zaten kullanıcıya gösterilebilir. Burada sadece ham/
// teknik ağ hatalarını (ör. bir Wi-Fi kopması sonrası) anlaşılır bir mesaja
// çeviriyoruz, backend'den gelen Türkçe mesajları olduğu gibi bırakıyoruz.
export function toUserMessage(err) {
  const raw = err?.message || "";
  if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|network/i.test(raw)) {
    return "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.";
  }
  if (/Error invoking remote method/i.test(raw)) {
    // Beklenmeyen bir IPC hatası — en azından ham "Error invoking remote
    // method '...'" önekini atıp geri kalanını (varsa) gösterir.
    const cleaned = raw.replace(/^Error invoking remote method '[^']*':\s*/i, "");
    return cleaned || "Bir hata oluştu, lütfen tekrar deneyin.";
  }
  return raw || "Bir hata oluştu, lütfen tekrar deneyin.";
}
