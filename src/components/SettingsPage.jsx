import {
  Users,
  Car,
  UserCog,
  CalendarDays,
  Store,
  Warehouse,
  FileSpreadsheet,
  KeyRound,
  Shield,
  Video,
  History,
  PanelLeft,
  PanelTop,
} from "lucide-react";
import CollapsibleCard from "./CollapsibleCard.jsx";
import VehiclesSection from "./VehiclesSection.jsx";
import EmployeesSection from "./EmployeesSection.jsx";
import HolidaysSection from "./HolidaysSection.jsx";
import UsersSection from "./UsersSection.jsx";
import SuppliersSection from "./SuppliersSection.jsx";
import DepotsSection from "./DepotsSection.jsx";
import StockCsvSection from "./StockCsvSection.jsx";
import ApiKeysSection from "./ApiKeysSection.jsx";
import SecuritySettingsSection from "./SecuritySettingsSection.jsx";
import CameraSettingsSection from "./CameraSettingsSection.jsx";
import ActivityLogSection from "./ActivityLogSection.jsx";
import MyProfileSection from "./MyProfileSection.jsx";
import { UserCircle } from "lucide-react";

// "Ayarlar" artık herkese açık (bkz. navTabs.jsx) ama içindeki bölümler ayni
// ciddiyette değil: Kullanıcılar/Çalışanlar/Tatiller/Tedarikçiler/API
// Anahtarları/Güvenlik/Aktivite Kaydı HER ZAMAN sadece admin'e özel — bu 7
// bölümün arkasındaki backend işlemleri de gerçek admin kontrolü yapıyor
// (bkz. electron/db.js requireAdmin), sadece burada gizlenmiyorlar. Araçlar/
// Depolar/Stok CSV ise admin'in her personel için ayrı ayrı açıp
// kapatabildiği (settingsSections) bölümler — bunların backend'i kontrol
// etmiyor, uygulamanın geri kalanıyla aynı (düşük) risk seviyesinde. Anahtar
// isimleri ("vehicles"/"depots"/"stockCsv") UsersSection.jsx'teki
// GRANTABLE_SECTIONS checkbox listesindeki `key`lerle birebir eşleşmeli.

function canSeeSection(currentUser, key) {
  if (currentUser?.role === "admin") return true;
  return currentUser?.settingsSections?.includes(key) || false;
}

