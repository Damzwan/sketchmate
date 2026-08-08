<template>
  <ion-modal :is-open="isOpen" @didDismiss="close" class="winners-modal">
    <div class="winner-shell h-full overflow-y-auto hide-scrollbar relative bg-background">
      <div class="winner-glow absolute inset-0 pointer-events-none" />

      <div class="relative h-full flex flex-col pt-safe pb-safe">
        <header class="shrink-0 px-5 sm:px-8 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">
              {{ iWon && showingCurrent ? 'Your winning moment' : 'Competition winners' }}
            </p>
            <h2 class="text-2xl sm:text-3xl font-black cabin-sketch-regular leading-none text-black truncate mt-1">
              {{ competition?.theme ?? 'Winners' }}
            </h2>
          </div>
          <ion-button fill="clear" color="dark" class="m-0 shrink-0" @click="close">
            <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-xl" />
          </ion-button>
        </header>

        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
          <ion-spinner name="dots" color="secondary" />
        </div>

        <div v-else-if="!results.length" class="flex-1 flex flex-col items-center justify-center text-center px-8">
          <p class="text-lg font-black text-black">No winners this competition</p>
          <p class="text-sm text-black/80 mt-1">There were not enough eligible entries.</p>
        </div>

        <template v-else>
          <div class="winner-pager-stage relative flex-1 min-h-0 mt-2 sm:mt-4">
            <div
              ref="pager"
              class="winner-pager h-full"
              :class="{ 'winner-pager--reveal': revealActive }"
              @scroll.passive="syncActiveSlide"
            >
              <article
                v-for="(row, index) in results"
                :key="row.category_id"
                class="winner-slide"
                :class="{ 'winner-slide--active': activeSlide === index }"
                @click.capture="activateSlide(index, $event)"
              >
                <div class="winner-card rounded-[1.75rem] border border-white/70 bg-tertiary/95 overflow-hidden">
                  <div class="winner-category flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-primary/20">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="h-7 px-2.5 rounded-full bg-secondary text-white text-[10px] font-black uppercase tracking-wider flex items-center">
                      {{ row.category_label }}
                    </span>
                    <span class="text-xs font-black text-black truncate">{{ row.winner?.name ?? 'Artist' }}</span>
                  </div>
                  <span class="text-[10px] font-black text-black/80 shrink-0">
                    {{ row.entry?.total_votes ?? row.votes }}
                    {{ (row.entry?.total_votes ?? row.votes) === 1 ? 'vote' : 'votes' }} · {{ index + 1 }} / {{ results.length }}
                  </span>
                  </div>

                  <div class="winner-content p-2.5 sm:p-4 grid md:grid-cols-[minmax(0,1.18fr)_minmax(16rem,0.82fr)] gap-2.5 md:gap-4 items-center">
                    <div class="winner-art-wrap relative min-w-0">
                    <img
                      v-if="row.entry"
                      :src="row.entry.image_url"
                      :alt="`${row.winner?.name ?? 'Artist'} winning drawing`"
                      class="winner-art w-full h-[32vh] min-h-56 max-h-80 rounded-[1.35rem] object-contain bg-background border border-primary/25"
                      :class="{ 'winner-art--portrait': isPortrait(row) }"
                    />
                    <div class="absolute inset-x-4 -bottom-2 h-5 bg-black/15 blur-xl rounded-full pointer-events-none" />
                  </div>

                  <aside class="winner-side min-w-0 flex flex-col gap-3">
                    <button
                      v-if="row.winner"
                      type="button"
                      class="winner-profile relative z-10 w-full -mt-5 px-2 md:mt-0 md:px-0 cursor-pointer rounded-2xl transition-all active:scale-[0.99] md:hover:scale-[1.015]"
                      aria-label="Open winner profile"
                      @click="openProfile(row.winner)"
                    >
                      <PreviewProfileCard
                        :user="row.winner"
                        :customization="row.winner.customization ?? {}"
                        :zoom="compactPhone ? 0.54 : 0.62"
                        :max-width="420"
                      />
                    </button>

                    <button
                      v-if="rewardFor(row)"
                      type="button"
                      class="winner-prize w-full rounded-xl border border-primary/30 bg-background p-2 flex items-center gap-2 text-left cursor-pointer transition-all active:scale-[0.99] md:hover:scale-[1.01] md:hover:shadow-sm"
                      @click="openReward(rewardFor(row)!.id)"
                    >
                      <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden border border-primary/25 shrink-0">
                        <ShopGrantPreview :item-id="rewardFor(row)!.id" :user-img="user?.img" />
                      </div>
                      <span class="min-w-0 flex-1">
                        <span class="block text-[9px] font-black uppercase tracking-widest text-black/80">Winner prize</span>
                        <span class="block text-sm font-black text-black truncate mt-0.5">{{ rewardFor(row)?.label }}</span>
                      </span>
                      <span class="text-[10px] font-black text-secondary shrink-0">View</span>
                    </button>
                    </aside>
                  </div>
                </div>
              </article>
            </div>

            <button
              v-if="activeSlide > 0"
              type="button"
              class="winner-arrow winner-arrow--left"
              aria-label="Previous winner"
              @click="goToSlide(activeSlide - 1)"
            >
              <ion-icon :icon="svg(mdiChevronLeft)" />
            </button>
            <button
              v-if="activeSlide < results.length - 1"
              type="button"
              class="winner-arrow winner-arrow--right"
              aria-label="Next winner"
              @click="goToSlide(activeSlide + 1)"
            >
              <ion-icon :icon="svg(mdiChevronRight)" />
            </button>
          </div>

          <div class="shrink-0 flex items-center justify-center gap-1.5 mt-3">
            <button
              v-for="(row, index) in results"
              :key="`dot-${row.category_id}`"
              type="button"
              class="h-2 rounded-full cursor-pointer transition-all"
              :class="activeSlide === index ? 'w-7 bg-secondary' : 'w-2 bg-black/20 md:hover:bg-black/35'"
              :aria-label="`Show ${row.category_label} winner`"
              @click="goToSlide(index)"
            />
          </div>

          <div class="shrink-0 px-5 sm:px-8 pt-3">
            <button
              v-if="!showingCurrent && competition"
              type="button"
              class="w-full rounded-2xl border border-primary/35 bg-tertiary py-2.5 font-black text-sm text-black cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.01] md:hover:shadow-sm"
              @click="openAllEntries"
            >
              See every entry
            </button>

            <button
              v-else-if="store.canSubmit"
              type="button"
              class="w-full rounded-2xl py-2.5 font-black text-sm shadow-sm cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.01]"
              :style="{ background: accent.from, color: accent.ink }"
              @click="goDraw"
            >
              Draw this week's entry
            </button>
          </div>
        </template>
      </div>

      <ShopPreviewModal
        :is-open="!!previewSku"
        :sku="previewSku"
        :owned="isPreviewOwned"
        :user="user"
        :user-img="user?.img"
        @close="previewSku = null"
        @purchase="purchasePreview"
        @equip="equipPreview"
      />
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import {
	IonButton,
	IonIcon,
	IonModal,
	IonSpinner,
	useIonRouter,
} from "@ionic/vue";
import { mdiChevronLeft, mdiChevronRight, mdiClose } from "@mdi/js";
import { useMediaQuery } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import ShopGrantPreview from "@/components/shop/ShopGrantPreview.vue";
import ShopPreviewModal from "@/components/shop/ShopPreviewModal.vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { useShopPreviewActions } from "@/composables/shop/useShopPreviewActions";
import {
	CATALOG_BY_ID,
	describeGrant,
	type ShopSku,
} from "@/config/catalog.config";
import { resolveAccent } from "@/config/competition.config";
import { masterAnimation } from "@/helper/animation.helper";
import { svg } from "@/helper/general.helper";
import type {
	CompetitionAuthor,
	CompetitionResultRow,
} from "@/service/api/competition.api";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useAuthStore } from "@/store/auth.store";
import { useCompetitionStore } from "@/store/competition.store";
import { useMenuStore } from "@/store/menu.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const revealedCompetitions = new Set<string>();

