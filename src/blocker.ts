import fs from "node:fs/promises";
import path from "node:path";
import {
	FiltersEngine,
	Request,
	adsAndTrackingLists,
	adsLists,
} from "@ghostery/adblocker";
import { type Session, app } from "electron";
import { config } from "./lib/config";

export class Blocker {
	private _engine: FiltersEngine | undefined;

	get engine() {
		if (!this._engine) {
			throw new Error("Engine not initialized");
		}

		return this._engine;
	}

	set engine(engine: FiltersEngine) {
		this._engine = engine;
	}

	async init() {
		if (!config.get("blocker.enabled")) {
			return;
		}

		const lists =
			config.get("blocker.ads") && config.get("blocker.tracking")
				? adsAndTrackingLists
				: config.get("blocker.ads")
					? adsLists
					: config.get("blocker.tracking")
						? adsAndTrackingLists.filter((list) => !adsLists.includes(list))
						: [];

		if (!lists.length) {
			return;
		}

		this.engine = await FiltersEngine.fromLists(
			fetch,
			lists,
			{
				enableCompression: true,
			},
			{
				path: path.join(app.getPath("userData"), "blocker-engine.bin"),
				read: fs.readFile,
				write: fs.writeFile,
			},
		);
	}

	setupSession(session: Session) {
		if (!this._engine) {
			return;
		}

		session.webRequest.onBeforeRequest(
			({ url, resourceType, referrer }, callback) => {
				const { match } = this.engine.match(
					Request.fromRawDetails({
						url,
						type: resourceType,
						sourceUrl: referrer,
					}),
				);

				callback({
					cancel: match,
				});
			},
		);
	}
}

export const blocker = new Blocker();
