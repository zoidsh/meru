import {
	ArrowLeftIcon,
	ArrowRightIcon,
	RotateCwIcon,
	SettingsIcon,
} from "lucide-react";
import type { HTMLAttributes } from "react";
import { APP_SIDEBAR_WIDTH, APP_TOOLBAR_HEIGHT } from "../../lib/constants";
import {
	useAccounts,
	useGmailNavigationHistory,
	useGmailVisible,
	useIsWindowMaximized,
	useTitle,
} from "../lib/hooks";
import { emitter } from "../lib/ipc";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "./ui/icons";

function WindowControlButton({
	className,
	...props
}: HTMLAttributes<HTMLButtonElement>) {
	return (
		<Button
			variant="ghost"
			className={cn("rounded-none", className)}
			style={{ width: APP_TOOLBAR_HEIGHT, height: APP_TOOLBAR_HEIGHT }}
			{...props}
		/>
	);
}

function WindowControls() {
	const isWindowMaximized = useIsWindowMaximized();

	return (
		<div
			className="flex"
			// @ts-expect-error
			style={{ appRegion: "none" }}
		>
			<WindowControlButton
				onClick={() => emitter.send("controlWindow", "minimize")}
			>
				<MinimizeIcon />
			</WindowControlButton>
			<WindowControlButton
				onClick={() =>
					emitter.send(
						"controlWindow",
						isWindowMaximized.data ? "unmaximize" : "maximize",
					)
				}
			>
				{isWindowMaximized.data ? <RestoreIcon /> : <MaximizeIcon />}
			</WindowControlButton>
			<WindowControlButton
				className="hover:bg-destructive/90"
				onClick={() => emitter.send("controlWindow", "close")}
			>
				<CloseIcon />
			</WindowControlButton>
		</div>
	);
}

function TitlebarTitle() {
	const title = useTitle();
	const gmailVisible = useGmailVisible();

	if (!gmailVisible.data) {
		return;
	}

	return (
		<div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs pointer-events-none">
			{title.data}
		</div>
	);
}

function TitlebarNavigation() {
	const gmailNavigationHistory = useGmailNavigationHistory();
	const gmailVisible = useGmailVisible();

	return (
		<div
			className={cn("flex items-center gap-1", {
				invisible: !gmailVisible.data,
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
					emitter.send("goNavigationHistory", "back");
				}}
				disabled={!gmailNavigationHistory.data?.canGoBack}
			>
				<ArrowLeftIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="size-7"
				onClick={() => {
					emitter.send("goNavigationHistory", "forward");
				}}
				disabled={!gmailNavigationHistory.data?.canGoForward}
			>
				<ArrowRightIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="size-7"
				onClick={() => {
					emitter.send("reload");
				}}
			>
				<RotateCwIcon />
			</Button>
		</div>
	);
}

export function AppTitlebar() {
	const accounts = useAccounts();

	if (!accounts.data) {
		return;
	}

	return (
		<div
			style={{
				minHeight: APP_TOOLBAR_HEIGHT,
				// @ts-expect-error
				appRegion: "drag",
			}}
			className="flex border-b select-none relative"
		>
			<TitlebarTitle />
			<div className="flex-1 flex justify-between px-2">
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
							emitter.send("toggleGmailVisible");
						}}
					>
						<SettingsIcon />
					</Button>
				</div>
			</div>
			{window.electron.process.platform !== "darwin" && <WindowControls />}
		</div>
	);
}