const router = useIonRouter();
const store = useCompetitionStore();
const menuStore = useMenuStore();
const { isCompetitionResultsOpen: isOpen } = storeToRefs(menuStore);
const { user } = storeToRefs(useAuthStore());
const { openUserActions } = useUserContextSheet();
const shopActions = useShopPreviewActions();

const isLoading = ref(false);
const pager = ref<HTMLElement | null>(null);
const activeSlide = ref(0);
const revealActive = ref(false);
const previewSku = ref<ShopSku | null>(null);
const compactPhone = useMediaQuery("(max-width: 640px)");
const isPreviewOwned = computed(() => shopActions.isSkuOwned(previewSku.value));
let revealTimer: ReturnType<typeof setTimeout> | null = null;
const competition = computed(() => store.presentedCompetition);
const results = computed<CompetitionResultRow[]>(
	() => store.presentedResults ?? [],
);
const accent = computed(() => resolveAccent(store.accent));
const showingCurrent = computed(
	() => competition.value?._id === store.competition?._id,
);
const iWon = computed(() =>
	results.value.some((row) => row.winner?._id === user.value?._id),
);

function rewardFor(row: CompetitionResultRow) {
	const itemId = row.granted_items.find((id) => !id.startsWith("title."));
	if (!itemId) return null;
	return { id: itemId, label: describeGrant(itemId).label };
}

