import { useState } from "react";
import { TrashIcon } from "./icons.jsx";

function newSupplierRow() {
  return { id: crypto.randomUUID(), name: "", url: "", searchUrlTemplate: "", logo: "" };
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export default function SuppliersSection({ suppliers, currentUser, onSaved, onNotify }) {
  const [rows, setRows] = useState(suppliers.map((s) => ({ ...s })));

  function updateRow(index, field, value) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function handleLogoChange(index, file) {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      window.alert("Logo dosyası çok büyük (2 MB üstü). Daha küçük bir görsel seçin.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateRow(index, "logo", reader.result);
    reader.readAsDataURL(file);
  }

  function addSupplier() {
    setRows((rs) => [...rs, newSupplierRow()]);
  }

  function removeSupplier(index) {
    const row = rows[index];
    const label = row.name || "bu tedarikçi";
    if (!window.confirm(`"${label}" tedarikçisini silmek istediğinize emin misiniz?`)) return;
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  function removeCredentials(index) {
    setRows((rs) =>
      rs.map((r, i) =>
        i === index ? { ...r, hasCredentials: false, clearCredentials: true, password: "" } : r
      )
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      const saved = await window.api.setSuppliers(rows, currentUser?.id);
      // Sunucudan dönen listeyle senkronize ediyoruz ki düz metin şifre/işaret
      // alanları hafızada asılı kalmasın.
      setRows(saved.map((s) => ({ ...s, password: "" })));
      onSaved(saved);
      onNotify?.("success", "Tedarikçiler kaydedildi.");
    } catch (err) {
      onNotify?.("error", err.message || "Kaydedilemedi.");
    }
  }

  return (
    <form onSubmit={handleSave}>
      {rows.map((row, i) => (
        <div
          key={row.id}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <label>
              Tedarikçi Adı
              <input value={row.name} onChange={(e) => updateRow(i, "name", e.target.value)} />
            </label>
            <label>
              B2B Site Adresi
              <input
                value={row.url}
                onChange={(e) => updateRow(i, "url", e.target.value)}
                placeholder="https://b2b.tedarikci.com"
              />
            </label>
            <button
              type="button"
              className="icon-btn delete"
              title="Tedarikçiyi sil"
              aria-label="Tedarikçiyi sil"
              onClick={() => removeSupplier(i)}
            >
              <TrashIcon />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
            {row.logo && (
              <img
                src={row.logo}
                alt={row.name}
                style={{ height: 32, maxWidth: 120, objectFit: "contain" }}
              />
            )}
            <label style={{ flex: 1 }}>
              Logo (opsiyonel — Sipariş sekmesinde isim yerine gösterilir)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoChange(i, e.target.files[0])}
              />
            </label>
            {row.logo && (
              <button type="button" className="secondary" onClick={() => updateRow(i, "logo", "")}>
                Logoyu Kaldır
              </button>
            )}
          </div>
          <label style={{ display: "block", marginTop: "0.5rem" }}>
            Arama Adresi (opsiyonel — ürün kodunu bu sitede aramak için)
            <input
              value={row.searchUrlTemplate || ""}
              onChange={(e) => updateRow(i, "searchUrlTemplate", e.target.value)}
              placeholder="https://b2b.tedarikci.com/arama?q={kod}"
            />
          </label>
          <small>
            Sitenin arama sonucu adresini buraya yazın, aranacak kodun geleceği yere{" "}
            <code>{"{kod}"}</code> yazın. Örn. tedarikçinin sitesinde "4453" aradığınızda adres
            çubuğunda ne görüyorsanız, "4453" yerine <code>{"{kod}"}</code> yazarak buraya
            yapıştırın. Boş bırakılırsa, Sipariş sekmesinde bu tedarikçiye tıklanınca sadece ana
            sayfası açılır, aramayı kendiniz yaparsınız.
          </small>

          {window.api.platform === "electron" ? (
            <div style={{ marginTop: "0.75rem" }}>
              <div className="form-row" style={{ alignItems: "flex-end" }}>
                <label>
                  Kullanıcı Adı
                  <input
                    value={row.username || ""}
                    onChange={(e) => updateRow(i, "username", e.target.value)}
                  />
                </label>
                <label>
                  Şifre
                  <input
                    type="password"
                    value={row.password || ""}
                    onChange={(e) => updateRow(i, "password", e.target.value)}
                    placeholder={row.hasCredentials ? "•••••••• (kayıtlı — değiştirmek için yazın)" : ""}
                  />
                </label>
                {row.hasCredentials && (
                  <button type="button" className="secondary" onClick={() => removeCredentials(i)}>
                    Kimlik Bilgilerini Kaldır
                  </button>
                )}
              </div>
              <small>
                Kaydedilen bilgilerle bu tedarikçiye tıklandığında otomatik giriş denenir (parola
                yöneticisi gibi çalışır). Şifre bu bilgisayarın güvenli anahtarlığında (Keychain)
                şifreli saklanır. Site 2 adımlı doğrulama veya görsel kod isterse o adımı siz
                tamamlarsınız — her site için garanti çalışacağı anlamına gelmez.
              </small>
            </div>
          ) : (
            <small>Kullanıcı adı/şifre girişi sadece masaüstü uygulamasında yapılabilir.</small>
          )}
        </div>
      ))}
      <button type="button" className="secondary" onClick={addSupplier}>
        + Tedarikçi Ekle
      </button>
      <button className="primary" type="submit" style={{ marginLeft: "0.6rem" }}>
        Tedarikçileri Kaydet
      </button>
    </form>
  );
}
