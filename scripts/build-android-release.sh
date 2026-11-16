#!/bin/bash
# Android mobil uygulamanın Play Store'a yüklenecek imzalı derlemesi (AAB) +
# cihazda denemek için imzalı APK.
#   scripts/build-android-release.sh
# Yükleme anahtarı: ~/.sita-android/upload-keystore.jks (iCloud dışı).
# Şifre: Anahtar Zinciri "sita-android-upload" — ekrana/dosyaya yazılmaz.
# Önce versionCode'u artırın (android/app/build.gradle); Play aynı numarayı kabul etmez.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITA_UPLOAD_STORE_PASSWORD="$(security find-generic-password -s sita-android-upload -a upload -w)"
export SITA_UPLOAD_STORE_PASSWORD
cd "$ROOT/android"
./gradlew :app:clean :app:bundleRelease :app:assembleRelease --no-daemon --console=plain -q
AAB="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
jarsigner -verify "$AAB" >/dev/null && echo "AAB imzalı: $AAB"
echo "APK: $APK"
