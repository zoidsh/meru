import type { AccountConfig } from "@/lib/config";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ipcMain } from "../lib/ipc";
import { licenseKeySearchParam } from "../lib/search-params";
import { useAccountsStore } from "../lib/stores";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export const accountSchema = z.object({
	id: z.string(),
	label: z.string(),
	selected: z.boolean(),
});

function AccountForm({
	account = { label: "" },
	placeholder = "Work",
	onSubmit,
}: {
	account?: Pick<AccountConfig, "label">;
	placeholder?: string;
	onSubmit: (values: Pick<AccountConfig, "label">) => void;
}) {
	const form = useForm<Pick<AccountConfig, "label">>({
		resolver: zodResolver(accountSchema.pick({ label: true })),
		defaultValues: {
			label: account.label,
		},
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
	const [isOpen, setIsOpen] = useState(false);

	if (
		Boolean(licenseKeySearchParam && JSON.parse(licenseKeySearchParam)) ===
		false
	) {
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
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
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

						setIsOpen(false);
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
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{accounts.map((account, index) => (
						<TableRow key={account.config.id}>
							<TableCell className="w-full">{account.config.label}</TableCell>
							<TableCell className="flex">
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
