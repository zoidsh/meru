import { ipc } from "@meru/renderer-lib/ipc";
import { APP_TITLEBAR_HEIGHT, WEBSITE_URL } from "@meru/shared/constants";
import type { DownloadItem } from "@meru/shared/types";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import { Input } from "@meru/ui/components/input";
import { cn } from "@meru/ui/lib/utils";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	CircleAlertIcon,
	DownloadIcon,
	EllipsisVerticalIcon,
	FileCheckIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useHashLocation } from "wouter/use-hash-location";
import {
	useAccountsStore,
	useAppUpdaterStore,
	useDownloadsStore,
	useFindInPageStore,
	useSettingsStore,
	useTrialStore,
} from "../lib/stores";

function RecentlyDownloadedItem({ item }: { item: DownloadItem }) {
	const [fadeOut, setFadeOut] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const handleAnimationEnd = () => {
			if (useDownloadsStore.getState().itemCompleted === item.id) {
				useDownloadsStore.setState({
					itemCompleted: null,
				});
			}
		};

		const timer = setTimeout(() => {
			buttonRef.current?.addEventListener("animationend", handleAnimationEnd);

			setFadeOut(true);
		}, 10000);

		return () => {
			clearTimeout(timer);

			buttonRef.current?.removeEventListener(
				"animationend",
				handleAnimationEnd,
			);
		};
	}, [item]);

	return (
		<Button
			ref={buttonRef}
			variant="ghost"
			size="sm"
			className={cn("text-xs h-7 max-w-56 animate-in fade-in", {
				"animate-out fade-out": fadeOut,
			})}
			onClick={() => {
				ipc.main.invoke("downloads.openFile", item.filePath);

				useDownloadsStore.setState({
					itemCompleted: null,
				});
			}}
		>
			<FileCheckIcon className="size-4" />
			<div className="truncate">{item.fileName}</div>
		</Button>
	);
}

function Download() {
	const [_location, navigate] = useHashLocation();

	const completedDownloadItem = useDownloadsStore(
		(state) =>
			(state.itemCompleted &&
				state.history.find((item) => item.id === state.itemCompleted)) ||
			null,
	);

	return (
		<div className="draggable-none flex items-center gap-1">
			{completedDownloadItem && (
				<RecentlyDownloadedItem item={completedDownloadItem} />
			)}
			<Button
				variant="ghost"
				size="icon"
				className="size-7"
				onClick={() => {
					navigate("/download-history");
					ipc.main.send("settings.toggleIsOpen");
				}}
			>
				<DownloadIcon className="size-4" />
			</Button>
		</div>
	);
}

function Trial() {
	const trialDaysLeft = useTrialStore((state) => state.daysLeft);

	if (!trialDaysLeft) {
		return;
	}

	return (
		<Badge
			variant="outline"
			className={cn(
				"h-7 text-yellow-600/60 border-yellow-600/60 hover:border-transparent hover:bg-secondary hover:text-secondary-foreground transition draggable-none group relative",
				{
					"text-red-600/60 border-red-600/60": trialDaysLeft <= 3,
				},
			)}
		>
			<a href={`${WEBSITE_URL}#pricing`} target="_blank" rel="noreferrer">
				<span className="group-hover:opacity-0 fade-out">
					Pro trial ends in {trialDaysLeft} days
				</span>
				<span className="opacity-0 absolute inset-0 group-hover:opacity-100 group-hover:inline-flex items-center justify-center fade-in">
					Upgrade to Pro
				</span>
			</a>
		</Badge>
	);
}

function FindInPage() {
	const isActive = useFindInPageStore((state) => state.isActive);
	const activeMatch = useFindInPageStore((state) => state.activeMatch);
	const totalMatches = useFindInPageStore((state) => state.totalMatches);
	const deactivate = useFindInPageStore((state) => state.deactivate);

	const inputRef = useRef<HTMLInputElement>(null);

	const [text, setText] = useState("");

	const debouncedOnChange = useDebouncedCallback((text) => {
		ipc.main.send("findInPage", text, { findNext: true });
	}, 250);

	useEffect(() => {
		if (isActive && text) {
			ipc.main.send("findInPage", text, { findNext: true });

			if (inputRef.current) {
				inputRef.current.select();
			}
		}
	}, [isActive]);

	if (!isActive) {
		return;
	}

	return (
		<div className="draggable-none flex items-center gap-4">
			<div className="relative">
				<Input
					ref={inputRef}
					className="h-7"
					autoFocus
					value={text}
					onChange={(event) => {
						setText(event.target.value);

						debouncedOnChange(event.target.value);
					}}
					onKeyDown={(event) => {
						switch (event.key) {
							case "Enter": {
								ipc.main.send("findInPage", text, {
									forward: true,
									findNext: false,
								});

								break;
							}
							case "Escape": {
								deactivate();

								break;
							}
						}
					}}
				/>
				<div className="absolute top-0 right-0 bottom-0 text-xs text-muted-foreground flex items-center p-2.5">
					{activeMatch}/{totalMatches}
				</div>
			</div>
			<div className="flex gap-2">
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					onClick={() => {
						ipc.main.send("findInPage", text, {
							forward: false,
							findNext: false,
						});
					}}
				>
					<ChevronUpIcon className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					onClick={() => {
						ipc.main.send("findInPage", text, { findNext: false });
					}}
				>
					<ChevronDownIcon className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					onClick={deactivate}
				>
					<XIcon className="size-4" />
				</Button>
			</div>
		</div>
	);
}

