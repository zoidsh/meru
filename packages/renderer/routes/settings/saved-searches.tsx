import { zodResolver } from "@hookform/resolvers/zod";
import { ipc } from "@meru/renderer-lib/ipc";
import {
	type GmailSavedSearch,
	type GmailSavedSearchInput,
	gmailSavedSearchInputSchema,
} from "@meru/shared/schemas";
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
import {
	EmojiPicker,
	EmojiPickerContent,
	EmojiPickerFooter,
	EmojiPickerSearch,
} from "@meru/ui/components/emoji-picker";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@meru/ui/components/popover";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@meru/ui/components/table";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	EllipsisIcon,
	SmileIcon,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import {
	SettingsContent,
	SettingsHeader,
	SettingsTitle,
} from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useGmailSavedSearchesStore } from "@/lib/stores";

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

	const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

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
								<Popover
									onOpenChange={setIsEmojiPickerOpen}
									open={isEmojiPickerOpen}
									modal
								>
									<PopoverTrigger asChild>
										<Button variant="outline">
											<SmileIcon />
										</Button>
									</PopoverTrigger>
									<PopoverContent>
										<EmojiPicker
											className="h-[264px]"
											onEmojiSelect={({ emoji }) => {
												setIsEmojiPickerOpen(false);

												form.setValue(
													"label",
													`${form.getValues().label}${emoji}`,
												);
											}}
										>
											<EmojiPickerSearch />
											<EmojiPickerContent />
											<EmojiPickerFooter />
										</EmojiPicker>
									</PopoverContent>
								</Popover>
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

export function AddSavedSearchButton() {
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
						ipc.main.send("gmail.addSavedSearch", values);

						setIsDialogOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

function SavedSearchMenuButton({
	savedSearch,
}: {
	savedSearch: GmailSavedSearch;
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
								ipc.main.send("gmail.deleteSavedSearch", savedSearch.id);
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
						ipc.main.send("gmail.updateSavedSearch", {
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
	const savedSearches = useGmailSavedSearchesStore(
		(state) => state.savedSearches,
	);

	return (
		<>
			<SettingsHeader>
				<SettingsTitle>Saved Searches</SettingsTitle>
			</SettingsHeader>
			<SettingsContent>
				<LicenseKeyRequiredBanner />
				<Table className="mb-4">
					<TableHeader>
						<TableRow>
							<TableHead>Label</TableHead>
							<TableHead>Query</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{savedSearches.map((savedSearch, index) => (
							<TableRow key={savedSearch.id}>
								<TableCell>{savedSearch.label}</TableCell>
								<TableCell>{savedSearch.query}</TableCell>
								<TableCell className="flex justify-end">
									{savedSearches.length > 1 && (
										<>
											<Button
												size="icon"
												className="size-8 p-0"
												variant="ghost"
												disabled={index + 1 === savedSearches.length}
												onClick={() => {
													ipc.main.send(
														"gmail.moveSavedSearch",
														savedSearch.id,
														"down",
													);
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
													ipc.main.send(
														"gmail.moveSavedSearch",
														savedSearch.id,
														"up",
													);
												}}
											>
												<ArrowUpIcon />
											</Button>
										</>
									)}
									<SavedSearchMenuButton savedSearch={savedSearch} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<div className="flex justify-end">
					<AddSavedSearchButton />
				</div>
			</SettingsContent>
		</>
	);
}
