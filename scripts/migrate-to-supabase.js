// TEK SEFERLİK betik: yerel data.json'daki gerçek işletme verisini PROD
// Supabase projesine aktarır. ID'ler korunur (üretilmez), tüm alanlar
// olduğu gibi upsert edilir — electron/db.js'teki iş mantığından (varsayılan
// değer atama vb.) BİLEREK geçmez, çünkü amaç mevcut veriyi birebir taşımak.
//
// Çalıştırma: node scripts/migrate-to-supabase.js
// (NODE_ENV=development AYARLANMAMALI — electron/config.js NODE_ENV yoksa
// PROD projesine bağlanır, bu betiğin amacı budur.)

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from "../electron/config.js";

if (process.env.NODE_ENV === "development") {
  console.error(
    "HATA: NODE_ENV=development ayarlıyken bu betiği çalıştırmayın — dev projesine yazardı, " +
      "amaç PROD'a taşımak. `NODE_ENV=` ayarlamadan tekrar çalıştırın."
  );
  process.exit(1);
}

const DATA_PATH = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Sita Servis Planlayıcı",
  "data.json"
);

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

console.log(`Kaynak dosya: ${DATA_PATH}`);
console.log(`Hedef Supabase projesi: ${SUPABASE_URL}`);
console.log("");
console.log("Taşınacak kayıt sayıları:");
console.log(`  appointments: ${data.appointments?.length ?? 0}`);
console.log(`  technicians:  ${data.technicians?.length ?? 0}`);
console.log(`  vehicles:     ${data.vehicles?.length ?? 0}`);
console.log(`  users:        ${data.users?.length ?? 0}`);
console.log(`  suppliers:    ${data.suppliers?.length ?? 0}`);
console.log(`  depots:       ${data.depots?.length ?? 0}`);
console.log(`  stockItems:   ${data.stockItems?.length ?? 0}`);
console.log(`  settings:     ${Object.keys(data.settings || {}).length} anahtar`);
console.log("");

if (process.argv[2] !== "--yes") {
  console.log(
    'Bu betik PROD veritabanına YAZAR (upsert). Onaylamak için: node scripts/migrate-to-supabase.js --yes'
  );
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertTable(table, rows) {
  if (!rows || rows.length === 0) {
    console.log(`${table}: aktarılacak kayıt yok, atlanıyor.`);
    return;
  }
  let done = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`${table} upsert hatası: ${error.message}`);
    done += batch.length;
    console.log(`${table}: ${done}/${rows.length} aktarıldı`);
  }
}

async function upsertSettings(settings) {
  const rows = Object.entries(settings || {}).map(([key, value]) => ({ key, value }));
  if (rows.length === 0) {
    console.log("settings: aktarılacak anahtar yok, atlanıyor.");
    return;
  }
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`settings upsert hatası: ${error.message}`);
  console.log(`settings: ${rows.length} anahtar aktarıldı`);
}

async function verifyCounts() {
  console.log("");
  console.log("Doğrulama (Supabase'deki satır sayıları):");
  const tables = [
    ["appointments", data.appointments?.length ?? 0],
    ["technicians", data.technicians?.length ?? 0],
    ["vehicles", data.vehicles?.length ?? 0],
    ["users", data.users?.length ?? 0],
    ["suppliers", data.suppliers?.length ?? 0],
    ["depots", data.depots?.length ?? 0],
    ["stockItems", data.stockItems?.length ?? 0],
  ];
  let allMatch = true;
  for (const [table, expected] of tables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table} sayım hatası: ${error.message}`);
    const ok = count === expected;
    if (!ok) allMatch = false;
    console.log(`  ${table}: ${count} (beklenen: ${expected}) ${ok ? "OK" : "UYUŞMUYOR!"}`);
  }
  console.log("");
  console.log(allMatch ? "Tüm satır sayıları eşleşiyor." : "UYARI: bazı tablolarda satır sayısı uyuşmuyor!");
}

async function main() {
  await upsertTable("vehicles", data.vehicles);
  await upsertTable("technicians", data.technicians);
  await upsertTable("depots", data.depots);
  await upsertTable("users", data.users);
  await upsertTable("suppliers", data.suppliers);
  await upsertTable("appointments", data.appointments);
  await upsertTable("stockItems", data.stockItems);
  await upsertSettings(data.settings);
  await verifyCounts();
  console.log("");
  console.log("Taşıma tamamlandı.");
  process.exit(0);
}

main().catch((err) => {
  console.error("HATA:", err.message);
  process.exit(1);
});
