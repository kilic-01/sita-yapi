# Sita Yapı — proje notları (Claude için)

Kullanıcıyla her zaman **Türkçe** konuş. Proje 2026-11-15'te `~/Projeler/test`'ten `~/Desktop/sita_yapi`'ye taşındı (Masaüstü iCloud ile eşitleniyor).

## Bileşenler
| Klasör | Ne | Not |
|---|---|---|
| `electron/`, `src/` | Masaüstü uygulaması (Electron + React/Vite) | Ofiste canlı (v1.1.15). Supabase'e doğrudan bağlanır (`electron/config.js`, git'te yok). |
| `android/tv` | Sita Yapı TV (Android TV, Compose) — ofis TV'sindeki Mi Box | Canlıda tv-v1.0.1. Repo'da 1.0.2 hazır, yayınlanmadı. |
| `ios/App/App` | Mobil iOS (SwiftUI, iOS 26+) | Taslak, mağazada değil. |
| `android/app` | Mobil Android (Compose, minSdk 26) | Taslak, mağazada değil. |
| `server/index.js` | Mobil uygulamaların konuştuğu test sunucusu (port 4173) | `electron/db.js` + `handlers.js`'i kullanır. Oturum kontrolü YOK. |

`ios/App/App/public`, `android/app/src/main/assets/public` ve capacitor modülleri eski Capacitor sürümünden kalma.

## Kesin kurallar
- **PROD'a ASLA dokunma.** Testler yalnız DEV veritabanında. Supabase'de (şema, RLS, veri) değişiklik yapma.
- DEV sunucusu her zaman `NODE_ENV=development` ile çalışmalı:
  `kill $(lsof -tiTCP:4173 -sTCP:LISTEN); NODE_ENV=development nohup node server/index.js > /tmp/server.log 2>&1 &`
  Kontrol: `ps eww <pid> | tr ' ' '\n' | grep NODE_ENV`.
- Gizli dosyaları commit etme: `electron/config.js`, `android/tv/supabase.properties` (şu an PROD publishable), `android/tv/photo-api.properties`, `.env`.
- Telefona/TV'ye `sb_secret_` anahtarı koyma. İstisna: yalnız emülatörde DEV testi için geçici derleme. Sonra `supabase.properties` PROD'a geri alınır.
- Commit'te dosyaları tek tek ekle (`git add -A` yok). TV, masaüstü ve mobil değişikliklerini ayrı commit'le.
- Push, GitHub sürümü ve mağaza işlemleri yalnız kullanıcı açıkça isteyince yapılır.
- Şifre ve uygulamaya özel şifre girme. Mac notarize'ı kullanıcı kendi Terminal'inde çalıştırır.

## Sık komutlar
- **Android mobil:**
  `cd android && ./gradlew :app:assembleDebug --no-daemon --console=plain -q`
  `adb -s <cihaz> install -r app/build/outputs/apk/debug/app-debug.apk`
- **iOS simülatör** (iPhone 18 Pro `4A9CD359-F413-49FD-8CDE-ECC012D14BB0`):
  `cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination "id=<sim>" -derivedDataPath build/dd build -quiet`
  Hata ararken `grep " error:"` kullan.
- **iPhone "Emre"** (`00008150-00154DC03CE2401C`): `-derivedDataPath build/dd-device -allowProvisioningUpdates`, sonra `xcrun devicectl device install app --device ...`. Telefonun kilidi açık olmalı.
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

## Durum (2026-11-15) — `tv-yayin` dalı, main'e birleştirilmedi, push edilmedi
- `dfe9768` mobil uygulamalar: iOS/Android eşitlendi, tasarım yenilendi.
- `a3cfdf8` TV yayın onayı: TV "shown" onayı gönderiyor. Bağlı TV yoksa ya da onay gelmezse masaüstü ve mobilde hata/uyarı çıkıyor. TV 1.0.2.
- `f7af414` iCloud taşıma (`.nosync` klasörler).
- Kontrol: Android lint hataları giderildi, Android ekran turu çökmesiz, iOS uyarısız derleniyor.

## Sıradaki işler / açık konular
1. **Mobil yayın öncesi (kullanıcıya anlatıldı, yapılmadı):**
   - `server/index.js` internete HTTPS ile taşınmalı.
   - Oturum kontrolü (token) eklenmeli; en kritik güvenlik açığı bu.
   - ATS `NSAllowsArbitraryLoads` ve Android `usesCleartextTraffic` kaldırılmalı.
   - Android upload keystore + AAB hazırlanmalı.
   - iOS `PrivacyInfo.xcprivacy` eklenmeli.
   - Dağıtım sırası: TestFlight ve Play dahili test → gizli/liste dışı yayın. Önce ofis, sonra saha.
2. **Masaüstü:** TV uyarısı için yeni sürüm gerekir (v1.1.16), yayınlanmadı.
3. **TV:** 1.0.2 Mi Box'a çıkmadı. `tv-yayin` kanalını private yapmak (RLS) bekliyor. Mi Box'ta USB hata ayıklama kapatılmalı.
4. **Mobil:** Kaydırma hareketleri, takvim ve teklif detayı gerçek telefonda kullanıcıyla birlikte denenmeli.
