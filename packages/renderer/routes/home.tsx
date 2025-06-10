import { ipc } from "@meru/renderer-lib/ipc";
import type { GMAIL_ACTION_CODE_MAP } from "@meru/shared/gmail";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@meru/ui/components/card";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableRow,
} from "@meru/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@meru/ui/components/tooltip";
import {
	ArchiveIcon,
	LoaderCircleIcon,
	MailOpenIcon,
	MailWarningIcon,
	TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { date } from "@/lib/date";
import { useAccountsStore } from "@/lib/stores";

function MessageActions({
	accountId,
	messageId,
}: {
	accountId: string;
	messageId: string;
}) {
	const [actionInProgress, setActionInProgress] = useState<
		keyof typeof GMAIL_ACTION_CODE_MAP | null
	>(null);

	return (
		<div className="justify-end gap-2 hidden fade-in group-hover:flex group-hover:animate-in group-hover:fade-in">
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<Button
						size="icon"
						variant="outline"
						className="size-7"
						onClick={(event) => {
							event.stopPropagation();

							ipc.main.send(
								"accounts.handleMessage",
								accountId,
								messageId,
								"archive",
							);

							setActionInProgress("archive");
						}}
						disabled={Boolean(actionInProgress)}
					>
						{actionInProgress === "archive" ? (
							<LoaderCircleIcon className="animate-spin" />
						) : (
							<ArchiveIcon />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Archive</TooltipContent>
			</Tooltip>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<Button
						size="icon"
						variant="outline"
						className="size-7"
						onClick={(event) => {
							event.stopPropagation();

							ipc.main.send(
								"accounts.handleMessage",
								accountId,
								messageId,
								"delete",
							);

							setActionInProgress("delete");
						}}
						disabled={Boolean(actionInProgress)}
					>
						{actionInProgress === "delete" ? (
							<LoaderCircleIcon className="animate-spin" />
						) : (
							<TrashIcon />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Delete</TooltipContent>
			</Tooltip>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<Button
						size="icon"
						variant="outline"
						className="size-7"
						onClick={(event) => {
							event.stopPropagation();

							ipc.main.send(
								"accounts.handleMessage",
								accountId,
								messageId,
								"markAsRead",
							);

							setActionInProgress("markAsRead");
						}}
						disabled={Boolean(actionInProgress)}
					>
						{actionInProgress === "markAsRead" ? (
							<LoaderCircleIcon className="animate-spin" />
						) : (
							<MailOpenIcon />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Mark as read</TooltipContent>
			</Tooltip>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<Button
						size="icon"
						variant="outline"
						className="size-7"
						onClick={(event) => {
							event.stopPropagation();

							ipc.main.send(
								"accounts.handleMessage",
								accountId,
								messageId,
								"markAsSpam",
							);

							setActionInProgress("markAsSpam");
						}}
						disabled={Boolean(actionInProgress)}
					>
						{actionInProgress === "markAsSpam" ? (
							<LoaderCircleIcon className="animate-spin" />
						) : (
							<MailWarningIcon />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Mark as spam</TooltipContent>
			</Tooltip>
		</div>
	);
}

export function Home() {
	const accounts = useAccountsStore((state) => state.accounts);
	const [_location, navigate] = useHashLocation();

	const unifiedInboxAccounts = accounts.filter(
		(account) => account.config.unifiedInbox,
	);

	const renderContent = () => {
		if (unifiedInboxAccounts.length === 0) {
			return (
				<div className="flex flex-col justify-center align-center gap-4">
					<div className="text-muted-foreground text-sm text-center">
						Enable unified inbox on your accounts to see them here.
					</div>
					<div className="flex justify-center">
						<Button
							onClick={() => {
								navigate("/accounts");
							}}
						>
							Manage accounts
						</Button>
					</div>
				</div>
			);
		}

		return accounts
			.filter((account) => account.config.unifiedInbox)
			.map((account) => {
				const table = (
					<Table className="table-fixed">
						<TableBody>
							{account.gmail.feed.map((message) => (
								<TableRow
									key={message.id}
									className="group hover:cursor-pointer"
									onClick={() => {
										ipc.main.send(
											"accounts.openMessage",
											account.config.id,
											message.id,
										);
									}}
								>
									<TableCell className="w-48">
										<div className="truncate">{message.sender.name}</div>
									</TableCell>
									<TableCell>
										<div className="truncate text-muted-foreground space-x-1.5">
											<span className="text-foreground">{message.subject}</span>
											<span>{message.summary}</span>
										</div>
									</TableCell>
									<TableCell className="w-48">
										<div className="h-7 flex items-center justify-end">
											<MessageActions
												accountId={account.config.id}
												messageId={message.id}
											/>
											<div className="text-muted-foreground group-hover:hidden group-hover:animate-out group-hover:fade-out">
												{date(message.issuedAt).calendar()}
											</div>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				);

				return (
					<Card key={account.config.id} className="min-w-4xl max-w-7xl mx-auto">
						<CardHeader className="flex items-center gap-2">
							<CardTitle>{account.config.label}</CardTitle>
							<Badge variant="secondary">{account.gmail.feed.length}</Badge>
						</CardHeader>
						<CardContent>
							{account.gmail.feed.length === 0 ? (
								<div className="text-muted-foreground text-center text-sm">
									All caught up! No unread emails.
								</div>
							) : account.gmail.feed.length > 4 ? (
								<ScrollArea className="h-48">{table}</ScrollArea>
							) : (
								table
							)}
						</CardContent>
					</Card>
				);
			});
	};

	return <div className="p-8 space-y-8">{renderContent()}</div>;
}
