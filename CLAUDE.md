# Sita Yapı — proje notları (Claude için)

Kullanıcıyla her zaman **Türkçe** konuş. Proje 2026-11-15'te `~/Projeler/test`'ten `~/Desktop/sita_yapi`'ye taşındı (Masaüstü iCloud ile eşitleniyor).

## Bileşenler
| Klasör | Ne | Not |
|---|---|---|
| `electron/`, `src/` | Masaüstü uygulaması (Electron + React/Vite) | Ofiste canlı (v1.1.15). Supabase'e doğrudan bağlanır (`electron/config.js`, git'te yok). |
| `android/tv` | Sita Yapı TV (Android TV, Compose) — ofis TV'sindeki Mi Box | Canlıda tv-v1.0.1. Repo'da 1.0.2 hazır, yayınlanmadı. |
| `ios/App/App` | Mobil iOS (SwiftUI, iOS 26+) | Taslak, mağazada değil. |
| `android/app` | Mobil Android (Compose, minSdk 26) | Taslak, mağazada değil. |
| `server/index.js` | Mobil uygulamaların konuştuğu test sunucusu (port 4173) | `electron/db.js` + `handlers.js`'i kullanır. Oturum anahtarı var (`server/auth.js`, 2026-11-15). |

`ios/App/App/public`, `android/app/src/main/assets/public` ve capacitor modülleri eski Capacitor sürümünden kalma.

## Kesin kurallar
- **PROD'a ASLA dokunma.** Testler yalnız DEV veritabanında. Supabase'de (şema, RLS, veri) değişiklik yapma.
- DEV sunucusu her zaman `NODE_ENV=development` ile çalışmalı:
  `kill $(lsof -tiTCP:4173 -sTCP:LISTEN); NODE_ENV=development nohup node server/index.js > /tmp/server.log 2>&1 &`
  Kontrol: `ps eww <pid> | tr ' ' '\n' | grep NODE_ENV`.
- Gizli dosyaları commit etme: `electron/config.js`, `android/tv/supabase.properties` (şu an PROD publishable), `android/tv/photo-api.properties`, `.env`, `electron/secrets/`, `android/app/google-services.json`, `server/.token-secret`. **GitHub deposu herkese açık.** Android Google Maps anahtarı `android/local.properties` içinde `MAPS_API_KEY=` (git dışı; yeni bilgisayarda bu satır eklenmeli). Göndermeden önce `git diff origin/main..HEAD` gizli anahtar desenlerine karşı taranmalı.
- Telefona/TV'ye `sb_secret_` anahtarı koyma. İstisna: yalnız emülatörde DEV testi için geçici derleme. Sonra `supabase.properties` PROD'a geri alınır.
- Commit'te dosyaları tek tek ekle (`git add -A` yok). TV, masaüstü ve mobil değişikliklerini ayrı commit'le.
- Push, GitHub sürümü ve mağaza işlemleri yalnız kullanıcı açıkça isteyince yapılır.
- Şifre ve uygulamaya özel şifre girme. Mac notarize'ı kullanıcı kendi Terminal'inde çalıştırır.

## Sık komutlar
- **Android mobil:**
  `cd android && ./gradlew :app:assembleDebug --no-daemon --console=plain -q`
  `adb -s <cihaz> install -r app/build/outputs/apk/debug/app-debug.apk`
- **iOS simülatör** (iPhone 18 Pro `4A9CD359-F413-49FD-8CDE-ECC012D14BB0`):
  `cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination "id=<sim>" -derivedDataPath ~/Library/Developer/Xcode/DerivedData/sita-sim build -quiet`
  Hata ararken `grep " error:"` kullan. derivedDataPath iCloud DIŞINDA olmalı: `build/dd*` eski `~/Projeler/test` yolunu tutuyor, iCloud ayrıca cihaz imzasını bozuyor ("resource fork… detritus").
- **iPhone "Emre"** (`00008150-00154DC03CE2401C`): `-derivedDataPath ~/Library/Developer/Xcode/DerivedData/sita-device -allowProvisioningUpdates`, sonra `xcrun devicectl device install app --device ... <dd>/Build/Products/Debug-iphoneos/App.app`. Telefonun kilidi açık olmalı.
- **Telefonda sunucu adresi:** Android `shared_prefs/sita-yapi-server.xml` (`address`), iOS UserDefaults `sita-yapi-server-address`. Uygulamadaki giriş ekranından da değişir.
- **Yeni Swift dosyası** eklenince `App.xcodeproj/project.pbxproj`'a da kaydedilmeli (otomatik değil).
- **TV:** `./gradlew :tv:assembleDebug`. Sürüm çıkarmak: `build.gradle` versionCode/versionName → `scripts/release-tv.sh`.
- **Masaüstü Windows:** `electron-builder --win --x64` (bu Mac Apple Silicon).

## Cihazlar ve ağ
Mac'in LAN IP'si değişebiliyor; son değer 192.168.1.102. Mobil uygulamalardaki varsayılan sunucu 192.168.1.120:4173, gerekirse girişte sunucu alanından değiştirilir.

| Cihaz | Erişim | Not |
|---|---|---|
| Emülatör `SitaTest` (telefon) | emulator-5554 | |
| Emülatör `SitaTV` | emulator-5556 | Ağ sorunu olursa `-no-snapshot-load -dns-server 1.1.1.1,8.8.8.8` ile aç. Sunum için `scrcpy -s emulator-5556 --fullscreen --no-audio --no-clipboard-autosync`. |
| Oppo CPH2185 (Android 10, test telefonu) | USB `QSBM7DZL8H8HKNGQ`, kablosuz `192.168.1.127:5555` | |
| Mi Box (ofis TV) | 192.168.1.84 | |

