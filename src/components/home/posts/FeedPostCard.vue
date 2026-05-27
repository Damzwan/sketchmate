<template>
  <div class="post-container relative w-full overflow-visible" :data-post-id="post._id">
    <div
      class="rounded-[2.25rem] border border-primary/40 shadow-sm overflow-hidden pt-3.5 flex flex-col h-full bg-tertiary"
    >
      <div class="px-4 pb-3 shrink-0">
        <div class="flex items-center justify-between">
          <button
            @click="openUser(post.author._id)"
            class="flex items-center active:scale-98 transition-all text-left min-w-0"
          >
            <div class="flex items-center justify-center shrink-0">
              <UserAvatar
                :user="post.author"
                :customization="authorCustomization"
                size="sm"
                static
              />
            </div>

            <div class="ml-3 flex flex-col justify-center min-w-0">
              <div class="flex items-baseline gap-1 truncate">
                <p
                  class="text-[14px] leading-none font-black drop-shadow-sm truncate"
                  :class="fontEffectClass"
                  :style="{ color: theme.nameColor, fontFamily: resolvedFontFamily }"
                >
                  {{ post.author.name }}
                </p>
                <span
                  v-if="displayTitle"
                  class="text-[9px] font-black uppercase tracking-widest opacity-50 shrink-0 truncate ml-0.5"
                  :style="{ color: theme.descColor }"
                >
                  · {{ displayTitle }}
                </span>
              </div>
              <p class="text-[8px] text-black/40 font-black uppercase mt-1 tracking-wider">
                {{ dayjs(post.createdAt).fromNow() }}
              </p>
            </div>
          </button>

          <button @click="presentActionSheet" class="p-2 active:scale-90 transition-transform shrink-0 text-black/30 hover:text-black">
            <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-xl" />
          </button>
        </div>

        <p v-if="post.description" class="cabin-sketch-regular text-base font-bold text-black/80 line-clamp-2 mt-2 px-0.5 leading-snug">
          {{ post.description }}
        </p>
      </div>

      <div
        class="relative w-full flex items-center justify-center overflow-hidden bg-[#FAF8F5] border-y border-primary/10 select-none"
        @dblclick="handleDoubleTap"
      >
        <img
          :src="post.image_url"
          class="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-40 pointer-events-none transition-opacity duration-500"
          :class="imageLoaded ? 'opacity-40' : 'opacity-0'"
          alt=""
        />

        <div class="absolute inset-0 z-[5] pointer-events-none dynamic-edge-vignette" />

        <img
          :src="post.image_url"
          class="relative z-10 w-full object-contain transition-opacity duration-500 max-h-[50vh]"
          :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
          @load="imageLoaded = true"
          alt="Main illustration content"
        />

        <div
          v-if="authorCustomization.signaturePath"
          class="absolute bottom-2 right-2 z-20 pointer-events-none transition-opacity duration-500"
          :class="imageLoaded ? 'opacity-80' : 'opacity-0'"
        >
          <svg
            class="w-20 h-20 filter drop-shadow-sm"
            :viewBox="authorCustomization.signatureViewBox || '0 0 300 150'"
            preserveAspectRatio="xMidYMid meet"
          >
            <path
              :d="authorCustomization.signaturePath"
              fill="none"
              :stroke="theme.accentColor || 'var(--ion-color-secondary)'"
              :stroke-width="signatureStrokeWidth"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <div v-if="activeAnim" class="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <img :src="reactionImages[activeAnim]" class="w-24 h-24 drop-shadow-xl anim-float-up object-contain" alt="" />
        </div>
      </div>

      <div class="px-4 py-2 flex items-center justify-between bg-white/40 shrink-0 border-b border-primary/5">
        <div class="flex items-center gap-3">
          <button
            @click="(e) => $emit('open-reaction-popover', { event: e, post })"
            class="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform bg-white/60 shadow-sm rounded-full border border-black/5"
          >
            <img
              :src="post.user_reaction ? reactionImages[post.user_reaction] : reactionImages.heart"
              class="w-5 h-5 object-contain transition-all"
              :class="{ 'grayscale opacity-40': !post.user_reaction, 'scale-110': post.user_reaction }"
              alt="heart"
            />
          </button>

          <button
            v-if="post.enable_comments"
            @click="$emit('open-comments', post)"
            class="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform bg-white/60 shadow-sm rounded-full border border-black/5 text-black/60 hover:text-black"
          >
            <ion-icon :icon="svg(mdiChatOutline)" class="text-lg mt-0.5" />
          </button>

          <button
            @click="openShare"
            class="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform bg-white/60 shadow-sm rounded-full border border-black/5 text-black/60 hover:text-black"
          >
            <ion-icon :icon="svg(mdiSendOutline)" class="text-base -rotate-12 ml-0.5" />
          </button>
        </div>

        <div class="flex items-center">
          <button
            v-if="post.enable_remix"
            @click="remixPost"
            class="px-3 h-8 flex items-center gap-1.5 active:scale-95 transition-all bg-secondary hover:bg-secondary-shade text-white font-black text-[10px] uppercase tracking-wider rounded-full shadow-sm"
          >
            <ion-icon :icon="svg(mdiPencilOutline)" class="text-xs" />
            <span>Remix</span>
          </button>
        </div>
      </div>

      <div class="px-4 pt-2.5 pb-4 bg-white/20 shrink-0 flex flex-col gap-2">
        <div v-if="activeReactions.length > 0" class="flex items-center gap-1.5">
          <div class="flex items-center overflow-visible">
            <img
              v-for="(key, i) in activeReactions.slice(0, 3)"
              :key="key"
              :src="reactionImages[key]"
              class="w-5 h-5 object-contain drop-shadow-sm border border-white/50 rounded-full bg-white"
              :class="i !== 0 ? '-ml-1.5' : ''"
              alt="reaction stack"
            />
          </div>
          <span class="text-[11px] font-black text-black/40 mt-0.5">
            {{ totalReactionCount }} reactions
          </span>
        </div>

        <div
          v-if="post.comments?.length || post.comment_count"
          @click="$emit('open-comments', post)"
          class="cursor-pointer active:opacity-70 transition-opacity bg-white/30 rounded-2xl p-2.5 border border-black/5"
        >
          <div v-for="comment in post.comments?.slice(0, 2)" :key="comment._id" class="flex items-start gap-1.5 mb-1 last:mb-0 text-xs">
            <span class="text-black font-black shrink-0 tracking-tight">{{ comment.author.name }}</span>
            <span class="text-black/70 truncate tracking-tight">{{ comment.message }}</span>
          </div>

          <p class="text-[9px] font-black text-secondary mt-1.5 uppercase tracking-widest leading-none">
            View all {{ post.comment_count }} comments
          </p>
        </div>

        <p
          v-else
          @click="$emit('open-comments', post)"
          class="text-[9px] font-black text-black/30 uppercase tracking-widest cursor-pointer active:opacity-60 px-1 py-1"
        >
          Start the conversation...
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { actionSheetController, alertController, IonIcon } from "@ionic/vue";
import {
	mdiChatOutline,
	mdiDeleteOutline,
	mdiDotsHorizontal,
	mdiFlagVariantOutline,
	mdiPencilOutline,
	mdiSendOutline,
} from "@mdi/js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { svg } from "@/helper/general.helper";
import { FeedPost } from "@/types/server.types";
import { reactionImages } from "@/config/post.config";
import { useToast } from "@/service/toast.service";
import { useMenuStore } from "@/store/menu.store";
import { usePostStore } from "@/store/post.store";
import router from "@/router";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { Menu } from "@/draw/types/draw.types";
import { useModerationStore } from "@/store/moderation.store";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import {
	hydrateCustomization,
	resolveTheme,
	resolveFontFamily,
	resolveFontEffectClass,
	resolveTitle,
	calculateSignatureStroke,
} from "@/config/profile_options.config";
import { useShareService } from "@/draw/store/useShareService.store";

