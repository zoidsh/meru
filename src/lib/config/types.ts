import { z } from "zod";

export const accountSchema = z.object({
	id: z.string(),
	label: z.string(),
	selected: z.boolean(),
});

export type Account = z.infer<typeof accountSchema>;

export type Accounts = Account[];

type LastWindowState = {
	bounds: {
		width: number;
		height: number;
		x: number | undefined;
		y: number | undefined;
	};
	fullscreen: boolean;
	maximized: boolean;
};

export type Config = {
	accounts: Accounts;
	lastWindowState: LastWindowState;
	hardwareAccelerationEnabled: boolean;
};
