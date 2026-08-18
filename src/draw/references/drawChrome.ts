export interface DrawChromeInsets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export const NO_DRAW_CHROME: DrawChromeInsets = {
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
};

type ChromeSide = "top" | "right" | "bottom" | "left";

/**
 * How much of each screen edge is already taken by the draw UI — notch and home
 * indicator via the safe-area probe, toolbars via their own rects. A reference
 * dropped at a fixed offset from the raw window lands under the status bar on a
 * notched phone and under the toolbar on any of them.
 */
export function measureDrawChrome(): DrawChromeInsets {
	if (typeof document === "undefined" || typeof window === "undefined") {
		return NO_DRAW_CHROME;
	}

	const viewportWidth = window.innerWidth || 0;
	const viewportHeight = window.innerHeight || 0;
	const insets = { ...safeAreaInsets() };

	for (const element of document.querySelectorAll("[data-draw-chrome]")) {
		const side = element.getAttribute("data-draw-chrome") as ChromeSide | null;
		const rect = element.getBoundingClientRect();
		if (!side || rect.width <= 0 || rect.height <= 0) continue;
		if (side === "top") insets.top = Math.max(insets.top, rect.bottom);
		else if (side === "bottom")
			insets.bottom = Math.max(insets.bottom, viewportHeight - rect.top);
		else if (side === "left") insets.left = Math.max(insets.left, rect.right);
		else if (side === "right")
			insets.right = Math.max(insets.right, viewportWidth - rect.left);
	}

	return insets;
}

/**
 * `env(safe-area-inset-*)` only resolves inside a real declaration — reading a
 * custom property that holds it hands back the unevaluated `env(...)` text — so
 * measure a throwaway element that actually uses it.
 */
function safeAreaInsets(): DrawChromeInsets {
	const probe = document.createElement("div");
	probe.style.cssText = [
		"position:fixed",
		"visibility:hidden",
		"pointer-events:none",
		"top:0",
		"left:0",
		"width:0",
		"height:0",
		"padding-top:env(safe-area-inset-top, 0px)",
		"padding-right:env(safe-area-inset-right, 0px)",
		"padding-bottom:env(safe-area-inset-bottom, 0px)",
		"padding-left:env(safe-area-inset-left, 0px)",
	].join(";");
	document.body.appendChild(probe);
	const style = getComputedStyle(probe);
	const insets: DrawChromeInsets = {
		top: Number.parseFloat(style.paddingTop) || 0,
		right: Number.parseFloat(style.paddingRight) || 0,
		bottom: Number.parseFloat(style.paddingBottom) || 0,
		left: Number.parseFloat(style.paddingLeft) || 0,
	};
	probe.remove();
	return insets;
}

/**
 * Corner placement needs a free corner and a mouse. Decided from the viewport
 * rather than the Ionic platform check so it also holds for a narrow desktop
 * window — and so it stays callable outside a browser.
 */
export function prefersCenteredPanel(): boolean {
	if (typeof window === "undefined") return false;
	const narrow = (window.innerWidth || 0) < 768;
	const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
	return narrow || coarse;
}
