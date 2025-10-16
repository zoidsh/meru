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

export const gmailSavedSearchSchema = z.object({
	id: z.string(),
	label: z.string().min(1),
	query: z.string().min(1),
});

export const gmailSavedSearchInputSchema = gmailSavedSearchSchema.omit({
	id: true,
});

export type GmailSavedSearchInput = z.infer<typeof gmailSavedSearchInputSchema>;

export type GmailSavedSearch = z.infer<typeof gmailSavedSearchSchema>;

export type GmailSavedSearches = GmailSavedSearch[];
