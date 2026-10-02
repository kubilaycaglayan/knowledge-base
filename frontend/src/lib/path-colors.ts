function luminance(color: string) {
  const channels = color.match(/[0-9a-f]{2}/gi);
  if (!channels || channels.length !== 3) return 0;
  const linear = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastingPathTextColor(background: string, preferred?: string | null) {
  if (preferred) return preferred;
  const backgroundLuminance = luminance(background);
  const contrastWithDark = (backgroundLuminance + 0.05) / 0.05;
  const contrastWithLight = 1.05 / (backgroundLuminance + 0.05);
  return contrastWithDark >= contrastWithLight ? "#000000" : "#FFFFFF";
}

export function pathTextContrastRatio(background: string, foreground: string) {
  const values = [luminance(background), luminance(foreground)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
