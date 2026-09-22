// QuoteForm.jsx (Fiyat Teklifi) ve IncomingOrderForm.jsx (Gelen Sipariş)
// arasında paylaşılan kalem-toplamı hesaplama mantığı — ikisi de aynı
// {qty, unitPrice, discountRate, vatRate} kalem şeklini kullanıyor.

// İskonto artık SADECE satır bazlıdır — "Genel İndirim Oranı" alanı, tüm
// satırların iskonto (%) alanını aynı değere doldurmak için bir kısayoldur;
// toplam hesabına AYRICA bir daha düşülmez, aksi halde satır iskontosu +
// genel indirim çifte uygulanmış olurdu. `discountRate` parametresi geriye
// dönük uyumluluk için hâlâ kabul edilir ama hesaba katılmaz.
// Ara Toplam = satır bazlı iskontodan sonraki tutarların toplamı.
// İndirim Tutarı = sadece bilgi amaçlı: satır iskontoları sayesinde
// düşülmüş toplam tutar (KDV matrahını AYRICA etkilemez).
// KDV Toplamı = her satırın kendi (iskontolu) tutarı üzerinden kendi KDV
// oranıyla hesaplanıp toplanır.
export function computeTotals(items, _discountRate) {
  const gross = (item) => (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
  const lineNet = (item) => gross(item) * (1 - (Number(item.discountRate) || 0) / 100);

  const grossToplam = items.reduce((sum, item) => sum + gross(item), 0);
  const araToplam = items.reduce((sum, item) => sum + lineNet(item), 0);
  const indirimTutari = grossToplam - araToplam;
  const kdvMatrahi = araToplam;
  const kdvToplami = items.reduce((sum, item) => sum + lineNet(item) * ((Number(item.vatRate) || 0) / 100), 0);
  const genelToplam = kdvMatrahi + kdvToplami;
  return { araToplam, indirimTutari, kdvMatrahi, kdvToplami, genelToplam };
}

export function formatMoney(n) {
  return (Number(n) || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
