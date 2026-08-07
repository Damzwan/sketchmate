import { type ComputedRef, computed, type Ref } from "vue";
import {
	type Customization,
	hydrateCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveTitle,
	type Theme,
} from "@/config/profile_options.config";

export interface SenderStyle {
	customization: Customization;
	theme: Theme;
	fontFamily: string;
	fontEffectClass: string;
	title: string;
}

/**
 * Resolved presentation for one sender, memoised across every component that
 * asks for it.
 *
 * `hydrateCustomization` allocates, and `resolveTheme` / `resolveFontFamily` /
 * `resolveFontEffectClass` / `resolveTitle` are each a linear `.find()` over a
 * config array. Chat rendered one bubble per message and ran all five per
 * bubble — but a DM only ever has two distinct senders, and a lobby has as many
 * senders as people in the room. The work is per SENDER, not per message.
 */
const cache = new Map<string, SenderStyle>();

// Sender styling is a handful of ids per person; a few hundred entries is far
// more than any session needs. Wholesale clear (rather than LRU bookkeeping) is
// fine — the values are cheap to rebuild and this should essentially never hit.
const MAX_ENTRIES = 300;

/**
 * Identity of the *rendered result*, not of the object. Two different message
 * objects carrying the same sender and the same customization ids must share a
 * cache entry — which is the entire point — while an actual customization
 * change has to miss so the new look takes effect immediately.
 */
function styleKey(
	senderId: string,
	raw?: Partial<Customization> | null,
): string {
	if (!raw) return `${senderId}|-`;
	return [
		senderId,
		raw.themeId,
		raw.fontId,
		raw.fontEffectId,
		raw.titleId,
		raw.decorationId,
		raw.effectId,
		raw.worldId,
		raw.signaturePath,
		raw.backgroundSketchPath,
	].join("|");
}

export function resolveSenderStyle(sender: any): SenderStyle {
	const raw = sender?.customization as Partial<Customization> | undefined;
	const key = styleKey(sender?._id ?? "anon", raw);

	const hit = cache.get(key);
	if (hit) return hit;

	const customization = hydrateCustomization(raw);
	const style: SenderStyle = {
		customization,
		theme: resolveTheme(customization.themeId),
		fontFamily: resolveFontFamily(customization.fontId),
		fontEffectClass: resolveFontEffectClass(customization.fontEffectId),
		title: resolveTitle(customization.titleId),
	};

	if (cache.size >= MAX_ENTRIES) cache.clear();
	cache.set(key, style);
	return style;
}

/** Reactive wrapper for use in `setup()`. */
export function useSenderStyle(
	sender: Ref<any> | (() => any),
): ComputedRef<SenderStyle> {
	const get = typeof sender === "function" ? sender : () => sender.value;
	return computed(() => resolveSenderStyle(get()));
}
