import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Sekme değişince (ör. Diğer sekmesinden çıkıp geri dönünce) bileşen
// unmount/remount olduğu için salt useState açık/kapalı durumu unutuyordu —
// başlığa göre localStorage'da saklıyoruz ki kullanıcı her seferinde
// yeniden açmak zorunda kalmasın.
function storageKeyFor(title) {
  return `collapsibleCard:${title}`;
}

export default function CollapsibleCard({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKeyFor(title));
      return stored === null ? defaultOpen : stored === "true";
    } catch {
      return defaultOpen;
    }
  });

  function toggle() {
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(storageKeyFor(title), String(next));
      } catch {
        // localStorage kullanılamıyorsa (gizli mod vb.) sessizce yoksay
      }
      return next;
    });
  }

  return (
    <div className="card">
      <button
        type="button"
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          font: "inherit",
          color: "inherit",
        }}
      >
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.55rem" }}>
          {icon}
          {title}
        </h3>
        <ChevronDown
          size={18}
          strokeWidth={1.75}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
        />
      </button>
      {open && <div style={{ marginTop: "1rem" }}>{children}</div>}
    </div>
  );
}
