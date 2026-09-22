const MODEL = "gemini-3.8-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(complaint, apiKey) {
  // Ağ isteği hiç yanıt almazsa fetch süresiz beklemeye devam eder — bu da
  // randevu kaydını "Kaydediliyor…" ekranında takılı bırakır. Bir üst sınır
  // koyup süre dolunca isteği iptal ediyoruz.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Bir Vitra yetkili servis ustası için müşteri şikayetini oku ve bu işin " +
                  "ustanın yerinde tamamlanma süresini dakika olarak tahmin et. SADECE bir " +
                  "tam sayı yaz, başka hiçbir şey yazma (örnek çıktı: 45). " +
                  "Şikayet: " +
                  complaint,
              },
            ],
          },
        ],
        generationConfig: {
          thinkingConfig: { thinkingLevel: "LOW" },
        },
      }),
    });
  } catch (err) {
    const error = new Error(
      err.name === "AbortError" ? "Gemini API zaman aşımına uğradı" : "Gemini API'ye ulaşılamadı"
    );
    error.retryable = true;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const retryable = res.status === 503 || res.status === 429;
    const error = new Error(`Gemini API hatası: HTTP ${res.status}`);
    error.retryable = retryable;
    throw error;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini API boş yanıt döndü");

  const match = text.match(/\d+/);
  if (!match) throw new Error(`Gemini API sayısal olmayan yanıt döndü: "${text}"`);

  const minutes = Number(match[0]);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`Geçersiz süre: ${minutes}`);

  return minutes;
}

// Müşteri şikayet metnini okuyup ustanın işi tahmini kaç dakikada
// tamamlayabileceğini döndürür. Şikayet boşsa veya API anahtarı yoksa
// null döner; API geçici olarak meşgulse (503/429) bir kez bekleyip
// tekrar dener, yine başarısız olursa null döner.
export async function estimateJobDurationMinutes(complaint, apiKey) {
  if (!apiKey || !complaint || !complaint.trim()) return null;

  try {
    return await callGemini(complaint, apiKey);
  } catch (err) {
    if (!err.retryable) return null;
    try {
      await sleep(1500);
      return await callGemini(complaint, apiKey);
    } catch {
      return null;
    }
  }
}
