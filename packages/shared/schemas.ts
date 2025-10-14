import { z } from "zod";
import type { GmailState } from "./gmail";

export const accountConfigSchema = z.object({
	id: z.string(),
	label: z.string(),
	selected: z.boolean(),
	unreadBadge: z.boolean(),
	notifications: z.boolean(),
	gmail: z.object({
		delegatedAccountId: z.string().nullable(),
	}),
});

export type AccountConfig = z.infer<typeof accountConfigSchema>;

export type AccountConfigs = AccountConfig[];

export const accountConfigInputSchema = accountConfigSchema.pick({
	label: true,
	unreadBadge: true,
	notifications: true,
});

export type AccountConfigInput = z.infer<typeof accountConfigInputSchema>;

export type AccountInstance = {
	config: AccountConfig;
	gmail: GmailState;
};

export type AccountInstances = AccountInstance[];
