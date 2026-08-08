<template>
  <div
    @click="handleTap"
    class="notification-card relative rounded-[2.25rem] border bg-tertiary transition-all duration-300 active:scale-[0.98] cursor-pointer group border-primary/40 shadow-sm hover:border-secondary/40 hover:-translate-y-0.5 hover:shadow-md"
  >
    <!-- Accent Unread Indicator Placed Elegantly -->
    <div
      v-if="!notification.read"
      class="absolute top-[26px] left-3.5 md:left-4 w-2 h-2 rounded-full z-10 animate-pulse"
      :style="{ backgroundColor: accentColor }"
    />

    <div class="flex items-center gap-4 p-4 pl-8 md:p-5 md:pl-10">

      <!-- Actor / System Icon Avatars -->
      <div class="shrink-0 relative select-none">
        <div v-if="notification.actors.length > 1" class="flex -space-x-3.5 md:-space-x-4 overflow-visible">
          <img
            v-for="(actor, i) in notification.actors.slice(0, 2)"
            :key="actor._id"
            :src="actor.img"
            class="w-11 h-11 md:w-12 md:h-12 rounded-full border border-primary/20 object-cover shadow-sm relative transition-all"
            :class="[
              i === 1 ? 'z-0 translate-x-1' : 'z-10',
              notification.read ? 'opacity-80 grayscale-[0.1]' : 'opacity-100'
            ]"
            :alt="actor.name"
          />
        </div>

        <img
          v-else-if="notification.actors[0]"
          :src="notification.actors[0].img"
          class="w-11 h-11 md:w-12 md:h-12 rounded-full object-cover border border-primary/20 shadow-sm transition-all"
          :class="notification.read ? 'opacity-80' : 'opacity-100'"
          :alt="notification.actors[0].name"
        />

        <div
          v-else
          class="w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center border border-primary/20 bg-white/40 shadow-sm"
        >
          <ion-icon :icon="svg(systemIcon)" class="text-xl" :style="{ color: accentColor }" />
        </div>
      </div>

      <!-- Text Payload Content Block -->
      <div class="flex-1 min-w-0 flex flex-col justify-center text-left pointer-events-none">
        <p class="text-[14px] md:text-[15px] leading-snug text-black/90 tracking-tight">
          <span :class="notification.read ? 'font-black text-black/80' : 'font-black'">
            {{ headline }}
          </span>
          <span :class="notification.read ? 'font-medium text-black/80 ml-1' : 'font-bold text-black/80 ml-1'">
            {{ body }}
          </span>
        </p>

        <!-- Quote / Message Content Previews -->
        <div
          v-if="notification.target_preview?.text"
          class="text-xs md:text-[13px] tracking-tight mt-2 line-clamp-2 italic border px-3 py-2 rounded-2xl transition-colors"
          :class="[
            notification.read
              ? 'bg-black/5 border-primary/5 text-black/80 font-medium'
              : 'bg-white/40 border-primary/10 text-black/80 font-bold shadow-inner'
          ]"
        >
          "{{ notification.target_preview.text }}"
        </div>

        <span class="text-[9px] md:text-[10px] mt-2 uppercase tracking-widest leading-none text-black/80">
          {{ dayjs(notification.updatedAt).fromNow() }}
        </span>
      </div>

      <!-- Target Artwork Thumbnail -->
      <div
        v-if="notification.target_preview?.thumbnail"
        class="shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden border p-0.5 bg-white/60 shadow-sm transition-all group-hover:scale-[1.03]"
        :class="notification.read ? 'border-primary/10 opacity-60' : 'border-primary/30'"
      >
        <img
          :src="notification.target_preview.thumbnail"
          class="w-full h-full object-cover rounded-xl"
          alt="Target illustration thumbnail"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, useIonRouter } from "@ionic/vue";
