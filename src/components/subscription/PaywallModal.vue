<template>
  <ion-modal :is-open="isPaywallOpen" @didDismiss="close" class="full-screen-modal">
    <ion-content class="--bg-canvas relative cabin-sketch-regular">

      <!-- ─── Header: centered brand, back button floated left ─── -->
      <div
        class="relative px-2 pb-3 border-b border-primary/40 header-bg"
        :style="{ paddingTop: 'calc(8px + var(--ion-safe-area-top, 0px))' }"
      >
        <!-- Title row: back button floated left, title centered, logo absolute
             just to the right of it (so it never shifts the centering). -->
        <div class="relative flex items-center justify-center">
          <ion-button
            fill="clear"
            class="m-0 absolute left-0 active:scale-90 transition-transform"
            @click="close"
          >
            <ion-icon :icon="chevronBackOutline" class="text-[26px] text-black" slot="icon-only" />
          </ion-button>
          <h2 class="relative text-[28px] font-black text-secondary italic tracking-tighter leading-none cabin-sketch-regular">
            {{ isPro ? 'Go Lifetime' : 'SketchMate Pro' }}
            <img :src="logo" alt="" class="absolute left-full top-1/2 -translate-y-1/2 ml-1.5 w-9 h-9 drop-shadow-sm" />
          </h2>
        </div>
        <p class="text-[16px] text-black/90 text-center mt-1.5">
          {{ isPro ? 'Upgrade to lifetime access' : 'Unlock your canvas' }}
        </p>
      </div>

      <div class="px-4 pt-4 pb-10 space-y-5">

        <!-- ─── Pro card (hidden once already Pro — only Pro→Lifetime remains) ─── -->
        <div v-if="!isPro" class="relative rounded-[2rem] border border-primary/40 bg-tertiary shadow-sm p-5">
          <!-- Title + cat share the top row so the cat reads as part of the card -->
          <div class="flex items-start justify-between gap-3">
            <h3 class="text-2xl font-black text-black tracking-tight leading-none cabin-sketch-regular pt-1">Pro</h3>
            <img :src="crazyCat" alt="" class="w-24 -mt-2 -mr-1 shrink-0 select-none pointer-events-none" />
          </div>

          <!-- Billing cycle chips -->
          <div class="flex gap-2 mt-4">
            <button
              class="flex-1 rounded-2xl border px-3 py-2 text-left transition-all cursor-pointer active:scale-[0.98]"
              :class="proCycle === 'yearly' ? 'border-secondary bg-secondary/10' : 'border-primary/40 bg-white'"
              @click="proCycle = 'yearly'"
            >
              <div class="flex items-center justify-between">
                <span class="text-[15px] font-black text-black">Yearly</span>
                <span v-if="yearlyDiscount"
                      class="text-[11px] font-black text-white bg-secondary px-1.5 py-0.5 rounded-full">
                  -{{ yearlyDiscount }}%
                </span>
              </div>
              <p class="text-[14px] font-black text-black/80 mt-0.5">{{ yearly?.product.priceString ?? '—' }}<span
                class="text-black/55">/yr</span></p>
            </button>
            <button
              class="flex-1 rounded-2xl border px-3 py-2 text-left transition-all cursor-pointer active:scale-[0.98]"
              :class="proCycle === 'monthly' ? 'border-secondary bg-secondary/10' : 'border-primary/40 bg-white'"
              @click="proCycle = 'monthly'"
            >
              <span class="text-[15px] font-black text-black">Monthly</span>
              <p class="text-[14px] font-black text-black/80 mt-0.5">{{ monthly?.product.priceString ?? '—' }}<span
                class="text-black/55">/mo</span></p>
            </button>
          </div>

          <!-- Bullets -->
          <ul class="mt-4 space-y-2.5">
            <li v-for="b in proBullets" :key="b.label" class="flex items-center gap-2.5">
              <span class="shrink-0 w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center">
                <ion-icon :icon="svg(b.icon)" class="text-secondary text-base" />
              </span>
              <span class="text-[15px] text-black">{{ b.label }}</span>
            </li>
          </ul>

          <ion-button
            expand="block"
            color="secondary"
            shape="round"
            class="mt-4"
            :disabled="purchasing || !selectedProPkg"
            @click="buyCycle"
          >
            Get Pro
          </ion-button>
        </div>

        <!-- ─── Lifetime card ─── -->
        <div class="relative rounded-[2rem] border-2 border-secondary/40 bg-tertiary shadow-md p-5">
          <!-- Title block + cat share the top row -->
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <ion-icon :icon="svg(mdiCrown)" class="text-secondary text-2xl" />
                <h3 class="text-2xl font-black text-black tracking-tight leading-none cabin-sketch-regular">Lifetime</h3>
              </div>
              <p class="text-[18px] font-black text-black mt-2">
                {{ lifetime?.product.priceString ?? '—' }}
                <span class="text-[14px] text-black/80">· one-time</span>
              </p>
              <p class="text-[14px] text-black/90 mt-0.5">One time purchase, forever yours</p>
            </div>
            <img :src="fireCat" alt="" class="w-28 -mt-2 -mr-1 shrink-0 select-none pointer-events-none" />
          </div>

          <!-- Spell out that Lifetime is the SUPERSET: every Pro perk, plus the
               whole cosmetics shop, forever. The two folded groups (Pro perks +
               cosmetic categories) kill the "is this less than Pro?" confusion. -->
          <div class="mt-4 space-y-3">
            <!-- Everything in Pro — recap the Pro perks inline so it's concrete -->
            <div class="rounded-2xl border border-primary/40 bg-white/60 p-3">
              <div class="flex items-center gap-2">
                <span class="shrink-0 w-6 h-6 rounded-lg bg-secondary flex items-center justify-center">
                  <ion-icon :icon="svg(mdiCheckAll)" class="text-white text-sm" />
                </span>
                <span class="text-base font-black text-black">Everything in Pro included</span>
              </div>
              <div class="flex flex-wrap gap-1.5 mt-2.5 pl-8">
                <span
                  v-for="b in proBullets"
                  :key="b.label"
                  class="text-xs text-black/90 bg-primary/20 rounded-full px-2 py-0.5"
                >
                  {{ b.label }}
                </span>
              </div>
            </div>

            <!-- Every cosmetic — name the shop categories so "cosmetics" is clear -->
            <div class="rounded-2xl border-2 border-secondary/40 bg-secondary/[0.07] p-3">
              <div class="flex items-center gap-2">
                <span class="shrink-0 w-6 h-6 rounded-lg bg-secondary flex items-center justify-center">
                  <ion-icon :icon="svg(mdiShimmer)" class="text-white text-sm" />
                </span>
                <span class="text-base font-black text-black">Every cosmetic unlocked</span>
              </div>
              <p class="text-base text-black/80 mt-1 pl-8 leading-snug">
                The whole shop, no buying items one at a time.
              </p>
              <div class="flex flex-wrap gap-1.5 mt-2 pl-8">
                <span
                  v-for="c in cosmeticTypes"
                  :key="c"
                  class="text-xs text-secondary bg-secondary/10 rounded-full px-2 py-0.5"
                >
                  {{ c }}
                </span>
              </div>
            </div>

            <!-- Forever -->
            <div class="flex items-center gap-2.5 px-1">
              <span class="shrink-0 w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center">
                <ion-icon :icon="svg(mdiInfinity)" class="text-secondary text-base" />
              </span>
              <span class="text-[15px] text-black">Yours forever! One payment, no subscription</span>
            </div>
          </div>

          <ion-button
            expand="block"
            color="secondary"
            shape="round"
            class="mt-4"
            :disabled="purchasing || !lifetime"
            @click="buyLifetime"
          >
            Get Lifetime
          </ion-button>
        </div>

        <!-- ─── Comparison table (irrelevant once already Pro) ─── -->
        <div v-if="!isPro">
          <h3 class="text-[18px] font-black text-black tracking-tight mb-2 px-1">Pro vs Lifetime</h3>
          <div class="relative rounded-[1.5rem] border border-primary/40 bg-tertiary overflow-hidden">
            <!-- Featured column: one continuous rounded highlight behind the
                 whole Lifetime column (cleaner than tinting each cell). -->
            <div class="absolute inset-y-0 right-0 w-16 bg-secondary/[0.06] pointer-events-none"></div>

            <div class="relative grid grid-cols-[1fr_64px_64px]">
              <!-- header row -->
              <div class="px-3.5 py-3"></div>
              <div class="py-3 text-center text-[15px] font-black text-black">Pro</div>
              <div class="py-3 text-center text-[15px] font-black text-secondary">Lifetime</div>

              <template v-for="row in compare" :key="row.label">
                <div class="px-3.5 py-3 text-[14px] text-black border-t border-primary/20 flex items-center">
                  {{ row.label }}
                </div>
                <div class="py-3 flex items-center justify-center border-t border-primary/20">
                  <span v-if="typeof row.pro === 'string'" class="text-[15px] font-black text-black">{{ row.pro }}</span>
                  <ion-icon v-else-if="row.pro" :icon="svg(mdiCheck)" class="text-secondary text-xl" />
                  <ion-icon v-else :icon="svg(mdiMinus)" class="text-black/30 text-xl" />
                </div>
                <div class="py-3 flex items-center justify-center border-t border-primary/20">
                  <span v-if="typeof row.life === 'string'" class="text-[15px] font-black text-black">{{ row.life }}</span>
                  <ion-icon v-else-if="row.life" :icon="svg(mdiCheck)" class="text-secondary text-xl" />
                  <ion-icon v-else :icon="svg(mdiMinus)" class="text-black/30 text-xl" />
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- ─── Support message (avatar bubble, like Shop) ─── -->
        <div class="flex items-start gap-3">
          <img
            :src="bigbossImage"
            alt="Developer"
            class="w-11 h-11 rounded-full object-cover border-2 border-primary/50 shadow-sm shrink-0"
          />
          <div
            class="relative flex-1 min-w-0 rounded-2xl rounded-tl-sm border border-primary/40 bg-tertiary px-3.5 py-2.5">
            <span
              class="absolute -left-1.5 top-3 w-3 h-3 rotate-45 bg-tertiary border-l border-b border-primary/40"></span>
            <p class="text-base text-black leading-snug">
              Going Pro supports the project and helps keep SketchMate high-quality and
              ad-free for everyone
              <ion-icon :icon="svg(mdiHeart)" class="text-secondary text-sm align-[-1px]" />
            </p>
          </div>
        </div>

        <!-- ─── Get Pro → plan selection sheet (only useful while Pro is an option) ─── -->
        <ion-button v-if="!isPro" expand="block" fill="outline" color="secondary" shape="round" size="large" class="m-0"
                    @click="selectOpen = true">
          See all plans
        </ion-button>

        <!-- ─── Legal (store compliance) ─── -->
        <p class="text-[12px] text-black/60 leading-snug text-center px-2 mt-2">
