import fs from "node:fs/promises";
import path from "node:path";
import { FiltersEngine, Request } from "@ghostery/adblocker";
import { config } from "@/config";
import { licenseKey } from "./license-key";

export class Blocker {
	private _engine: FiltersEngine | undefined;

	get engine() {
		if (!this._engine) {
			throw new Error("Blocker engine is not initialized");
		}

		return this._engine;
	}

	set engine(engine: FiltersEngine) {
		this._engine = engine;
	}

	async init() {
		if (!licenseKey.isValid || !config.get("blocker.enabled")) {
			return;
		}

		const lists: Promise<string>[] = [];

		if (config.get("blocker.ads")) {
			lists.push(
				fs.readFile(
					path.join(__dirname, "..", "static", "blocker", "easylist.txt"),
					"utf-8",
				),
			);
		}

		if (config.get("blocker.tracking")) {
			lists.push(
				fs.readFile(
					path.join(__dirname, "..", "static", "blocker", "easyprivacy.txt"),
					"utf-8",
				),
			);
		}

		if (!lists.length) {
			return;
		}

		this.engine = FiltersEngine.parse((await Promise.all(lists)).join("\n"));
	}

	private onBeforeRequest = (
		details: Electron.OnBeforeRequestListenerDetails,
		callback: (response: Electron.CallbackResponse) => void,
	) => {
		const { id, url, resourceType, referrer } = details;

		const { redirect, match } = this.engine.match(
			Request.fromRawDetails({
				_originalRequestDetails: details,
				requestId: `${id}`,
				url,
				type: resourceType,
				sourceUrl: referrer,
			}),
		);

		if (redirect) {
			callback({ redirectURL: redirect.dataUrl });

			return;
		}

		if (match) {
			callback({ cancel: true });

			return;
		}

		callback({});
	};

	setupSession(session: Electron.Session) {
		if (this._engine) {
			session.webRequest.onBeforeRequest(
				{ urls: ["<all_urls>"] },
				this.onBeforeRequest,
			);
		}
	}
}

export const blocker = new Blocker();
