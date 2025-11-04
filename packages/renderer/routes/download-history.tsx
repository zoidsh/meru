import { ipc } from "@meru/renderer-lib/ipc";
import { Button } from "@meru/ui/components/button";
import { Card, CardContent } from "@meru/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@meru/ui/components/empty";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@meru/ui/components/tooltip";
import { DownloadIcon, FolderIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { date } from "@/lib/date";
import { useDownloadsStore } from "@/lib/stores";

function DateFromNow({ timestamp }: { timestamp: number }) {
	const [timeAgo, setTimeAgo] = useState(date.unix(timestamp).fromNow());

	useEffect(() => {
		const interval = setInterval(() => {
			setTimeAgo(date.unix(timestamp).fromNow());
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	}, [timestamp]);

	return (
		<div className="text-muted-foreground first-letter:capitalize">
			{timeAgo}
		</div>
	);
}

export function DownloadHistory() {
	const downloadHistory = useDownloadsStore((state) => state.history);

	useEffect(() => {
		useDownloadsStore.setState({
			itemCompleted: null,
		});
	}, []);

	if (downloadHistory.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<DownloadIcon />
					</EmptyMedia>
					<EmptyTitle>No downloads yet</EmptyTitle>
					<EmptyDescription>
						Your downloaded files will appear here.
					</EmptyDescription>
					<EmptyDescription>
						Downloads older than 30 days will be automatically removed from the
						history.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div>
			<div className="flex justify-end mb-8">
				<Button
					variant="outline"
					onClick={() => {
						ipc.main.send("downloads.clearHistory");
					}}
				>
					Clear all
				</Button>
			</div>
			<div className="space-y-4">
				{downloadHistory.map(({ id, fileName, filePath, createdAt }) => (
					<Card key={id}>
						<CardContent className="flex gap-4 items-center text-sm">
							<div className="flex-1 space-y-1">
								<div className="text-muted-foreground first-letter:capitalize">
									<DateFromNow timestamp={createdAt} />
								</div>
								<Tooltip delayDuration={700}>
									<TooltipTrigger asChild>
										<button
											className="font-semibold hover:underline underline-offset-4"
											type="button"
											onClick={async () => {
												const { error } = await ipc.main.invoke(
													"downloads.openFile",
													filePath,
												);

												if (error) {
													toast("Failed to open file", {
														description: error,
													});
												}
											}}
										>
											{fileName}
										</button>
									</TooltipTrigger>
									<TooltipContent side="bottom">Open file</TooltipContent>
								</Tooltip>
							</div>
							<div className="flex gap-2">
								<Tooltip delayDuration={700}>
									<TooltipTrigger asChild>
										<Button
											size="icon"
											variant="ghost"
											onClick={async () => {
												const { error } = await ipc.main.invoke(
													"downloads.showFileInFolder",
													filePath,
												);

												if (error) {
													toast("Failed to show file in folder", {
														description: error,
													});
												}
											}}
										>
											<FolderIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom">Show in folder</TooltipContent>
								</Tooltip>
								<Tooltip delayDuration={700}>
									<TooltipTrigger asChild>
										<Button
											size="icon"
											variant="ghost"
											onClick={() => {
												ipc.main.send("downloads.removeHistoryItem", id);
											}}
										>
											<XIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom">
										Remove from history
									</TooltipContent>
								</Tooltip>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
