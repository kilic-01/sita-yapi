import { test, expect } from "@playwright/test";
import { launchApp } from "./electron-app.js";

// electron/appointments.test.js'teki desenle aynı sebep: db.js, config.js'in
// SUPABASE_URL/SUPABASE_SERVICE_KEY'i (DEV mi PROD mu) hangi ortamda
// çalıştığına karar vermeden önce NODE_ENV'in ayarlanmış olması gerekiyor —
// bu yüzden statik import yerine dinamik import kullanılıyor.
process.env.NODE_ENV = "development";
delete process.env.FORCE_PROD_DB;
const db = await import("../electron/db.js");

// Kullanıcı ekleme/silme admin yetkisi istiyor (bkz. db.js requireAdmin) —
// bu, DEV Supabase'de zaten var olan, bu oturum boyunca doğrulanmış Emre'nin
// admin hesabının id'si. SADECE test kullanıcısını oluşturup silmek için
// yetkilendirme amaçlı kullanılıyor; bu hesaba hiçbir şekilde giriş
// yapılmıyor ya da değiştirilmiyor.
const EMRE_DEV_ADMIN_ID = "f0113e9a-9dd5-4f53-bf46-ee6feb940afd";
const TEST_USER_NAME = "E2E Test";
const TEST_USER_PASSWORD = "E2eTest!2026";

let testUserId;

test.beforeAll(async () => {
  await db.initDb();
  const user = await db.addUser({
    name: TEST_USER_NAME,
    password: TEST_USER_PASSWORD,
    role: "staff",
    actingUserId: EMRE_DEV_ADMIN_ID,
  });
  testUserId = user.id;
});

test.afterAll(async () => {
  if (testUserId) {
    await db.deleteUser(testUserId, EMRE_DEV_ADMIN_ID);
  }
});

test.describe("Giriş ekranı", () => {
  test("yanlış şifreyle giriş reddedilmeli", async () => {
    const { app, window } = await launchApp();
    try {
      await window.getByLabel("Kullanıcı Adı").fill(TEST_USER_NAME);
      await window.getByLabel("Şifre").fill("yanlis-sifre");
      await window.getByRole("button", { name: "Giriş Yap" }).click();
      await expect(window.locator(".error")).toHaveText("Kullanıcı adı veya şifre yanlış.");
    } finally {
      await app.close();
    }
  });

  test("doğru bilgilerle giriş yapılabilmeli", async () => {
    const { app, window } = await launchApp();
    try {
      await window.getByLabel("Kullanıcı Adı").fill(TEST_USER_NAME);
      await window.getByLabel("Şifre").fill(TEST_USER_PASSWORD);
      await window.getByRole("button", { name: "Giriş Yap" }).click();
      // Giriş başarılı olunca LoginGate kalkıp yerine ana uygulama kabuğu
      // (Anasayfa sekmesi dahil) geliyor.
      await expect(window.getByRole("button", { name: "Anasayfa" })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});

test.describe("Ana sekmelerde gezinme", () => {
  test("ana sekmeler çökmeden açılabilmeli", async () => {
    const { app, window } = await launchApp();
    const pageErrors = [];
    window.on("pageerror", (err) => pageErrors.push(err));

    try {
      await window.getByLabel("Kullanıcı Adı").fill(TEST_USER_NAME);
      await window.getByLabel("Şifre").fill(TEST_USER_PASSWORD);
      await window.getByRole("button", { name: "Giriş Yap" }).click();
      await expect(window.getByRole("button", { name: "Anasayfa" })).toBeVisible();

      // Az önce düzeltilen çökmenin regresyon testi: Anasayfa arama kutusuna
      // yazınca (müşteri adı/adresi boş olan randevular yüzünden) sayfa
      // çökmüyor olmalı (bkz. HomePage.jsx:122,124 null-check düzeltmesi).
      await window.getByPlaceholder("Müşteri, ürün veya teklif ara…").fill("test arama");
      await window.getByPlaceholder("Müşteri, ürün veya teklif ara…").clear();

      for (const tabLabel of ["Randevular", "Stok", "Parça Zimmeti", "Bekleyen Parçalar", "Ayarlar"]) {
        const tabButton = window.getByRole("button", { name: tabLabel });
        await tabButton.click();
        await expect(tabButton).toHaveClass(/active/);
      }

      expect(pageErrors, `Sekmeler arasında gezinirken yakalanmayan hata(lar): ${pageErrors.join(", ")}`).toHaveLength(
        0
      );
    } finally {
      await app.close();
    }
  });
});
