import { useRef, useState } from "react";
import { colorForTechnician } from "./techColors.js";

// Fotoğrafı olmayan kullanıcılar/teknisyenler için varsayılan avatar —
// internet bağlantısı gerektirmeden (masaüstü uygulaması offline
// çalışabilmeli) gösterilen, kişiden kişiye SADECE renk değişen tek bir
// silüet (kullanıcının verdiği profile-avatar.svg şablonu). Hangi kişinin
// hangi rengi aldığı `colorForTechnician` ile aynı index'e (listedeki
// sırasına) bağlıdır — böylece bir kişi uygulamanın her yerinde (harita,
// program, anasayfa, mesajlar) hep aynı renkte görünür, asla başkasıyla
// karışmaz.

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Yüklenen fotoğrafta yüzün ortalanabilmesi için sürükleyerek konumlandırma
// — object-position yüzdesini üretir, TechnicianAvatar/UserAvatar bunu
// aynen kullanır.
export function PhotoPositioner({ photo, position, onChange, size = 110 }) {
  const boxRef = useRef(null);
  const dragState = useRef(null);
  const pos = position || { x: 50, y: 50 };

  function handleDown(e) {
    dragState.current = { startX: e.clientX, startY: e.clientY, startPos: pos };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleMove(e) {
    if (!dragState.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    onChange({
      x: clamp(dragState.current.startPos.x - (dx / rect.width) * 100, 0, 100),
      y: clamp(dragState.current.startPos.y - (dy / rect.height) * 100, 0, 100),
    });
  }
  function handleUp() {
    dragState.current = null;
  }

  return (
    <div
      ref={boxRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerLeave={handleUp}
      title="Yüzü ortalamak için fotoğrafı sürükleyin"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        border: "2px solid var(--border)",
        cursor: "grab",
        touchAction: "none",
        flexShrink: 0,
      }}
    >
      <img
        src={photo}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${pos.x}% ${pos.y}%`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// Instagram'ın profil fotoğrafı düzenleyicisine benzer adım: fotoğraf
// yüklendiğinde önce burası gösterilir, kullanıcı dairenin içinde kalacak
// alanı sürükleyerek ayarlar, "Kaydet" ile bu adım kapanıp asıl forma
// (artık ayarlanmış fotoğrafla) döner.
export function PhotoCropEditor({ photo, initialPosition, onCancel, onSave }) {
  const [position, setPosition] = useState(initialPosition || { x: 50, y: 50 });
  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ marginTop: 0 }}>Fotoğrafı Ayarla</h3>
      <p style={{ marginTop: 0 }}>
        <small>Yuvarlak alanda görünecek kısmı ayarlamak için fotoğrafı sürükleyin.</small>
      </p>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <PhotoPositioner photo={photo} position={position} onChange={setPosition} size={220} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1.25rem" }}>
        <button type="button" className="primary" onClick={() => onSave(position)}>
          Kaydet
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}

export function TechnicianAvatar({ technician, technicians, size = 32 }) {
  const color = colorForTechnician(technician?.id, technicians);
  if (technician?.photo) {
    const pos = technician.photoPosition || { x: 50, y: 50 };
    return (
      <img
        src={technician.photo}
        alt={technician.name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          objectPosition: `${pos.x}% ${pos.y}%`,
          flexShrink: 0,
        }}
      />
    );
  }
  return <DefaultAvatar color={color} size={size} />;
}

export function UserAvatar({ user, users, size = 32 }) {
  const color = colorForTechnician(user?.id, users);
  if (user?.photo) {
    const pos = user.photoPosition || { x: 50, y: 50 };
    return (
      <img
        src={user.photo}
        alt={user.name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          objectPosition: `${pos.x}% ${pos.y}%`,
          flexShrink: 0,
        }}
      />
    );
  }
  return <DefaultAvatar color={color} size={size} />;
}

export function DefaultAvatar({ color = "#7f8c8d", size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      style={{ borderRadius: "50%", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path
        fill={`color-mix(in srgb, ${color} 22%, white)`}
        d="M1024,512c0,162.24-75.46,306.86-193.21,400.66-87.46,69.7-198.26,111.34-318.79,111.34s-231.33-41.64-318.79-111.34C75.46,818.86,0,674.24,0,512,0,229.23,229.23,0,512,0s512,229.23,512,512Z"
      />
      <circle fill={color} cx="512" cy="397.59" r="215.22" />
      <path
        fill={color}
        d="M830.79,912.66c-87.46,69.7-198.26,111.34-318.79,111.34s-231.33-41.64-318.79-111.34c41.4-136.81,168.46-236.41,318.79-236.41s277.39,99.6,318.79,236.41Z"
      />
    </svg>
  );
}
