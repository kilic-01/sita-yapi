import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function CollapsibleCard({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
