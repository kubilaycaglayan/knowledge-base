export const formatTrackedDuration = (seconds: number) => {
  const normalizedSeconds = Math.max(0, Math.floor(seconds));
  if (normalizedSeconds < 60)
    return `${normalizedSeconds}s`;

  const minutes = Math.floor(normalizedSeconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours >= 24) return `${hours}h`;
  if (!remainingMinutes) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
};
