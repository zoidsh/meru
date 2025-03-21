import { type Account, accountSchema } from "@/lib/config/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAccounts } from "../lib/hooks";
import { ipcMain } from "../lib/ipc";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";

function EditAccountForm({
	account = { label: "" },
	placeholder = "Work",
	onSubmit,
	onDelete,
}: {
	account?: Pick<Account, "label">;
	placeholder?: string;
	onSubmit: (values: Pick<Account, "label">) => void;
	onDelete?: () => void;
}) {
	const form = useForm<Pick<Account, "label">>({
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
				<div className="flex items-center">
					<div className="flex-1">
						{onDelete && (
							<Button
								type="button"
								variant="destructive"
								onClick={() => {
									onDelete();
								}}
							>
								Remove
							</Button>
						)}
					</div>
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

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button size="sm">Add</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add account</DialogTitle>
				</DialogHeader>
				<EditAccountForm
					onSubmit={(account) => {
						ipcMain.send("addAccount", account);

						setIsOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

function EditAccountButton({ account }: { account: Account }) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button size="icon" variant="ghost">
					<PencilIcon />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit account</DialogTitle>
				</DialogHeader>
				<EditAccountForm
					account={account}
					onSubmit={(values) => {
						ipcMain.send("updateAccount", { ...account, ...values });

						setIsOpen(false);
					}}
					onDelete={() => {
						const confirmed = window.confirm(
							`Are you sure you want to remove ${account.label}?`,
						);

						if (confirmed) {
							ipcMain.send("removeAccount", account.id);
						}
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

export function Accounts() {
	const accounts = useAccounts();

	if (!accounts.data) {
		return;
	}

	return (
		<div className="py-5 px-6 bg-background border rounded-lg">
			<div className="flex justify-between items-center mb-6">
				<div className="text-2xl font-bold tracking-tight">Accounts</div>
				<AddAccountButton />
			</div>
			<div className="space-y-4">
				{accounts.data.map((account, index) => (
					<div className="flex justify-between items-center" key={account.id}>
						<div className="flex items-center gap-3">
							<div className="size-8 border rounded-full flex items-center justify-center text-sm font-light">
								{account.label[0].toUpperCase()}
							</div>
							<div>{account.label}</div>
						</div>
						<div className="flex items-center gap-2">
							{accounts.data.length > 1 && (
								<>
									<Button
										size="icon"
										className="size-8"
										variant="ghost"
										disabled={index + 1 === accounts.data.length}
										onClick={() => {
											ipcMain.send("moveAccount", account.id, "down");
										}}
									>
										<ArrowDownIcon />
									</Button>
									<Button
										size="icon"
										className="size-8"
										variant="ghost"
										disabled={index === 0}
										onClick={() => {
											ipcMain.send("moveAccount", account.id, "up");
										}}
									>
										<ArrowUpIcon />
									</Button>
								</>
							)}
							<EditAccountButton account={account} />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
