import { Car } from "lucide-react";
import CollapsibleCard from "./CollapsibleCard.jsx";
import FuelPage from "./FuelPage.jsx";
import VehiclesPage from "./VehiclesPage.jsx";

// Header/Sidebar'da her yeni özellik için ayrı bir sekme açmak yer
// kaplayıp ana navigasyonu kalabalıklaştırıyordu — sık kullanılmayan
// özellikler burada, Ayarlar sekmesindekiyle AYNI açılır/kapanır kart
// deseniyle (bkz. CollapsibleCard.jsx) toplanıyor. FuelPage kendi
// CollapsibleCard'ını ZATEN kendi içinde sarıyor (bkz. FuelPage.jsx) — burada
// AYRICA sarmalarsak başlık iki kere görünür, bu yüzden doğrudan render
// ediliyor. VehiclesPage kendi kartını sarmıyor, o yüzden burada sarılıyor.
export default function OtherPage(props) {
  return (
    <div>
      <FuelPage {...props} />
      <CollapsibleCard title="Araçlar" icon={<Car size={18} strokeWidth={1.75} />}>
        <VehiclesPage {...props} />
      </CollapsibleCard>
    </div>
  );
}
