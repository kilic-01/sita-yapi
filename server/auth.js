// Mobil uygulamaların ve Saha aracının (public-barkod) API oturumu.
//
// Eskiden sunucu hiçbir isteği doğrulamıyordu: istemci "ben şu kullanıcıyım"
// diye actingUserId gönderiyor, sunucu buna güveniyordu — ağdaki herkes başka
// biri adına randevu silebilirdi. Artık:
//   • POST /api/login başarılıysa imzalı bir anahtar (token) döner.
//   • Diğer bütün /api istekleri "Authorization: Bearer <token>" ister; yoksa,
//     imza bozuksa ya da süresi geçtiyse 401.
//   • Kullanıcı silindiyse anahtarı da geçersiz olur (kullanıcı listesi
//     en fazla 60 sn önbellekte tutulur).
//   • İstek gövdesindeki actingUserId anahtardaki kullanıcıyla DEĞİŞTİRİLİR
//     (sorgudakini rotalar req.authUserId'den okur) — istemci başkası adına
//     işlem yapamaz.
//
// Anahtar biçimi: base64url(JSON {uid, exp}) + "." + base64url(HMAC-SHA256).
// Gizli anahtar: SITA_TOKEN_SECRET ortam değişkeni. Geliştirmede yoksa
// server/.token-secret dosyasında üretilip saklanır (git'e girmez); canlıda
// (NODE_ENV=production) ortam değişkeni olmadan sunucu açılmaz.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "../electron/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
const USERS_CACHE_MS = 60 * 1000;

function loadSecret() {
  const fromEnv = process.env.SITA_TOKEN_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SITA_TOKEN_SECRET ortam değişkeni (en az 32 karakter) tanımlı değil — sunucu başlatılmadı.");
  }
  const file = path.join(__dirname, ".token-secret");
  try {
    const saved = fs.readFileSync(file, "utf8").trim();
    if (saved.length >= 32) return saved;
  } catch {
    // ilk çalıştırma
  }
  const generated = crypto.randomBytes(48).toString("base64url");
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

const SECRET = loadSecret();

function sign(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

export function issueToken(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Geçerliyse kullanıcı id'si, değilse null. */
function verifyToken(token) {
  if (typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!uid || typeof exp !== "number" || exp < Date.now()) return null;
    return uid;
  } catch {
    return null;
  }
}

let usersCache = { at: 0, ids: new Set() };
async function userExists(id) {
  if (Date.now() - usersCache.at > USERS_CACHE_MS) {
    const users = await db.getUsers();
    usersCache = { at: Date.now(), ids: new Set(users.map((u) => u.id)) };
  }
  return usersCache.ids.has(id);
}

/** /api altındaki her istek için (giriş hariç). */
export async function requireAuth(req, res, next) {
  if (req.method === "POST" && req.path === "/login") return next();
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const uid = verifyToken(token);
  if (!uid) return res.status(401).json({ message: "Oturum süresi doldu, lütfen tekrar giriş yapın." });
  try {
    if (!(await userExists(uid))) {
      return res.status(401).json({ message: "Bu kullanıcı artık yok, lütfen tekrar giriş yapın." });
    }
  } catch (err) {
    return next(err);
  }
  req.authUserId = uid;
  // İstemcinin gönderdiği kimliğe güvenme: işlemi yapan, anahtarın sahibidir.
  // (Express 5'te req.query salt okunur; sorgudaki actingUserId yerine
  // rotalar doğrudan req.authUserId kullanır.)
  // Gövde varsa (yazma istekleri) actingUserId her zaman oturum sahibi —
  // istemci hiç göndermese de doldurulur, başka biri yazsa da ezilir.
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) req.body.actingUserId = uid;
  next();
}

// ---------- Giriş denemesi sınırı (kaba kuvvet şifre denemesine karşı) ----------
// Bellekte tutulur: 15 dakikalık pencerede aynı IP'den 10, aynı kullanıcı
// adına 5 başarısız denemeden sonra o pencere bitene kadar 429 döner.
// Başarılı giriş o kullanıcı adının sayacını sıfırlar.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 10;
const MAX_FAILS_PER_NAME = 5;
const loginFails = new Map(); // anahtar → { count, first }

function failCount(key) {
  const entry = loginFails.get(key);
  if (!entry) return 0;
  if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginFails.delete(key);
    return 0;
  }
  return entry.count;
}

function addFail(key) {
  const entry = loginFails.get(key);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) loginFails.set(key, { count: 1, first: Date.now() });
  else entry.count += 1;
}

function loginKeys(req, name) {
  return { ip: `ip:${req.ip}`, name: `name:${String(name || "").trim().toLocaleLowerCase("tr")}` };
}

/** Giriş denemesinden ÖNCE: sınır aşıldıysa true (istek reddedilmeli). */
export function loginBlocked(req, name) {
  const k = loginKeys(req, name);
  return failCount(k.ip) >= MAX_FAILS_PER_IP || failCount(k.name) >= MAX_FAILS_PER_NAME;
}

export function recordLoginResult(req, name, ok) {
  const k = loginKeys(req, name);
  if (ok) {
    loginFails.delete(k.name);
    return;
  }
  addFail(k.ip);
  addFail(k.name);
}

// Bellek şişmesin: süresi geçen kayıtları 10 dakikada bir temizle.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginFails) if (now - entry.first > LOGIN_WINDOW_MS) loginFails.delete(key);
}, 10 * 60 * 1000).unref();

/** Temel güvenlik başlıkları. HSTS yalnız canlıda (HTTPS arkasında). */
export function securityHeaders(_req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "no-referrer");
  if (process.env.NODE_ENV === "production") {
    // Tarayıcı/uygulama 1 yıl boyunca bu alan adına yalnız HTTPS ile bağlanır.
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}
