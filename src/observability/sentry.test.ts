import { describe, expect, it } from "vitest";
import { filterCapacitorBridgeBreadcrumb } from "./sentry";

describe("Sentry breadcrumb filtering", () => {
	it("drops Capacitor's listener-removal debug breadcrumb", () => {
		expect(
			filterCapacitorBridgeBreadcrumb({
				category: "console",
				level: "debug",
				message: "Removing listener Keyboard keyboardWillShow",
			}),
		).toBeNull();
	});

	it("keeps application and non-console breadcrumbs", () => {
		const appDebug = {
			category: "console",
			level: "debug",
			message: "draw backend selected",
		};
		const ui = {
			category: "ui.click",
			message: "button.send",
		};

		expect(filterCapacitorBridgeBreadcrumb(appDebug)).toBe(appDebug);
		expect(filterCapacitorBridgeBreadcrumb(ui)).toBe(ui);
	});

	it("does not hide errors that happen to mention listener removal", () => {
		const error = {
			category: "console",
			level: "error",
			message: "Removing listener failed",
		};

		expect(filterCapacitorBridgeBreadcrumb(error)).toBe(error);
	});

	it("drops embedded URLs before native scope sync", () => {
		expect(
			filterCapacitorBridgeBreadcrumb({
				category: "fetch",
				data: {
					status_code: 200,
					url: "data:application/octet-stream;base64,UEsDBBQAAAAI",
				},
			}),
		).toBeNull();
		expect(
			filterCapacitorBridgeBreadcrumb({
				category: "fetch",
				data: { status_code: 200, url: "blob:https://localhost/id" },
			}),
		).toBeNull();
	});

	it("drops successful packaged lottie loads but keeps failures", () => {
		const success = {
			category: "fetch",
			data: { status_code: "200", url: "https://localhost/cat.lottie" },
		};
		const failure = {
			category: "fetch",
			data: { status_code: 500, url: "https://localhost/cat.lottie" },
		};

		expect(filterCapacitorBridgeBreadcrumb(success)).toBeNull();
		expect(filterCapacitorBridgeBreadcrumb(failure)).toBe(failure);
	});
});
