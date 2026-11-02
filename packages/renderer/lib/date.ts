import { getDayjsLocale, type LocaleTag } from "@meru/shared/i18n";
import dayjsPrimitive from "dayjs";
// One side-effect import per shipped catalog, because dayjs registers a locale
// by loading its module and a bundle has nothing to fetch one from at runtime.
// English is dayjs's built-in locale, so this import only states the rule the
// rest follow.
import "dayjs/locale/de";
import "dayjs/locale/en";
import "dayjs/locale/es";
import "dayjs/locale/es-mx";
import "dayjs/locale/fr";
import "dayjs/locale/it";
import "dayjs/locale/ja";
import "dayjs/locale/nl";
import "dayjs/locale/pl";
import "dayjs/locale/pt-br";
import calendar from "dayjs/plugin/calendar";
import isToday from "dayjs/plugin/isToday";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";

dayjsPrimitive.extend(localizedFormat);
dayjsPrimitive.extend(relativeTime);
dayjsPrimitive.extend(calendar);
dayjsPrimitive.extend(isToday);

export const dayjs = dayjsPrimitive;

export function setDayjsLocale(tag: LocaleTag) {
  dayjsPrimitive.locale(getDayjsLocale(tag));
}

export function createDateTimeFormatter(options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(navigator.language, options);
}
