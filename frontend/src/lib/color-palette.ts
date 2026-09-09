export const colorPalette = [
  { name: "Off White", hex: "#F8FAFC" },
  { name: "Mid Gray", hex: "#64748B" },
  { name: "Near Black", hex: "#0F172A" },
  { name: "Yellow", hex: "#EAB308" },
  { name: "Amber", hex: "#F59E0B" },
  { name: "Orange", hex: "#F97316" },
  { name: "Red", hex: "#EF4444" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Purple", hex: "#A855F7" },
  { name: "Indigo", hex: "#6366F1" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Cyan", hex: "#06B6D4" },
  { name: "Teal", hex: "#14B8A6" },
  { name: "Green", hex: "#22C55E" },
  { name: "Lime", hex: "#84CC16" },
] as const;

export const paletteColors = colorPalette.map((color) => color.hex);
