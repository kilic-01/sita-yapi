import { useState } from "react";

export default function LoginGate({ hasUsers, onLogin, onCreateFirstUser, isDark, notice }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!hasUsers) {
      if (!name.trim()) {
        setError("Adınızı girin.");
        return;
      }
      if (password.length < 4) {
        setError("Şifre en az 4 karakter olmalı.");
        return;
      }
      if (password !== confirm) {
        setError("Şifreler eşleşmiyor.");
        return;
      }
      await onCreateFirstUser(name.trim(), password, remember);
      return;
    }

    const ok = await onLogin(name.trim(), password, remember);
    if (!ok) setError("Kullanıcı adı veya şifre yanlış.");
  }

  return (
    <div className="login-screen">
      <img src={isDark ? "./logo-white.svg" : "./logo.svg"} alt="Sita Yapı" />
      {notice && (
        <p style={{ maxWidth: 320, textAlign: "center", opacity: 0.8, fontSize: "0.85rem" }}>{notice}</p>
      )}
      <form onSubmit={handleSubmit}>
        <label>
          {hasUsers ? "Kullanıcı Adı" : "İlk kullanıcı adınızı belirleyin"}
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          {hasUsers ? "Şifre" : "Şifre belirleyin"}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {!hasUsers && (
          <label>
            Şifreyi tekrar girin
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        )}
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: "auto" }}
          />
          Beni Hatırla
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit">
          {hasUsers ? "Giriş Yap" : "Kullanıcıyı Oluştur"}
        </button>
      </form>
    </div>
  );
}
