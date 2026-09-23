import { useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { useSyncStatus } from "../lib/useHeaderAlerts.js";
import ToggleSwitch from "./ToggleSwitch.jsx";

export default function LoginGate({ hasUsers, onLogin, onCreateFirstUser, isDark, notice }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const syncInfo = useSyncStatus();

  // window.api.login/addUser bir ağ/Supabase hatasında (yanlış şifreden
  // FARKLI olarak) İSTİSNA FIRLATIR — önceden bu hiç yakalanmıyordu, hatalı
  // şifre mesajı yerine buton sessizce hiçbir şey yapmıyormuş gibi
  // görünüyordu (kullanıcı "yazınca giriş yapmıyor" sanıyordu, aslında
  // internet/Supabase sorunuydu). Şimdi ikisini ayırt edip doğru mesajı
  // gösteriyoruz.
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
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
    } catch (err) {
      setError(
        "İnternet bağlantısında sorun var, giriş yapılamadı. Bağlantınızı kontrol edip tekrar deneyin." +
          (err?.message ? ` (${err.message})` : "")
      );
    }
  }

  return (
    <div className="login-screen">
      <img src={isDark ? "./logo-white.svg" : "./logo.svg"} alt="Sita Yapı" />
      {notice && (
        <p style={{ maxWidth: 320, textAlign: "center", opacity: 0.8, fontSize: "0.85rem" }}>{notice}</p>
      )}
      <form onSubmit={handleSubmit}>
        {syncInfo.isProblem && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "var(--danger)",
              fontSize: "0.82rem",
              background: "color-mix(in srgb, var(--danger) 12%, transparent)",
              border: "1px solid var(--danger)",
              borderRadius: 8,
              padding: "0.5rem 0.7rem",
              marginBottom: "0.9rem",
            }}
          >
            <WifiOff size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            <span>İnternet bağlantısında sorun var — giriş yapmakta zorluk yaşayabilirsiniz.</span>
          </div>
        )}
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
          <ToggleSwitch checked={remember} onChange={(e) => setRemember(e.target.checked)} />
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
