import fs from "node:fs";
import path from "node:path";
import { Engine, FilterSet } from "adblock-rs";
import type { Session } from "electron";
import { config } from "./lib/config";

export class Blocker {
	private _engine: Engine | undefined;

	get engine() {
		if (!this._engine) {
			throw new Error("Engine not initialized");
		}

		return this._engine;
	}

	set engine(engine: Engine) {
		this._engine = engine;
	}

	async init() {
		if (
			!config.get("blocker.enabled") ||
			(!config.get("blocker.ads") && !config.get("blocker.tracking"))
		) {
			return;
		}

		const debugInfo = true;
		const filterSet = new FilterSet(debugInfo);

		if (config.get("blocker.ads")) {
			const easylistFilters = fs
				.readFileSync(
					path.join(__dirname, "..", "static", "blocker", "easylist.txt"),
					{ encoding: "utf-8" },
				)
				.split("\n");

			filterSet.addFilters(easylistFilters);
		}

		if (config.get("blocker.tracking")) {
			const easyprivacyFilters = fs
				.readFileSync(
					path.join(__dirname, "..", "static", "blocker", "easyprivacy.txt"),
					{ encoding: "utf-8" },
				)
				.split("\n");

			filterSet.addFilters(easyprivacyFilters);
		}

		this._engine = new Engine(filterSet, true);
	}

	setupSession(session: Session) {
		if (!this._engine) {
			return;
		}

		session.webRequest.onBeforeRequest(
			({ url, resourceType, referrer }, callback) => {
				const match = this.engine.check(url, referrer, resourceType);

				callback({
					cancel: match,
				});
			},
		);
	}
}

export const blocker = new Blocker();
