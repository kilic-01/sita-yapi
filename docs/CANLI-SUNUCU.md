# Mobil API'yi canlıya alma (B yolu)

Mobil uygulamalar (iOS/Android) Supabase'e doğrudan bağlanmaz; aradaki küçük
API programı (`server/index.js`) kimlik ve yetkiyi kontrol edip veriyi Supabase
PROD'dan alır. Bu belge, o programı bir bulut barındırma hizmetinde 7/24
çalıştırmayı anlatır. **Veri Supabase PROD'da kalır; masaüstüyle aynı veriyi
kullanır. Fiziki sunucu gerekmez.**

> ⚠️ GitHub deposu **herkese açık**. Hiçbir gizli değer depoya yazılmaz; hepsi
> barındırma hizmetinin şifreli ortam değişkenlerine **elle** girilir.

## Kim ne yapar

| Adım | Kim |
|---|---|
| Barındırma hesabı açmak, ödeme bilgisi | **Emre** |
| Gizli değerleri barındırma hizmetine girmek | **Emre** (Claude bu değerleri görmez/yazmaz) |
| Kodu GitHub'a göndermek (push) | Emre onay verince Claude |
| Kurulum sonrası kontroller, uygulamaların canlı adrese bağlanması | Claude |

## 1. Barındırma hizmeti

Render, Fly.io ya da Railway — üçü de bu depodaki `Dockerfile`'ı doğrudan kullanır.
Öneri: **Render** (kurulumu en sade, web arayüzünden yönetilir).

- Hizmet türü: **Web Service**, kaynak: GitHub deposu, ortam: **Docker**.
- **Bölge:** Supabase projesiyle aynı bölge (ör. Frankfurt) — gecikme düşük olur.
- **Plan:** Sürekli açık kalan ücretli en küçük plan. (Ücretsiz planlar boşta
  kalınca uyur; telefon ilk istekte 30–60 sn bekler.)
- **Health check path:** `/healthz`
- **Dal:** `ios-canli` (2026-11-16 kararı: önce yalnız iOS; `main`'e dokunulmaz).
- **Otomatik dağıtım:** kapalı (Off) — her dağıtım elle "Manual Deploy" ile.

## 2. Ortam değişkenleri (hepsi "secret" olarak girilir)

| Değişken | Nereden | Zorunlu |
|---|---|---|
| `SUPABASE_URL` | Supabase **PROD** projesi → Settings → API → Project URL | ✔ |
| `SUPABASE_SERVICE_KEY` | Supabase **PROD** → Settings → API → *secret* anahtar (`sb_secret_…`) | ✔ |
| `SECRET_ENCRYPTION_KEY` | Masaüstündeki `electron/config.js` ile **birebir aynı** değer (veritabanındaki şifreli alanlar bununla çözülür) | ✔ |
| `SITA_TOKEN_SECRET` | Yeni üret: Terminal'de `openssl rand -base64 48` (çıktıyı kimseyle paylaşma) | ✔ |
| `GOOGLE_MAPS_API_KEY` | Masaüstündeki `electron/config.js` değeri | ✔ |
| `SHOP_LOCATION` | Dükkân konumu, `enlem,boylam` (ör. `41.0123,29.0456`) | ✔ |
| `APNS_KEY_P8` | `electron/secrets/AuthKey_5S493ZUGL3.p8` dosyasının **tüm içeriği** | ✔ |
| `APNS_KEY_ID` | `5S493ZUGL3` (dosya adındaki kimlik) | ✔ |
| `APNS_TEAM_ID` | `FK25J32ZK3` | ✔ |
| `FCM_SERVICE_ACCOUNT_JSON` | `electron/secrets/fcm-service-account.json` dosyasının **tüm içeriği** | ✔ |
| `GEMINI_API_KEY` | Masaüstündeki değer (randevu süre tahmini) | — |
| `FILOTIM_API_KEY` | Masaüstündeki değer (yakıt) | — |
| `APNS_BUNDLE_ID` | Varsayılan `com.vitra.sitaservisplanlayici` | — |

`NODE_ENV=production`, `SITA_TV_AUTORESPOND=off` (TV'yi yalnız masaüstü yönetir) ve `PORT` Dockerfile/hizmet tarafından verilir; girilmez.

Bir zorunlu değer eksikse sunucu **açılmaz** ve günlükte yalnız eksik
değişkenlerin **adlarını** yazar (değerler hiçbir zaman günlüğe yazılmaz).

## 3. İlk dağıtımdan sonra kontrol (Claude)

1. `https://<adres>/healthz` → `{"ok":true}`
2. Anahtarsız `GET /api/quotes` → **401** (oturum kontrolü çalışıyor)
3. Telefonda giriş ekranındaki **Sunucu** alanına `https://<adres>` yazıp gerçek
   hesapla giriş → randevular PROD verisiyle geliyor, masaüstüyle aynı.
4. Bir mesaj gönder → iPhone'a bildirim (APNs canlı) ve Android'e bildirim (FCM).

## 4. Uygulamaların canlıya bağlanması (Claude, adres belli olunca)

- iOS/Android varsayılan sunucu adresi → `https://<adres>`.
- iOS `NSAllowsArbitraryLoads` ve Android `usesCleartextTraffic` **kapatılır**
  (yalnız HTTPS).
- iOS `PrivacyInfo.xcprivacy` projeye eklenir → arşiv → **TestFlight** (yükleme
  Emre "yükle" deyince).

## Güvenlik özeti

- Gerçek `electron/config.js` ve `electron/secrets/` kapsayıcıya **girmez**
  (`.dockerignore`); yerine ortam değişkenli `server/config.production.js` kullanılır.
- Kapsayıcı yetkisiz kullanıcıyla çalışır; yalnız sunucu kodunu içerir.
- Canlı mod (`NODE_ENV=production`) yalnız bu yapılandırmayla açılır — bir
  bilgisayarda yanlışlıkla verilirse sunucu PROD'a bağlanmak yerine kapanır.
- HTTPS'i barındırma hizmeti sağlar; sunucu HSTS gönderir.
- Her `/api` isteği imzalı oturum anahtarı ister; işlemi yapan kişi anahtardan
  belirlenir; girişte deneme sınırı vardır (bkz. `server/auth.js`).
- Supabase `sb_secret_` anahtarı yalnız bu sunucudadır; telefonlarda yoktur.
