import { useTrialStore } from "@/lib/stores";
import { zodResolver } from "@hookform/resolvers/zod";
import { ipc } from "@meru/renderer-lib/ipc";
import { licenseKeySearchParam } from "@meru/renderer-lib/search-params";
import { WEBSITE_URL } from "@meru/shared/constants";
import { Button } from "@meru/ui/components/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@meru/ui/components/card";
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
import { toast } from "sonner";
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
					{variant === "change" ? "Change License Key" : "Activate"}
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
						const { success } = await ipc.main.invoke(
							"licenseKey.activate",
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

export function License() {
	const [licenseKey, setLicenseKey] = useState<string | null>(null);
	const trialDaysLeft = useTrialStore((state) => state.daysLeft);

	useEffect(() => {
		if (licenseKeySearchParam) {
			setLicenseKey(JSON.parse(licenseKeySearchParam));
		}
	}, []);

	const renderContent = () => {
		if (licenseKey) {
			return (
				<>
					<CardContent className="text-sm">
						You're using Meru Pro with professional features and for commercial
						use. Thank you for supporting Meru!
					</CardContent>
					<CardFooter className="gap-4 justify-end">
						<ActivateLicenseKeyButton variant="change" />
						<Button
							variant="outline"
							onClick={() => {
								navigator.clipboard.writeText(licenseKey);

								toast("Copied license key to clipboard");
							}}
						>
							Copy License Key
						</Button>
					</CardFooter>
				</>
			);
		}

		if (trialDaysLeft) {
			return (
				<>
					<CardContent className="space-y-2 text-sm">
						<div>
							You're using a Meru Pro trial with {trialDaysLeft} day
							{trialDaysLeft > 1 ? "s" : ""} left.
						</div>
						<div>
							Purchase Meru Pro before your trial ends to keep using all
							features.
						</div>
					</CardContent>
					<CardFooter className="gap-4 justify-end">
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
					</CardFooter>
				</>
			);
		}

		return (
			<>
				<CardContent className="space-y-2 text-sm">
					<div>You're using the free version of Meru for personal use.</div>
					<div>
						Unlock Meru Pro for professional features and commercial use. Your
						upgrade supports ongoing development.
					</div>
				</CardContent>
				<CardFooter className="gap-4 justify-end">
					<ActivateLicenseKeyButton />
					<Button asChild>
						<a href={`${WEBSITE_URL}#pricing`} target="_blank" rel="noreferrer">
							Purchase
						</a>
					</Button>
				</CardFooter>
			</>
		);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>License</CardTitle>
			</CardHeader>
			{renderContent()}
		</Card>
	);
}