function isPortrait(row: CompetitionResultRow) {
	return (row.entry?.aspect_ratio ?? 1) < 0.85;
}

function syncActiveSlide() {
	if (!pager.value) return;
	const center =
		pager.value.getBoundingClientRect().left + pager.value.clientWidth / 2;
	let closest = 0;
	let distance = Number.POSITIVE_INFINITY;
	for (const [index, slide] of Array.from(pager.value.children).entries()) {
		const rect = (slide as HTMLElement).getBoundingClientRect();
		const nextDistance = Math.abs(rect.left + rect.width / 2 - center);
		if (nextDistance < distance) {
			distance = nextDistance;
			closest = index;
		}
	}
	activeSlide.value = closest;
}

function goToSlide(index: number) {
	activeSlide.value = index;
	(pager.value?.children[index] as HTMLElement | undefined)?.scrollIntoView({
		behavior: "smooth",
		block: "nearest",
		inline: "center",
	});
}

function activateSlide(index: number, event: MouseEvent) {
	if (index === activeSlide.value) return;
	event.preventDefault();
	event.stopPropagation();
	goToSlide(index);
}

function openReward(itemId: string) {
	trackEvent(mixpanelEvents.competitionRewardShopOpen, {
		item_id: itemId,
		won: iWon.value,
	});
	const known = CATALOG_BY_ID[itemId];
	if (known) {
		previewSku.value = known;
		return;
	}
	const item = describeGrant(itemId);
	previewSku.value = {
		id: itemId,
		kind: "single",
		rcProductId: "",
		grants: [itemId],
		category: item.category,
		name: item.label,
		desc: "Competition prize",
	};
}

async function purchasePreview() {
	await shopActions.purchaseSku(previewSku.value);
}

async function equipPreview(patch: Record<string, unknown>) {
	if (await shopActions.equipSku(patch)) previewSku.value = null;
}

function openProfile(winner: CompetitionAuthor) {
	void openUserActions({ _id: winner._id, name: winner.name, img: winner.img });
}

function goDraw() {
	close();
	router.push(
		{ path: `/${FRONTEND_ROUTES.draw}`, query: { type: "competition" } },
		masterAnimation,
	);
}

function openAllEntries() {
	const id = competition.value?._id;
	if (!id) return;
	close();
	store.requestArchive(id);
}

function close() {
	if (!isOpen.value) return;
	const markCurrentSeen = showingCurrent.value;
	isOpen.value = false;
	if (markCurrentSeen) void store.markSeen();
	store.clearResultsPresentation();
}

watch(
	isOpen,
	async (open) => {
		if (!open) return;
		isLoading.value = true;
		activeSlide.value = 0;
		try {
			await store.loadPresentedResults();
			await nextTick();
			pager.value?.scrollTo({ left: 0 });
			const id = competition.value?._id;
			if (id && !revealedCompetitions.has(id)) {
				revealedCompetitions.add(id);
				revealActive.value = true;
				revealTimer = setTimeout(() => (revealActive.value = false), 900);
			}
			trackEvent(mixpanelEvents.competitionResultsView, {
				week_key: competition.value?.week_key,
				won: iWon.value,
			});
		} finally {
			isLoading.value = false;
		}
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	if (revealTimer) clearTimeout(revealTimer);
});
</script>

