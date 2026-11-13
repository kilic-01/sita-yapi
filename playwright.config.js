import { defineConfig } from "@playwright/test";

// Electron uygulamasını sürecek testler tek bir örnek üzerinden, sırayla
// çalışmalı — paylaşılan DEV Supabase verisiyle uğraştıkları için paralel
// koşmak (aynı anda iki Electron penceresi + aynı test kullanıcısı) yarış
// durumlarına yol açar.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  // electron/main.js, NODE_ENV=development iken pencereyi Vite dev
  // sunucusundan (http://localhost:5173) yüklüyor — bu sayede DEV Supabase'e
  // bağlanıyor ve build almaya gerek kalmıyor (bkz. electron/config.js).
  webServer: {
    command: "npx vite",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
