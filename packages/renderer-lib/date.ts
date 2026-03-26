import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import calendar from "dayjs/plugin/calendar";

dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);
dayjs.extend(calendar);

export const date = dayjs;
