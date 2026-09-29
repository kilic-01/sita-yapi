#!/bin/bash
# Mac build'ini imzalayıp notarize eden ve DMG/zip üreten script.
#
# electron-builder'ın kendi otomatik imzalama adımı (npm run build/publish:mac)
# bu makinede yüzlerce ayrı `codesign` alt-süreci başlatırken tekrarlayan,
# sebebi tam çözülemeyen bir donma sorununa takılıyor. Bu script aynı işi
# elle, güvenilir şekilde yapıyor:
#   1) electron-builder'ı SADECE paketleme (imzasız) için çalıştırır
#   2) `codesign --deep` ile TEK komutta tüm paketi imzalar (hızlı, donmuyor)
#   3) `--deep`'in atladığı bilinen "gömülü" dosyaları (ffmpeg, Electron'un
#      Libraries/ altındaki .dylib'leri, Squirrel'in ShipIt aracı) tek tek
#      imzalar, sonra dış paketi tekrar mühürler
#   4) Apple'a notarization'a gönderir, sonucu bekler
#   5) Onaylanınca bileti (ticket) uygulamaya "staple" eder
#   6) DMG ve zip (auto-update için) oluşturur, DMG'yi de ayrıca notarize
#      edip staple eder
#   7) latest-mac.yml dosyasını doğru sha512/boyut bilgileriyle üretir
#
# Kullanım:
#   APPLE_ID=... APPLE_APP_SPECIFIC_PASSWORD=... APPLE_TEAM_ID=... ./scripts/notarize-mac.sh
#
# Bittiğinde release/ klasöründe imzalı+notarize dmg, zip ve latest-mac.yml
# hazır olur — GitHub'a yüklemek elle kalır (gh release upload v<versiyon> ...).
#
# SKIP_NOTARIZE=1 ile çağrılırsa (Apple kimlik bilgisi HİÇ gerekmez):
# paket yine yerel "Developer ID Application" sertifikasıyla İMZALANIR
# (Squirrel.Mac'in otomatik güncelleme sırasında imza sürekliliği kontrolü
# için bu şart), ama Apple'a notarization'a hiç gönderilmez/staple edilmez.
# Sonuç: ilk açılışta Gatekeeper "tanımlanamayan geliştirici" uyarısı
# verebilir (sağ tık > Aç ile bir kere aşılır), ama imza geçerli olduğu için
# sonraki otomatik güncellemeler çalışmaya devam eder. Acil/aynı gün teslim
# gereken durumlar için.
SKIP_NOTARIZE="${SKIP_NOTARIZE:-0}"

set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$SKIP_NOTARIZE" != "1" ]; then
  : "${APPLE_ID:?APPLE_ID ortam değişkeni tanımlı değil}"
  : "${APPLE_APP_SPECIFIC_PASSWORD:?APPLE_APP_SPECIFIC_PASSWORD ortam değişkeni tanımlı değil}"
  : "${APPLE_TEAM_ID:?APPLE_TEAM_ID ortam değişkeni tanımlı değil}"
fi

IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed -E 's/.*\) ([0-9A-F]+) ".*/\1/')
if [ -z "$IDENTITY" ]; then
  echo "HATA: Keychain'de 'Developer ID Application' sertifikası bulunamadı." >&2
  exit 1
fi
echo "Kullanılacak sertifika: $IDENTITY"

VERSION=$(node -p "require('./package.json').version")
ENT="node_modules/app-builder-lib/templates/entitlements.mac.plist"
APP="release/mac-arm64/Sita Yapı.app"
DMG_NAME="sita-servis-planlayici-${VERSION}-arm64.dmg"
ZIP_NAME="sita-servis-planlayici-${VERSION}-arm64.zip"

echo "== 1/7: Render derleniyor + imzasız paketleniyor (sürüm ${VERSION}) =="
npm run build:renderer
rm -rf release
# ÖNEMLİ: "--dir" hedefi kullanılırsa electron-builder, otomatik güncelleme
# kontrolünün ihtiyaç duyduğu "app-update.yml" dosyasını HİÇ yazmıyor (bu
# dosyayı yazan PublishManager kancası sadece hedefler arasında "dmg" ya da
# "zip" varsa çalışıyor) — bu yüzden "zip" hedefini de veriyoruz. Bu adımda
# üretilen zip henüz imzasız/notarize değil, aşağıda 6. adımda kendi
# imzalı zip'imizle üzerine yazılacak; buradaki tek amacı app-update.yml'in
# oluşmasını tetiklemek.
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac zip

