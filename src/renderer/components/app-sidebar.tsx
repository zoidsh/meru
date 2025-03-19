import { APP_SIDEBAR_WIDTH } from "../../lib/constants";
import { useAccounts, useGmailVisible } from "../lib/hooks";
import { emitter } from "../lib/ipc";
import { cn } from "../lib/utils";
import { ScrollArea } from "./ui/scroll-area";

export function AppSidebar() {
	const gmailVisible = useGmailVisible();
	const accounts = useAccounts();

	if (!gmailVisible.data || !accounts.data || accounts.data.length === 0) {
		return;
	}

	return (
		<ScrollArea
			style={{ minWidth: APP_SIDEBAR_WIDTH }}
			className="border-r flex flex-col select-none"
		>
			<div className="flex flex-col items-center gap-4 flex-1 py-4 px-3">
				{accounts.data.map((account) => (
					<button
						key={account.id}
						type="button"
						className={cn(
							"size-10 border rounded-full flex items-center justify-center font-light cursor-pointer",
							{
								"bg-secondary": account.selected,
							},
						)}
						onClick={() => {
							emitter.send("selectAccount", account.id);
						}}
					>
						{account.label[0].toUpperCase()}
					</button>
				))}
			</div>
		</ScrollArea>
	);
}
