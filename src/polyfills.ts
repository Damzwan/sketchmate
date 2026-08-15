/** Runtime API shims for Android System WebViews older than our JS syntax target. */
export function installLegacyPolyfills(): void {
	if (typeof Object.hasOwn !== "function") {
		Object.defineProperty(Object, "hasOwn", {
			configurable: true,
			writable: true,
			value: (object: object, key: PropertyKey): boolean =>
				Reflect.apply(Object.prototype.hasOwnProperty, object, [key]),
		});
	}
}

installLegacyPolyfills();
