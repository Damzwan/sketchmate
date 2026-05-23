// store/notification.store.ts
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Notification } from "@/types/server.types";
import {
	fetchNotifications,
	fetchNotificationCounts,
	markAllSeen as apiMarkAllSeen,
	markRead as apiMarkRead,
	deleteNotification as apiDeleteNotification,
} from "@/service/api/notification.api";
import { socket } from "@/service/api/socket/socket.service";
import dayjs from "dayjs";

export const useInAppNotificationStore = defineStore(
	"inAppNotification",
	() => {
		// ─── State ───────────────────────────────────────────────────────
		const notifications = ref<Notification[]>([]);
		const unseen = ref(0);
		const unread = ref(0);
		const isLoading = ref(false);
		const isLoadingMore = ref(false);
		const hasMore = ref(true);

		// ─── Derived ─────────────────────────────────────────────────────
		const hasUnseen = computed(() => unseen.value > 0);
		const groupedByDay = computed(() => {
			// Bucket entries by day for the page UI ("Today", "Yesterday", "Earlier")
			const groups = new Map<string, Notification[]>();
			for (const n of notifications.value) {
				const key = dayKey(n.updatedAt);
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key)!.push(n);
			}
			return groups;
		});

		// ─── Actions ─────────────────────────────────────────────────────

		async function loadInitial() {
			if (isLoading.value) return;
			isLoading.value = true;
			try {
				const [feed, counts] = await Promise.all([
					fetchNotifications({ limit: 30 }),
					fetchNotificationCounts(),
				]);
				notifications.value = feed.data;
				hasMore.value = feed.hasMore;
				unseen.value = counts.unseen;
				unread.value = counts.unread;
			} finally {
				isLoading.value = false;
			}
		}

		async function loadMore() {
			if (isLoadingMore.value || !hasMore.value) return;
			const last = notifications.value[notifications.value.length - 1];
			if (!last) return;

			isLoadingMore.value = true;
			try {
				const res = await fetchNotifications({
					before: last.updatedAt,
					limit: 20,
				});
				notifications.value.push(...res.data);
				hasMore.value = res.hasMore;
			} finally {
				isLoadingMore.value = false;
			}
		}

		async function refreshCounts() {
			const counts = await fetchNotificationCounts();
			unseen.value = counts.unseen;
			unread.value = counts.unread;
		}

		/**
		 * Called when the user opens the bell / notification page.
		 * Zero the unseen counter optimistically, fire the server call.
		 */
		async function markAllSeen() {
			if (unseen.value === 0) return;
			unseen.value = 0;
			notifications.value = notifications.value.map((n) => ({
				...n,
				seen: true,
			}));
			try {
				await apiMarkAllSeen();
			} catch (e) {
				// Worst case: counter drifts until next refresh
				console.error("markAllSeen failed:", e);
			}
		}

		async function markRead(id: string) {
			const entry = notifications.value.find((n) => n._id === id);
			if (!entry || entry.read) return;

			entry.read = true;
			entry.seen = true;
			unread.value = Math.max(0, unread.value - 1);

			try {
				await apiMarkRead(id);
			} catch (e) {
				console.error("markRead failed:", e);
			}
		}

		async function dismiss(id: string) {
			const idx = notifications.value.findIndex((n) => n._id === id);
			if (idx === -1) return;
			const removed = notifications.value.splice(idx, 1)[0];
			if (removed && !removed.read)
				unread.value = Math.max(0, unread.value - 1);
			if (removed && !removed.seen)
				unseen.value = Math.max(0, unseen.value - 1);
			try {
				await apiDeleteNotification(id);
			} catch (e) {
				// Roll back
				notifications.value.splice(idx, 0, removed);
				console.error("dismiss failed:", e);
			}
		}

		function registerSocketListener() {
			if (!socket) return;
			socket.on(
				"notification:new",
				(payload: { notification: Notification }) => {
					ingest(payload.notification);
				},
			);
		}

		function ingest(n: Notification) {
			let replacedExisting: Notification | undefined;

			if (n.aggregation_key) {
				const existingIdx = notifications.value.findIndex(
					(existing) => existing.aggregation_key === n.aggregation_key,
				);
				if (existingIdx !== -1) {
					replacedExisting = notifications.value[existingIdx];
					notifications.value.splice(existingIdx, 1);
				}
			}

			notifications.value.unshift(n);

			if (replacedExisting) {
				if (replacedExisting.seen && !n.seen) unseen.value++;
				if (replacedExisting.read && !n.read) unread.value++;
			} else {
				if (!n.seen) unseen.value++;
				if (!n.read) unread.value++;
			}
		}

		function reset() {
			notifications.value = [];
			unseen.value = 0;
			unread.value = 0;
			hasMore.value = true;
		}

		async function markAllRead() {
			const hasUnread = notifications.value.some((n) => !n.read);
			if (!hasUnread) return;

			notifications.value = notifications.value.map((n) => ({
				...n,
				read: true,
				seen: true,
			}));
			unread.value = 0;
			unseen.value = 0;

			try {
				await apiMarkAllSeen();
			} catch (e) {
				console.error("markAllRead failed:", e);
				// Refresh from server to recover
				void refreshCounts();
			}
		}

		return {
			notifications,
			unseen,
			unread,
			isLoading,
			isLoadingMore,
			hasMore,
			hasUnseen,
			groupedByDay,
			loadInitial,
			loadMore,
			refreshCounts,
			markAllSeen,
			markRead,
			dismiss,
			registerSocketListener,
			ingest,
			reset,
			markAllRead,
		};
	},
);

function dayKey(iso: string): string {
	const d = dayjs(iso);
	if (d.isToday()) return "Today";
	if (d.isYesterday()) return "Yesterday";
	return "Earlier";
}
