import { useEffect, useMemo, useState } from "react";
import { loadAddressData } from "../lib/turkeyAddressData.js";

const trSort = (a, b) => a.localeCompare(b, "tr");

// Dükkan Beşiktaş/İstanbul'da olduğu için en çok kullanılan bu ikisi
// listelerin başına sabitleniyor, kayıt hızlansın.
const PRIORITY_IL = "İSTANBUL";
const PRIORITY_ILCE = "BEŞİKTAŞ";

function withPriorityFirst(list, priorityValue) {
  if (!list.includes(priorityValue)) return list;
  return [priorityValue, ...list.filter((item) => item !== priorityValue)];
}

export default function AddressFields({ value, onChange }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    loadAddressData().then(setData);
  }, []);

  const iller = useMemo(() => {
    if (!data) return [];
    return withPriorityFirst(Object.keys(data).sort(trSort), PRIORITY_IL);
  }, [data]);

  const ilceler = useMemo(() => {
    if (!data || !value.il) return [];
    const list = Object.keys(data[value.il] || {}).sort(trSort);
    return value.il === PRIORITY_IL ? withPriorityFirst(list, PRIORITY_ILCE) : list;
  }, [data, value.il]);

  const mahalleler = useMemo(() => {
    if (!data || !value.il || !value.ilce) return [];
    return (data[value.il]?.[value.ilce] || [])
      .map((m) => m.replace(/ Mah\.$/, ""))
      .sort(trSort);
  }, [data, value.il, value.ilce]);

  function set(field, next) {
    const updated = { ...value, [field]: next };
    if (field === "il") {
      updated.ilce = "";
      updated.mahalle = "";
    }
    if (field === "ilce") {
      updated.mahalle = "";
    }
    onChange(updated);
  }

  return (
    <>
      <div className="form-row">
        <label>
          İl
          <select value={value.il} onChange={(e) => set("il", e.target.value)} required>
            <option value="">Seçin</option>
            {iller.map((il) => (
              <option key={il} value={il}>
                {il}
              </option>
            ))}
          </select>
        </label>
        <label>
          İlçe
          <select
            value={value.ilce}
            onChange={(e) => set("ilce", e.target.value)}
            required
            disabled={!value.il}
          >
            <option value="">Seçin</option>
            {ilceler.map((ilce) => (
              <option key={ilce} value={ilce}>
                {ilce}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mahalle
          <select
            value={value.mahalle}
            onChange={(e) => set("mahalle", e.target.value)}
            required
            disabled={!value.ilce}
          >
            <option value="">Seçin</option>
            {mahalleler.map((mahalle) => (
              <option key={mahalle} value={mahalle}>
                {mahalle}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Sokak / Cadde ve Bina No
          <input
            value={value.street}
            onChange={(e) => set("street", e.target.value)}
            placeholder="Örn. Bağdat Cad. No:12"
          />
        </label>
        <label>
          Apartman Adı
          <input value={value.buildingName} onChange={(e) => set("buildingName", e.target.value)} />
        </label>
        <label>
          Daire No
          <input value={value.apartmentNo} onChange={(e) => set("apartmentNo", e.target.value)} />
        </label>
      </div>
    </>
  );
}
