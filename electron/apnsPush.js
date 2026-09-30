// iOS native uygulamaya push bildirimi göndermek için minimal bir Apple Push
// Notification service (APNs) HTTP/2 istemcisi. Ağır bir bağımlılık (ör.
// node-apn) eklemek yerine Node'un yerleşik http2 modülü + jsonwebtoken
// (ES256 provider token imzalamak için) kullanılıyor — APNs'in HTTP/2
// protokolü zaten basit: tek bir JWT üretip her istekte Authorization
// header'ında gönderiyoruz.
import http2 from "node:http2";
import fs from "node:fs";
import jwt from "jsonwebtoken";
import { APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID } from "./config.js";

// Apple, aynı provider token'ın tekrar tekrar (dakikada bir) üretilmesini
// istemiyor — token 1 saate kadar geçerli, biz 50 dakikada bir yeniliyoruz.
let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

function providerToken() {
  if (cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;
  const privateKey = fs.readFileSync(APNS_KEY_PATH, "utf8");
  cachedToken = jwt.sign({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }, privateKey, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: APNS_KEY_ID },
  });
  cachedTokenAt = Date.now();
  return cachedToken;
}

const APNS_HOST = "https://api.push.apple.com";

/// Tek bir cihaz token'ına bildirim gönderir. Hata durumunda (ör. "kayıt"
/// (device token) artık geçersiz — uygulama silinmiş) fırlatmak yerine
/// sonucu döner; çağıran taraf geçersiz token'ları temizleyebilir.
export function sendPushNotification(deviceToken, { title, body, data } = {}) {
  return new Promise((resolve) => {
    let client;
    try {
      client = http2.connect(APNS_HOST);
    } catch (err) {
      resolve({ ok: false, status: 0, reason: err.message });
      return;
    }
    client.on("error", (err) => resolve({ ok: false, status: 0, reason: err.message }));

    const payload = JSON.stringify({
      aps: { alert: { title, body }, sound: "default" },
      ...(data || {}),
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let responseBody = "";
    req.on("response", (headers) => {
      status = headers[":status"];
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      if (status === 200) {
        resolve({ ok: true, status });
      } else {
        let reason = responseBody;
        try {
          reason = JSON.parse(responseBody).reason || responseBody;
        } catch {
          // responseBody zaten JSON değilse olduğu gibi kullanılır.
        }
        resolve({ ok: false, status, reason });
      }
    });
    req.on("error", (err) => {
      client.close();
      resolve({ ok: false, status: 0, reason: err.message });
    });
    req.end(payload);
  });
}

/// Birden fazla cihaza (aynı kullanıcının birden fazla telefonu olabilir)
/// paralel gönderir — tek bir başarısız token diğerlerini engellemez.
export async function sendPushNotificationToTokens(tokens, notification) {
  return Promise.all(tokens.map((token) => sendPushNotification(token, notification)));
}