import {
	mdiAccountPlus,
	mdiBullhorn,
	mdiChatOutline,
	mdiHeart,
	mdiPencilOutline,
	mdiShieldAlertOutline,
	mdiTrophyOutline,
} from "@mdi/js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { computed } from "vue";
import { useCompetitionEntryViewer } from "@/composables/competition/useCompetitionEntryViewer";
import { useInboxSwiper } from "@/composables/gallery/useInboxSwiper";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { masterAnimation } from "@/helper/animation.helper";
import { svg } from "@/helper/general.helper";
import { useCompetitionStore } from "@/store/competition.store";
import { useInAppNotificationStore } from "@/store/inAppNotificationStore";
import { useInboxStore } from "@/store/inbox.store";
import { useMenuStore } from "@/store/menu.store";
import { usePostStore } from "@/store/post.store";
import { FRONTEND_ROUTES } from "@/types/router.types";
import type { Notification } from "@/types/server.types";

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
		case "moderation_content":
			// Review is a temporary, neutral state; removal is not. Colouring both red
			// would tell someone whose post is merely queued that they've been
			// penalised.
			return {
				color:
					props.notification.payload?.status === "removed"
						? "var(--ion-color-danger, #f04141)"
						: props.notification.payload?.status === "restored"
							? "var(--ion-color-success)"
							: "var(--ion-color-warning, #ffd534)",
				icon: mdiShieldAlertOutline,
				verb: () => "",
			};
		case "announcement":
			return {
				color: "var(--ion-color-secondary)",
				icon: mdiBullhorn,
				verb: () => "",
			};
		case "competition":
			return {
				color: "var(--ion-color-secondary)",
				icon:
					props.notification.payload?.kind === "entry_comment"
						? mdiChatOutline
						: mdiTrophyOutline,
				verb: (n: number) =>
					n === 1
						? "commented on your competition entry"
						: `and ${n - 1} others commented on your entry`,
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
	if (props.notification.type === "moderation_content") {
		return props.notification.payload?.title ?? "Content update";
	}
	if (props.notification.type === "announcement") {
		return props.notification.payload?.title ?? "Announcement";
	}
	if (props.notification.type === "competition") {
		// A comment is a person doing something; everything else on this type is
		// the system talking, so it leads with its own title.
		if (props.notification.payload?.kind === "entry_comment") {
			return props.notification.actors[0]?.name ?? "Someone";
		}
		return props.notification.payload?.title ?? "Weekly competition";
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
	if (props.notification.type === "moderation_content") {
		return props.notification.payload?.body ?? "";
	}
	if (props.notification.type === "announcement") {
		return props.notification.payload?.body ?? "";
	}
	if (props.notification.type === "competition") {
		if (props.notification.payload?.kind === "entry_comment") {
			return typeConfig.value.verb(props.notification.actor_count);
		}
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
const { openEntryById } = useCompetitionEntryViewer();

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
			if (n.type === "competition") {
				const competitionId = n.payload?.competition_id;
				const entryId = n.payload?.entry_id;

				// A comment opens the drawing it was left on, right here — reading a
				// reply is not a reason to move the user off the notification list
				// and strand them on the competition page when they close it.
				if (n.payload?.kind === "entry_comment" && entryId) {
					void openEntryById(entryId, true);
					break;
				}

				// Submissions closing is a state change on the page, not a podium.
				if (n.payload?.kind === "submissions_closed") {
					r.push(FRONTEND_ROUTES.competition, masterAnimation);
					break;
				}

				if (competitionId) {
					useCompetitionStore().targetResults(competitionId);
					useMenuStore().isCompetitionResultsOpen = true;
				} else {
					r.push(FRONTEND_ROUTES.competition, masterAnimation);
				}
				break;
			}
			if (
				n.type === "moderation_strike" ||
				n.type === "moderation_lifted" ||
				n.type === "moderation_content"
			) {
				r.push(FRONTEND_ROUTES.moderation, masterAnimation);
			}
			break;
	}
}
</script>
