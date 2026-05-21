import { defineStore } from "pinia";
import { computed, ref, shallowRef, triggerRef } from "vue";
import type { PublicUser } from "@/types/server.types";
import { getPartialUsers } from "@/service/api/user.api";

interface CacheEntry {
	data: PublicUser;
	fetchedAt: number;
}

const SOFT_TTL_MS = 5 * 60 * 1000;
const BATCH_DEBOUNCE_MS = 50;
const BATCH_MAX_SIZE = 100;

export const useUserCacheStore = defineStore("userCache", () => {
	const cache = shallowRef<Map<string, CacheEntry>>(new Map());

	// Pending batch — ids waiting to be flushed
	const pendingIds = new Set<string>();
	let pendingTimer: ReturnType<typeof setTimeout> | null = null;

	// In-flight dedupe — promises per id so concurrent reads of the same
	// missing user share one network round-trip
	const inflight = new Map<string, Promise<PublicUser | null>>();

	// ─── INTERNAL ──────────────────────────────────────────────────────────

	const writeMany = (users: PublicUser[]) => {
		if (!users.length) return;
		const next = new Map(cache.value);
		const now = Date.now();
		for (const u of users) {
			next.set(u._id, { data: u, fetchedAt: now });
		}
		cache.value = next;
		triggerRef(cache);
	};

	/**
	 * Flush the pending batch. Splits into chunks of BATCH_MAX_SIZE if
	 * needed. Resolves all in-flight promises for the included ids.
	 */
	const flushBatch = async () => {
		pendingTimer = null;
		const ids = Array.from(pendingIds);
		pendingIds.clear();
		if (!ids.length) return;

		// Chunk to respect server cap
		const chunks: string[][] = [];
		for (let i = 0; i < ids.length; i += BATCH_MAX_SIZE) {
			chunks.push(ids.slice(i, i + BATCH_MAX_SIZE));
		}

		try {
			const responses = await Promise.all(
				chunks.map((chunk) => getPartialUsers(chunk)),
			);
			const users = responses.flat();
			writeMany(users);

			// Resolve any in-flight promises with their actual data
			const byId = new Map(users.map((u) => [u._id, u]));
			for (const id of ids) {
				const resolver = inflightResolvers.get(id);
				if (resolver) {
					resolver(byId.get(id) || null);
					inflightResolvers.delete(id);
					inflight.delete(id);
				}
			}
		} catch (e) {
			// On failure, resolve waiters with null and let them fall back
			for (const id of ids) {
				const resolver = inflightResolvers.get(id);
				if (resolver) {
					resolver(null);
					inflightResolvers.delete(id);
					inflight.delete(id);
				}
			}
			console.error("[userCache] batch fetch failed:", e);
		}
	};

	/** Map of resolver functions for in-flight promises, keyed by id */
	const inflightResolvers = new Map<string, (v: PublicUser | null) => void>();

	/**
	 * Schedule an id for the next batch and return a promise that resolves
	 * once that batch completes.
	 */
	const enqueue = (id: string): Promise<PublicUser | null> => {
		// Already waiting on this id? Share the promise.
		const existing = inflight.get(id);
		if (existing) return existing;

		pendingIds.add(id);
		const p = new Promise<PublicUser | null>((resolve) => {
			inflightResolvers.set(id, resolve);
		});
		inflight.set(id, p);

		if (!pendingTimer) {
			pendingTimer = setTimeout(flushBatch, BATCH_DEBOUNCE_MS);
		}
		return p;
	};

	// ─── PUBLIC API ────────────────────────────────────────────────────────

	/**
	 * Synchronous lookup. Returns the cached entry or undefined.
	 * Use this when you want to render "what we have right now" without
	 * triggering a fetch — e.g. inside computed properties that re-evaluate
	 * cheaply.
	 */
	const peek = (id: string): PublicUser | undefined => {
		return cache.value.get(id)?.data;
	};

	/**
	 * Reactive lookup. Returns the cached entry (or undefined) and triggers
	 * a background fetch if the entry is missing or stale.
	 *
	 * Components should treat the result as stale-while-revalidate: render
	 * whatever's available immediately, the cache will replace it when
	 * fresh data arrives.
	 */
	const getUser = (id: string): PublicUser | undefined => {
		if (!id) return undefined;

		const entry = cache.value.get(id);

		// Cache miss — trigger a batched fetch, return undefined for now
		if (!entry) {
			enqueue(id);
			return undefined;
		}

		// Soft-stale — return current data and trigger a background refresh
		if (Date.now() - entry.fetchedAt > SOFT_TTL_MS && !inflight.has(id)) {
			enqueue(id);
		}

		return entry.data;
	};

	/**
	 * Batch read for components rendering lists. Returns an array in the
	 * same order as the input ids, with undefined for misses (which are
	 * automatically queued).
	 */
	const getUsers = (ids: string[]): (PublicUser | undefined)[] => {
		return ids.map((id) => getUser(id));
	};

	/**
	 * Await a single user's data. Use sparingly — for components that
	 * genuinely need to block on the fetch (e.g. opening a sheet).
	 * For list rendering prefer the reactive `getUser`.
	 */
	const fetchUser = async (id: string): Promise<PublicUser | null> => {
		const peeked = peek(id);
		if (peeked) {
			// Check for staleness; if stale, fall through to fetch
			const entry = cache.value.get(id);
			if (entry && Date.now() - entry.fetchedAt <= SOFT_TTL_MS) return peeked;
		}
		return enqueue(id);
	};

	/**
	 * Upsert from any source. Called by stores when they receive
	 * user-shaped payloads from API responses or socket events.
	 *
	 * Components shouldn't call this directly — it's for plumbing the
	 * cache from existing data flows (chat list responses, post fetches, etc).
	 */
	const upsert = (user: PublicUser | undefined | null) => {
		if (!user || !user._id) return;
		writeMany([user]);
	};

	/**
	 * Upsert multiple users at once. Used by list endpoints — chat list
	 * response, network list response, posts feed.
	 */
	const upsertMany = (users: (PublicUser | undefined | null)[]) => {
		const filtered = users.filter((u): u is PublicUser => !!u && !!u._id);
		writeMany(filtered);
	};

	/**
	 * Evict a single user. Use when blocking — we don't want the blocked
	 * user's customization/avatar lingering around the UI.
	 */
	const invalidate = (id: string) => {
		if (!cache.value.has(id)) return;
		const next = new Map(cache.value);
		next.delete(id);
		cache.value = next;
		triggerRef(cache);
	};

	/**
	 * Nuke everything. Called on logout.
	 */
	const clear = () => {
		cache.value = new Map();
		pendingIds.clear();
		inflight.clear();
		inflightResolvers.clear();
		if (pendingTimer) {
			clearTimeout(pendingTimer);
			pendingTimer = null;
		}
	};

	// Debug helpers — useful in dev
	const size = computed(() => cache.value.size);

	return {
		peek,
		getUser,
		getUsers,
		fetchUser,
		upsert,
		upsertMany,
		invalidate,
		clear,
		size,
	};
});
