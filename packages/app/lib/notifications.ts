import type { NotificationTime } from "@meru/shared/types";

function timeToMinutes(time: string) {
  const colonIndex = time.indexOf(":");
  return Number(time.slice(0, colonIndex)) * 60 + Number(time.slice(colonIndex + 1));
}

export function checkWithinNotificationTimes(times: NotificationTime[], now: Date) {
  if (!times.length) {
    return true;
  }

  const current = now.getHours() * 60 + now.getMinutes();

  return times.some(({ start, end, days }) => {
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);

    const withinTime =
      endMinutes > startMinutes
        ? current >= startMinutes && current < endMinutes
        : current >= startMinutes || current < endMinutes;

    if (!withinTime) {
      return false;
    }

    if (!days || days.length === 0) {
      return true;
    }

    return days.includes(now.getDay());
  });
}
