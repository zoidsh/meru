import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { accountColors } from "./schemas";

// lingui-set comment="A color an account can be marked with, in the account form's Color picker"
export const accountColorsMap: Record<
  (typeof accountColors)[number],
  {
    label: MessageDescriptor;
    className: `bg-${(typeof accountColors)[number]}-500`;
  }
> = {
  orange: {
    label: msg`Orange`,
    className: "bg-orange-500",
  },
  amber: {
    label: msg`Amber`,
    className: "bg-amber-500",
  },
  yellow: {
    label: msg`Yellow`,
    className: "bg-yellow-500",
  },
  lime: {
    label: msg`Lime`,
    className: "bg-lime-500",
  },
  green: {
    label: msg`Green`,
    className: "bg-green-500",
  },
  emerald: {
    label: msg`Emerald`,
    className: "bg-emerald-500",
  },
  teal: {
    label: msg`Teal`,
    className: "bg-teal-500",
  },
  cyan: {
    label: msg`Cyan`,
    className: "bg-cyan-500",
  },
  sky: {
    label: msg`Sky`,
    className: "bg-sky-500",
  },
  blue: {
    label: msg`Blue`,
    className: "bg-blue-500",
  },
  indigo: {
    label: msg`Indigo`,
    className: "bg-indigo-500",
  },
  violet: {
    label: msg`Violet`,
    className: "bg-violet-500",
  },
  purple: {
    label: msg`Purple`,
    className: "bg-purple-500",
  },
  fuchsia: {
    label: msg`Fuchsia`,
    className: "bg-fuchsia-500",
  },
  pink: {
    label: msg`Pink`,
    className: "bg-pink-500",
  },
};
// lingui-reset
