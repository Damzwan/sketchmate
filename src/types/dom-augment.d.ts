/**
 * Vendor-prefixed DOM surface that lib.dom does not declare but that the app
 * still needs on older Android System WebViews.
 */
interface CSSStyleDeclaration {
	/**
	 * `-webkit-clip-path`. Required alongside the unprefixed `clipPath` for
	 * WebViews that predate unprefixed clip-path support; the transform
	 * controller writes and restores both.
	 */
	webkitClipPath: string;
}
