import type { accountColors } from "./schemas";

export const accountColorsMap: Record<
  (typeof accountColors)[number],
  {
    label: string;
    className: `bg-${(typeof accountColors)[number]}-500`;
  }
> = {
  orange: {
    label: "Orange",
    className: "bg-orange-500",
  },
  amber: {
    label: "Amber",
    className: "bg-amber-500",
  },
  yellow: {
    label: "Yellow",
    className: "bg-yellow-500",
  },
  lime: {
    label: "Lime",
    className: "bg-lime-500",
  },
  green: {
    label: "Green",
    className: "bg-green-500",
  },
  emerald: {
    label: "Emerald",
    className: "bg-emerald-500",
  },
  teal: {
    label: "Teal",
    className: "bg-teal-500",
  },
  cyan: {
    label: "Cyan",
    className: "bg-cyan-500",
  },
  sky: {
    label: "Sky",
    className: "bg-sky-500",
  },
  blue: {
    label: "Blue",
    className: "bg-blue-500",
  },
  indigo: {
    label: "Indigo",
    className: "bg-indigo-500",
  },
  violet: {
    label: "Violet",
    className: "bg-violet-500",
  },
  purple: {
    label: "Purple",
    className: "bg-purple-500",
  },
  fuchsia: {
    label: "Fuchsia",
    className: "bg-fuchsia-500",
  },
  pink: {
    label: "Pink",
    className: "bg-pink-500",
  },
};
