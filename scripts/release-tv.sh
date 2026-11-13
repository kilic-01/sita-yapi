#!/bin/bash
# Ofisteki TV'nin "Sita Yapı TV" uygulamasının yeni sürümünü yayınlar —
# TV'ler açılışta ve 6 saatte bir GitHub'a bakıp (android/tv/.../Updater.kt)
# bekleme ekranında "Yeni sürüm hazır — OK'e basın" gösterir.
#
#   1) android/tv/build.gradle'da versionCode'u 1 artırın, versionName'i
#      yükseltin (ör. 1.0 → 1.0.1)
#   2) scripts/release-tv.sh
#
# Sürüm "tv-v<versionName>" etiketiyle ÖN SÜRÜM (prerelease) olarak açılır:
# masaüstünün otomatik güncellemesi yalnız "latest" sürüme baktığı için TV
# sürümleri ona karışmaz. APK debug anahtarıyla imzalı (bkz. tv/build.gradle)
# — güncelleme kurulabilsin diye HER SÜRÜM BU MAC'TE derlenmeli; başka bir
# makinenin debug anahtarıyla imzalanan APK TV'deki sürümün üstüne kurulmaz.
# release derlemesi tv/supabase.properties'te gizli (sb_secret_) anahtar
# varsa durur — TV'ye yalnız publishable anahtar konur.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(sed -n 's/^ *versionName "\(.*\)"$/\1/p' "$ROOT/android/tv/build.gradle")"
TAG="tv-v$VERSION"
APK="$ROOT/android/tv/build/outputs/apk/release/tv-release.apk"

if [ -z "$VERSION" ]; then
  echo "versionName okunamadı (android/tv/build.gradle)." >&2
  exit 1
fi
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "$TAG zaten yayınlanmış — önce build.gradle'da sürümü yükseltin." >&2
  exit 1
fi

(cd "$ROOT/android" && ./gradlew :tv:assembleRelease)

cp "$APK" "$ROOT/android/tv/build/sita-yapi-tv.apk"
gh release create "$TAG" "$ROOT/android/tv/build/sita-yapi-tv.apk" \
  --title "Sita Yapı TV $VERSION" \
  --notes "Ofis TV uygulaması. TV'ler bu sürümü kendileri bulur; bekleme ekranında OK'e basınca kurulur." \
  --prerelease --latest=false
echo "Yayınlandı: $TAG"
