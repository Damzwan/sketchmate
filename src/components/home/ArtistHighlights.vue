<template>
  <section
    v-if="visible"
    class="artist-highlights mb-6"
    aria-labelledby="artist-highlights-title"
  >
    <div class="flex items-center justify-between gap-3 px-1 mb-2.5">
      <div class="min-w-0">
        <h3 id="artist-highlights-title" class="text-sm font-black uppercase tracking-widest text-black/65">
          {{ config?.title || "Meet the artists" }}
        </h3>
        <p v-if="config?.subtitle" class="text-xs text-black/55 leading-snug mt-0.5">{{ config.subtitle }}</p>
      </div>
      <button type="button" class="w-9 h-9 shrink-0 flex items-center justify-center opacity-60 cursor-pointer hover:opacity-100 active:scale-90 transition-all" aria-label="Artist highlight options" aria-haspopup="menu" @click="openHideMenu">
        <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-xl text-black/60" />
      </button>
    </div>

    <div v-if="loading" class="h-[390px] rounded-[2rem] bg-tertiary border border-black/5 animate-pulse" aria-busy="true" />

    <swiper-container
      v-else
      ref="artistSwiper"
      class="artist-highlight-swiper"
      :slides-per-view="1.12"
      :space-between="12"
      :pagination="{ clickable: true }"
      :keyboard="{ enabled: true, onlyInViewport: true }"
      :centered-slides="true"
      :centered-slides-bounds="true"
      :breakpoints="{ 768: { slidesPerView: 1.18, spaceBetween: 16 } }"
      :grab-cursor="true"
      @swiperslidechange="onArtistSlideChange"
    >
      <swiper-slide v-for="(entry, entryIndex) in config?.artists" :key="entry._id">
        <article
          class="artist-highlight-card relative rounded-[1.75rem] border overflow-hidden shadow-sm"
          :class="entryIndex === activeArtistSlide ? 'artist-highlight-card--active' : 'artist-highlight-card--peek'"
          :style="cardStyle(entry)"
          @click.capture="activateArtistSlide($event, entryIndex)"
        >
          <div v-show="entryIndex === activeArtistSlide" class="absolute inset-0 pointer-events-none z-0">
            <ProfileWorld
              :world-id="customization(entry).worldId"
              :accent="theme(entry).accentColor"
              :font="fontFamily(entry)"
              :dark="theme(entry).isDark"
              feature
              static-mode
              contained
              radius-class="rounded-[1.75rem]"
            />
            <ProfileEffect
              :effect-id="customization(entry).effectId"
              radius-class="rounded-[1.75rem]"
              static-effect
              contained
            />
          </div>

          <div class="relative z-10 pt-3.5 pb-4">
            <div class="artist-identity  flex items-center gap-3 px-4 min-h-20" :style="identityStyle(entry)">
              <button type="button" class="shrink-0 cursor-pointer rounded-full active:scale-95 transition-transform" :aria-label="`Open ${entry.artist.name}'s profile`" @click="openArtist(entry, entryIndex)">
                <UserAvatar
                  :user="entry.artist"
                  :customization="entry.artist.customization"
                  size="md"
                  static
                />
              </button>

              <div class="min-w-0 flex-1">
                <TitleBadge
                  v-if="customization(entry).titleId"
                  :title-id="customization(entry).titleId"
                  :theme="theme(entry)"
                  extra-class="artist-highlight-title mb-1"
                  @will-open="beginOverlay"
                  @did-close="endOverlay"
                />
                <button type="button" class="flex w-full cursor-pointer  items-center gap-1.5 text-left active:opacity-70 transition-opacity" @click="openArtist(entry, entryIndex)">
                  <span
                    class="artist-highlight-name block min-w-0 flex-1 text-2xl leading-none font-black truncate"
                    :class="fontClass(entry)"
                    :style="{ fontFamily: fontFamily(entry) }"
                  >{{ entry.artist.name }}</span>
                  <ion-icon :icon="svg(mdiChevronRight)" class="shrink-0 text-xl opacity-60" />
                </button>
              </div>

              <svg
                v-if="customization(entry).signaturePath"
                class="hidden sm:block w-24 h-12 shrink-0 opacity-80"
                :viewBox="customization(entry).signatureViewBox || '0 0 300 150'"
                preserveAspectRatio="xMidYMid meet"
                aria-label="Artist signature"
              >
                <path
                  :d="customization(entry).signaturePath"
                  fill="none"
                  :stroke="theme(entry).accentColor"
                  :stroke-width="signatureStroke(entry)"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>

            <div class="relative mt-3">
              <div
                :ref="(element) => setArtworkStripRef(entry._id, element as HTMLElement | null)"
                class="swiper-no-swiping artwork-strip flex gap-2.5 overflow-x-auto scroll-smooth snap-x snap-mandatory px-3.5 pb-1"
              >
                <div
                  v-for="(post, postIndex) in entry.posts"
                  :key="post._id"
                  class="relative flex-none w-[82%] sm:w-[64%] h-52 sm:h-60 overflow-hidden rounded-2xl border border-white/60 bg-white/55 shadow-sm snap-center active:scale-[0.98] transition-transform"
                >
                  <button
                    type="button"
                    class="absolute inset-0 w-full h-full cursor-pointer"
                    :aria-label="`Select ${entry.artist.name}'s drawing ${postIndex + 1}`"
                    @click="focusArtwork(entry._id, $event)"
                  >
