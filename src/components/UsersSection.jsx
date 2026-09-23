import { useState } from "react";
import { TrashIcon } from "./icons.jsx";
import { TABS } from "./Header.jsx";
import { UserAvatar, PhotoCropEditor } from "../lib/avatars.jsx";
import Modal from "./Modal.jsx";

// "Ayarlar" role="admin" ile ayrı bir şekilde kısıtlı, izin listesine
// girmez. "Kameralar" da bu genel sekme-izni listesinden bilerek çıkarıldı —
// kamera erişimi normal bir personel izni gibi açılıp kapatılabilir bir şey
// olarak gösterilmesin diye (test hesabında olduğu gibi hiddenTabs ile
// doğrudan, bu ekrandan bağımsız olarak kapatılıyor).
const PERMISSION_TABS = TABS.filter((t) => !t.adminOnly && t.id !== "cameras");
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// Ayarlar sekmesi artık personele de açık (bkz. navTabs.jsx) ama içindeki
// bölümlerin çoğu admin-only kalıyor (Kullanıcılar/Çalışanlar/Tatiller/
// Tedarikçiler/API Anahtarları/Güvenlik/Aktivite Kaydı — bkz.
// SettingsPage.jsx'teki not). Sadece bu 3 bölüm admin tarafından kişi
// başına açılıp kapatılabiliyor; anahtarlar (`key`) SettingsPage.jsx'teki
// canSeeSection() çağrılarıyla birebir eşleşmeli.
export const GRANTABLE_SECTIONS = [
  { key: "vehicles", label: "Araçlar" },
  { key: "depots", label: "Depolar" },
  { key: "stockCsv", label: "Stok CSV İçe/Dışa Aktar" },
];

