// TEK SEFERLİK betik: /tmp/stock_name_fixes.json'daki {id, code, old, new}
// listesini kullanarak PROD'daki stockItems.name alanındaki gereksiz jenerik
// kategori önekini ("Duş başlıkları - " vb.) temizler, ardından aynı
// düzeltmeyi DEV projesindeki (varsa) eşleşen kodlara da uygular.
//
// Çalıştırma: node scripts/fix-stock-names.js --yes

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { SUPABASE_PROD as PROD, SUPABASE_DEV as DEV } from "../electron/config.js";

const fixes = JSON.parse(fs.readFileSync("/tmp/stock_name_fixes.json", "utf-8"));
console.log(`Düzeltilecek kayıt sayısı: ${fixes.length}`);

const dryRun = process.argv[2] !== "--yes";
if (dryRun) {
  console.log("Önizleme modu — hiçbir şey yazılmadı. Onaylamak için: node scripts/fix-stock-names.js --yes");
  process.exit(0);
}

const prod = createClient(PROD.url, PROD.key);
const dev = createClient(DEV.url, DEV.key);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log("PROD güncelleniyor...");
  let done = 0;
  for (const f of fixes) {
    const { error } = await prod.from("stockItems").update({ name: f.new }).eq("id", f.id);
    if (error) throw new Error(`PROD güncelleme hatası (${f.code}): ${error.message}`);
    done++;
    if (done % 100 === 0) console.log(`  PROD: ${done}/${fixes.length}`);
  }
  console.log(`PROD: ${done}/${fixes.length} tamamlandı`);

  console.log("DEV'deki eşleşen kodlar güncelleniyor...");
  const { data: devRows, error: devErr } = await dev.from("stockItems").select("id, code");
  if (devErr) throw new Error(`DEV okuma hatası: ${devErr.message}`);
  const devIdByCode = new Map(devRows.map((r) => [r.code, r.id]));

  let devDone = 0;
  for (const f of fixes) {
    const devId = devIdByCode.get(f.code);
    if (!devId) continue;
    const { error } = await dev.from("stockItems").update({ name: f.new }).eq("id", devId);
    if (error) throw new Error(`DEV güncelleme hatası (${f.code}): ${error.message}`);
    devDone++;
  }
  console.log(`DEV: ${devDone} eşleşen kayıt güncellendi (DEV'de bulunmayanlar atlandı)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("HATA:", err.message);
    process.exit(1);
  });
