import { Pencil, Trash2, MapPin, Settings } from "lucide-react";

// SF Symbols'a yakın ince çizgi (regular ağırlık) görünüm için sabit boyut.
const DEFAULTS = { size: 16, strokeWidth: 1.75 };

export const PencilIcon = (props) => <Pencil {...DEFAULTS} {...props} />;
export const TrashIcon = (props) => <Trash2 {...DEFAULTS} {...props} />;
export const MapPinIcon = (props) => <MapPin {...DEFAULTS} {...props} />;
export const SettingsIcon = (props) => <Settings {...DEFAULTS} {...props} />;

// "Fiyat Teklifi" sekmesi için — lucide-react'te Türk Lirası simgeli bir
// dosya ikonu yok, kullanıcının verdiği özel SVG'den (aynı 24x24 çizim,
// lucide'ın stroke/currentColor kuralına uyarlanmış) React bileşeni.
export function TurkishLiraFileIcon({ size = 18, strokeWidth = 1.75, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12,22h6c1.1,0,2-.9,2-2v-12c0-.64-.25-1.25-.71-1.71l-3.59-3.59c-.45-.45-1.07-.71-1.71-.71H6c-1.1,0-2,.9-2,2v2.57" />
      <path d="M14,2v5c0,.55.45,1,1,1h5" />
      <path d="M7.21,11.68l-5.35,2.67" />
      <path d="M7.21,14.69l-5.35,2.67" />
      <path d="M8.81,17.19c0,2.66-2.16,4.81-4.81,4.81h0v-12" />
    </svg>
  );
}

// lucide-react'te marka ikonları yok (jenerik ikon seti) — WhatsApp'ın
// tanınabilir logosunu doğrudan SVG olarak çiziyoruz.
export function WhatsAppIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
      <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.32 4.95L2 22l5.2-1.34A9.96 9.96 0 0 0 12.04 22c5.52 0 10-4.48 10-10s-4.48-10-10-10zm0 18.2c-1.6 0-3.13-.44-4.46-1.24l-.32-.19-3.09.8.82-3-.21-.32A8.16 8.16 0 1 1 20.2 12c0 4.53-3.67 8.2-8.16 8.2z" />
      <path d="M16.6 13.9c-.25-.12-1.47-.72-1.7-.81-.23-.08-.4-.12-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.04-.38-1.99-1.22-.73-.66-1.23-1.47-1.37-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.23.25-.86.85-.86 2.06s.88 2.39 1 2.55c.13.17 1.75 2.66 4.24 3.73.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.28z" />
    </svg>
  );
}
