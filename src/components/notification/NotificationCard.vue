<template>
  <div
    @click="handleTap"
    class="notification-card relative rounded-[1.75rem] border transition-all duration-200 active:scale-[0.98] hover:border-[var(--ion-color-secondary)]/30"
    :class="[
      notification.read
        ? 'bg-white/20 border-[var(--ion-color-dark)]/10 shadow-none'
        : 'bg-[var(--ion-color-tertiary)] border-[var(--ion-color-dark)]/25 shadow-sm'
    ]"
  >
    <div
      v-if="!notification.read"
      class="absolute top-[22px] left-3 w-2 h-2 rounded-full z-10"
      :style="{ backgroundColor: accentColor }"
    />

    <div class="flex items-center gap-3.5 p-3.5 pl-7.5">

      <div class="shrink-0 relative select-none">
        <div v-if="notification.actors.length > 1" class="flex -space-x-3 overflow-visible">
          <img
            v-for="(actor, i) in notification.actors.slice(0, 2)"
            :key="actor._id"
            :src="actor.img"
            class="w-10 h-10 rounded-full border-2 border-[var(--ion-color-tertiary)] object-cover shadow-sm relative"
            :class="[
              i === 1 ? 'z-0 translate-x-0.5' : 'z-10',
              notification.read ? 'opacity-90 grayscale-[0.15]' : 'opacity-100'
            ]"
            :alt="actor.name"
          />
        </div>

        <img
          v-else-if="notification.actors[0]"
          :src="notification.actors[0].img"
          class="w-10 h-10 rounded-full object-cover border border-[var(--ion-color-dark)]/10 shadow-sm"
          :class="notification.read ? 'opacity-90 ' : 'opacity-100'"
          :alt="notification.actors[0].name"
        />

        <div
          v-else
          class="w-10 h-10 rounded-full flex items-center justify-center border bg-white/60"
          :style="{ borderColor: accentColor + '30' }"
        >
          <ion-icon :icon="svg(systemIcon)" class="text-base" :style="{ color: accentColor }" />
        </div>
      </div>

      <div class="flex-1 min-w-0 flex flex-col justify-center text-left">
        <p class="text-[13px] leading-snug text-[var(--ion-color-dark)] tracking-tight">
          <span :class="notification.read ? 'font-bold opacity-90' : 'font-black'">
            {{ headline }}
          </span>
          <span :class="notification.read ? 'font-medium opacity-80 ml-1' : 'font-bold text-[var(--ion-color-dark)]/80 ml-1'">
            {{ body }}
          </span>
        </p>

        <div
          v-if="notification.target_preview?.text"
          class="text-[11px] tracking-tight mt-2 line-clamp-2 italic border p-2 rounded-2xl"
          :class="[
            notification.read
              ? 'bg-white/10 border-[var(--ion-color-dark)]/5 text-[var(--ion-color-dark)]/50 font-medium'
              : 'bg-white/50 border-[var(--ion-color-dark)]/10 text-[var(--ion-color-dark)]/80 font-bold shadow-inner'
          ]"
        >
          "{{ notification.target_preview.text }}"
        </div>

        <span class="text-[8px] font-black mt-1.5 uppercase tracking-wider leading-none text-[var(--ion-color-dark)]/40">
          {{ dayjs(notification.updatedAt).fromNow() }}
        </span>
      </div>

      <div
        v-if="notification.target_preview?.thumbnail"
        class="shrink-0 w-12 h-12 rounded-xl overflow-hidden border p-0.5 bg-white shadow-sm transition-all"
        :class="notification.read ? 'border-[var(--ion-color-dark)]/10 opacity-80' : 'border-primary/80'"
      >
        <img
          :src="notification.target_preview.thumbnail"
          class="w-full h-full object-cover rounded-lg"
          alt="Target illustration thumbnail"
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
import relativeTime from "dayjs/plugin/relativeTime";
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

dayjs.extend(relativeTime);

const props = defineProps<{ notification: Notification }>();
const store = useInAppNotificationStore();

const typeConfig = computed(() => {
	switch (props.notification.type) {
		case "post_reaction":
			return {
				color: "var(--ion-color-secondary)",
				icon: mdiHeart,
				verb: (n: number) =>
					n === 1
						? "loved your canvas post"
						: `and ${n - 1} others loved your post`,
			};
		case "post_comment":
			return {
				color: "var(--ion-color-secondary)",
				icon: mdiChatOutline,
				verb: () => "commented on your post",
			};
		case "inbox_comment":
			return {
				color: "var(--ion-color-secondary)",
				icon: mdiChatOutline,
				verb: (n: number) =>
					n === 1
						? "commented on a canvas drawing"
						: `and ${n - 1} others commented`,
			};
		case "follow":
			return {
				color: "var(--ion-color-success, #2fdf75)",
				icon: mdiAccountPlus,
				verb: (n: number) =>
					n === 1
						? "started following your sketches"
						: `and ${n - 1} others started following you`,
			};
		case "inbox_drawing":
			return {
				color: "var(--ion-color-warning, #ffd534)",
				icon: mdiPencilOutline,
				verb: () => "shared a drawing with you",
			};
		case "moderation_strike":
			return {
				color: "var(--ion-color-danger, #f04141)",
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
				color: "var(--ion-color-secondary)",
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
	if (props.notification.type === "moderation_strike") {
		return props.notification.payload?.name ?? "Account restriction";
	}
	if (props.notification.type === "moderation_lifted") {
		return "Welcome back";
	}
	if (props.notification.type === "announcement") {
		return props.notification.payload?.title ?? "Announcement";
	}
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
			if (n.target_id) openSharedPost(n.target_id);
			break;
		case "inbox_item":
			if (n.target_id) openSharedInboxItem(n.target_id);
			break;
		case "user":
			if (n.target_id) openUserActions({ _id: n.target_id });
			break;
		case "system":
			if (n.type === "moderation_strike" || n.type === "moderation_lifted") {
				r.push(FRONTEND_ROUTES.moderation, masterAnimation);
			}
			break;
	}
}
</script>