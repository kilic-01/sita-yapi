import { useState } from "react";
import FuelPage from "./FuelPage.jsx";

// Header/Sidebar'da her yeni özellik için ayrı bir sekme açmak yer
// kaplayıp ana navigasyonu kalabalıklaştırıyordu — sık kullanılmayan
// özellikler burada, bir dropdown ile seçilen tek bir sekme altında
// toplanıyor. Yeni bir tane eklemek için SECTIONS'a bir satır eklemek
// yeterli, Header.jsx/Sidebar.jsx/navTabs.jsx'e hiç dokunmadan.
const SECTIONS = [{ id: "fuel", label: "Yakıt Takibi", render: (props) => <FuelPage {...props} /> }];

export default function OtherPage(props) {
  const [sectionId, setSectionId] = useState(SECTIONS[0].id);
  const section = SECTIONS.find((s) => s.id === sectionId) || SECTIONS[0];

  return (
    <div>
      <div className="card">
        <label style={{ maxWidth: 260, marginBottom: 0 }}>
          Özellik
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {section.render(props)}
    </div>
  );
}
