import { zodResolver } from "@hookform/resolvers/zod";
import { ipcMain } from "@meru/renderer-lib/ipc";
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
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@meru/ui/components/form";
import { Input } from "@meru/ui/components/input";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

function ActivateLicenseKeyButton({ variant }: { variant?: "change" }) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					{variant === "change" ? "Change" : "Activate"} License Key
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Activate License Key</DialogTitle>
				</DialogHeader>
				<DialogDescription>
					Please enter the license key you received at your email address after
					your purchase.
				</DialogDescription>
				<LicenseKeyForm
					onSubmit={async (licenseKey) => {
						const { success } = await ipcMain.invoke(
							"activateLicenseKey",
							licenseKey,
						);

						if (success) {
							setIsOpen(false);
						}
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

export function LicenseKey() {
	const [licenseKey, setLicenseKey] = useState<string | null>(null);

	useEffect(() => {
		if (licenseKeySearchParam) {
			setLicenseKey(JSON.parse(licenseKeySearchParam));
		}
	}, []);

	return (
		<div>
			<div className="flex justify-between items-center mb-4">
				<div className="text-3xl font-bold tracking-tight">License</div>
			</div>
			{licenseKey ? (
				<>
					<div className="mb-4">
						You're using the Pro version of Meru for professional and commercial
						use. Thank you for supporting Meru!
					</div>
					<div className="flex gap-4 justify-end">
						<ActivateLicenseKeyButton variant="change" />
						<Button
							variant="outline"
							onClick={() => {
								navigator.clipboard.writeText(licenseKey);
							}}
						>
							Copy License Key
						</Button>
					</div>
				</>
			) : (
				<>
					<div className="mb-2">
						You're using the free version of Meru for personal use.
					</div>
					<div className="mb-4">
						Unlock Meru Pro for professional features and commercial use. Your
						upgrade supports ongoing development.
					</div>
					<div className="flex gap-4 justify-end">
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
			)}
		</div>
	);
}