export function AppTitlebar() {
	const accounts = useAccountsStore((state) => state.accounts);
	const unreadBadge = useAccountsStore((state) => state.unreadBadge);

	const selectedAccount = accounts.find((account) => account.config.selected);

	const isSettingsOpen = useSettingsStore((state) => state.isOpen);

	const appUpdateVersion = useAppUpdaterStore((state) => state.version);
	const dismissAppUpdate = useAppUpdaterStore((state) => state.dismiss);

	if (!accounts) {
		return;
	}

	const renderContent = () => {
		if (appUpdateVersion) {
			return (
				<div className="h-full flex justify-center items-center text-xs gap-4">
					<div>An update for Meru is available and ready to install.</div>
					<div className="flex gap-2">
						<Button
							size="sm"
							className="text-xs h-7 draggable-none"
							onClick={() => {
								ipc.main.send("appUpdater.quitAndInstall");
							}}
						>
							Restart Now
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="text-xs h-7 draggable-none"
							onClick={() => {
								dismissAppUpdate();
							}}
						>
							Later
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="text-xs h-7 draggable-none"
							onClick={() => {
								ipc.main.send("appUpdater.openReleaseNotes", appUpdateVersion);
							}}
						>
							What's New?
						</Button>
					</div>
				</div>
			);
		}

		if (isSettingsOpen) {
			return (
				<div className="h-full flex items-center justify-center text-xs font-medium text-muted-foreground">
					Meru
				</div>
			);
		}

		return (
			<div className="h-full flex items-center justify-end gap-4">
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="size-7 draggable-none"
						onClick={() => {
							ipc.main.send("gmail.moveNavigationHistory", "back");
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
							ipc.main.send("gmail.moveNavigationHistory", "forward");
						}}
						disabled={!selectedAccount?.gmail.navigationHistory.canGoForward}
					>
						<ArrowRightIcon />
					</Button>
				</div>
				<div className="flex-1 flex gap-2">
					{accounts.length > 1 &&
						accounts.map((account) => (
							<Button
								key={account.config.id}
								variant={account.config.selected ? "secondary" : "ghost"}
								size="sm"
								className="text-xs h-7 flex items-center justify-center gap-1 draggable-none"
								onClick={() => {
									ipc.main.send("accounts.selectAccount", account.config.id);
								}}
							>
								{account.config.label}
								{account.gmail.attentionRequired && (
									<CircleAlertIcon className="size-3.5 text-yellow-400" />
								)}
								{!account.gmail.attentionRequired &&
								unreadBadge &&
								account.gmail.unreadCount ? (
									<div className="bg-[#ec3128] font-normal text-[0.5rem] leading-none text-white min-w-3.5 h-3.5 px-1 flex items-center justify-center rounded-full">
										{account.gmail.unreadCount.toLocaleString()}
									</div>
								) : null}
							</Button>
						))}
				</div>
				<Trial />
				<FindInPage />
				<Download />
				{window.electron.process.platform !== "darwin" && (
					<div className="draggable-none">
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() => {
								ipc.main.send("titleBar.toggleAppMenu");
							}}
						>
							<EllipsisVerticalIcon />
						</Button>
					</div>
				)}
			</div>
		);
	};

	return (
		<div
			className="relative bg-background border-b draggable select-none"
			style={{ height: APP_TITLEBAR_HEIGHT }}
		>
			<div
				className="absolute top-0 bottom-0 px-1.5"
				style={{
					left: "env(titlebar-area-x, 0)",
					width: "env(titlebar-area-width, 100%)",
				}}
			>
				{renderContent()}
			</div>
		</div>
	);
}
