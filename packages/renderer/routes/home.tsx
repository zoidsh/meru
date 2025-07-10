import { ipc } from "@meru/renderer-lib/ipc";
import type { GMAIL_ACTION_CODE_MAP } from "@meru/shared/gmail";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
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
	InboxIcon,
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

		let unifiedInbox = [];

		for (const account of unifiedInboxAccounts) {
			for (const message of account.gmail.feed) {
				unifiedInbox.push({
					account: account.config,
					message,
				});
			}
		}

		unifiedInbox = unifiedInbox.sort((a, b) => {
			return (
				new Date(b.message.issuedAt).getTime() -
				new Date(a.message.issuedAt).getTime()
			);
		});

		if (unifiedInbox.length === 0) {
			return (
				<div className="absolute inset-0 flex flex-col justify-center items-center gap-2 text-muted-foreground">
					<InboxIcon className="size-8" />
					<div className="text-sm">All caught up! No unread emails.</div>
				</div>
			);
		}

		return (
			<Table className="table-fixed">
				<TableBody>
					{unifiedInbox.map(({ account, message }) => (
						<TableRow
							key={message.id}
							className="group hover:cursor-pointer"
							onClick={() => {
								ipc.main.send("accounts.openMessage", account.id, message.id);
							}}
						>
							<TableCell className="w-32">
								<Badge variant="secondary">{account.label}</Badge>
							</TableCell>
							<TableCell className="w-48">{message.sender.name}</TableCell>
							<TableCell>
								<div className="space-x-1.5">
									<div className="text-foreground truncate">
										{message.subject}
									</div>
									<div className="text-muted-foreground truncate">
										{message.summary}
									</div>
								</div>
							</TableCell>
							<TableCell className="w-48">
								<div className="h-7 flex items-center justify-end">
									<MessageActions
										accountId={account.id}
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
	};

	return (
		<div className="p-8 absolute inset-0 flex items-center justify-center">
			<div className="max-w-7xl">{renderContent()}</div>
		</div>
	);
}
