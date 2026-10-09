// Android native uygulamaya push bildirimi göndermek için minimal bir
// Firebase Cloud Messaging (FCM) HTTP v1 istemcisi. firebase-admin gibi ağır
// bir bağımlılık eklemek yerine mevcut jsonwebtoken + yerleşik fetch
// kullanılıyor — apnsPush.js'teki aynı minimal-bağımlılık yaklaşımı.
import fs from "node:fs";
import jwt from "jsonwebtoken";
import { FCM_SERVICE_ACCOUNT_PATH } from "./config.js";

let cachedAccessToken = null;
let cachedAccessTokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

function loadServiceAccount() {
  const raw = fs.readFileSync(FCM_SERVICE_ACCOUNT_PATH, "utf8");
  return JSON.parse(raw);
}

async function accessToken(account) {
  if (cachedAccessToken && Date.now() - cachedAccessTokenAt < TOKEN_TTL_MS) return cachedAccessToken;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    account.private_key,
    { algorithm: "RS256" }
  );
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error_description || json.error || "FCM access token alınamadı");
  cachedAccessToken = json.access_token;
  cachedAccessTokenAt = Date.now();
  return cachedAccessToken;
}

// Tek bir cihaz token'ına bildirim gönderir. APNs istemcisiyle aynı sözleşme:
// hata durumunda fırlatmak yerine { ok, status, reason } döner — çağıran
// taraf (electron/handlers.js) geçersiz token'ları temizleyebilir.
export async function sendFcmPushNotification(deviceToken, { title, body, data } = {}) {
  let account;
  try {
    account = loadServiceAccount();
  } catch (err) {
    return { ok: false, status: 0, reason: `FCM servis hesabı bulunamadı: ${err.message}` };
  }
  try {
    const token = await accessToken(account);
    const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title, body },
          data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
        },
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (resp.ok) return { ok: true, status: resp.status };
    const reason = json.error?.status || json.error?.message || "UNKNOWN";
    return { ok: false, status: resp.status, reason };
  } catch (err) {
    return { ok: false, status: 0, reason: err.message };
  }
}

export async function sendFcmPushNotificationToTokens(tokens, notification) {
  return Promise.all(tokens.map((token) => sendFcmPushNotification(token, notification)));
}