export default function SettingsPage({
  appointments,
  technicians,
  officeStaff,
  holidays,
  vehicles,
  users,
  suppliers,
  depots,
  stockItems,
  settings,
  cameras,
  activityLog,
  currentUser,
  onTechniciansSaved,
  onOfficeStaffSaved,
  onHolidaysSaved,
  onVehiclesSaved,
  onUsersSaved,
  onCurrentUserUpdated,
  onSuppliersSaved,
  onDepotsSaved,
  onStockSaved,
  onSettingsSaved,
  onCamerasSaved,
  onNotify,
  onTestScreensaver,
  navStyle = "top",
  onNavStyleChange,
}) {
  return (
    <div>
      <CollapsibleCard title="Görünüm" icon={<PanelLeft size={18} strokeWidth={1.75} />} defaultOpen>
        <p style={{ marginTop: 0 }}>
          <small style={{ opacity: 0.7 }}>
            Bu tercih sadece bu cihazda geçerli — ekibin diğer üyelerini etkilemez.
          </small>
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={navStyle === "top" ? "primary" : "secondary"}
            onClick={() => onNavStyleChange?.("top")}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <PanelTop size={16} strokeWidth={1.75} />
            Üst Menü
          </button>
          <button
            type="button"
            className={navStyle === "side" ? "primary" : "secondary"}
            onClick={() => onNavStyleChange?.("side")}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <PanelLeft size={16} strokeWidth={1.75} />
            Kenar Çubuğu
          </button>
        </div>
      </CollapsibleCard>
      <CollapsibleCard title="Profilim" icon={<UserCircle size={18} strokeWidth={1.75} />}>
        <MyProfileSection
          currentUser={currentUser}
          users={users}
          onSaved={onUsersSaved}
          onCurrentUserUpdated={onCurrentUserUpdated}
          onNotify={onNotify}
        />
      </CollapsibleCard>
      {currentUser?.role === "admin" && (
        <CollapsibleCard title="Kullanıcılar" icon={<Users size={18} strokeWidth={1.75} />}>
          <UsersSection users={users} currentUser={currentUser} onSaved={onUsersSaved} onNotify={onNotify} />
        </CollapsibleCard>
      )}
      {canSeeSection(currentUser, "vehicles") && (
        <CollapsibleCard title="Araçlar" icon={<Car size={18} strokeWidth={1.75} />}>
          <VehiclesSection vehicles={vehicles} currentUser={currentUser} onSaved={onVehiclesSaved} onNotify={onNotify} />
        </CollapsibleCard>
      )}
      {currentUser?.role === "admin" && (
        <CollapsibleCard title="Çalışanlar" icon={<UserCog size={18} strokeWidth={1.75} />}>
          <EmployeesSection
            appointments={appointments}
            technicians={technicians}
            officeStaff={officeStaff}
            holidays={holidays}
            vehicles={vehicles}
            currentUser={currentUser}
            onTechniciansSaved={onTechniciansSaved}
            onOfficeStaffSaved={onOfficeStaffSaved}
            onNotify={onNotify}
          />
        </CollapsibleCard>
      )}
      {currentUser?.role === "admin" && (
        <CollapsibleCard title="Resmi ve Dini Tatiller" icon={<CalendarDays size={18} strokeWidth={1.75} />}>
          <HolidaysSection holidays={holidays} currentUser={currentUser} onSaved={onHolidaysSaved} onNotify={onNotify} />
        </CollapsibleCard>
      )}
      {currentUser?.role === "admin" && (
        <CollapsibleCard title="Tedarikçiler" icon={<Store size={18} strokeWidth={1.75} />}>
          <SuppliersSection suppliers={suppliers} currentUser={currentUser} onSaved={onSuppliersSaved} onNotify={onNotify} />
        </CollapsibleCard>
      )}
      {canSeeSection(currentUser, "depots") && (
        <CollapsibleCard title="Depolar" icon={<Warehouse size={18} strokeWidth={1.75} />}>
          <DepotsSection depots={depots} currentUser={currentUser} onSaved={onDepotsSaved} onNotify={onNotify} />
        </CollapsibleCard>
      )}
      {canSeeSection(currentUser, "stockCsv") && (
        <CollapsibleCard title="Stok CSV İçe/Dışa Aktar" icon={<FileSpreadsheet size={18} strokeWidth={1.75} />}>
          <StockCsvSection
            stockItems={stockItems}
            onStockSaved={onStockSaved}
            depots={depots}
            onDepotsSaved={onDepotsSaved}
            currentUser={currentUser}
          />
        </CollapsibleCard>
      )}
      {currentUser?.role === "admin" && settings && (
        <CollapsibleCard title="API Anahtarları" icon={<KeyRound size={18} strokeWidth={1.75} />}>
          <ApiKeysSection settings={settings} onSaved={onSettingsSaved} currentUser={currentUser} />
        </CollapsibleCard>
      )}
      {currentUser?.role === "admin" && settings && (
        <CollapsibleCard title="Güvenlik" icon={<Shield size={18} strokeWidth={1.75} />}>
          <SecuritySettingsSection
            settings={settings}
            onSaved={onSettingsSaved}
            currentUser={currentUser}
            onTestScreensaver={onTestScreensaver}
            onNotify={onNotify}
          />
        </CollapsibleCard>
      )}
      {!currentUser?.hiddenTabs?.includes("cameras") && (
        <CollapsibleCard title="Kameralar" icon={<Video size={18} strokeWidth={1.75} />}>
          <CameraSettingsSection cameras={cameras} onSaved={onCamerasSaved} currentUser={currentUser} />
        </CollapsibleCard>
      )}
      {currentUser?.role === "admin" && (
        <CollapsibleCard title="Aktivite Kaydı" icon={<History size={18} strokeWidth={1.75} />}>
          <ActivityLogSection activityLog={activityLog} users={users} />
        </CollapsibleCard>
      )}
    </div>
  );
}
