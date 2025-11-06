import { zodResolver } from "@hookform/resolvers/zod";
import { ipc } from "@meru/renderer-lib/ipc";
import { licenseKeySearchParam } from "@meru/renderer-lib/search-params";
import { WEBSITE_URL } from "@meru/shared/constants";
import { Button } from "@meru/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Field, FieldGroup, FieldLabel } from "@meru/ui/components/field";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@meru/ui/components/form";
import { Input } from "@meru/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontalIcon } from "lucide-react";
import { type ComponentProps, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useTrialStore } from "@/lib/stores";

export const licenseKeySchema = z.object({
	licenseKey: z.string(),
});

function LicenseKeyForm({
	onSubmit,
}: {
	onSubmit: (key: z.infer<typeof licenseKeySchema>["licenseKey"]) => void;
}) {
	const form = useForm<z.infer<typeof licenseKeySchema>>({
		resolver: zodResolver(licenseKeySchema),
		defaultValues: {
			licenseKey: "",
		},
	});

	return (
		<Form {...form}>
			<form
				className="space-y-4"
				onSubmit={form.handleSubmit(({ licenseKey }) => {
					onSubmit(licenseKey);
				})}
			>
				<FormField
					control={form.control}
					name="licenseKey"
					render={({ field }) => (
						<FormItem>
							<FormLabel>License Key</FormLabel>
							<FormControl>
								<Input placeholder="MERU-XXXX-XXXX-XXXX-XXXX-XXXX" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<div className="flex justify-end items-center">
					<Button type="submit" className="self-end">
						Activate
					</Button>
				</div>
			</form>
		</Form>
	);
}

function ActivateLicenseDialog({
	variant = "activate",
	children,
	...props
}: { variant?: "activate" | "change" } & ComponentProps<typeof Dialog>) {
	return (
		<Dialog {...props}>
			{children}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{variant === "activate" ? "Activate" : "Change"} License Key
					</DialogTitle>
				</DialogHeader>
				<DialogDescription>
					Please enter the license key you received at your email address after
					your purchase.
				</DialogDescription>
				<LicenseKeyForm
					onSubmit={async (licenseKey) => {
						const { success } = await ipc.main.invoke(
							"licenseKey.activate",
							licenseKey,
						);

						if (success && props.onOpenChange) {
							props.onOpenChange(false);
						}
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

function ActivateLicenseKeyButton() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<ActivateLicenseDialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">Activate</Button>
			</DialogTrigger>
		</ActivateLicenseDialog>
	);
}

export function LicenseSettings() {
	const [licenseKey, setLicenseKey] = useState<string | null>(null);
	const trialDaysLeft = useTrialStore((state) => state.daysLeft);

	const { data: licenseKeyStatus } = useQuery({
		queryKey: ["license-key-status"],
		queryFn: () => ipc.main.invoke("licenseKey.getStatus"),
	});

	const [isChangeLicenseDialogOpen, setIsChangeLicenseDialogOpen] =
		useState(false);

	const [isLicenseKeyRevealed, setIsLicenseKeyRevealed] = useState(false);

	useEffect(() => {
		if (licenseKeySearchParam) {
			setLicenseKey(JSON.parse(licenseKeySearchParam));
		}
	}, []);

	if (!licenseKeyStatus) {
		return;
	}

	const renderContent = () => {
		if (licenseKey) {
			return (
				<div className="space-y-4">
					<div className="text-sm">
						You're using Meru Pro with professional features and for commercial
						use. Thank you for supporting Meru!
					</div>
					<div>
						<FieldGroup>
							<Field>
								<FieldLabel>License Key</FieldLabel>
								<div className="flex gap-2">
									<Input
										placeholder="Click to reveal license key"
										value={isLicenseKeyRevealed ? licenseKey : ""}
										onFocus={() => {
											setIsLicenseKeyRevealed(true);
										}}
										onBlur={() => {
											setIsLicenseKeyRevealed(false);
										}}
										readOnly
									/>
									<DropdownMenu>
										<DropdownMenuTrigger>
											<Button size="icon" variant="secondary">
												<MoreHorizontalIcon />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent>
											<DropdownMenuItem
												onClick={() => {
													navigator.clipboard.writeText(licenseKey);

													toast("Copied license key to clipboard");
												}}
											>
												Copy
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => {
													setIsChangeLicenseDialogOpen(true);
												}}
											>
												Change
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
									<ActivateLicenseDialog
										variant="change"
										open={isChangeLicenseDialogOpen}
										onOpenChange={setIsChangeLicenseDialogOpen}
									/>
								</div>
							</Field>
							<Field>
								<FieldLabel>Device Name</FieldLabel>
								<Input value={licenseKeyStatus.instance.label} readOnly />
							</Field>
						</FieldGroup>
					</div>
				</div>
			);
		}

		if (trialDaysLeft) {
			return (
				<>
					<div className="space-y-2 text-sm mb-4">
						<div>
							You're using a Meru Pro trial with {trialDaysLeft} day
							{trialDaysLeft > 1 ? "s" : ""} left.
						</div>
						<div>
							Purchase Meru Pro before your trial ends to keep using all
							features.
						</div>
					</div>
					<div className="flex gap-4">
						<ActivateLicenseKeyButton />
						<Button asChild>
							<a
								href={`${WEBSITE_URL}#pricing`}
								target="_blank"
								rel="noreferrer"
							>
								Purchase
							</a>
						</Button>
					</div>
				</>
			);
		}

		return (
			<>
				<div className="space-y-2 text-sm mb-4">
					<div>You're using the free version of Meru for personal use.</div>
					<div>
						Unlock Meru Pro for professional features and commercial use. Your
						upgrade supports ongoing development.
					</div>
				</div>
				<div className="flex gap-4">
					<ActivateLicenseKeyButton />
					<Button asChild>
						<a href={`${WEBSITE_URL}#pricing`} target="_blank" rel="noreferrer">
							Purchase
						</a>
					</Button>
				</div>
			</>
		);
	};

	return (
		<>
			<SettingsHeader>
				<SettingsTitle>License</SettingsTitle>
			</SettingsHeader>
			{renderContent()}
		</>
	);
}
