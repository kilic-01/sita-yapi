import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

// Uyarı (warning) için sabit kehribar tonu — temada ayrı bir renk yok.
const WARNING = "#d97706";

export default function Toast({ toast }) {
  if (!toast) return null;
  const isSuccess = toast.type === "success";
  const color = isSuccess ? "var(--success)" : toast.type === "warning" ? WARNING : "var(--danger)";
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.6rem 1rem",
        borderRadius: 10,
        background: `color-mix(in srgb, ${color} 16%, var(--card-bg))`,
        border: `1px solid ${color}`,
        color,
        fontSize: "0.85rem",
        fontWeight: 600,
        boxShadow: "var(--shadow)",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      {isSuccess ? (
        <CheckCircle2 size={16} strokeWidth={1.75} />
      ) : toast.type === "warning" ? (
        <AlertTriangle size={16} strokeWidth={1.75} />
      ) : (
        <XCircle size={16} strokeWidth={1.75} />
      )}
      {toast.text}
    </div>
  );
}