<img width="1" height="1" :src="post.thumbnail_url || post.image_url" class="absolute inset-0 w-full h-full object-contain" alt="" loading="lazy" decoding="async" fetchpriority="low" />
                  </button>
                  <button
                    type="button"
                    class="absolute top-2 right-2 z-10 h-9 w-9 rounded-full flex items-center justify-center bg-black/40 text-white backdrop-blur-sm border border-white/20 active:scale-90 hover:bg-black/55 transition-all cursor-pointer"
                    :aria-label="`View ${entry.artist.name}'s drawing ${postIndex + 1} fullscreen`"
                    @click.stop="openDrawing(entry.posts, postIndex)"
                  >
                    <ion-icon :icon="svg(mdiArrowExpand)" class="text-lg" />
                  </button>
                  <span class="absolute bottom-2 right-2 pointer-events-none rounded-full bg-black/55 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
                    {{ postIndex + 1 }} / {{ entry.posts.length }}
                  </span>
                </div>
              </div>

              <template v-if="entry.posts.length > 1">
                <button
                  type="button"
                  class="artwork-scroll-button artwork-scroll-button--previous"
                  :aria-label="`Previous artwork by ${entry.artist.name}`"
                  @click="scrollArtwork(entry._id, -1)"
                >
                  <ion-icon :icon="svg(mdiChevronLeft)" />
                </button>
                <button
                  type="button"
                  class="artwork-scroll-button artwork-scroll-button--next"
                  :aria-label="`Next artwork by ${entry.artist.name}`"
                  @click="scrollArtwork(entry._id, 1)"
                >
                  <ion-icon :icon="svg(mdiChevronRight)" />
                </button>
              </template>
            </div>

            <div class="mx-3.5 mt-3 rounded-2xl border backdrop-blur-sm overflow-hidden" :style="scrimStyle(entry)">
              <div
                v-for="(qa, qaIndex) in visibleQuestions(entry)"
                :key="qa._id"
                class="p-3.5"
                :class="qaIndex > 0 ? 'border-t border-current/10' : ''"
              >
                <p class="text-sm font-black leading-snug">{{ qa.question }}</p>
                <p class="text-sm leading-snug mt-1.5 opacity-80 whitespace-pre-wrap">“{{ qa.answer }}”</p>
              </div>

              <button
                v-if="entry.questions.length > 1"
                type="button"
                class="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border-t border-current/10 text-[10px] font-black uppercase tracking-wider active:bg-black/5 cursor-pointer"
                @click="toggleQuestions(entry._id)"
              >
                {{ questionsExpanded(entry._id) ? "Show less" : `${entry.questions.length - 1} more questions` }}
                <ion-icon :icon="svg(questionsExpanded(entry._id) ? mdiChevronUp : mdiChevronDown)" />
              </button>
            </div>

            <div v-if="customization(entry).signaturePath" class="flex justify-end px-5 mt-2.5 opacity-80 sm:hidden">
              <svg class="w-28 h-10" :viewBox="customization(entry).signatureViewBox || '0 0 300 150'" preserveAspectRatio="xMidYMid meet" aria-label="Artist signature">
                <path
                  :d="customization(entry).signaturePath"
                  fill="none"
                  :stroke="theme(entry).accentColor"
                  :stroke-width="signatureStroke(entry)"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
          </div>
        </article>
      </swiper-slide>
    </swiper-container>
  </section>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import {
	mdiArrowExpand,
	mdiChevronDown,
	mdiChevronLeft,
	mdiChevronRight,
	mdiChevronUp,
	mdiDotsHorizontal,
} from "@mdi/js";
import { register } from "swiper/element/bundle";
import { useArtistHighlights } from "@/components/home/useArtistHighlights";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import TitleBadge from "@/components/profile/TitleBadge.vue";
import { svg } from "@/helper/general.helper";

