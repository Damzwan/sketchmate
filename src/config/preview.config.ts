import { computed } from "vue";
import { useWindowSize } from "@vueuse/core";

// Shared sizing presets for <PreviewSurfacePager>. One place to tune every
// preview surface instead of hand-editing props in each modal.
//
//   PICKER   — compact, lives in a modal's sticky #sub-header so it stays
//              visible while the user scrolls the option grid below. Kept small
//              enough to leave room for that grid, but big enough to read.
//   SHOWCASE — the shop's "show it off" surface. Scrolls with the content, so
//              it can go wide + tall for a big, squint-free look.
//
// v-bind one of these onto the pager; pass user / customization / active
// separately (those are per-modal, not sizing).

export const PICKER_PREVIEW = {
	paneWidth: "min(92%, 480px)",
	paneHeight: 330,
	postImgMaxHeight: "210px",
	cardZoom: 0.56,
	postZoom: 0.7,
	chatZoom: 1,
	// Pickers are compact — the fullscreen blow-up matters most here.
	zoomable: true,
} as const;

// Short screens (iPhone SE ~667px tall, small Androids): the full-size PICKER
// eats the whole modal so the option grid below can't be reached. Shrink the
// preview so the picker stays usable. Applied reactively by usePickerPreview()
// below the breakpoint. Sizing is inline (CSS vars + a numeric height), so a
// CSS media query can't override it — the swap has to happen in JS.
export const PICKER_PREVIEW_COMPACT = {
	paneWidth: "min(88%, 360px)",
	paneHeight: 232,
	postImgMaxHeight: "150px",
	cardZoom: 0.38,
	postZoom: 0.52,
	chatZoom: 0.9,
	// On tiny screens the inline preview is smallest — fullscreen matters even more.
	zoomable: true,
} as const;

// Viewport heights at or below this get the compact picker. 700px clears the
// iPhone SE (667) and similarly short devices.
export const SHORT_VIEWPORT_MAX_H = 700;

// Reactive picker sizing: full-size normally, compact on short screens. Bind
// the returned computed onto the pager (v-bind) in every customization modal —
// it re-evaluates live on rotate/resize.
export function usePickerPreview() {
	const { height } = useWindowSize();
	return computed(() =>
		height.value <= SHORT_VIEWPORT_MAX_H
			? PICKER_PREVIEW_COMPACT
			: PICKER_PREVIEW,
	);
}

export const SHOWCASE_PREVIEW = {
	paneWidth: "min(92%, 480px)",
	paneHeight: 440,
	postImgMaxHeight: "300px",
	cardZoom: 0.72,
	postZoom: 0.7,
	chatZoom: 1,
	zoomable: true,
} as const;
