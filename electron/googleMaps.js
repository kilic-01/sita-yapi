// Ağ isteği hiç yanıt almazsa (örn. internet kesintisi/DNS takılması) fetch
// süresiz beklemeye devam eder — bu da "Kaydediliyor…" ekranda takılı kalır
// hale getirir. AbortController ile bir üst sınır koyup, süre dolunca isteği
// iptal edip anlamlı bir hata döndürüyoruz.
async function fetchWithTimeout(url, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeOnce({ address, components }, apiKey) {
  const params = new URLSearchParams({ address, key: apiKey });
  if (components) params.set("components", components);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.results.length) {
      return { ok: false, error: data.status || "ADDRESS_NOT_FOUND" };
    }
    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    return {
      ok: true,
      lat,
      lng,
      formattedAddress: result.formatted_address,
      placeId: result.place_id || null,
      // Google'ın kendi hassasiyet sınıflandırması: ROOFTOP (tam bina),
      // RANGE_INTERPOLATED (bina numarası aralığa göre tahmin),
      // GEOMETRIC_CENTER (sokak/bölge ortası), APPROXIMATE (kaba tahmin).
      locationType: result.geometry.location_type || null,
      // APPROXIMATE: Google sokağı/binayı bulamadı, sadece mahalle/ilçe merkezine
      // düşürdü — bu durumda konum gerçek adresten uzak olabilir.
      approximate: result.geometry.location_type === "APPROXIMATE",
      // partial_match: Google verdiğimiz adresin bir kısmını eşleştiremedi
      // (örn. ilçeyi görmezden gelip sadece sokak adına göre başka bir yer buldu).
      partialMatch: Boolean(result.partial_match),
    };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "ZAMAN_AŞIMI" : "AĞ_HATASI" };
  }
}

// Tek bir serbest-metin adres yerine, en spesifikten en sadeye doğru birden
// çok varyasyon dener (bkz. electron/geocodeQuery.js buildGeocodeAttempts) —
// ilk başarılı sonuçta durur. `attempts` boşsa (ör. hiç sokak/mahalle
// girilmemiş) eski davranışla, verilen tek adresi dener.
export async function geocodeAddress(address, apiKey, attempts) {
  const queries = attempts && attempts.length ? attempts : [{ address, components: null }];
  let lastResult = null;
  for (const attempt of queries) {
    lastResult = await geocodeOnce(attempt, apiKey);
    if (lastResult.ok) return { ...lastResult, stage: attempt.stage };
  }
  return lastResult;
}

export async function getDrivingDistances(origin, destinations, apiKey) {
  if (!destinations.length) return [];
  const originStr = `${origin.lat},${origin.lng}`;
  const destStr = destinations.map((d) => `${d.lat},${d.lng}`).join("|");
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originStr}&destinations=${destStr}&mode=driving&key=${apiKey}`;
  const res = await fetchWithTimeout(url);
  const data = await res.json();
  if (data.status !== "OK") {
    throw new Error(`Distance Matrix hatası: ${data.status}`);
  }
  const elements = data.rows[0].elements;
  return elements.map((el) =>
    el.status === "OK" ? el.distance.value : Number.POSITIVE_INFINITY
  );
}
