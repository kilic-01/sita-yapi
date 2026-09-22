let cache = null;

export function loadAddressData() {
  if (!cache) {
    cache = fetch("./data/il-ilce-mahalle.json").then((r) => r.json());
  }
  return cache;
}

export function composeAddress({ street, buildingName, apartmentNo, mahalle, ilce, il }) {
  const parts = [];
  if (street) parts.push(street);
  if (buildingName) parts.push(buildingName);
  if (apartmentNo) parts.push(`Daire ${apartmentNo}`);
  if (mahalle) parts.push(`${mahalle} Mahallesi`);
  const cityLine = [ilce, il].filter(Boolean).join("/");
  if (cityLine) parts.push(cityLine);
  return parts.join(", ");
}
