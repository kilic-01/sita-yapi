export const TECH_COLORS = [
  "#3eaca7",
  "#c0392b",
  "#8e44ad",
  "#2980b9",
  "#d35400",
  "#27ae60",
  "#f39c12",
  "#16a085",
  "#c2185b",
  "#5d4037",
];

export const UNASSIGNED_COLOR = "#7f8c8d";

export function colorForTechnician(technicianId, technicians) {
  const idx = technicians.findIndex((t) => t.id === technicianId);
  return idx === -1 ? UNASSIGNED_COLOR : TECH_COLORS[idx % TECH_COLORS.length];
}
