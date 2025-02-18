import { z } from "zod";

export const accountSchema = z.object({
	id: z.string(),
	label: z.string(),
	selected: z.boolean(),
});

export type Account = z.infer<typeof accountSchema>;

export type Accounts = Account[];

export type Config = {
	accounts: Accounts;
};
