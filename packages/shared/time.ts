export function timeToMinutes(time: string) {
  const colonIndex = time.indexOf(":");
  return Number(time.slice(0, colonIndex)) * 60 + Number(time.slice(colonIndex + 1));
}

export function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