<!--          Subscriptions auto-renew until cancelled. Cancel anytime in your store account.-->
<!--          <button class="underline" @click="openLink(TERMS_URL)">Terms</button>-->
<!--          ·-->
          <button class="underline" @click="openLink(PRIVACY_URL)">Privacy</button>
          ·
          <button class="underline" @click="subStore.restorePurchases()">Restore</button>
        </p>
      </div>

      <!-- ─── Plan selection sheet ─── -->
      <BaseSheetModal :is-open="selectOpen" @close="selectOpen = false">
        <template #header>
          <div class="text-center px-2">
            <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none cabin-sketch-regular">
              Choose your plan
            </h1>
            <p class="text-[14px] text-black/70 mt-2">Cancel anytime · unlock instantly</p>
          </div>
        </template>

        <div class="space-y-2.5">
          <button
            v-for="opt in planOptions"
            :key="opt.id"
            class="w-full rounded-[1.5rem] border-2 px-4 py-3 flex items-center justify-between transition-all cursor-pointer active:scale-[0.98]"
            :class="selectedPlan === opt.id ? 'border-secondary bg-secondary/10' : 'border-primary/40 bg-tertiary'"
            @click="selectedPlan = opt.id"
          >
            <div class="text-left">
              <div class="flex items-center gap-2">
                <span class="text-[16px] font-black text-black">{{ opt.title }}</span>
                <span v-if="opt.badge"
                      class="text-[11px] font-black text-white bg-secondary px-1.5 py-0.5 rounded-full">
                  {{ opt.badge }}
                </span>
              </div>
              <p v-if="opt.sub" class="text-[13px] text-black/65 mt-0.5">{{ opt.sub }}</p>
            </div>
            <span class="text-[16px] font-black text-black shrink-0">{{ opt.price }}</span>
          </button>

          <p v-if="!planOptions.length" class="text-center text-[14px] text-black/60 py-6">
            Loading plans…
          </p>
        </div>

        <template #footer>
          <ion-button
            expand="block"
            color="secondary"
            shape="round"
            size="large"
            class="m-0"
            :disabled="!selectedPkg || purchasing"
            @click="buy"
          >
            {{ purchasing ? 'Processing…' : 'Continue' }}
          </ion-button>
        </template>
      </BaseSheetModal>

    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { Browser } from "@capacitor/browser";
