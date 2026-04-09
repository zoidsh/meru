import dayjsPrimitive from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import calendar from "dayjs/plugin/calendar";
import isToday from "dayjs/plugin/isToday";

dayjsPrimitive.extend(localizedFormat);
dayjsPrimitive.extend(relativeTime);
dayjsPrimitive.extend(calendar);
dayjsPrimitive.extend(isToday);

export const dayjs = dayjsPrimitive;

export function createDateTimeFormatter(options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(navigator.language, options);
}
