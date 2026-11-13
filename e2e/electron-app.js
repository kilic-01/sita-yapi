import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Her test koşusu, gerçek Electron kullanıcı profilinden (bu bilgisayarda
// "Beni Hatırla" işaretliyse orada kayıtlı bir rememberedUserId olabilir,
// bkz. electron/main.js) tamamen İZOLE bir profille başlar — yoksa test
// LoginGate'i hiç görmeden otomatik giriş yapılmış halde açılabilir, ya da
// önceki bir test koşusunun bıraktığı navStyle/tercihlerle karışabilirdi.
export async function launchApp() {
  const userDataDir = mkdtempSync(join(tmpdir(), "sita-e2e-"));
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: "development" },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  return { app, window };
}