echo "== 2/7: Tek komutla derin imzalama (codesign --deep) =="
codesign --deep --force --timestamp --options runtime --entitlements "$ENT" --sign "$IDENTITY" "$APP"

echo "== 3/7: --deep'in atladığı gömülü dosyalar tek tek imzalanıyor =="
# Bu liste geçmişte notarization'ın "not signed with a valid Developer ID
# certificate" diye reddettiği dosyalardan derlendi. Electron/ffmpeg-static
# sürüm değişikliklerinde yeni bir dosya eksik çıkarsa, notarization
# hatasında path'i görünür (bkz. adım 5) — o path'i buraya ekleyin.
MISSED_FILES=(
  "$APP/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"
  "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib"
  "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib"
  "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib"
  "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib"
  "$APP/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt"
)
for f in "${MISSED_FILES[@]}"; do
  if [ -e "$f" ]; then
    codesign --force --timestamp --options runtime --entitlements "$ENT" --sign "$IDENTITY" "$f"
  fi
done
echo "Dış paket tekrar mühürleniyor..."
codesign --deep --force --timestamp --options runtime --entitlements "$ENT" --sign "$IDENTITY" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

if [ "$SKIP_NOTARIZE" = "1" ]; then
  echo "== 4/7: SKIP_NOTARIZE=1 — Apple notarization ATLANIYOR =="
  echo "== 5/7: SKIP_NOTARIZE=1 — staple ATLANIYOR =="
else
  echo "== 4/7: Notarization'a gönderiliyor (Apple'ın onayı birkaç dakika sürebilir) =="
  rm -f /tmp/sita-notarize-app.zip
  ditto -c -k --keepParent "$APP" /tmp/sita-notarize-app.zip
  xcrun notarytool submit /tmp/sita-notarize-app.zip \
    --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID" \
    --wait

  echo "== 5/7: Bilet uygulamaya yapıştırılıyor (staple) =="
  xcrun stapler staple "$APP"
  spctl -a -vvv --type execute "$APP"
fi

echo "== 6/7: DMG ve zip oluşturuluyor =="
rm -f "release/$DMG_NAME" "release/$ZIP_NAME"
STAGE=$(mktemp -d)
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "Sita Yapı" -srcfolder "$STAGE" -ov -format UDZO "release/$DMG_NAME"
rm -rf "$STAGE"
ditto -c -k --keepParent "$APP" "release/$ZIP_NAME"

echo "DMG imzalanıyor..."
codesign --sign "$IDENTITY" --timestamp "release/$DMG_NAME"
if [ "$SKIP_NOTARIZE" = "1" ]; then
  echo "SKIP_NOTARIZE=1 — DMG notarization/staple ATLANIYOR."
else
  echo "DMG notarize ediliyor..."
  xcrun notarytool submit "release/$DMG_NAME" \
    --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID" \
    --wait
  xcrun stapler staple "release/$DMG_NAME"
  spctl -a -vvv --type open --context context:primary-signature "release/$DMG_NAME"
fi

echo "== 7/7: latest-mac.yml oluşturuluyor =="
sha512_b64() { openssl dgst -sha512 -binary "$1" | openssl base64 -A; }
ZIP_SHA=$(sha512_b64 "release/$ZIP_NAME")
ZIP_SIZE=$(stat -f%z "release/$ZIP_NAME")
DMG_SHA=$(sha512_b64 "release/$DMG_NAME")
DMG_SIZE=$(stat -f%z "release/$DMG_NAME")
cat > release/latest-mac.yml << EOF
version: ${VERSION}
files:
  - url: ${ZIP_NAME}
    sha512: ${ZIP_SHA}
    size: ${ZIP_SIZE}
  - url: ${DMG_NAME}
    sha512: ${DMG_SHA}
    size: ${DMG_SIZE}
path: ${ZIP_NAME}
sha512: ${ZIP_SHA}
releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'
EOF

echo ""
echo "Tamamlandı. release/ içindeki dosyalar:"
echo "  - release/$DMG_NAME"
echo "  - release/$ZIP_NAME"
echo "  - release/latest-mac.yml"
echo ""
echo "GitHub'a yüklemek için:"
echo "  gh release upload v${VERSION} release/$DMG_NAME release/$ZIP_NAME release/latest-mac.yml --clobber"
