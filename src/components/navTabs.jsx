// Header.jsx (üst dock) ve Sidebar.jsx (sol kenar çubuğu) — kullanıcı ikisi
// arasında seçim yapabiliyor (bkz. Ayarlar > Görünüm) — aynı sekme listesini
// paylaşır, tek kaynaktan gelsin diye buraya çıkarıldı.
import {
  ShoppingCart,
  ShoppingCartPlus,
  Home,
  Package,
  CalendarDays,
  Route,
  History,
  Video,
  ListChecks,
  MoreHorizontal,
} from "lucide-react";
import { TurkishLiraFileIcon } from "./icons.jsx";
import { MapPinIcon, SettingsIcon } from "./icons.jsx";

export const TABS = [
  { id: "home", label: "Anasayfa", icon: <Home size={18} strokeWidth={1.75} /> },
  { id: "appointments", label: "Randevular", icon: <CalendarDays size={18} strokeWidth={1.75} /> },
  { id: "routes", label: "Rota Oluştur", icon: <Route size={18} strokeWidth={1.75} /> },
  { id: "map", label: "Harita", icon: <MapPinIcon size={18} /> },
  { id: "orders", label: "Sipariş", icon: <ShoppingCart size={18} strokeWidth={1.75} /> },
  { id: "incomingOrders", label: "Firmalardan Gelen Siparişler", icon: <ShoppingCartPlus size={18} strokeWidth={1.75} /> },
  { id: "stock", label: "Stok", icon: <Package size={18} strokeWidth={1.75} /> },
  { id: "partCheckouts", label: "Parça Zimmeti", icon: <ListChecks size={18} strokeWidth={1.75} /> },
  { id: "quotes", label: "Fiyat Teklifi", icon: <TurkishLiraFileIcon size={18} strokeWidth={1.75} /> },
  { id: "cameras", label: "Kameralar", icon: <Video size={18} strokeWidth={1.75} /> },
  { id: "history", label: "Geçmiş", icon: <History size={18} strokeWidth={1.75} /> },
  { id: "other", label: "Diğer", icon: <MoreHorizontal size={18} strokeWidth={1.75} /> },
  { id: "settings", label: "Ayarlar", icon: <SettingsIcon size={18} />, adminOnly: true },
];

// Sidebar'daki gruplama (bölücü çizgilerle) — sadece görsel bir gruplama,
// TABS'ın kendisini değiştirmiyor. Fieldwise (dribbble) referansındaki
// "ilgili sekmeleri bölücülerle kümeleme" fikrinden uyarlandı.
export const TAB_GROUPS = [
  ["home"],
  ["appointments", "routes", "map"],
  ["orders", "incomingOrders", "stock", "partCheckouts", "quotes"],
  ["cameras", "history"],
  ["other"],
  ["settings"],
];