function SettingsSectionsCheckboxes({ settingsSections, onChange }) {
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <small style={{ opacity: 0.7 }}>Ayarlar içinde görebileceği bölümler:</small>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.3rem" }}>
        {GRANTABLE_SECTIONS.map((section) => (
          <label
            key={section.key}
            style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", fontWeight: 400 }}
          >
            <input
              type="checkbox"
              checked={settingsSections.includes(section.key)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...settingsSections, section.key]
                    : settingsSections.filter((k) => k !== section.key)
                )
              }
            />
            {section.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function EditUserModal({ user, users, currentUser, onClose, onSaved, onNotify }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState("");
  const [hiddenTabs, setHiddenTabs] = useState(user.hiddenTabs || []);
  const [settingsSections, setSettingsSections] = useState(user.settingsSections || []);
  const [photo, setPhoto] = useState(user.photo || "");
  const [photoPosition, setPhotoPosition] = useState(user.photoPosition || { x: 50, y: 50 });
  const [cropTarget, setCropTarget] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSelf = user.id === currentUser.id;

  function handleFileChange(file) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      window.alert("Fotoğraf dosyası çok büyük (2 MB üstü). Daha küçük bir görsel seçin.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropTarget(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Kullanıcı adı boş olamaz.");
      return;
    }
    if (password && password.length < 4) {
      setError("Yeni şifre en az 4 karakter olmalı.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const patch = { name: name.trim(), role, hiddenTabs, settingsSections, photo, photoPosition };
      if (password) patch.password = password;
      await window.api.updateUser(user.id, patch, currentUser.id);
      onSaved();
      onNotify?.("success", "Kullanıcı güncellendi.");
      onClose();
    } catch (err) {
      setError(err.message);
      onNotify?.("error", err.message || "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (cropTarget) {
    return (
      <Modal onClose={() => setCropTarget(null)}>
        <div className="card">
          <PhotoCropEditor
            photo={cropTarget}
            initialPosition={{ x: 50, y: 50 }}
            onCancel={() => setCropTarget(null)}
            onSave={(pos) => {
              setPhoto(cropTarget);
              setPhotoPosition(pos);
              setCropTarget(null);
            }}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Kullanıcıyı Düzenle</h3>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSave}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <UserAvatar user={{ id: user.id, name, photo, photoPosition }} users={users} size={56} />
            <label style={{ flex: 1 }}>
              Profil Fotoğrafı (opsiyonel — yoksa otomatik bir avatar atanır)
              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e.target.files[0])} />
            </label>
            {photo && (
              <button type="button" className="secondary" onClick={() => setPhoto("")}>
                Fotoğrafı Kaldır
              </button>
            )}
          </div>
          <label>
            Kullanıcı Adı
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label style={{ display: "block", marginTop: "0.6rem" }}>
            Rol
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
              <option value="admin">Yönetici</option>
              <option value="staff">Personel</option>
            </select>
          </label>
          {isSelf && <small>Kendi rolünüzü değiştiremezsiniz.</small>}
          <label style={{ display: "block", marginTop: "0.6rem" }}>
            Yeni Şifre (opsiyonel)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Değiştirmek için yazın"
            />
          </label>
          {role !== "admin" && (
            <div style={{ marginTop: "0.75rem" }}>
              <small style={{ opacity: 0.7 }}>Görebileceği sekmeler:</small>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.3rem" }}>
                {PERMISSION_TABS.map((tab) => (
                  <label
                    key={tab.id}
                    style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", fontWeight: 400 }}
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenTabs.includes(tab.id)}
                      onChange={(e) =>
                        setHiddenTabs((h) =>
                          e.target.checked ? h.filter((id) => id !== tab.id) : [...h, tab.id]
                        )
                      }
                    />
                    {tab.label}
                  </label>
                ))}
              </div>
              <SettingsSectionsCheckboxes settingsSections={settingsSections} onChange={setSettingsSections} />
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
            <button className="primary" type="submit" disabled={busy}>
              Kaydet
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              İptal
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default function UsersSection({ users, currentUser, onSaved, onNotify }) {
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("staff");
  const [newHiddenTabs, setNewHiddenTabs] = useState([]);
  const [newSettingsSections, setNewSettingsSections] = useState([]);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    if (!newName.trim() || newPassword.length < 4) {
      setError("Ad girin ve en az 4 karakterli bir şifre belirleyin.");
      return;
    }
    try {
      await window.api.addUser(newName.trim(), newPassword, newRole, newHiddenTabs, newSettingsSections, currentUser.id);
      setNewName("");
      setNewPassword("");
      setNewRole("staff");
      setNewHiddenTabs([]);
      setNewSettingsSections([]);
      onSaved();
      onNotify?.("success", "Kullanıcı eklendi.");
    } catch (err) {
      setError(err.message || "Kullanıcı eklenemedi.");
      onNotify?.("error", err.message || "Kullanıcı eklenemedi.");
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`"${user.name}" kullanıcısını silmek istediğinize emin misiniz?`)) return;
    try {
      await window.api.deleteUser(user.id, currentUser.id);
      onSaved();
      onNotify?.("success", "Kullanıcı silindi.");
    } catch (err) {
      setError(err.message);
      onNotify?.("error", err.message || "Silinemedi.");
    }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      {users.map((user) => (
        <div
          key={user.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--border)",
            padding: "0.6rem 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <UserAvatar user={user} users={users} size={32} />
            <div>
              <strong>{user.name}</strong>{" "}
              <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>
                {user.role === "admin" ? "Yönetici" : "Personel"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="secondary" onClick={() => setEditingUser(user)}>
              Düzenle
            </button>
            <button
              type="button"
              className="icon-btn delete"
              title="Kullanıcıyı sil"
              aria-label="Kullanıcıyı sil"
              onClick={() => handleDelete(user)}
              disabled={user.id === currentUser.id}
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      ))}

      <form onSubmit={handleAdd} style={{ marginTop: "0.75rem" }}>
        <div className="form-row" style={{ alignItems: "flex-end" }}>
          <label>
            Yeni Kullanıcı Adı
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <label>
            Şifre
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label>
            Rol
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="staff">Personel</option>
              <option value="admin">Yönetici</option>
            </select>
          </label>
          <button className="primary" type="submit">
            + Kullanıcı Ekle
          </button>
        </div>
        {newRole !== "admin" && (
          <div style={{ marginTop: "0.5rem" }}>
            <small style={{ opacity: 0.7 }}>Görebileceği sekmeler:</small>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.3rem" }}>
              {PERMISSION_TABS.map((tab) => (
                <label key={tab.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={!newHiddenTabs.includes(tab.id)}
                    onChange={(e) =>
                      setNewHiddenTabs((h) =>
                        e.target.checked ? h.filter((id) => id !== tab.id) : [...h, tab.id]
                      )
                    }
                  />
                  {tab.label}
                </label>
              ))}
            </div>
            <SettingsSectionsCheckboxes settingsSections={newSettingsSections} onChange={setNewSettingsSections} />
          </div>
        )}
      </form>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          users={users}
          currentUser={currentUser}
          onClose={() => setEditingUser(null)}
          onSaved={onSaved}
          onNotify={onNotify}
        />
      )}
    </>
  );
}