register();

const {
	config,
	loading,
	visible,
	endOverlay,
	activeArtistSlide,
	artistSwiper,
	customization,
	theme,
	palette,
	fontFamily,
	fontClass,
	cardStyle,
	identityStyle,
	scrimStyle,
	onArtistSlideChange,
	activateArtistSlide,
	setArtworkStripRef,
	scrollArtwork,
	focusArtwork,
	questionsExpanded,
	visibleQuestions,
	toggleQuestions,
	signatureStroke,
	openArtist,
	openDrawing,
	beginOverlay,
	openHideMenu,
} = useArtistHighlights();
</script>

<style scoped>
.artist-highlight-swiper {
	display: block;
	width: calc(100% + 1rem);
	margin-right: -1rem;
	padding: 0 1rem 2rem 0;
}

/* Same browser-native virtualization strategy as FeedPostCard. `auto` lets the
   browser remember the real rendered height, preventing scroll metrics from
   jumping when this fairly heavy section leaves and re-enters the viewport. */
.artist-highlights {
	content-visibility: auto;
	contain-intrinsic-size: auto 560px;
}

.artist-highlight-card {
	content-visibility: auto;
	contain-intrinsic-size: auto 500px;
	transition: transform 180ms ease, opacity 180ms ease;
}

.artist-highlight-card--peek {
	opacity: 0.72;
	transform: scale(0.965);
	cursor: pointer;
}

.artist-highlight-swiper::part(pagination) {
	bottom: 0;
}

.artist-highlight-swiper::part(bullet-active) {
	background: var(--ion-color-secondary);
}

.artwork-strip {
	scrollbar-width: none;
	-webkit-overflow-scrolling: touch;
}

.artwork-strip::-webkit-scrollbar {
	display: none;
}

.artwork-scroll-button {
	display: none;
}

.artist-identity :deep(.artist-highlight-title) {
	gap: 0.3rem;
	padding: 0.2rem 0.55rem 0.2rem 0.3rem;
	font-size: 0.5rem;
}

.artist-identity :deep(.artist-highlight-title > span:nth-child(2)) {
	width: 0.875rem;
	height: 0.875rem;
	font-size: 0.75rem;
}

/* Profile font/title effects are still represented visually, but an editorial
   feed card must not keep repainting text and sheen layers forever. */
.artist-highlight-name,
.artist-identity :deep(.artist-highlight-title),
.artist-identity :deep(.artist-highlight-title *) {
	animation: none !important;
	will-change: auto !important;
}

@media (min-width: 768px) {
	.artwork-scroll-button {
		position: absolute;
		top: 50%;
		z-index: 20;
		display: flex;
		width: 2.5rem;
		height: 2.5rem;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 9999px;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		font-size: 1.35rem;
		cursor: pointer;
		transform: translateY(-50%);
		backdrop-filter: blur(10px);
		transition: transform 150ms ease, background-color 150ms ease;
	}

	.artwork-scroll-button:hover {
		background: rgba(0, 0, 0, 0.82);
		transform: translateY(-50%) scale(1.06);
	}

	.artwork-scroll-button:disabled {
		opacity: 0.22;
		cursor: default;
	}

	.artwork-scroll-button:disabled:hover {
		background: rgba(0, 0, 0, 0.6);
		transform: translateY(-50%);
	}

	.artwork-scroll-button--previous { left: 1.75rem; }
	.artwork-scroll-button--next { right: 1.75rem; }
}
</style>
