# Sita Yapı mobil API'si (server/index.js) — CANLI kapsayıcı.
# Veri Supabase PROD'da; bu kapsayıcı yalnız mobil uygulamalar ile Supabase
# arasındaki API katmanını çalıştırır. Kurulum: docs/CANLI-SUNUCU.md.
#
# Güvenlik:
#  • Gerçek electron/config.js ve electron/secrets/ imaja GİRMEZ (.dockerignore);
#    yerine ortam değişkenlerinden okuyan server/config.production.js kopyalanır.
#  • Yalnız sunucunun ihtiyaç duyduğu dosyalar kopyalanır (mobil/masaüstü/TV yok).
#  • Geliştirme paketleri kurulmaz; süreç yetkisiz "node" kullanıcısıyla çalışır.

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Bağımlılıklar (geliştirme paketleri ve kurulum betikleri olmadan — ör.
# ffmpeg-static'in ~70 MB'lık indirmesi sunucuda gereksiz).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Sunucu kodu + masaüstüyle ortak iş mantığı
COPY server/ ./server/
COPY electron/ ./electron/
# Canlı yapılandırma: değerler ortam değişkenlerinden (bkz. config.production.js)
RUN cp server/config.production.js electron/config.js \
 && rm -f server/.token-secret

USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4173}/healthz" >/dev/null || exit 1

CMD ["node", "server/index.js"]