dayjs.extend(relativeTime);

const props = defineProps<{ post: FeedPost; isMine: boolean }>();
const emit = defineEmits([
	"open-comments",
	"open-reaction-popover",
	"delete-post",
]);

const { openUserActions } = useUserContextSheet();
const menuStore = useMenuStore();
const postStore = usePostStore();
const { toast } = useToast();

const imageLoaded = ref(false);
const activeAnim = ref<string | null>(null);

const authorCustomization = computed(() =>
	hydrateCustomization(props.post.author?.customization),
);
const theme = computed(() => resolveTheme(authorCustomization.value.themeId));
const resolvedFontFamily = computed(() =>
	resolveFontFamily(authorCustomization.value.fontId),
);
const fontEffectClass = computed(() =>
	resolveFontEffectClass(authorCustomization.value.fontEffectId),
);
const displayTitle = computed(() =>
	resolveTitle(authorCustomization.value.titleId),
);
const signatureStrokeWidth = computed(() =>
	calculateSignatureStroke(authorCustomization.value.signatureViewBox),
);

const activeReactions = computed(() =>
	Object.keys(props.post.reaction_counts || {}).filter(
		(key) => props.post.reaction_counts[key] > 0,
	),
);

const totalReactionCount = computed(() =>
	Object.values(props.post.reaction_counts || {}).reduce(
		(sum, count) => sum + count,
		0,
	),
);

