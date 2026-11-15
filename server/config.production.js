// CANLI (PROD) sunucu yapılandırması — Docker imajında electron/config.js
// yerine bu dosya kopyalanır (bkz. Dockerfile). Gerçek electron/config.js git
// dışında ve imaja ASLA girmez (.dockerignore).
//
// Bütün değerler barındırma hizmetinin şifreli ortam değişkenlerinden okunur.
// Zorunlu bir değişken eksikse sunucu açılmaz ve yalnız EKSİK DEĞİŞKENİN ADINI
// yazar (değerleri hiçbir zaman günlüğe yazılmaz). Liste: docs/CANLI-SUNUCU.md.
//
// Masaüstü uygulamasının electron/config.js'iyle AYNI dışa aktarımlar —
// electron/db.js ve handlers.js değişmeden çalışır.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const missing = [];
function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) missing.push(name);
  return (v || "").trim();
}
function optional(name, fallback = "") {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

if (process.env.NODE_ENV !== "production") {
  throw new Error("config.production.js yalnız NODE_ENV=production ile kullanılır.");
}

// --- Veritabanı: her zaman PROD Supabase ---
const supabaseUrl = required("SUPABASE_URL");
const supabaseServiceKey = required("SUPABASE_SERVICE_KEY");

// --- Mobil oturum anahtarlarını imzalayan gizli anahtar (server/auth.js okur;
// burada da kontrol edilir ki eksikse tek seferde tam liste verilsin) ---
required("SITA_TOKEN_SECRET");

// --- Masaüstüyle ORTAK şifreleme anahtarı (veritabanındaki şifreli değerler,
// ör. kamera şifreleri, bununla çözülür — masaüstündekiyle birebir aynı olmalı) ---
export const SECRET_ENCRYPTION_KEY = required("SECRET_ENCRYPTION_KEY");

// --- Dış servisler ---
export const GOOGLE_MAPS_API_KEY = required("GOOGLE_MAPS_API_KEY");
export const GEMINI_API_KEY = optional("GEMINI_API_KEY");
export const FILOTIM_API_KEY = optional("FILOTIM_API_KEY");

// "41.0,29.0" biçiminde (enlem,boylam)
const [shopLat, shopLng] = required("SHOP_LOCATION").split(",").map((n) => Number(n));
export const SHOP_LOCATION = { lat: shopLat, lng: shopLng };

// --- Bildirim anahtarları: dosya yerine ortam değişkeninde içerik olarak gelir,
// açılışta yalnız bu sürecin okuyabileceği geçici dosyalara yazılır ---
const secretsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sita-secrets-"));
fs.chmodSync(secretsDir, 0o700);
function secretFile(envName, fileName) {
  const content = required(envName);
  const file = path.join(secretsDir, fileName);
  if (content) fs.writeFileSync(file, content.replace(/\\n/g, "\n"), { mode: 0o600 });
  return file;
}

export const APNS_KEY_PATH = secretFile("APNS_KEY_P8", "apns.p8");
export const APNS_KEY_ID = required("APNS_KEY_ID");
export const APNS_TEAM_ID = required("APNS_TEAM_ID");
export const APNS_BUNDLE_ID = optional("APNS_BUNDLE_ID", "com.vitra.sitaservisplanlayici");
export const FCM_SERVICE_ACCOUNT_PATH = secretFile("FCM_SERVICE_ACCOUNT_JSON", "fcm.json");

// db.js/handlers.js'in beklediği adlar. Canlıda DEV yoktur.
export const SUPABASE_DEV = { url: "", key: "" };
export const SUPABASE_PROD = { url: supabaseUrl, key: supabaseServiceKey };
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_SERVICE_KEY = supabaseServiceKey;
export const IS_DEV_DB = false;
// server/index.js bunu kontrol eder: NODE_ENV=production yalnız bu dosyayla çalışır.
export const CONFIG_KIND = "production-env";

if (missing.length > 0) {
  throw new Error(`Eksik ortam değişkenleri: ${missing.join(", ")} — sunucu başlatılmadı (bkz. docs/CANLI-SUNUCU.md).`);
}
