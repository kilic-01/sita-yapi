import crypto from "node:crypto";
import { SECRET_ENCRYPTION_KEY } from "./config.js";

// Tedarikçi/kamera şifreleri için: Electron'un safeStorage'ının aksine
// (Keychain/DPAPI'ye, yani TEK bir bilgisayara bağlı) sabit, paylaşılan bir
// anahtarla şifreler — böylece bir bilgisayarda kaydedilen kimlik bilgisi,
// paylaşılan veritabanı üzerinden senkronlanan HERHANGİ bir şirket
// bilgisayarında çözülebilir.
const SECRET_KEY = Buffer.from(SECRET_ENCRYPTION_KEY, "hex");

export function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(encoded) {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", SECRET_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}