<style scoped>
.pt-safe { padding-top: calc(env(safe-area-inset-top, 0px) + .85rem); }
.pb-safe { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + .85rem); }
.winner-glow {
  background:
    radial-gradient(circle at 15% 5%, rgba(var(--ion-color-secondary-rgb), .2), transparent 32%),
    radial-gradient(circle at 90% 60%, rgba(var(--ion-color-primary-rgb), .25), transparent 38%);
}
.winner-pager {
  --winner-slide-w: min(82vw, 760px);
  display: flex;
  gap: .85rem;
  align-items: center;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: calc((100% - var(--winner-slide-w)) / 2);
  padding-inline: calc((100% - var(--winner-slide-w)) / 2);
  padding-block: .25rem .5rem;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}
.winner-pager::-webkit-scrollbar,
.hide-scrollbar::-webkit-scrollbar { display: none; }
.winner-slide {
  flex: 0 0 var(--winner-slide-w);
  scroll-snap-align: center;
  opacity: .82;
  transform: scale(.965);
  transition: opacity 220ms ease, transform 260ms cubic-bezier(.22,1,.36,1);
}
.winner-slide--active { opacity: 1; transform: scale(1); }
.winner-slide:not(.winner-slide--active) { cursor: pointer; }
.winner-slide:not(.winner-slide--active):hover { opacity: .88; transform: scale(.975); }
.winner-art { height: clamp(18rem, 40vh, 24rem); min-height: 18rem; max-height: 24rem; }
.winner-art--portrait { height: clamp(22rem, 52vh, 32rem); min-height: 22rem; max-height: 32rem; }
.winner-card {
  box-shadow: 0 18px 46px rgba(59,35,20,.14), inset 0 1px 0 rgba(255,255,255,.75);
}
.winner-arrow {
  display: none;
  position: absolute;
  top: 50%;
  z-index: 20;
  width: 2.75rem;
  height: 2.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(255,255,255,.94);
  color: #111;
  font-size: 1.5rem;
  box-shadow: 0 8px 26px rgba(0,0,0,.18);
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.winner-arrow:hover { transform: translateY(-50%) scale(1.08); box-shadow: 0 10px 30px rgba(0,0,0,.24); }
.winner-arrow--left { left: .75rem; transform: translateY(-50%); }
.winner-arrow--right { right: .75rem; transform: translateY(-50%); }
.winner-pager--reveal .winner-category { animation: winner-rise 360ms 60ms both; }
.winner-pager--reveal .winner-art-wrap { animation: winner-rise 430ms 170ms both; }
.winner-pager--reveal .winner-profile { animation: winner-rise 430ms 310ms both; }
.winner-pager--reveal .winner-prize { animation: winner-rise 400ms 470ms both; }
@keyframes winner-rise {
  from { opacity: 0; transform: translateY(14px) scale(.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
:global(ion-modal.winners-modal) {
  --width: min(96%, 1000px);
  --height: min(96%, 900px);
  --border-radius: 2rem;
  --background: var(--ion-color-background);
  --backdrop-opacity: .48;
}
:global(ion-modal.winners-modal::part(backdrop)) {
  background: rgba(18, 14, 25, .72);
  opacity: 1;
}
@media (max-width: 640px) {
  :global(ion-modal.winners-modal) {
    --width: 100%;
    --height: 91%;
    --border-radius: 2rem 2rem 0 0;
    align-items: flex-end;
  }
  .winner-pager { --winner-slide-w: min(76vw, 440px); gap: .65rem; }
  .winner-art,
  .winner-art--portrait { height: 23vh; min-height: 10rem; max-height: 14rem; }
  .winner-card { border-radius: 1.35rem; }
  .winner-category { padding-block: .45rem; }
}
@media (min-width: 768px) {
  .winner-arrow { display: flex; }
}
@media (prefers-reduced-motion: reduce) {
  .winner-pager--reveal .winner-category,
  .winner-pager--reveal .winner-art-wrap,
  .winner-pager--reveal .winner-profile,
  .winner-pager--reveal .winner-prize { animation: none; }
}
</style>
