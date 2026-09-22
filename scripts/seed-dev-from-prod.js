// TEK SEFERLİK betik: PROD'daki gerçek müşteri/randevu ve tedarikçi
// verisini (ve bunların bağlı olduğu teknisyen/araç/depo kayıtlarını) DEV
// projesine KOPYALAR — sadece test/kontrol amaçlı. PROD'dan sadece OKUR,
// hiçbir yazma işlemi yapmaz. Kullanıcı şifreleri (passwordHash) ve
// tedarikçi kimlik bilgileri (passwordEncrypted) olduğu gibi kopyalanır —
// bunlar zaten güvenli şekilde saklanıyor (scrypt hash / OS şifrelemesi).
//
// Çalıştırma: node scripts/seed-dev-from-prod.js --yes

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PROD as PROD, SUPABASE_DEV as DEV } from "../electron/config.js";

const prod = createClient(PROD.url, PROD.key);
const dev = createClient(DEV.url, DEV.key);

const TABLES = ["depots", "vehicles", "technicians", "suppliers", "appointments"];

async function main() {
  console.log(`Kaynak (sadece okunur): ${PROD.url}`);
  console.log(`Hedef (yazılır):        ${DEV.url}`);
  console.log("");

  const dryRun = process.argv[2] !== "--yes";

  for (const table of TABLES) {
    const { data, error } = await prod.from(table).select("*");
    if (error) throw new Error(`PROD ${table} okuma hatası: ${error.message}`);
    console.log(`${table}: PROD'da ${data.length} kayıt`);

    if (dryRun) continue;

    if (data.length) {
      const { error: upsertErr } = await dev.from(table).upsert(data, { onConflict: "id" });
      if (upsertErr) throw new Error(`DEV ${table} yazma hatası: ${upsertErr.message}`);
    }
    console.log(`  → DEV'e kopyalandı`);
  }

  if (dryRun) {
    console.log("");
    console.log("Bu bir önizlemeydi, hiçbir şey yazılmadı. Onaylamak için: node scripts/seed-dev-from-prod.js --yes");
    return;
  }

  console.log("");
  console.log("Doğrulama:");
  for (const table of TABLES) {
    const { count, error } = await dev.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`DEV ${table} sayım hatası: ${error.message}`);
    console.log(`  ${table}: DEV'de şimdi ${count} kayıt`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("HATA:", err.message);
    process.exit(1);
  });
