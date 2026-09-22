// Depo kameraları: DVR'ın RTSP akışını ffmpeg ile HLS'e çevirip, yerel bir
// HTTP sunucudan (127.0.0.1 sabit port) renderer'a servis eder. Renderer
// hiçbir zaman DVR'ın IP/kullanıcı/şifre bilgisini görmez — RTSP URL'si
// main.js içinde (şifre çözüldükten sonra) oluşturulup buraya verilir.

import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import ffmpegPathRaw from "ffmpeg-static";

// ffmpeg-static'in kendi hesapladığı yol, paketlenmiş uygulamada HÂLÂ
// "app.asar" içini gösteriyor — ama gerçek çalıştırılabilir dosya
// package.json'daki asarUnpack sayesinde "app.asar.unpacked" klasörüne
// çıkarılıyor. spawn(), asar arşivinin İÇİNDEKİ bir binary'yi doğrudan
// çalıştıramaz (Node'un fs/require'ı asar'ı şeffaf okusa da, spawn işletim
// sisteminin kendi dosya sistemine gerçek bir yol ister) — bu yüzden
// "Error: spawn ENOTDIR" ile başarısız oluyordu. Yolu unpacked konuma
// çeviriyoruz; geliştirme modunda zaten "app.asar" hiç geçmediği için bu
// değişiklik etkisiz kalır.
const ffmpegPath = ffmpegPathRaw.replace("app.asar", "app.asar.unpacked");

const HTTP_PORT = 17342;
const IDLE_TIMEOUT_MS = 90_000;
const SWEEP_INTERVAL_MS = 30_000;
const READY_TIMEOUT_MS = 10_000;

const baseDir = path.join(os.tmpdir(), "sita-yapi-cameras");

// channelId -> { process, dir, lastAccess }
const channels = new Map();

function channelDir(id) {
  return path.join(baseDir, String(id));
}

function killChannel(rawId) {
  const id = String(rawId);
  const ch = channels.get(id);
  if (!ch) return;
  try {
    ch.process.kill("SIGKILL");
  } catch {}
  channels.delete(id);
  fs.rm(channelDir(id), { recursive: true, force: true }, () => {});
}

// Aynı kanal aynı anda hem ızgarada hem büyütülmüş modalde izlenebiliyor —
// bu yüzden tek bir "kapat" isteğiyle diğer görüntüleyicinin akışını
// koparmamak için referans sayısı tutuyoruz; süreç sadece son izleyici de
// kapattığında gerçekten sonlandırılır.
export function startChannel(rawId, rtspUrl) {
  const id = String(rawId);
  const existing = channels.get(id);
  if (existing) {
    existing.lastAccess = Date.now();
    existing.refCount += 1;
    return Promise.resolve(`http://127.0.0.1:${HTTP_PORT}/${id}/index.m3u8`);
  }

  return new Promise((resolve, reject) => {
    const dir = channelDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const playlistPath = path.join(dir, "index.m3u8");

    const args = [
      "-rtsp_transport", "tcp",
      "-timeout", "8000000",
      "-i", rtspUrl,
      "-c:v", "copy",
      "-an",
      "-f", "hls",
      "-hls_time", "1",
      "-hls_list_size", "8",
      "-hls_flags", "delete_segments+append_list",
      playlistPath,
    ];

    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let settled = false;
    let stderrTail = "";

    proc.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });

    proc.on("exit", () => {
      channels.delete(id);
      if (!settled) {
        settled = true;
        const lastLines = stderrTail.trim().split("\n").slice(-2).join(" ");
        reject(new Error(`Kameraya bağlanılamadı${lastLines ? ": " + lastLines : "."}`));
      }
    });

    channels.set(id, { process: proc, dir, lastAccess: Date.now(), refCount: 1 });

    const startedAt = Date.now();
    const check = setInterval(() => {
      if (fs.existsSync(playlistPath)) {
        clearInterval(check);
        if (!settled) {
          settled = true;
          resolve(`http://127.0.0.1:${HTTP_PORT}/${id}/index.m3u8`);
        }
      } else if (Date.now() - startedAt > READY_TIMEOUT_MS) {
        clearInterval(check);
        if (!settled) {
          settled = true;
          killChannel(id);
          reject(new Error("Kamera zaman aşımına uğradı — DVR'a erişilemiyor olabilir."));
        }
      }
    }, 300);
  });
}

export function stopChannel(rawId) {
  const id = String(rawId);
  const ch = channels.get(id);
  if (!ch) return;
  ch.refCount -= 1;
  if (ch.refCount <= 0) killChannel(id);
}

export function stopAll() {
  for (const id of [...channels.keys()]) killChannel(id);
}

let server = null;

export function ensureHttpServer() {
  if (server) return;
  server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const [, id, file] = req.url.split("/");
    const ch = channels.get(id);
    if (!ch) {
      res.writeHead(404).end();
      return;
    }
    ch.lastAccess = Date.now();
    const filePath = path.join(ch.dir, file || "index.m3u8");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        // Segment ffmpeg tarafından yazılırken/silinirken kısa süreli
        // yarışa girebilir — CORS başlığı burada da olmalı ki hls.js
        // "CORS" değil gerçek "404" görsün ve kendi yeniden deneme
        // mantığıyla toparlansın.
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": file?.endsWith(".ts") ? "video/mp2t" : "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  });
  // Sunucu hatası (ör. port zaten kullanımda — aynı bilgisayarda hem
  // geliştirme hem paketlenmiş sürüm aynı anda açık kaldığında olur)
  // dinleyicisiz bırakılırsa Node bunu "uncaught exception" olarak
  // fırlatıp TÜM uygulamayı çökertiyordu. Artık sadece loglanıp kamera
  // özelliği devre dışı kalıyor — geri kalan uygulama normal çalışmaya
  // devam ediyor.
  server.on("error", (err) => {
    console.error("Kamera sunucusu başlatılamadı:", err.message);
    server = null;
  });
  server.listen(HTTP_PORT, "127.0.0.1");

  // Kimse izlemeyi bırakıp uygulamayı kapatmayı unutursa (ya da renderer'ın
  // stopChannel çağrısı bir şekilde kaçarsa) boşta kalan ffmpeg süreçlerini
  // otomatik temizler.
  setInterval(() => {
    const now = Date.now();
    for (const [id, ch] of channels) {
      if (now - ch.lastAccess > IDLE_TIMEOUT_MS) killChannel(id);
    }
  }, SWEEP_INTERVAL_MS);
}
