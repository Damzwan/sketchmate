import { FRONTEND_ROUTES } from "@/types/router.types";

export interface AppColorConfig {
	statusBar: string;
	navigationBar: string;
}

export const primaryColor = "#FAE0C2";
export const backgroundColor = "#FFF2E4";
export const secondaryColor = "#B9463A";

export const photoSwiperColorConfig: AppColorConfig = {
	statusBar: "#000000",
	navigationBar: "#000000",
};
export const popoverColorConfig: AppColorConfig = {
	statusBar: "#ad7659",
	navigationBar: "#ad7659",
};
export const settingsModalColorConfig: AppColorConfig = {
	statusBar: backgroundColor,
	navigationBar: backgroundColor,
};
export const qrModalColorConfig: AppColorConfig = {
	statusBar: primaryColor,
	navigationBar: backgroundColor,
};
export const drawModalColorConfig: AppColorConfig = {
	statusBar: primaryColor,
	navigationBar: primaryColor,
};
export const defaultRouteColorConfig: AppColorConfig = {
	statusBar: backgroundColor,
	navigationBar: primaryColor,
};

/**
 * Only the routes that need non-default system-bar colors are listed. Declared
 * `Partial` on purpose — the previous `Record<FRONTEND_ROUTES, …>` claimed all
 * twelve routes while defining four, so every lookup was typed as defined when
 * eight were not. Read through `routeColorConfig()` rather than indexing.
 */
export const colorsPerRoute: Partial<Record<FRONTEND_ROUTES, AppColorConfig>> =
	{
		[FRONTEND_ROUTES.draw]: {
			statusBar: primaryColor,
			navigationBar: primaryColor,
		},
		[FRONTEND_ROUTES.login]: {
			statusBar: primaryColor,
			navigationBar: primaryColor,
		},
		[FRONTEND_ROUTES.gallery]: {
			statusBar: backgroundColor,
			navigationBar: primaryColor,
		},
		[FRONTEND_ROUTES.connect]: {
			statusBar: backgroundColor,
			navigationBar: primaryColor,
		},
	};

export const routeColorConfig = (route: FRONTEND_ROUTES): AppColorConfig =>
	colorsPerRoute[route] ?? defaultRouteColorConfig;
