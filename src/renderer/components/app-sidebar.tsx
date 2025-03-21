import { APP_SIDEBAR_WIDTH } from "../../lib/constants";
import { useAccounts, useGmailVisible, useUnreadMails } from "../lib/hooks";
import { ipcMain } from "../lib/ipc";
import { cn } from "../lib/utils";
import { ScrollArea } from "./ui/scroll-area";

export function AppSidebar() {
	const gmailVisible = useGmailVisible();
	const accounts = useAccounts();
	const inboxesUnreadCount = useUnreadMails();

	if (!gmailVisible.data || !accounts.data || accounts.data.length === 0) {
		return;
	}

	return (
		<ScrollArea
			style={{ minWidth: APP_SIDEBAR_WIDTH }}
			className="border-r flex flex-col select-none"
		>
			<div className="flex flex-col items-center gap-4 flex-1 py-4 px-3">
				{accounts.data.map((account) => {
					const inboxUnreadCount = inboxesUnreadCount.data?.get(account.id);

					return (
						<button
							key={account.id}
							type="button"
							className={cn(
								"size-10 border rounded-md flex items-center justify-center font-light cursor-pointer relative",
								{
									"bg-secondary": account.selected,
								},
							)}
							onClick={() => {
								ipcMain.send("selectAccount", account.id);
							}}
						>
							{account.label[0].toUpperCase()}
							{inboxUnreadCount ? (
								<div className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full text-white w-4 h-4 flex items-center justify-center text-[0.5rem]">
									{inboxUnreadCount}
								</div>
							) : null}
						</button>
					);
				})}
			</div>
		</ScrollArea>
	);
}
