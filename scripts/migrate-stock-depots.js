// TEK SEFERLİK betik: Çoklu depo desteği eklenmeden önceki stockItems
// satırlarındaki tek "depotId"/"quantity" çiftini, yeni "stockItemDepots"
// tablosunda o ürünün İLK (tek) satırı olarak taşır. "depotId" boş olan
// ürünler (büyük çoğunluk — hiç depo atanmamış dev verisi) atlanır, onlar
// için hiçbir şey oluşturulmaz; dispatcher ilk kez stok eklerken/düzenlerken
// elle bir depo seçer.
//
// ÖNEMLİ: Çalıştırmadan önce Supabase'de "stockItemDepots" tablosunun ve
// "partCheckouts.depotId" sütununun zaten oluşturulmuş olması gerekir —
// bkz. bu betiğin sonundaki SQL yorumu.
//
// Çalıştırma: node scripts/migrate-stock-depots.js --env=dev
//             node scripts/migrate-stock-depots.js --env=dev --yes

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_DEV, SUPABASE_PROD } from "../electron/config.js";

const envArg = process.argv.find((a) => a.startsWith("--env="))?.split("=")[1] || "dev";
const target = envArg === "prod" ? SUPABASE_PROD : SUPABASE_DEV;
const dryRun = !process.argv.includes("--yes");

console.log(`Hedef: ${envArg.toUpperCase()} (${target.url})`);
if (dryRun) {
  console.log("Önizleme modu — hiçbir şey yazılmayacak. Onaylamak için --yes ekleyin.");
}

const supabase = createClient(target.url, target.key);

function uuid() {
  return crypto.randomUUID();
}

async function selectAllStockItems() {
  // PostgREST varsayılan olarak tek istekte en fazla 1000 satır döndürüyor —
  // ~10 binlik tabloda sayfalama olmadan sessizce kırpılırdı.
  const PAGE_SIZE = 1000;
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("stockItems")
      .select("id, code, depotId, quantity")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`stockItems okunamadı: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  const items = await selectAllStockItems();

  const candidates = items.filter((i) => i.depotId && Number(i.quantity) > 0);
  console.log(`Toplam ürün: ${items.length}, taşınacak (depotId + quantity>0): ${candidates.length}`);

  if (dryRun) {
    console.log("İlk 5 örnek:", candidates.slice(0, 5).map((i) => ({ code: i.code, depotId: i.depotId, quantity: i.quantity })));
    process.exit(0);
  }

  let done = 0;
  for (const item of candidates) {
    const { data: existing } = await supabase
      .from("stockItemDepots")
      .select("id")
      .eq("stockItemId", item.id)
      .eq("depotId", item.depotId)
      .maybeSingle();
    if (existing) continue; // Zaten taşınmış (betik iki kez çalıştırılırsa yinelenmesin diye).
    const { error: insErr } = await supabase
      .from("stockItemDepots")
      .insert({ id: uuid(), stockItemId: item.id, depotId: item.depotId, quantity: Number(item.quantity) });
    if (insErr) throw new Error(`${item.code} taşınamadı: ${insErr.message}`);
    done++;
    if (done % 200 === 0) console.log(`  ${done}/${candidates.length}`);
  }
  console.log(`Tamamlandı: ${done}/${candidates.length} ürün taşındı.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("HATA:", err.message);
    process.exit(1);
  });

/* Önce Supabase SQL editöründe (dev ve prod'da ayrı ayrı):

create table if not exists "stockItemDepots" (
  id uuid primary key,
  "stockItemId" uuid not null references "stockItems"(id) on delete cascade,
  "depotId" uuid not null references "depots"(id) on delete cascade,
  quantity numeric not null default 0,
  unique ("stockItemId", "depotId")
);

alter table "partCheckouts" add column if not exists "depotId" uuid references "depots"(id);

Sonra Database > Replication'da "stockItemDepots" tablosunu da açın
(feeEntries/fuelTransactions'da yaptığımız gibi).
*/
