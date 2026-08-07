/**
 * `uuid` replacement.
 *
 * The package existed only for `v4()`. Every platform this app ships to has
 * `crypto.randomUUID` — Android WebView 92+, iOS 15.4+, and the Capacitor
 * `capacitor://` / `https://` origins are secure contexts, so it is present
 * natively.
 *
 * The fallback is NOT dead code, and is not about old browsers: `randomUUID`
 * is exposed only in secure contexts, and `ionic serve --external` serves the
 * dev build over plain http on a LAN address. That is exactly how the app gets
 * tested on a real phone, and there `crypto.randomUUID` is undefined while
 * `crypto.getRandomValues` is not.
 */
export function uuidv4(): string {
	if (typeof crypto?.randomUUID === "function") {
		return crypto.randomUUID();
	}

	// RFC 4122 v4 from 16 CSPRNG bytes: set the version nibble to 4 and the
	// variant bits to 0b10, then hex-encode with the canonical dashes.
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex: string[] = [];
	for (const b of bytes) hex.push(b.toString(16).padStart(2, "0"));

	return [
		hex.slice(0, 4).join(""),
		hex.slice(4, 6).join(""),
		hex.slice(6, 8).join(""),
		hex.slice(8, 10).join(""),
		hex.slice(10, 16).join(""),
	].join("-");
}

/** Alias for call sites that imported `{ v4 }`. */
export const v4 = uuidv4;
