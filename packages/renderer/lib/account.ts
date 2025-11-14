import type { accountColors } from "@meru/shared/schemas";

export const accountColorsMap: Record<
	(typeof accountColors)[number],
	{ label: string; value: `bg-${(typeof accountColors)[number]}-500` }
> = {
	orange: { label: "Orange", value: "bg-orange-500" },
	amber: { label: "Amber", value: "bg-amber-500" },
	yellow: { label: "Yellow", value: "bg-yellow-500" },
	lime: { label: "Lime", value: "bg-lime-500" },
	green: { label: "Green", value: "bg-green-500" },
	emerald: { label: "Emerald", value: "bg-emerald-500" },
	teal: { label: "Teal", value: "bg-teal-500" },
	cyan: { label: "Cyan", value: "bg-cyan-500" },
	sky: { label: "Sky", value: "bg-sky-500" },
	blue: { label: "Blue", value: "bg-blue-500" },
	indigo: { label: "Indigo", value: "bg-indigo-500" },
	violet: { label: "Violet", value: "bg-violet-500" },
	purple: { label: "Purple", value: "bg-purple-500" },
	fuchsia: { label: "Fuchsia", value: "bg-fuchsia-500" },
	pink: { label: "Pink", value: "bg-pink-500" },
};
