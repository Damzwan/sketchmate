<template>
  <article
    ref="root"
    class="entry-card relative rounded-[1.6rem] overflow-hidden border shadow-sm transition-all duration-200 md:hover:scale-[1.015] md:hover:shadow-md"
    :style="artistSurfaceStyle"
  >
    <ProfileEffect
      v-if="visible && showEffect"
      :effect-id="authorCustomization.effectId"
      radius-class="rounded-none"
      contained
    />

    <div
      class="relative z-[1] overflow-hidden border-b border-black/10"
      :class="showWorld ? 'min-h-[6.25rem]' : 'min-h-[4.25rem]'"
    >
      <ProfileWorld
        v-if="visible && showWorld"
        :world-id="authorCustomization.worldId"
        :accent="theme.accentColor"
        :dark="theme.isDark"
        static-mode
        banner
        contained
        radius-class="rounded-none"
      />

      <div class="relative z-10 flex items-start justify-between gap-1 p-2.5">
        <button
          type="button"
          class="flex items-center min-w-0 text-left cursor-pointer rounded-xl transition-all md:hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-secondary"
          aria-label="Open artist profile"
          @click="openProfile"
        >
          <UserAvatar
            v-if="entry.author"
            :user="entry.author"
            :customization="authorCustomization"
            size="xs"
            static
            class="shrink-0 aspect-square"
          />
          <span class="ml-2 min-w-0">
            <span class="block text-xs font-black truncate drop-shadow-sm" :style="nameStyle">
              {{ entry.author?.name ?? 'Artist' }}
            </span>
            <span v-if="displayTitle" class="block mt-0.5 text-[9px] font-black uppercase tracking-wider truncate" :style="descriptionStyle">
              {{ displayTitle }}
            </span>
          </span>
        </button>

        <button
          type="button"
          class="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-90 md:hover:scale-110 md:hover:bg-black/10"
          :style="{ color: palette.name }"
          aria-label="Report entry"
          @click="$emit('report', entry)"
        >
          <ion-icon :icon="svg(mdiFlagVariantOutline)" class="text-base" />
        </button>
      </div>
    </div>

    <div
      ref="artwork"
      class="relative z-10 bg-primary/10 select-none"
      :style="{ aspectRatio: entry.aspect_ratio || 1 }"
      @dblclick.prevent="$emit('vote', entry)"
      @contextmenu.prevent
    >
