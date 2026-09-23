// Apple tarzı aç/kapa anahtarı — tekil (evet/hayır) ayarlar için düz
// checkbox yerine kullanılıyor (bkz. src/styles.css .toggle-switch).
// Gerçek bir <input type="checkbox"> üzerine kurulu, bu yüzden mevcut
// checkbox kullanım yerlerine (checked/onChange/disabled) birebir aynı
// props'larla drop-in olarak geçilebiliyor. Kendi başına bir <label>
// OLUŞTURMAZ — çağıran yerdeki mevcut dış <label>...metin</label> sarmalayıcı
// tıklama/eşleşmeyi zaten sağlıyor.
export default function ToggleSwitch({ checked, onChange, disabled, id }) {
  return (
    <span className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} id={id} />
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
    </span>
  );
}
