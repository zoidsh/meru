import dayjsPrimitive from "dayjs";
import calendar from "dayjs/plugin/calendar";
import isToday from "dayjs/plugin/isToday";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";

dayjsPrimitive.extend(localizedFormat);
dayjsPrimitive.extend(relativeTime);
dayjsPrimitive.extend(calendar);
dayjsPrimitive.extend(isToday);

export const dayjs = dayjsPrimitive;

export function createDateTimeFormatter(options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(navigator.language, options);
}
