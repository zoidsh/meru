import { zodResolver } from "@hookform/resolvers/zod";
import {
	type GmailSavedSearch,
	type GmailSavedSearchInput,
	gmailSavedSearchInputSchema,
} from "@meru/shared/schemas";
import { arrayMove } from "@meru/shared/utils";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@meru/ui/components/table";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import {
	SettingsContent,
	SettingsHeader,
	SettingsTitle,
} from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";

export function SavedSearchForm({
	savedSearch = { label: "", query: "" },
	labelPlaceholder = "Friends",
	queryPlaceholder = "label:friends is:unread",
	type,
	onSubmit,
}: {
	savedSearch?: GmailSavedSearchInput;
	labelPlaceholder?: string;
	queryPlaceholder?: string;
	type: "add" | "edit";
	onSubmit: (savedSearch: GmailSavedSearchInput) => void;
}) {
	const form = useForm<GmailSavedSearchInput>({
		resolver: zodResolver(gmailSavedSearchInputSchema),
		defaultValues: savedSearch,
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
							<div className="flex gap-2">
								<FormControl>
									<Input placeholder={labelPlaceholder} {...field} />
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
				<FormField
					control={form.control}
					name="query"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Query</FormLabel>
							<FormControl>
								<Input placeholder={queryPlaceholder} {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<div className="flex justify-end">
					<Button type="submit">{type === "add" ? "Add" : "Save"}</Button>
				</div>
			</form>
		</Form>
	);
}

export function AddSavedSearchButton({
	onAdd,
}: {
	onAdd: (savedSearch: GmailSavedSearchInput) => void;
}) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const isLicenseKeyValid = useIsLicenseKeyValid();

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button
					onClick={() => {
						setIsDialogOpen(true);
					}}
					disabled={!isLicenseKeyValid}
				>
					Add
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Saved Search</DialogTitle>
				</DialogHeader>
				<SavedSearchForm
					type="add"
					onSubmit={(values) => {
						onAdd(values);

						setIsDialogOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

function SavedSearchMenuButton({
	savedSearch,
	onDelete,
	onEdit,
}: {
	savedSearch: GmailSavedSearch;
	onDelete: () => void;
	onEdit: (editedSavedSearch: GmailSavedSearch) => void;
}) {
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
					<DropdownMenuItem
						className="text-destructive-foreground focus:bg-destructive/90 focus:text-destructive-foreground"
						onClick={() => {
							const confirmed = window.confirm(
								`Are you sure you want to delete ${savedSearch.label}?`,
							);

							if (confirmed) {
								onDelete();
							}
						}}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Saved Search</DialogTitle>
				</DialogHeader>
				<SavedSearchForm
					savedSearch={savedSearch}
					onSubmit={(values) => {
						onEdit({
							...savedSearch,
							...values,
						});

						setIsOpen(false);
					}}
					type="edit"
				/>
			</DialogContent>
		</Dialog>
	);
}

export function SavedSearchesSettings() {
	const { config } = useConfig();

	const configMutation = useConfigMutation();

	if (!config) {
		return;
	}

	const moveSavedSearch = (savedSearchId: string, direction: "up" | "down") => {
		const savedSearchIndex = config["gmail.savedSearches"].findIndex(
			(savedSearch) => savedSearch.id === savedSearchId,
		);

		configMutation.mutate({
			"gmail.savedSearches": arrayMove(
				config["gmail.savedSearches"],
				savedSearchIndex,
				direction === "up" ? savedSearchIndex - 1 : savedSearchIndex + 1,
			),
		});
	};

	return (
		<>
			<SettingsHeader>
				<SettingsTitle>Saved Searches</SettingsTitle>
			</SettingsHeader>
			<SettingsContent>
				<LicenseKeyRequiredBanner>
					Upgrade to Meru Pro to add saved searches
				</LicenseKeyRequiredBanner>
				<Table className="mb-4">
					<TableHeader>
						<TableRow>
							<TableHead>Label</TableHead>
							<TableHead>Query</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{config["gmail.savedSearches"].map((savedSearch, index) => (
							<TableRow key={savedSearch.id}>
								<TableCell>{savedSearch.label}</TableCell>
								<TableCell>{savedSearch.query}</TableCell>
								<TableCell className="flex justify-end">
									{config["gmail.savedSearches"].length > 1 && (
										<>
											<Button
												size="icon"
												className="size-8 p-0"
												variant="ghost"
												disabled={
													index + 1 === config["gmail.savedSearches"].length
												}
												onClick={() => {
													moveSavedSearch(savedSearch.id, "down");
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
													moveSavedSearch(savedSearch.id, "up");
												}}
											>
												<ArrowUpIcon />
											</Button>
										</>
									)}
									<SavedSearchMenuButton
										savedSearch={savedSearch}
										onDelete={() => {
											const deleteSavedSearchId = savedSearch.id;

											configMutation.mutate({
												"gmail.savedSearches": config[
													"gmail.savedSearches"
												].filter(
													(savedSearch) =>
														savedSearch.id !== deleteSavedSearchId,
												),
											});
										}}
										onEdit={(editedSavedSearch) => {
											configMutation.mutate({
												"gmail.savedSearches": config[
													"gmail.savedSearches"
												].map((savedSearch) =>
													savedSearch.id === editedSavedSearch.id
														? editedSavedSearch
														: savedSearch,
												),
											});
										}}
									/>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<div className="flex justify-end">
					<AddSavedSearchButton
						onAdd={(savedSearch) => {
							configMutation.mutate({
								"gmail.savedSearches": [
									...config["gmail.savedSearches"],
									{
										id: crypto.randomUUID(),
										...savedSearch,
									},
								],
							});
						}}
					/>
				</div>
			</SettingsContent>
		</>
	);
}
