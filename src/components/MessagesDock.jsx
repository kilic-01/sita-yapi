import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, ChevronDown, ChevronUp, ArrowLeft, Send, Check, CheckCheck } from "lucide-react";
import { UserAvatar } from "../lib/avatars.jsx";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Bugün";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Dün";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long" });
}

// LinkedIn'in sağ-alt köşede sabit duran mesajlaşma çubuğu gibi: sekme
// değiştirmeden her sayfadan erişilebilir, kapalıyken sadece küçük bir
// başlık çubuğu + okunmamış rozeti, tıklanınca yukarı doğru açılan bir
// panel.
export default function MessagesDock({ messages, users, currentUser, onSend, onMarkRead }) {
  const contacts = useMemo(() => users.filter((u) => u.id !== currentUser.id), [users, currentUser.id]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState("");
  const listEndRef = useRef(null);
  const dockRef = useRef(null);

  // Panelin DIŞINA tıklanınca kapansın — WhatsApp panelinde olduğu gibi.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (dockRef.current && !dockRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const conversations = useMemo(() => {
    const map = new Map();
    for (const c of contacts) map.set(c.id, { contact: c, messages: [], unread: 0, lastAt: null });
    for (const m of messages) {
      const otherId = m.senderId === currentUser.id ? m.recipientId : m.senderId;
      const entry = map.get(otherId);
      if (!entry) continue;
      entry.messages.push(m);
      if (m.recipientId === currentUser.id && !m.readAt) entry.unread += 1;
      if (!entry.lastAt || m.createdAt > entry.lastAt) entry.lastAt = m.createdAt;
    }
    return [...map.values()].sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || ""));
  }, [messages, contacts, currentUser.id]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);
  const selected = conversations.find((c) => c.contact.id === selectedId);

  // Panel açıkken ve bir sohbet seçiliyken, o kişiden gelen okunmamış
  // mesajları okundu işaretler — panel kapalıyken ya da liste görünümündeyken
  // tetiklenmez.
  useEffect(() => {
    if (open && selected && selected.unread > 0) onMarkRead(selected.contact.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selected?.contact.id, selected?.unread]);

  useEffect(() => {
    if (open && selectedId) listEndRef.current?.scrollIntoView({ block: "end" });
  }, [open, selectedId, selected?.messages.length]);

  function openContact(id) {
    setSelectedId(id);
    setOpen(true);
  }

  function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selected) return;
    onSend(selected.contact.id, text);
    setDraft("");
  }

  if (contacts.length === 0) return null;

  return (
    <div className="messages-dock" ref={dockRef}>
      <button type="button" className="messages-dock-header" onClick={() => setOpen((v) => !v)}>
        <MessageCircle size={17} strokeWidth={1.75} />
        <span style={{ flex: 1, textAlign: "left" }}>Mesajlar</span>
        {totalUnread > 0 && <span className="msg-unread-badge">{totalUnread}</span>}
        {open ? <ChevronDown size={16} strokeWidth={1.75} /> : <ChevronUp size={16} strokeWidth={1.75} />}
      </button>

      {open && (
        <div className="messages-dock-body">
          {!selected ? (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {conversations.map(({ contact, messages: msgs, unread }) => {
                const last = msgs[msgs.length - 1];
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => openContact(contact.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      width: "100%",
                      textAlign: "left",
                      padding: "0.65rem 0.85rem",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                  >
                    <UserAvatar user={contact} users={users} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
                        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.88rem" }}>
                          {contact.name}
                        </strong>
                        {unread > 0 && <span className="msg-unread-badge">{unread}</span>}
                      </div>
                      <small
                        style={{
                          opacity: 0.7,
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {last ? last.body : "Henüz mesaj yok"}
                      </small>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.6rem 0.85rem",
                  borderBottom: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Geri"
                  onClick={() => setSelectedId(null)}
                >
                  <ArrowLeft size={15} strokeWidth={1.75} />
                </button>
                <UserAvatar user={selected.contact} users={users} size={26} />
                <strong style={{ fontSize: "0.88rem" }}>{selected.contact.name}</strong>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                {selected.messages.length === 0 && (
                  <small style={{ opacity: 0.6 }}>Henüz mesaj yok — ilk mesajı siz gönderin.</small>
                )}
                {selected.messages.map((m, i) => {
                  const mine = m.senderId === currentUser.id;
                  const prev = selected.messages[i - 1];
                  const showDay = !prev || formatDay(prev.createdAt) !== formatDay(m.createdAt);
                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div style={{ textAlign: "center", margin: "0.4rem 0" }}>
                          <small style={{ opacity: 0.5, fontSize: "0.7rem" }}>{formatDay(m.createdAt)}</small>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <div className={`msg-bubble ${mine ? "mine" : "theirs"}`}>
                          {m.body}
                          <span className="msg-bubble-time">
                            {formatTime(m.createdAt)}
                            {mine &&
                              (m.readAt ? (
                                <CheckCheck size={13} strokeWidth={2} className="msg-read-icon read" />
                              ) : (
                                <Check size={13} strokeWidth={2} className="msg-read-icon" />
                              ))}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={listEndRef} />
              </div>

              <form
                onSubmit={handleSend}
                style={{ display: "flex", gap: "0.4rem", padding: "0.6rem 0.7rem", borderTop: "1px solid var(--border)", flexShrink: 0 }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Bir mesaj yazın…"
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Gönder"
                  title="Gönder"
                  style={{
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: "none",
                    background: "var(--accent)",
                    color: "var(--accent-text)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: draft.trim() ? "pointer" : "default",
                    opacity: draft.trim() ? 1 : 0.45,
                  }}
                >
                  <Send size={15} strokeWidth={1.75} />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
