<!-- components/notification/NotificationCard.vue -->
<template>
  <div
    class="notification-card relative rounded-[2rem] border border-black/5 shadow-sm overflow-hidden transition-all active:scale-[0.98]"
    :class="{ 'opacity-70': notification.read }"
    :style="{ backgroundColor: 'var(--ion-color-tertiary)' }"
    @click="handleTap"
  >
    <!-- Accent stripe (color-coded by type) -->
    <div
      class="absolute left-0 top-0 bottom-0 w-1.5"
      :style="{ backgroundColor: accentColor }"
    />

    <!-- Unread pip -->
    <div
      v-if="!notification.read"
      class="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
      :style="{ backgroundColor: accentColor }"
    />

    <div class="flex items-center gap-3 p-4 pl-5">
      <!-- Actor cluster (stacked avatars for aggregated entries) -->
      <div class="shrink-0 relative">
        <div v-if="notification.actors.length > 1" class="flex -space-x-2">
          <img
            v-for="(actor, i) in notification.actors.slice(0, 2)"
            :key="actor._id"
            :src="actor.img"
            class="w-10 h-10 rounded-full border-2 border-white object-cover"
            :class="i === 1 ? 'z-0' : 'z-10'"
            :alt="actor.name"
          />
        </div>
        <img
          v-else-if="notification.actors[0]"
          :src="notification.actors[0].img"
          class="w-10 h-10 rounded-full object-cover"
          :alt="notification.actors[0].name"
        />
        <!-- System notifications get an icon instead -->
        <div
          v-else
          class="w-10 h-10 rounded-full flex items-center justify-center"
          :style="{ backgroundColor: accentColor + '20' }"
        >
          <ion-icon :icon="svg(systemIcon)" class="text-xl" :style="{ color: accentColor }" />
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 min-w-0 pr-4">
        <p class="text-sm leading-snug text-black/90">
          <span class="font-black">{{ headline }}</span>
          <span class="text-black/70">{{ ' ' + body }}</span>
        </p>
        <p
          v-if="notification.target_preview?.text"
          class="text-xs text-black/50 mt-1 line-clamp-1 italic"
        >
          "{{ notification.target_preview.text }}"
        </p>
        <p class="text-[10px] font-bold text-black/40 mt-1 uppercase tracking-widest">
          {{ dayjs(notification.updatedAt).fromNow() }}
        </p>
      </div>

      <!-- Optional thumbnail (for post/inbox events) -->
      <div
        v-if="notification.target_preview?.thumbnail"
        class="shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-black/5"
      >
        <img
          :src="notification.target_preview.thumbnail"
          class="w-full h-full object-cover"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonIcon, useIonRouter } from "@ionic/vue";
import {
	mdiAccountPlus,
	mdiBullhorn,
	mdiChatOutline,
	mdiHeart,
	mdiPencilOutline,
	mdiShieldAlertOutline,
} from "@mdi/js";
import dayjs from "dayjs";
import { svg } from "@/helper/general.helper";
import type { Notification } from "@/types/server.types";
import { useInAppNotificationStore } from "@/store/inAppNotificationStore";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { usePostStore } from "@/store/post.store";
import { useInboxStore } from "@/store/inbox.store";
import { useInboxSwiper } from "@/composables/gallery/useInboxSwiper";
import { usePostSwiper } from "@/composables/home/usePostSwiper";

const props = defineProps<{ notification: Notification }>();

const store = useInAppNotificationStore();

// ─── Type-specific rendering ──────────────────────────────────────────

const typeConfig = computed(() => {
	switch (props.notification.type) {
		case "post_reaction":
			return {
				color: "var(--ion-color-danger)",
				icon: mdiHeart,
				verb: (n: number) =>
					n === 1
						? "reacted to your post"
						: `and ${n - 1} others reacted to your post`,
			};
		case "post_comment":
			return {
				color: "var(--ion-color-primary)",
				icon: mdiChatOutline,
				verb: () => "commented on your post",
			};
		case "inbox_comment":
			return {
				color: "var(--ion-color-primary)",
				icon: mdiChatOutline,
				verb: (n: number) =>
					n === 1 ? "commented on a drawing" : `and ${n - 1} others commented`,
			};
		case "follow":
			return {
				color: "var(--ion-color-success)",
				icon: mdiAccountPlus,
				verb: (n: number) =>
					n === 1
						? "started following you"
						: `and ${n - 1} others started following you`,
			};
		case "inbox_drawing":
			// Edge case — not normally surfaced here since inbox_drawing has in_app:false,
			// but kept for completeness in case you change the policy later.
			return {
				color: "var(--ion-color-warning)",
				icon: mdiPencilOutline,
				verb: () => "sent you a drawing",
			};
		case "moderation_strike":
			return {
				color: "var(--ion-color-danger)",
				icon: mdiShieldAlertOutline,
				verb: () => "",
			};
		case "moderation_lifted":
			return {
				color: "var(--ion-color-success)",
				icon: mdiShieldAlertOutline,
				verb: () => "",
			};
		case "announcement":
			return {
				color: "var(--ion-color-primary)",
				icon: mdiBullhorn,
				verb: () => "",
			};
		default:
			return {
				color: "var(--ion-color-medium)",
				icon: mdiBullhorn,
				verb: () => "",
			};
	}
});

const accentColor = computed(() => typeConfig.value.color);
const systemIcon = computed(() => typeConfig.value.icon);

const headline = computed(() => {
	// Moderation/announcement: no actor, headline comes from payload
	if (props.notification.type === "moderation_strike") {
		return props.notification.payload?.name ?? "Account update";
	}
	if (props.notification.type === "moderation_lifted") {
		return "Welcome back";
	}
	if (props.notification.type === "announcement") {
		return props.notification.payload?.title ?? "Announcement";
	}
	// Standard: first actor's name
	return props.notification.actors[0]?.name ?? "Someone";
});

const body = computed(() => {
	if (props.notification.type === "moderation_strike") {
		return props.notification.payload?.description ?? "";
	}
	if (props.notification.type === "moderation_lifted") {
		return "Your restriction has been lifted.";
	}
	if (props.notification.type === "announcement") {
		return props.notification.payload?.body ?? "";
	}
	return typeConfig.value.verb(props.notification.actor_count);
});

const postStore = usePostStore();
const inboxStore = useInboxStore();
const { openInboxSwiper } = useInboxSwiper();
const { openPostSwiper } = usePostSwiper();

const openSharedPost = async (_id: string) => {
	const post = await postStore.fetchSinglePost(_id);
	if (post) openPostSwiper([post], 0);
};

const openSharedInboxItem = async (_id: string) => {
	const item = await inboxStore.fetchSingleInboxItem(_id);
	if (item) openInboxSwiper([item], 0);
};

const r = useIonRouter();
const { openUserActions } = useUserContextSheet();
async function handleTap() {
	await store.markRead(props.notification._id);

	const n = props.notification;
	switch (n.target_type) {
		case "post":
			if (n.target_id) {
				openSharedPost(n.target_id);
			}
			break;
		case "inbox_item":
			if (n.target_id) {
				openSharedInboxItem(n.target_id);
			}
			break;
		case "user":
			if (!n.target_id) return;
			openUserActions({ _id: n.target_id });
			break;
		case "system":
			if (n.type === "moderation_strike" || n.type === "moderation_lifted") {
				r.push(FRONTEND_ROUTES.moderation, masterAnimation);
			}
			break;
	}
}
</script>