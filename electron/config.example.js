// electron/config.js'in ŞABLONU — gerçek anahtarları BURAYA yazmayın.
// Kurulum: bu dosyayı "config.js" adıyla kopyalayıp gerçek değerleri
// electron/config.js içine girin. config.js .gitignore'da olduğu için
// git'e hiç eklenmez, GitHub geçmişine sızmaz.

export const GOOGLE_MAPS_API_KEY = "";

// Gemini API anahtarı (şikayet metninden süre tahmini için) — aistudio.google.com/app/apikey
export const GEMINI_API_KEY = "";

export const SHOP_LOCATION = {
  lat: 0,
  lng: 0,
};

// Apple Push Notifications (iOS native uygulama) — developer.apple.com >
// Certificates, Identifiers & Profiles > Keys altında oluşturulan .p8
// anahtarı. Dosyayı electron/secrets/ altına koyup buraya dosya adını yazın
// (electron/secrets/ de .gitignore'da, hiç commit'lenmez).
export const APNS_KEY_PATH = new URL("./secrets/AuthKey_XXXXXXXXXX.p8", import.meta.url).pathname;
export const APNS_KEY_ID = "";
export const APNS_TEAM_ID = "";
export const APNS_BUNDLE_ID = "";

// Paylaşımlı bulut veritabanı (Supabase) — geliştirme/telefon testi HER ZAMAN
// "dev" projesine, paketlenmiş/canlı uygulama "prod" projesine bağlanır.
// Böylece geliştirirken gerçek işletme verisine yanlışlıkla dokunma riski olmaz.
export const SUPABASE_DEV = {
  url: "",
  key: "",
};

export const SUPABASE_PROD = {
  url: "",
  key: "",
};

const isDev = process.env.NODE_ENV === "development";
export const SUPABASE_URL = isDev ? SUPABASE_DEV.url : SUPABASE_PROD.url;
export const SUPABASE_SERVICE_KEY = isDev ? SUPABASE_DEV.key : SUPABASE_PROD.key;
