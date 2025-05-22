import {
	APP_TITLEBAR_HEIGHT,
	GOOGLE_ACCOUNTS_URL,
} from "@meru/shared/constants";
import {
	WebContentsView,
	type WebContentsViewConstructorOptions,
	dialog,
} from "electron";
import { createStore } from "zustand/vanilla";
import { setupWindowContextMenu } from "./context-menu";
import { ipc } from "./ipc";
import { main } from "./main";

export class GoogleApp {
	baseUrl: string;

	view: WebContentsView;

	viewStore = createStore<{
		navigationHistory: {
			canGoBack: boolean;
			canGoForward: boolean;
		};
		attentionRequired: boolean;
	}>(() => ({
		navigationHistory: {
			canGoBack: false,
			canGoForward: false,
		},
		attentionRequired: false,
	}));

	constructor(
		baseUrl: string,
		webContentsViewOptions?: WebContentsViewConstructorOptions,
	) {
		this.baseUrl = baseUrl;

		this.view = new WebContentsView(webContentsViewOptions);

		main.window.contentView.addChildView(this.view);

		this.registerNavigationHandler();

		this.registerFoundInPageHandler();

		setupWindowContextMenu(this.view);

		this.updateViewBounds();

		main.window.on("resize", () => {
			this.updateViewBounds();
		});
	}

	private registerNavigationHandler() {
		this.view.webContents.on(
			"did-navigate",
			(_event: Electron.Event, url: string) => {
				if (
					/accounts\.google.com\/v3\/signin\/challenge\/pk\/presend/.test(url)
				) {
					dialog.showMessageBox({
						type: "info",
						message: "Passkey sign-in not supported yet",
						detail: "Please use password to sign in.",
					});
				}

				this.viewStore.setState({
					navigationHistory: {
						canGoBack: this.view.webContents.navigationHistory.canGoBack(),
						canGoForward:
							this.view.webContents.navigationHistory.canGoForward(),
					},
					attentionRequired: !url.startsWith(this.baseUrl),
				});
			},
		);

		this.view.webContents.on(
			"did-navigate-in-page",
			(_event: Electron.Event) => {
				this.viewStore.setState({
					navigationHistory: {
						canGoBack: this.view.webContents.navigationHistory.canGoBack(),
						canGoForward:
							this.view.webContents.navigationHistory.canGoForward(),
					},
				});
			},
		);

		this.view.webContents.on("will-redirect", (event, url) => {
			if (url.startsWith("https://www.google.com")) {
				event.preventDefault();

				this.view.webContents.loadURL(
					`${GOOGLE_ACCOUNTS_URL}/ServiceLogin?service=mail`,
				);
			}
		});
	}

	private registerFoundInPageHandler() {
		this.view.webContents.on("found-in-page", (_event, result) => {
			ipc.renderer.send(main.window.webContents, "findInPage.result", {
				activeMatch: result.activeMatchOrdinal,
				totalMatches: result.matches,
			});
		});
	}

	updateViewBounds() {
		const { width, height } = main.window.getContentBounds();

		this.view.setBounds({
			x: 0,
			y: APP_TITLEBAR_HEIGHT,
			width,
			height: height - APP_TITLEBAR_HEIGHT,
		});
	}

	destroy() {
		this.view.webContents.removeAllListeners();

		this.view.webContents.close();

		this.view.removeAllListeners();

		main.window.contentView.removeChildView(this.view);
	}
}
