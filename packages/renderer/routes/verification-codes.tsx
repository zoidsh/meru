import { ipc } from "@meru/renderer-lib/ipc";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@meru/ui/components/card";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@meru/ui/components/field";
import { Switch } from "@meru/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/react-query";

const queryKey = ["verificationCodesConfig"];

export function VerificationCodes() {
	const { data } = useQuery({
		queryKey,
		queryFn: () => ipc.main.invoke("verificationCodes.getConfig"),
	});

	const invalidateQueries = () => {
		queryClient.invalidateQueries({ queryKey });
	};

	const autoCopyMutation = useMutation({
		mutationFn: (autoCopy: boolean) =>
			ipc.main.invoke("verificationCodes.setAutoCopy", autoCopy),
		onSuccess: invalidateQueries,
	});

	const autoDeleteMutation = useMutation({
		mutationFn: (autoDelete: boolean) =>
			ipc.main.invoke("verificationCodes.setAutoDelete", autoDelete),
		onSuccess: invalidateQueries,
	});

	if (!data) {
		return;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Verification Codes</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<Field orientation="horizontal">
					<FieldContent>
						<FieldLabel htmlFor="auto-copy">
							Automatically copy verification codes to clipboard
						</FieldLabel>
						<FieldDescription>
							Verification codes received via email will be automatically copied
							to your clipboard for easy pasting.
						</FieldDescription>
					</FieldContent>
					<Switch
						id="auto-copy"
						checked={data?.autoCopy}
						onCheckedChange={(checked) => {
							autoCopyMutation.mutate(checked);
						}}
					/>
				</Field>
				<Field orientation="horizontal">
					<FieldContent>
						<FieldLabel htmlFor="auto-delete">
							Automatically delete emails after copying
						</FieldLabel>
						<FieldDescription>
							Emails containing verification codes will be automatically deleted
							after the code has been copied to your clipboard.
						</FieldDescription>
					</FieldContent>
					<Switch
						id="auto-delete"
						checked={data?.autoDelete}
						onCheckedChange={(checked) => {
							autoDeleteMutation.mutate(checked);
						}}
					/>
				</Field>
			</CardContent>
		</Card>
	);
}
