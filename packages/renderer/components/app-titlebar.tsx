import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import { Button } from "@meru/ui/components/button";
import { cn } from "@meru/ui/lib/utils";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CircleAlertIcon,
	EllipsisVerticalIcon,
	RotateCwIcon,
} from "lucide-react";
import { ipcMain } from "../lib/ipc";
import { useAccountsStore, useSettingsStore } from "../lib/stores";

export function AppTitlebar() {
	const accounts = useAccountsStore((state) => state.accounts);
	const unreadBadge = useAccountsStore((state) => state.unreadBadge);

	const selectedAccount = accounts.find((account) => account.config.selected);

	const isSettingsOpen = useSettingsStore((state) => state.isOpen);

	if (!accounts) {
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
						invisible: isSettingsOpen,
					})}
				>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 draggable-none"
						onClick={() => {
							ipcMain.send("goNavigationHistory", "back");
						}}
						disabled={!selectedAccount?.gmail.navigationHistory.canGoBack}
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
						disabled={!selectedAccount?.gmail.navigationHistory.canGoForward}
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
					{!isSettingsOpen &&
						accounts.length > 1 &&
						accounts.map((account) => (
							<Button
								key={account.config.id}
								variant={account.config.selected ? "secondary" : "ghost"}
								size="sm"
								className="text-xs h-7 flex items-center justify-center gap-1 draggable-none"
								onClick={() => {
									ipcMain.send("selectAccount", account.config.id);
								}}
							>
								{account.config.label}
								{account.gmail.attentionRequired && (
									<CircleAlertIcon className="size-3.5 text-yellow-400" />
								)}
								{!account.gmail.attentionRequired &&
								unreadBadge &&
								account.gmail.unreadCount ? (
									<div className="bg-[#ec3128] font-normal text-[0.5rem] text-white min-w-3.5 h-3.5 px-1 flex items-center justify-center rounded-full">
										{account.gmail.unreadCount}
									</div>
								) : null}
							</Button>
						))}
				</div>
				{window.electron.process.platform !== "darwin" && (
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
				)}
			</div>
		</div>
	);
}