watch(
	() => props.post.user_reaction,
	(newVal, oldVal) => {
		if (newVal && newVal !== oldVal) {
			activeAnim.value = newVal;
			setTimeout(() => {
				activeAnim.value = null;
			}, 1000);
		}
	},
);

const openUser = (userId: string) => openUserActions({ _id: userId });
const shareService = useShareService();

const openShare = () => {
	shareService.setActiveShareItem({ type: "post", data: props.post });
	menuStore.openMenu(Menu.SharePostMenu);
};

const remixPost = async () => {
	const alert = await alertController.create({
		header: "Start Remix Session?",
		subHeader: "This leaves your current room.",
		message:
			"You are about to start a drawing canvas session based on this layout framework.",
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Cancel", role: "cancel" },
			{
				text: "Let's Draw",
				handler: () => {
					setTimeout(() => {
						router.push({
							path: FRONTEND_ROUTES.draw,
							query: { canvas_url: props.post.drawing_url, mode: "solo" },
						});
					}, 100);
				},
			},
		],
	});
	await alert.present();
};

const handleDoubleTap = (e: MouseEvent | TouchEvent) => {
	e.preventDefault();
	emit("open-reaction-popover", { event: e, post: props.post });
};

const presentActionSheet = async () => {
	const buttons: any[] = [
		{
			text: "Report Artwork",
			role: "destructive",
			icon: svg(mdiFlagVariantOutline),
			handler: () => {
				useModerationStore().openReport({
					type: "post",
					id: props.post._id,
					label: `${props.post.author.name}'s post`,
				});
			},
		},
	];
	if (props.isMine) {
		buttons.unshift({
			text: "Delete Post",
			role: "destructive",
			icon: svg(mdiDeleteOutline),
			handler: () => emit("delete-post", props.post),
		});
	}
	buttons.push({ text: "Cancel", role: "cancel" });

	const actionSheet = await actionSheetController.create({
		header: "Post Options",
		cssClass: "liquid-action-sheet",
		buttons,
	});
	await actionSheet.present();
};
</script>

<style scoped>
@keyframes floatUpFade {
  0% { opacity: 0; transform: scale(0.6) translateY(24px); }
  15% { opacity: 1; transform: scale(1.1) translateY(0px); }
  80% { opacity: 1; transform: scale(1) translateY(-25px); }
  100% { opacity: 0; transform: scale(0.85) translateY(-45px); }
}
.anim-float-up { animation: floatUpFade 0.9s cubic-bezier(0.175, 0.885, 0.32, 1.2) forwards; }

/* * Smooth Vignette: Uses your modern brand tertiary theme token background variables
 * to subtly dissolve card image parameters safely, removing letterbox borders.
 */
.dynamic-edge-vignette {
  background: linear-gradient(
    to right,
    var(--ion-color-tertiary, #FFF2E4) 0%,
    rgba(var(--ion-color-tertiary-rgb, 255, 242, 228), 0.2) 12%,
    transparent 25%,
    transparent 75%,
    rgba(var(--ion-color-tertiary-rgb, 255, 242, 228), 0.2) 88%,
    var(--ion-color-tertiary, #FFF2E4) 100%
  );
}
</style>