<img
        width="1"
        height="1"
        v-if="visible"
        :src="entry.thumbnail_url || entry.image_url"
        :alt="caption || 'Competition entry'"
        loading="lazy"
        decoding="async"
        class="w-full h-full object-cover"
      />

      <span
        v-if="entry.is_winner"
        class="absolute top-2 left-2 h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-black shadow-sm bg-secondary text-white"
      >
        <ion-icon :icon="svg(mdiTrophyOutline)" />
        {{ wonCategoryLabel }}
      </span>

      <button
        type="button"
        class="absolute top-2 right-2 z-20 h-8 w-8 rounded-full flex items-center justify-center bg-black/45 text-white backdrop-blur-sm border border-white/20 cursor-pointer transition-all active:scale-90 md:hover:scale-110 md:hover:bg-black/60"
        aria-label="View drawing fullscreen"
        @click.stop="$emit('fullscreen', entry)"
      >
        <ion-icon :icon="svg(mdiArrowExpand)" class="text-base" />
      </button>

      <span
        v-if="entry.my_votes.length"
        class="absolute bottom-2 left-2 h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-black bg-black/75 text-white shadow-sm"
      >
        <ion-icon :icon="svg(mdiCheckCircleOutline)" />
        {{ entry.my_votes.length === 1 ? 'Your vote' : `${entry.my_votes.length} of your votes` }}
      </span>

      <span
        v-if="entry.total_votes !== undefined"
        class="absolute bottom-2 right-2 h-7 px-2 rounded-full flex items-center gap-1 text-[10px] font-black bg-black/80 text-white shadow-sm"
      >
        <ion-icon :icon="svg(mdiVoteOutline)" />
        {{ entry.total_votes }} {{ entry.total_votes === 1 ? 'vote' : 'votes' }}
      </span>
    </div>

    <div class="relative z-[1] px-2.5 py-2 border-t border-black/10">
      <p v-if="caption" class="mb-1.5 text-[11px] leading-snug line-clamp-2" :style="descriptionStyle">
        {{ caption }}
      </p>
      <p v-if="isOwnEntry" class="mb-1 text-[10px] font-black uppercase tracking-wider" :style="uiNameStyle">
        Your weekly entry
      </p>

      <div class="flex items-center gap-1">
        <ion-button
          fill="clear"
          color="secondary"
          size="small"
          class="entry-action m-0 cursor-pointer"
          :style="voteActionStyle"
          aria-label="Vote for this entry"
          @click="$emit('vote', entry)"
        >
          <ion-icon :icon="svg(mdiVoteOutline)" slot="icon-only" class="text-base" />
        </ion-button>
        <ion-button
          fill="clear"
          size="small"
          class="entry-action m-0 cursor-pointer"
          :style="actionStyle"
          aria-label="Open comments"
          @click="$emit('comment', entry)"
        >
          <ion-icon :icon="svg(mdiChatOutline)" class="text-base" />
          <span v-if="entry.comment_count" class="ml-1 text-[11px] font-black">{{ entry.comment_count }}</span>
        </ion-button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from "@ionic/vue";
import {
	mdiArrowExpand,
	mdiChatOutline,
	mdiCheckCircleOutline,
	mdiFlagVariantOutline,
	mdiTrophyOutline,
	mdiVoteOutline,
} from "@mdi/js";
import { onLongPress } from "@vueuse/core";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import type { CompetitionCategory } from "@/config/competition.config";
import { IMPRESSION_DWELL_MS } from "@/config/competition.config";
import { playSelectionTick } from "@/config/post.config";
import {
	DEFAULT_EFFECT_ID,
	DEFAULT_WORLD_ID,
	hydrateCustomization,
	PROFILE_UI_FONT_FAMILY,
	resolveFontFor,
	resolveReadableCustomizationPalette,
	resolveTheme,
	resolveTitle,
} from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import type { CompetitionEntry } from "@/service/api/competition.api";

const props = defineProps<{
	entry: CompetitionEntry;
	categories: CompetitionCategory[];
	accent?: string;
	isOwnEntry: boolean;
	profanityFilter: boolean;
}>();

/** Keep a card's artwork and customization alive this far outside the viewport. */
const RETENTION_MARGIN_PX = 1500;

const emit = defineEmits<{
	(e: "vote", entry: CompetitionEntry): void;
	(e: "comment", entry: CompetitionEntry): void;
	(e: "report", entry: CompetitionEntry): void;
	(e: "fullscreen", entry: CompetitionEntry): void;
	(e: "impression", entryId: string): void;
}>();

