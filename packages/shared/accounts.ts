import type { accountColors } from "./schemas";

export const accountColorsMap: Record<
	(typeof accountColors)[number],
	{
		label: string;
		className: `bg-${(typeof accountColors)[number]}-500`;
		value: string;
	}
> = {
	orange: {
		label: "Orange",
		className: "bg-orange-500",
		value: "oklch(70.5% 0.213 47.604)",
	},
	amber: {
		label: "Amber",
		className: "bg-amber-500",
		value: "oklch(76.9% 0.188 70.08)",
	},
	yellow: {
		label: "Yellow",
		className: "bg-yellow-500",
		value: "oklch(79.5% 0.184 86.047)",
	},
	lime: {
		label: "Lime",
		className: "bg-lime-500",
		value: "oklch(76.8% 0.233 130.85)",
	},
	green: {
		label: "Green",
		className: "bg-green-500",
		value: "oklch(72.3% 0.219 149.579)",
	},
	emerald: {
		label: "Emerald",
		className: "bg-emerald-500",
		value: "oklch(69.6% 0.17 162.48)",
	},
	teal: {
		label: "Teal",
		className: "bg-teal-500",
		value: "oklch(70.4% 0.14 182.503)",
	},
	cyan: {
		label: "Cyan",
		className: "bg-cyan-500",
		value: "oklch(71.5% 0.143 215.221)",
	},
	sky: {
		label: "Sky",
		className: "bg-sky-500",
		value: "oklch(68.5% 0.169 237.323)",
	},
	blue: {
		label: "Blue",
		className: "bg-blue-500",
		value: "oklch(62.3% 0.214 259.815)",
	},
	indigo: {
		label: "Indigo",
		className: "bg-indigo-500",
		value: "oklch(58.5% 0.233 277.117)",
	},
	violet: {
		label: "Violet",
		className: "bg-violet-500",
		value: "oklch(60.6% 0.25 292.717)",
	},
	purple: {
		label: "Purple",
		className: "bg-purple-500",
		value: "oklch(62.7% 0.265 303.9)",
	},
	fuchsia: {
		label: "Fuchsia",
		className: "bg-fuchsia-500",
		value: "oklch(66.7% 0.295 322.15)",
	},
	pink: {
		label: "Pink",
		className: "bg-pink-500",
		value: "oklch(65.6% 0.241 354.308)",
	},
};

export type AccountState = {
	gmail: {
		unreadCount: number;
		outOfOffice: boolean;
		navigationHistory: {
			canGoBack: boolean;
			canGoForward: boolean;
		};
		attentionRequired: boolean;
	};
};
