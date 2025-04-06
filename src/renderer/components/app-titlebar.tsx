import { APP_TITLEBAR_HEIGHT } from "@/lib/constants";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CircleAlertIcon,
	EllipsisVerticalIcon,
	RotateCwIcon,
} from "lucide-react";
import {
	useAccounts,
	useIsSettingsOpen,
	useSelectedAccount,
} from "../lib/hooks";
import { ipcMain } from "../lib/ipc";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export function AppTitlebar() {
	const accounts = useAccounts();

	const selectedAccount = useSelectedAccount();

	const isSettingsOpen = useIsSettingsOpen();

	if (!accounts.data) {
		return;
	}

	return (
		<div
			className="relative bg-background border-b draggable select-none"
			style={{ height: APP_TITLEBAR_HEIGHT }}
		>
			<div
				className="absolute top-0 bottom-0 flex items-center gap-4 px-1.5"
				style={{
					left: "env(titlebar-area-x, 0)",
					width: "env(titlebar-area-width, 100%)",
				}}
			>
				<div
					className={cn("flex items-center gap-1", {
						invisible: isSettingsOpen.data,
					})}
				>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 draggable-none"
						onClick={() => {
							ipcMain.send("goNavigationHistory", "back");
						}}
						disabled={!selectedAccount?.gmail.state.navigationHistory.canGoBack}
					>
						<ArrowLeftIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 draggable-none"
						onClick={() => {
							ipcMain.send("goNavigationHistory", "forward");
						}}
						disabled={
							!selectedAccount?.gmail.state.navigationHistory.canGoForward
						}
					>
						<ArrowRightIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 draggable-none"
						onClick={() => {
							ipcMain.send("reloadGmail");
						}}
					>
						<RotateCwIcon />
					</Button>
				</div>
				<div className="flex-1 flex gap-2">
					{!isSettingsOpen.data &&
						accounts.data.length > 1 &&
						accounts.data.map((account) => (
							<Button
								key={account.config.id}
								variant={account.config.selected ? "secondary" : "ghost"}
								size="sm"
								className={cn(
									"text-xs h-7 flex items-center justify-center gap-1 draggable-none text-muted-foreground",
									{
										"text-primary": account.config.selected,
									},
								)}
								onClick={() => {
									ipcMain.send("selectAccount", account.config.id);
								}}
							>
								{account.config.label}
								{account.gmail.state.attentionRequired && (
									<CircleAlertIcon className="size-4 text-yellow-400" />
								)}
								{!account.gmail.state.attentionRequired &&
								account.gmail.state.unreadCount > 0 ? (
									<div className="bg-[#ec3128] font-normal text-[0.5rem] text-white min-w-4 h-4 px-1 flex items-center justify-center rounded-full">
										{account.gmail.state.unreadCount}
									</div>
								) : null}
							</Button>
						))}
				</div>
				<div className="draggable-none">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => {
							ipcMain.send("toggleAppMenu");
						}}
					>
						<EllipsisVerticalIcon />
					</Button>
				</div>
			</div>
		</div>
	);
}