const { openUserActions } = useUserContextSheet();
const root = ref<HTMLElement | null>(null);
const artwork = ref<HTMLElement | null>(null);
const visible = ref(false);
const caption = computed(() =>
	props.profanityFilter && props.entry.caption_filtered
		? props.entry.caption_filtered
		: props.entry.caption,
);
const authorCustomization = computed(() =>
	hydrateCustomization(props.entry.author?.customization as any),
);
const theme = computed(() => resolveTheme(authorCustomization.value.themeId));
const palette = computed(() =>
	resolveReadableCustomizationPalette(theme.value),
);
const showWorld = computed(
	() => authorCustomization.value.worldId !== DEFAULT_WORLD_ID,
);
const showEffect = computed(
	() => authorCustomization.value.effectId !== DEFAULT_EFFECT_ID,
);
const displayTitle = computed(() =>
	resolveTitle(authorCustomization.value.titleId),
);
const fontFamily = computed(() =>
	resolveFontFor(authorCustomization.value.fontId, "compact"),
);
const artistSurfaceStyle = computed(() => ({
	background: theme.value.cardBg,
	borderColor: theme.value.cardBorderColor,
	isolation: "isolate" as const,
}));
const actionStyle = computed(() => ({
	"--background": `${palette.value.name}12`,
	"--background-hover": `${palette.value.name}22`,
	"--color": palette.value.name,
	"--border-radius": "999px",
}));
const voteActionStyle = computed(() => ({
	"--background": "var(--ion-color-secondary)",
	"--background-hover": "var(--ion-color-secondary-shade)",
	"--color": "var(--ion-color-secondary-contrast)",
	"--border-radius": "999px",
}));
const nameStyle = computed(() => ({
	color: palette.value.name,
	fontFamily: fontFamily.value,
	textShadow: palette.value.textShadow,
}));
const descriptionStyle = computed(() => ({
	color: palette.value.desc,
	fontFamily: PROFILE_UI_FONT_FAMILY,
	textShadow: palette.value.textShadow,
}));
const uiNameStyle = computed(() => ({
	color: palette.value.name,
	fontFamily: PROFILE_UI_FONT_FAMILY,
	textShadow: palette.value.textShadow,
}));
const wonCategoryLabel = computed(
	() =>
		props.categories.find(
			(category) => category.id === props.entry.won_category,
		)?.label ?? "Winner",
);

function openProfile() {
	if (!props.entry.author) return;
	void openUserActions({
		_id: props.entry.author._id,
		name: props.entry.author.name,
		img: props.entry.author.img,
	});
}

let observer: IntersectionObserver | null = null;
let retentionObserver: IntersectionObserver | null = null;
let dwellTimer: ReturnType<typeof setTimeout> | null = null;
let reported = false;

onLongPress(
	artwork,
	() => {
		playSelectionTick();
		emit("vote", props.entry);
	},
	{
		delay: 650,
		distanceThreshold: 12,
		modifiers: { prevent: true },
	},
);

onMounted(() => {
	if (!root.value) return;
	observer = new IntersectionObserver(
		(records) => {
			const ratio = records[0]?.intersectionRatio ?? 0;
			if (ratio > 0) visible.value = true;
			if (ratio >= 0.5 && !reported) {
				dwellTimer ??= setTimeout(() => {
					reported = true;
					emit("impression", props.entry._id);
				}, IMPRESSION_DWELL_MS);
			} else if (dwellTimer) {
				clearTimeout(dwellTimer);
				dwellTimer = null;
			}
		},
		{ threshold: [0, 0.5], rootMargin: "200px 0px" },
	);
	observer.observe(root.value);

	// Release far-offscreen cards. `content-visibility: auto` already skips
	// their layout and paint, but the decoded bitmap, the ProfileWorld scene and
	// the ProfileEffect sheet all stay resident — and unlike the feed, which is
	// capped at 20 posts, this grid paginates, so a busy week can accumulate
	// hundreds. The band is deliberately wide: scrolling back up a screen or two
	// must not re-decode anything.
	retentionObserver = new IntersectionObserver(
		(records) => {
			if (!records[0]?.isIntersecting) visible.value = false;
		},
		{ threshold: 0, rootMargin: `${RETENTION_MARGIN_PX}px 0px` },
	);
	retentionObserver.observe(root.value);
});

onBeforeUnmount(() => {
	observer?.disconnect();
	retentionObserver?.disconnect();
	if (dwellTimer) clearTimeout(dwellTimer);
});
</script>

<style scoped>
.entry-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
}
.entry-action {
  min-height: 1.9rem;
  height: 1.9rem;
  --padding-start: 0.55rem;
  --padding-end: 0.55rem;
}
</style>
