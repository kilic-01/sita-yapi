import { test } from "node:test";
import assert from "node:assert/strict";
import { expandAbbreviations, buildGeocodeAttempts } from "./geocodeQuery.js";

test("expandAbbreviations sık kısaltmaları genişletir", () => {
  assert.equal(expandAbbreviations("Bağdat Cd. No:12"), "Bağdat Caddesi No:12");
  assert.equal(expandAbbreviations("Atatürk Blv"), "Atatürk Bulvarı");
  assert.equal(expandAbbreviations("Çiçek Sok."), "Çiçek Sokak");
  assert.equal(expandAbbreviations(""), "");
  assert.equal(expandAbbreviations(null), null);
});

test("expandAbbreviations kısaltma olmayan kelimelere dokunmaz", () => {
  assert.equal(expandAbbreviations("Nispetiye Caddesi"), "Nispetiye Caddesi");
});

test("buildGeocodeAttempts en spesifikten en sadeye 3 aşama üretir", () => {
  const attempts = buildGeocodeAttempts({
    street: "Bağdat Cd. No:12",
    buildingName: "Deniz Apt",
    apartmentNo: "4",
    mahalle: "Caferağa",
    ilce: "Kadıköy",
    il: "İstanbul",
  });
  assert.equal(attempts.length, 3);
  // Daire numarası hiçbir aşamada geçmemeli.
  for (const a of attempts) {
    assert.ok(!a.address.includes("4"), `daire no sızmış: ${a.address}`);
    assert.ok(a.components.includes("İstanbul"));
  }
  assert.ok(attempts[0].address.includes("Caddesi")); // kısaltma genişletildi
  assert.ok(attempts[0].address.includes("Deniz Apt"));
  assert.ok(!attempts[1].address.includes("Deniz Apt")); // 2. aşamada bina adı yok
  assert.ok(!attempts[2].address.includes("Bağdat")); // 3. aşamada sokak yok
});

test("buildGeocodeAttempts eksik bilgilerle bile kırılmadan çalışır", () => {
  assert.deepEqual(buildGeocodeAttempts({}), []);
  const onlyNeighborhood = buildGeocodeAttempts({ mahalle: "Caferağa", ilce: "Kadıköy" });
  assert.equal(onlyNeighborhood.length, 1);
  assert.equal(onlyNeighborhood[0].address, "Caferağa Mahallesi, Kadıköy");
});

test("buildGeocodeAttempts orijinal girdi objesini değiştirmez", () => {
  const input = { street: "Bağdat Cd.", mahalle: "Caferağa", ilce: "Kadıköy", il: "İstanbul" };
  const copy = { ...input };
  buildGeocodeAttempts(input);
  assert.deepEqual(input, copy);
});
