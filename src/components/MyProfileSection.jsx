import { useState } from "react";
import { UserAvatar, PhotoCropEditor } from "../lib/avatars.jsx";
import Modal from "./Modal.jsx";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// "Ayarlar" artık personele de açık (bkz. navTabs.jsx) — bu bölüm herkesin
// (admin dahil) KENDİ ad/şifre/fotoğrafını değiştirebildiği tek yer.
// Rol/hiddenTabs/settingsSections burada HİÇ gösterilmiyor — o alanlar
// sadece "Kullanıcılar" bölümünden (admin-only) değiştirilebilir; backend
// (electron/db.js updateUser) da admin olmayan bir çağrıda bu alanları zaten
// yok sayıyor, burası sadece o gerçeğe uygun bir arayüz.
export default function MyProfileSection({ currentUser, users, onSaved, onCurrentUserUpdated, onNotify }) {
  const [name, setName] = useState(currentUser?.name || "");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState(currentUser?.photo || "");
  const [photoPosition, setPhotoPosition] = useState(currentUser?.photoPosition || { x: 50, y: 50 });
  const [cropTarget, setCropTarget] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      const patch = { name: name.trim(), photo, photoPosition };
      if (password) patch.password = password;
      const updated = await window.api.updateUser(currentUser.id, patch, currentUser.id);
      setPassword("");
      onCurrentUserUpdated?.((prev) => ({ ...prev, ...updated }));
      onSaved?.();
      onNotify?.("success", "Profiliniz güncellendi.");
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
    <div>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSave}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <UserAvatar user={{ id: currentUser.id, name, photo, photoPosition }} users={users} size={56} />
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
          Yeni Şifre (opsiyonel)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Değiştirmek için yazın"
          />
        </label>
        <div style={{ marginTop: "1.25rem" }}>
          <button className="primary" type="submit" disabled={busy}>
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
