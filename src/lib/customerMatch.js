// AppointmentForm.jsx (geçmiş müşteri önerisi) ve CustomerProfilePage.jsx
// (müşteri profili) arasında paylaşılan eşleştirme mantığı.
//
// İsim TEK BAŞINA asla yeterli sayılmaz — aynı ismi taşıyan farklı gerçek
// müşteriler olabilir (ör. "Cengiz Kaya" gibi yaygın isimler; canlı veride
// 381 isimde birbirinden tamamen farklı telefon numaralarına sahip 2.538
// kayıt tespit edildi). Bu yüzden isim eşleşmesi SADECE telefon numarası da
// AYNI ANDA eşleşirse geçerli sayılır. Adres eşleşmesi ayrı, bağımsız bir
// kriter olarak kalır — Excel'den içe aktarılan ~20 bin geçmiş kayıtta
// telefon çoğu zaman hiç girilmemiş, bu kayıtları tamamen gözden
// kaybetmemek için tek başına adres eşleşmesi yeterli sayılıyor.
export function normalizeForMatch(s) {
  return (s || "").trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}

// Adres için tam eşleşme yerine "içeriyor mu" bakılır: yeni randevu formu
// yapılandırılmış (il/ilçe/mahalle/sokak) bir adres üretirken, Excel'den
// içe aktarılan geçmiş kayıtlar tamamen serbest metin (ör. "ORMANADA
// NO:153") — ikisi birebir asla eşleşmez.
export function findCustomerAppointments(appointments, { name, phone, addressQuery } = {}, excludeId) {
  const normName = normalizeForMatch(name);
  const phoneDigits = (phone || "").replace(/\D/g, "");
  const streetQuery = normalizeForMatch(addressQuery);
  const hasNameAndPhone = normName && phoneDigits.length >= 6;
  if (!hasNameAndPhone && streetQuery.length < 4) return [];

  return appointments
    .filter((a) => a.id !== excludeId)
    .filter((a) => {
      const aName = normalizeForMatch(a.customerName);
      const aPhone = (a.customerPhone || "").replace(/\D/g, "");
      const aAddress = normalizeForMatch(a.address);
      const nameAndPhoneMatch = hasNameAndPhone && aName === normName && aPhone === phoneDigits;
      const addressMatch = streetQuery.length >= 4 && aAddress && aAddress.includes(streetQuery);
      return nameAndPhoneMatch || addressMatch;
    })
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));
}
