import { CheckCircle2, XCircle } from "lucide-react";

export default function Toast({ toast }) {
  if (!toast) return null;
  const isSuccess = toast.type === "success";
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
        background: isSuccess
          ? "color-mix(in srgb, var(--success) 16%, var(--card-bg))"
          : "color-mix(in srgb, var(--danger) 16%, var(--card-bg))",
        border: `1px solid ${isSuccess ? "var(--success)" : "var(--danger)"}`,
        color: isSuccess ? "var(--success)" : "var(--danger)",
        fontSize: "0.85rem",
        fontWeight: 600,
        boxShadow: "var(--shadow)",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      {isSuccess ? (
        <CheckCircle2 size={16} strokeWidth={1.75} />
      ) : (
        <XCircle size={16} strokeWidth={1.75} />
      )}
      {toast.text}
    </div>
  );
}
