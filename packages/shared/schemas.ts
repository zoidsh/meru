import { z } from "zod";
import type { GmailState } from "./gmail";

export const accountColors = [
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
] as const;

export const accountConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.enum(accountColors).nullable(),
  selected: z.boolean(),
  notifications: z.boolean(),
  gmail: z.object({
    unreadBadge: z.boolean(),
    delegatedAccountId: z.string().nullable(),
  }),
});

export type AccountConfig = z.infer<typeof accountConfigSchema>;

export type AccountConfigs = AccountConfig[];

export const accountConfigInputSchema = accountConfigSchema
  .pick({
    label: true,
    color: true,
    notifications: true,
  })
  .extend({
    gmail: accountConfigSchema.shape.gmail.pick({ unreadBadge: true }),
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