import { IonButton, IonContent, IonIcon, IonModal } from "@ionic/vue";
import {
	mdiBrush,
	mdiCheck,
	mdiCheckAll,
	mdiCrown,
	mdiCrownOutline,
	mdiHeart,
	mdiInfinity,
	mdiLayersTripleOutline,
	mdiMinus,
	mdiMotionPlayOutline,
	mdiPalette,
	mdiShimmer,
} from "@mdi/js";
import {
	Purchases,
	type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import { chevronBackOutline } from "ionicons/icons";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import bigbossImage from "@/assets/bigboss.jpg";
import logo from "@/assets/logo.webp";
// TODO: swap in two distinct cat illustrations later; same image for now.
import crazyCat from "@/assets/stickers/crazy.webp";
import fireCat from "@/assets/stickers/fire.webp";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import { LIFETIME_RC_PRODUCT } from "@/config/catalog.config";
import { isNative, svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { useSubscriptionStore } from "@/store/subscription.store";

// TODO: point these at the live pages before release.
const TERMS_URL = "https://sketchmate.app/terms";
const PRIVACY_URL = "https://sketchmate.ninja/legal";

const menuStore = useMenuStore();
const subStore = useSubscriptionStore();
const { isPaywallOpen } = storeToRefs(menuStore);

// Already Pro → the only upgrade left is Lifetime. Hide every Pro-subscription
// surface (card, comparison, monthly/yearly plans) so the flow is Pro → Lifetime.
const isPro = computed(() => subStore.isPro);

// ─── Static marketing content ────────────────────────────────────────────────
const proBullets = [
	{ label: "All brushes", icon: mdiBrush },
	{ label: "10 layers per drawing", icon: mdiLayersTripleOutline },
	{ label: "Animated avatar", icon: mdiMotionPlayOutline },
	{ label: "Advanced profile customization", icon: mdiPalette },
	{ label: "VIP lobby slots", icon: mdiCrownOutline },
	{ label: "More posts & balloons", icon: mdiCrownOutline },
];
// The cosmetic shop categories Lifetime unlocks (mirrors Shop.vue's filter bar,
// minus brushes — those already come with Pro). Naming them makes the abstract
// word "cosmetics" concrete on the paywall.
const cosmeticTypes = ["Themes", "Worlds", "Effects", "Decor", "Fonts", "Text"];
// Mirrors the RevenueCat comparison table. string = value, boolean = check/dash.
const compare: {
	label: string;
	pro: boolean | string;
	life: boolean | string;
}[] = [
	{ label: "Unlock all cosmetics", pro: false, life: true },
	{ label: "All brushes", pro: true, life: true },
	{ label: "Layers per drawing", pro: "10", life: "10" },
	{ label: "Animated avatar", pro: true, life: true },
	{ label: "Custom signature & card doodle", pro: true, life: true },
	{ label: "Custom chat background", pro: true, life: true },
	{ label: "VIP lobby slots", pro: true, life: true },
	{ label: "More posts", pro: "6", life: "6" },
	{ label: "More balloons", pro: "5", life: "5" },
];

// ─── RC packages ─────────────────────────────────────────────────────────────
const monthly = ref<PurchasesPackage>();
const yearly = ref<PurchasesPackage>();
const lifetime = ref<PurchasesPackage>();

const proCycle = ref<"yearly" | "monthly">("yearly");
const selectedProPkg = computed(() =>
	proCycle.value === "yearly" ? yearly.value : monthly.value,
);

const yearlyDiscount = computed(() => {
	const m = monthly.value?.product.price;
	const y = yearly.value?.product.price;
	if (!m || !y) return null;
	const pct = Math.round((1 - y / (m * 12)) * 100);
	return pct > 0 ? pct : null;
});

// Web has no RevenueCat — fake a few packages in dev so the whole paywall
// (cards, discount %, table, plan sheet) is verifiable in the browser.
function mockPkg(
	id: string,
	type: string,
	price: number,
	priceString: string,
): PurchasesPackage {
	return {
		identifier: id,
		packageType: type,
		product: { identifier: id, price, priceString },
	} as unknown as PurchasesPackage;
}

async function loadPackages() {
	if (!isNative()) {
		if (import.meta.env.DEV) {
			monthly.value = mockPkg("sm_pro_monthly", "MONTHLY", 2.99, "$2.99");
			yearly.value = mockPkg("sm_pro_yearly", "ANNUAL", 19.99, "$19.99");
			lifetime.value = mockPkg(
				LIFETIME_RC_PRODUCT,
				"LIFETIME",
				39.99,
				"$39.99",
			);
		}
		return;
	}
	try {
		const offerings = await Purchases.getOfferings();
		const pkgs = offerings.all["paywall_items"]?.availablePackages ?? [];
		monthly.value = pkgs.find((p) => p.packageType === "MONTHLY");
		yearly.value = pkgs.find((p) => p.packageType === "ANNUAL");
		lifetime.value =
			pkgs.find((p) => p.product.identifier === LIFETIME_RC_PRODUCT) ??
			pkgs.find((p) => p.packageType === "LIFETIME");
	} catch (e) {
		console.error("[paywall] failed to load offerings", e);
	}
}

// Load once when the paywall opens.
watch(
	isPaywallOpen,
	(open) => {
		if (!open) return;
		if (isPro.value) selectedPlan.value = "lifetime";
		if (!monthly.value && !yearly.value && !lifetime.value) void loadPackages();
	},
	{ immediate: true },
);

// ─── Purchasing ──────────────────────────────────────────────────────────────
const purchasing = ref(false);

async function buyPkg(pkg?: PurchasesPackage) {
	if (!pkg || purchasing.value) return false;
	purchasing.value = true;
	const ok = await subStore.purchaseSubscription(pkg);
	purchasing.value = false;
	return ok;
}

// Direct per-card purchases.
const buyCycle = () => buyPkg(selectedProPkg.value);
const buyLifetime = () => buyPkg(lifetime.value);

// ─── Plan selection sheet ────────────────────────────────────────────────────
const selectOpen = ref(false);
type PlanId = "monthly" | "yearly" | "lifetime";
const selectedPlan = ref<PlanId>("yearly");

const planOptions = computed(() => {
	const out: {
		id: PlanId;
		title: string;
		sub?: string;
		price: string;
		badge?: string;
	}[] = [];
	if (yearly.value && !isPro.value)
		out.push({
			id: "yearly",
			title: "Yearly",
			sub: "Billed once a year",
			price: yearly.value.product.priceString,
			badge: yearlyDiscount.value
				? `Save ${yearlyDiscount.value}%`
				: "Best value",
		});
	if (monthly.value && !isPro.value)
		out.push({
			id: "monthly",
			title: "Monthly",
			sub: "Billed monthly",
			price: monthly.value.product.priceString,
		});
	if (lifetime.value)
		out.push({
			id: "lifetime",
			title: "Lifetime",
			sub: "One-time · forever yours",
			price: lifetime.value.product.priceString,
		});
	return out;
});

const selectedPkg = computed<PurchasesPackage | undefined>(() => {
	if (selectedPlan.value === "yearly") return yearly.value;
	if (selectedPlan.value === "monthly") return monthly.value;
	return lifetime.value;
});

async function buy() {
	const ok = await buyPkg(selectedPkg.value);
	if (ok) selectOpen.value = false;
}

function close() {
	isPaywallOpen.value = false;
}

function openLink(url: string) {
	void Browser.open({ url });
}
</script>

<style scoped>
ion-modal.full-screen-modal {
  --height: 100%;
  --width: 100%;
  --border-radius: 0;
}

.--bg-canvas {
  --background: var(--ion-color-background) !important;
}

.header-bg {
  background-color: rgba(245, 230, 211, 0.95);
}
</style>
