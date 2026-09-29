import { useState } from "react";
import { UserAvatar } from "../lib/avatars.jsx";
import { formatDateTime } from "../lib/format.js";
import { NoDataIllustration } from "./illustrations.jsx";

export default function ActivityLogSection({ activityLog = [], users = [] }) {
  const [userFilter, setUserFilter] = useState("all");

  if (activityLog.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "1rem 0" }}>
        <NoDataIllustration size={110} />
        <p>Henüz bir aktivite kaydı yok.</p>
      </div>
    );
  }

  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const filteredLog =
    userFilter === "all" ? activityLog : activityLog.filter((entry) => entry.actorUserId === userFilter);

  return (
    <div>
      <label style={{ display: "block", marginBottom: "0.85rem", maxWidth: 260 }}>
        Kullanıcı
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
          <option value="all">Tümü</option>
          {sortedUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      {filteredLog.length === 0 && <p>Bu kullanıcıya ait aktivite kaydı yok.</p>}
      {filteredLog.map((entry) => {
        const actor = users.find((u) => u.id === entry.actorUserId);
        return (
          <div key={entry.id} className="schedule-row" style={{ cursor: "default" }}>
            <UserAvatar user={actor} users={users} size={32} />
            <div className="schedule-row-main">
              <div>{entry.description}</div>
              <div className="schedule-row-sub">
                <small>{formatDateTime(entry.createdAt)}</small>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