## Durum (2026-11-16) — `tv-yayin` dalı, main'e birleştirilmedi, push edilmedi
- `cb2cf37` Mobil API: oturum anahtarı (`server/auth.js`), kimlik bağlama, giriş deneme sınırı; canlı hazırlık (Dockerfile, `server/config.production.js`, `docs/CANLI-SUNUCU.md`). Docker imajı yerelde derlenip denetlendi (gizli dosya yok, `node` kullanıcısı, eksik ortam değişkeninde açılmıyor).
- `bb6340f` Masaüstü: yeni header/ana sayfa, Program haftaları, GG/AA/YYYY, kamera hata mesajları (v1.1.16'ya girecek, yayınlanmadı).
- `9b5d193` Android, `549d9b9` iOS/iPad: oturum anahtarı (Keystore/Keychain), bildirime basınca sohbet, okundu bilgisi, teklif düzenleme, kaydırma/geri al düzeltmeleri.
- `ec76359` TV: fotoğraf inmezse sıradakine geçer (1.0.2'ye girecek).
- Firebase projesi `com-vitra-sitaservisplanlayici`: `android/app/google-services.json` ve `electron/secrets/fcm-service-account.json` yerinde (git dışı); Android bildirimleri DEV'de çalıştı.
- GitHub deposu HERKESE AÇIK — hiçbir gizli değer commit'lenmez; geçmiş tarandı, temiz.
- `ios/App/App/PrivacyInfo.xcprivacy` hazır ama projeye eklenmedi/commit'lenmedi.

- **iOS 1.0 (1) TestFlight'ta (2026-11-16):** canlı API `https://sita-yapi-api.onrender.com` (Render, dal `ios-canli`, veri PROD). iPhone'da TestFlight'tan kuruldu, giriş ve randevular çalışıyor. Yerel commit'ler `8bed123` (canlı adres, ATS, PrivacyInfo, şifreleme beyanı), `b25b47d` (yeni simge `App/AppIcon.icon`) — push edilmedi. Yükleme: `xcodebuild -exportArchive` (method app-store-connect, destination upload); sonraki derlemede CURRENT_PROJECT_VERSION artırılmalı.

## Sıradaki işler / açık konular
1. **Mobil yayın (önce iOS, Android sonra):** Karar: B yolu — `server/index.js` bulut barındırmada (Render önerildi), veri Supabase PROD. Kullanıcı hesap açıp gizli değerleri kendisi girecek (`docs/CANLI-SUNUCU.md`); push ve main birleştirme yalnız açık onayla.
   - Oturum kontrolü YAPILDI (2026-11-15, commit edilmedi): `server/auth.js` — girişte HMAC imzalı 30 günlük anahtar, `/api` altında her istek `Authorization: Bearer` ister, gövdedeki `actingUserId` anahtarın sahibiyle değiştirilir, girişte kaba kuvvet sınırı (IP 10 / ad 5 deneme, 15 dk), güvenlik başlıkları. iOS anahtarı Keychain'de, Android Keystore AES-GCM ile şifreli saklar; 401'de çıkış. Canlıda `SITA_TOKEN_SECRET` (≥32 karakter) zorunlu; DEV'de `server/.token-secret` (git dışı). HTTPS'e geçince HSTS eklenmeli.
   - ATS `NSAllowsArbitraryLoads` ve Android `usesCleartextTraffic` kaldırılmalı.
   - Android upload keystore + AAB hazırlanmalı.
   - iOS `PrivacyInfo.xcprivacy` eklenmeli.
   - Dağıtım sırası: TestFlight ve Play dahili test → gizli/liste dışı yayın. Önce ofis, sonra saha.
2. **Masaüstü:** TV uyarısı için yeni sürüm gerekir (v1.1.16), yayınlanmadı.
3. **TV:** 1.0.2 Mi Box'a çıkmadı — iOS canlıya çıkarken senkron çıkacak (2026-11-16 kararı). Mi Box'ta USB hata ayıklama kapatılmalı.
   - **RLS KODU YAZILDI (2026-11-16, `7080802` masaüstü, `34b0fa3` TV), DEV'de uçtan uca denendi; DEV'e politikalar eklendi.** PROD'a SQL (docs/TV-ESLESTIRME.md) masaüstü 1.1.16 + TV 1.0.2 + Render yeniden dağıtımıyla aynı gün. Eski not: **RLS (`tv-yayin` kanalını özel yapmak) MASAÜSTÜ v1.1.16 İLE BİRLİKTE yapılacak (kullanıcı kararı, 2026-11-16).** Şu an kanal herkese açık: publishable anahtar TV APK'sında (GitHub'da açık) — anahtarı bilen TV'de içerik gösterebilir, TV'ye gidenleri (teklif/stok) dinleyebilir, sahte TV olabilir. Gerekenler aynı anda: Supabase PROD'da private kanal + realtime.messages politikası, TV'ye kimlik (giriş/JWT), masaüstü ve sunucunun kanala `private: true` ile bağlanması. Yalnız Supabase tarafı değişirse canlı masaüstü v1.1.15 TV'ye yayın yapamaz.
4. **Mobil:** Kaydırma hareketleri, takvim ve teklif detayı gerçek telefonda kullanıcıyla birlikte denenmeli.
5. **Depo kamerası (2026-11-15):** DVR 78.161.19.251:15541'e bu Mac'ten ulaşılamıyor (tüm portlar zaman aşımı). Kullanıcı depoda kontrol edecek: DVR/modem açık mı, depo dış IP'si değişti mi, port yönlendirmesi duruyor mu. Kod tarafında `electron/camera.js` hata mesajları düzeltildi (anlaşılır Türkçe mesaj, RTSP şifresi gizlenir).
