import {
	ArrowLeftIcon,
	ArrowRightIcon,
	EllipsisVerticalIcon,
	RotateCwIcon,
	SettingsIcon,
} from "lucide-react";
import { APP_SIDEBAR_WIDTH, APP_TITLEBAR_HEIGHT } from "../../lib/constants";
import { useIsSettingsOpen, useSelectedAccount } from "../lib/hooks";
import { ipcMain } from "../lib/ipc";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

function TitlebarTitle() {
	const selectedAccount = useSelectedAccount();

	const isSettingsOpen = useIsSettingsOpen();

	return (
		<div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
			{isSettingsOpen.data || !selectedAccount
				? "Settings"
				: selectedAccount.gmail.state.title}
		</div>
	);
}

function TitlebarNavigation() {
	const selectedAccount = useSelectedAccount();

	const isSettingsOpen = useIsSettingsOpen();

	return (
		<div
			className={cn("flex items-center gap-1", {
				invisible: isSettingsOpen.data,
			})}
			style={{
				// @ts-expect-error
				appRegion: "none",
				marginLeft:
					window.electron.process.platform === "darwin"
						? APP_SIDEBAR_WIDTH
						: undefined,
			}}
		>
			<Button
				variant="ghost"
				size="icon"
				className="size-7"
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
				className="size-7"
				onClick={() => {
					ipcMain.send("goNavigationHistory", "forward");
				}}
				disabled={!selectedAccount?.gmail.state.navigationHistory.canGoForward}
			>
				<ArrowRightIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="size-7"
				onClick={() => {
					ipcMain.send("reloadGmail");
				}}
			>
				<RotateCwIcon />
			</Button>
		</div>
	);
}

export function AppTitlebar() {
	return (
		<div
			style={{
				height: APP_TITLEBAR_HEIGHT,
				// @ts-expect-error
				appRegion: "drag",
			}}
			className="border-b select-none relative"
		>
			<TitlebarTitle />
			<div
				className={cn(
					"absolute flex justify-between items-center inset-0",
					window.electron.process.platform === "darwin" ? "px-2" : "px-3",
				)}
				style={
					window.electron.process.platform !== "darwin"
						? {
								left: "env(titlebar-area-x, 0)",
								width: "env(titlebar-area-width, 100%)",
							}
						: undefined
				}
			>
				<TitlebarNavigation />
				<div
					className="flex items-center gap-1"
					// @ts-expect-error
					style={{ appRegion: "none" }}
				>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => {
							ipcMain.send("toggleIsSettingsOpen");
						}}
					>
						<SettingsIcon />
					</Button>
					{window.electron.process.platform !== "darwin" && (
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
					)}
				</div>
			</div>
		</div>
	);
}
