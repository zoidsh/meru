import { useAccountsStore, useTrialStore } from "@/lib/stores";
import { zodResolver } from "@hookform/resolvers/zod";
import { ipcMain } from "@meru/renderer-lib/ipc";
import { licenseKeySearchParam } from "@meru/renderer-lib/search-params";
import type { AccountConfig } from "@meru/shared/schemas";
import {
	type AccountConfigInput,
	accountConfigInputSchema,
} from "@meru/shared/schemas";
import { Button } from "@meru/ui/components/button";
import { Checkbox } from "@meru/ui/components/checkbox";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@meru/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@meru/ui/components/tooltip";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	CheckIcon,
	EllipsisIcon,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

function AccountForm({
	account = { label: "", unreadBadge: true, notifications: true },
	placeholder = "Work",
	onSubmit,
}: {
	account?: AccountConfigInput;
	placeholder?: string;
	onSubmit: (values: AccountConfigInput) => void;
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
					name="label"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Label</FormLabel>
							<FormControl>
								<Input placeholder={placeholder} {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="unreadBadge"
					render={({ field }) => (
						<FormItem className="flex">
							<FormControl>
								<Checkbox
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
							<FormLabel>Unread badge</FormLabel>
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
								<Checkbox
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
						Save
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

	if (!isTrialActive && !licenseKeySearchParam) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<div>
						<Button disabled>Add</Button>
					</div>
				</TooltipTrigger>
				<TooltipContent>
					Upgrade to Meru Pro to add more accounts
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button>Add</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add account</DialogTitle>
				</DialogHeader>
				<AccountForm
					onSubmit={(account) => {
						ipcMain.send("addAccount", account);

						setIsDialogOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

function AccountMenuButton({
	account,
	removable,
}: { account: AccountConfig; removable: boolean }) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="icon" className="size-8 p-0" variant="ghost">
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
									ipcMain.send("removeAccount", account.id);
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
					<DialogTitle>Edit account</DialogTitle>
				</DialogHeader>
				<AccountForm
					account={account}
					onSubmit={(values) => {
						ipcMain.send("updateAccount", { ...account, ...values });

						setIsOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

export function Accounts() {
	const accounts = useAccountsStore((state) => state.accounts);

	if (!accounts.length) {
		return;
	}

	return (
		<div>
			<div className="flex justify-between items-center mb-4">
				<div className="text-3xl font-bold tracking-tight">Accounts</div>
			</div>
			<Table className="mb-4">
				<TableHeader>
					<TableRow>
						<TableHead>Label</TableHead>
						<TableHead>Unread badge</TableHead>
						<TableHead>Notifications</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{accounts.map((account, index) => (
						<TableRow key={account.config.id}>
							<TableCell>{account.config.label}</TableCell>
							<TableCell>
								{account.config.unreadBadge && <CheckIcon className="size-4" />}
							</TableCell>
							<TableCell>
								{account.config.notifications && (
									<CheckIcon className="size-4" />
								)}
							</TableCell>
							<TableCell className="flex justify-end">
								{accounts.length > 1 && (
									<>
										<Button
											size="icon"
											className="size-8 p-0"
											variant="ghost"
											disabled={index + 1 === accounts.length}
											onClick={() => {
												ipcMain.send("moveAccount", account.config.id, "down");
											}}
										>
											<ArrowDownIcon />
										</Button>
										<Button
											size="icon"
											className="size-8 p-0"
											variant="ghost"
											disabled={index === 0}
											onClick={() => {
												ipcMain.send("moveAccount", account.config.id, "up");
											}}
										>
											<ArrowUpIcon />
										</Button>
									</>
								)}
								<AccountMenuButton
									account={account.config}
									removable={accounts.length > 1}
								/>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<div className="flex justify-end">
				<AddAccountButton />
			</div>
		</div>
	);
}
