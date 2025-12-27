import { zodResolver } from "@hookform/resolvers/zod";
import { ipc } from "@meru/renderer-lib/ipc";
import type { AccountConfig } from "@meru/shared/schemas";
import {
	type AccountConfigInput,
	accountConfigInputSchema,
} from "@meru/shared/schemas";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@meru/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@meru/ui/components/dropdown";
import { EmojiPickerButton } from "@meru/ui/components/emoji-picker-button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@meru/ui/components/form";
import { Input } from "@meru/ui/components/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemTitle,
} from "@meru/ui/components/item";
import { Label } from "@meru/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@meru/ui/components/select";
import { Switch } from "@meru/ui/components/switch";
import { cn } from "@meru/ui/lib/utils";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { Entries } from "type-fest";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import {
	SettingsContent,
	SettingsHeader,
	SettingsTitle,
} from "@/components/settings";
import { accountColorsMap } from "@/lib/account";
import { useConfig } from "@/lib/react-query";
import { useAccountsStore, useTrialStore } from "@/lib/stores";
import { restartRequiredToast } from "@/lib/toast";

function AccountForm({
	account = { label: "", color: null, unreadBadge: true, notifications: true },
	placeholder = "Work",
	onSubmit,
	type,
}: {
	account?: AccountConfigInput;
	placeholder?: string;
	onSubmit: (values: AccountConfigInput) => void;
	type: "add" | "edit";
}) {
	const form = useForm<AccountConfigInput>({
		resolver: zodResolver(accountConfigInputSchema),
		defaultValues: account,
	});

	return (
		<Form {...form}>
			<form
				className="space-y-4"
				onSubmit={form.handleSubmit((values) => {
					onSubmit(values);
				})}
			>
				<FormField
					control={form.control}
					name="color"
					render={({ field: { onChange, value, ...field } }) => (
						<FormItem>
							<FormLabel>Color</FormLabel>
							<div className="flex gap-2">
								<FormControl>
									<Select
										onValueChange={onChange}
										value={value || ""}
										{...field}
									>
										<SelectTrigger>
											<SelectValue placeholder="Optional" />
										</SelectTrigger>
										<SelectContent>
											{(
												Object.entries(accountColorsMap) as Entries<
													typeof accountColorsMap
												>
											).map(([colorKey, { label, value }]) => (
												<SelectItem
													key={colorKey}
													value={colorKey}
													className="flex items-center gap-2"
												>
													<div className={`size-2 rounded-full ${value}`} />
													{label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</FormControl>
								{form.getValues().color && (
									<Button
										size="icon"
										variant="outline"
										onClick={(event) => {
											event.preventDefault();

											form.setValue("color", null);
										}}
									>
										<XIcon />
									</Button>
								)}
							</div>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="label"
					render={({ field }) => (
						<FormItem className="flex-1">
							<FormLabel>Label</FormLabel>
							<div className="flex gap-2">
								<FormControl>
									<Input placeholder={placeholder} {...field} />
								</FormControl>
								<EmojiPickerButton
									onEmojiSelect={({ emoji }) => {
										form.setValue("label", `${form.getValues().label}${emoji}`);
									}}
									modal
								/>
							</div>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Label>Options</Label>
				<FormField
					control={form.control}
					name="unreadBadge"
					render={({ field }) => (
						<FormItem className="flex">
							<FormControl>
								<Switch
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
							<FormLabel>Unread Badge</FormLabel>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="notifications"
					render={({ field }) => (
						<FormItem className="flex">
							<FormControl>
								<Switch
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
							<FormLabel>Notifications</FormLabel>
							<FormMessage />
						</FormItem>
					)}
				/>
				<div className="flex justify-end items-center">
					<Button type="submit" className="self-end">
						{type === "add" ? "Add" : "Save"}
					</Button>
				</div>
			</form>
		</Form>
	);
}

function AddAccountButton() {
	const isDialogOpen = useAccountsStore(
		(state) => state.isAddAccountDialogOpen,
	);

	const setIsDialogOpen = useAccountsStore(
		(state) => state.setIsAddAccountDialogOpen,
	);

	const isTrialActive = useTrialStore((state) => Boolean(state.daysLeft));

	const { config } = useConfig();

	if (!config) {
		return;
	}

	if (!isTrialActive && !config.licenseKey) {
		return <Button disabled>Add</Button>;
	}

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button>Add</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Account</DialogTitle>
				</DialogHeader>
				<AccountForm
					onSubmit={(account) => {
						ipc.main.send("accounts.addAccount", account);

						setIsDialogOpen(false);
					}}
					type="add"
				/>
			</DialogContent>
		</Dialog>
	);
}

function AccountMenuButton({
	account,
	removable,
}: {
	account: AccountConfig;
	removable: boolean;
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="icon" className="size-8 p-0" variant="outline">
						<EllipsisIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DialogTrigger asChild>
						<DropdownMenuItem>Edit</DropdownMenuItem>
					</DialogTrigger>
					{removable && (
						<DropdownMenuItem
							className="text-destructive-foreground focus:bg-destructive/90 focus:text-destructive-foreground"
							onClick={() => {
								const confirmed = window.confirm(
									`Are you sure you want to remove ${account.label}?`,
								);

								if (confirmed) {
									ipc.main.send("accounts.removeAccount", account.id);
								}
							}}
						>
							Remove
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Account</DialogTitle>
				</DialogHeader>
				<AccountForm
					account={account}
					onSubmit={(values) => {
						ipc.main.send("accounts.updateAccount", { ...account, ...values });

						setIsOpen(false);

						if (
							account.unreadBadge !== values.unreadBadge ||
							account.notifications !== values.notifications
						) {
							restartRequiredToast();
						}
					}}
					type="edit"
				/>
			</DialogContent>
		</Dialog>
	);
}

export function AccountsSettings() {
	const accounts = useAccountsStore((state) => state.accounts);

	if (!accounts.length) {
		return;
	}

	return (
		<>
			<SettingsHeader>
				<SettingsTitle>Accounts</SettingsTitle>
				<AddAccountButton />
			</SettingsHeader>
			<SettingsContent>
				<LicenseKeyRequiredBanner>
					Upgrade to Meru Pro to add more accounts
				</LicenseKeyRequiredBanner>
				<div className="space-y-4">
					{accounts.map((account, index) => (
						<Item key={account.config.id} variant="muted">
							<ItemContent className="gap-2">
								<ItemTitle>
									<div
										className={cn(
											"size-2 rounded-full",
											account.config.color
												? `${accountColorsMap[account.config.color].value}`
												: "border",
										)}
									/>
									{account.config.label}
								</ItemTitle>
								{(account.config.unreadBadge ||
									account.config.notifications) && (
									<div className="flex gap-2">
										{account.config.unreadBadge && (
											<Badge variant="outline">Unread Badge</Badge>
										)}
										{account.config.notifications && (
											<Badge variant="outline">Notifications</Badge>
										)}
									</div>
								)}
							</ItemContent>
							<ItemActions>
								{accounts.length > 1 && (
									<>
										<Button
											size="icon"
											className="size-8 p-0"
											variant="outline"
											disabled={index === 0}
											onClick={() => {
												ipc.main.send(
													"accounts.moveAccount",
													account.config.id,
													"up",
												);
											}}
										>
											<ArrowUpIcon />
										</Button>
										<Button
											size="icon"
											className="size-8 p-0"
											variant="outline"
											disabled={index + 1 === accounts.length}
											onClick={() => {
												ipc.main.send(
													"accounts.moveAccount",
													account.config.id,
													"down",
												);
											}}
										>
											<ArrowDownIcon />
										</Button>
									</>
								)}
								<AccountMenuButton
									account={account.config}
									removable={accounts.length > 1}
								/>
							</ItemActions>
						</Item>
					))}
				</div>
			</SettingsContent>
		</>
	);
}
