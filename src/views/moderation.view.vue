<template>
  <ion-page class="slide-page">
    <SubPageBar title="Account Status" />

    <ion-content class="bg-background">
      <div class="w-full max-w-2xl mx-auto px-4 pt-5 pb-10 bot-pad-safe flex flex-col min-h-full">

        <div class="grow flex flex-col gap-4">

          <section
            class="rounded-2xl p-4 border shadow-sm flex flex-col gap-2 transition-colors"
            :class="levelCardClass"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm"
                :class="levelIconBgClass"
              >
                <ion-icon :icon="svg(levelIcon)" />
              </div>
              <div class="min-w-0">
                <p class="cabin-sketch-regular text-xs font-black uppercase tracking-widest text-black/60 leading-none">
                  Status
                </p>
                <h2 class="text-xl font-black tracking-tight mt-1 leading-none">
                  {{ standing?.name || 'Good Standing' }}
                </h2>
              </div>
            </div>

            <p class="text-base opacity-90 leading-snug mt-1">
              {{ standing?.description || 'All features unlocked. Keep sketching!' }}
            </p>

            <div
              v-if="modStore.isRestricted && standing?.restriction?.expires_at"
              class="mt-1 pt-2 border-t border-current/10 flex items-center justify-between text-sm"
            >
              <span class="opacity-70 font-medium">Restriction ends</span>
              <span class="font-black">{{ formatExpiry(standing.restriction.expires_at) }}</span>
            </div>
          </section>

          <section class="grid grid-cols-2 gap-3">
            <div class="bg-white/40 border border-primary/10 rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
              <p class="text-3xl font-black leading-none text-black">{{ modStore.strikeSummary.active_strikes }}</p>
              <p class="cabin-sketch-regular text-xs font-black text-black/60 uppercase tracking-widest mt-1">Active Strikes</p>
              <p class="text-xs text-black/60 mt-0.5">Last 90 days</p>
            </div>
            <div class="bg-white/40 border border-primary/10 rounded-2xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
              <p class="text-3xl font-black leading-none text-black">{{ modStore.strikeSummary.total_strikes }}</p>
              <p class="cabin-sketch-regular text-xs font-black text-black/60 uppercase tracking-widest mt-1">Total History</p>
              <p class="text-xs text-black/60 mt-0.5">All-time record</p>
            </div>
          </section>

          <section
            v-if="modStore.isRestricted && standing?.restriction?.blocked_capabilities?.length"
            class="bg-red-50/40 rounded-2xl p-4 border border-red-200/60 shadow-sm"
          >
            <h3 class="cabin-sketch-regular text-sm font-black text-red-900/70 mb-2.5 uppercase tracking-wider">
              Paused Features
            </h3>
            <div class="flex flex-wrap gap-1.5">
              <div
                v-for="cap in standing.restriction.blocked_capabilities"
                :key="cap"
                class="flex items-center gap-1 px-2.5 py-1 bg-white border border-red-100 rounded-xl text-sm font-bold text-red-950 shadow-sm"
              >
                <ion-icon :icon="svg(capabilityIcon(cap))" class="text-base" />
                <span>{{ capabilityLabel(cap) }}</span>
              </div>
            </div>
          </section>

          <section
            v-if="standing?.history?.length"
            class="bg-white/50 rounded-2xl p-4 border border-primary/10 shadow-sm"
          >
            <h3 class="cabin-sketch-regular text-sm font-black text-black/60 mb-1 uppercase tracking-wider">
              Recent History
            </h3>
            <div class="divide-y divide-primary/10">
              <div
                v-for="(action, idx) in standing.history.slice(0, 10)"
                :key="idx"
                class="py-2.5 flex items-center justify-between text-sm first:pt-1 last:pb-0"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <ion-icon :icon="svg(actionIcon(action.action_type))" class="text-lg shrink-0" />
                  <div class="min-w-0">
                    <p class="font-bold truncate text-black">{{ actionLabel(action.action_type) }}</p>
                    <p v-if="action.reason" class="text-xs text-black/60 mt-0.5 truncate font-medium">{{ reasonLabel(action.reason) }}</p>
                  </div>
                </div>
                <span class="text-xs font-black text-black/60 shrink-0 ml-2">
                  {{ formatDate(action.created_at) }}
                </span>
              </div>
            </div>
          </section>

          <section class="bg-white/50 rounded-2xl border border-primary/10 shadow-sm overflow-hidden flex flex-col">

            <details class="group border-b border-primary/10 last:border-0">
              <summary class="p-3.5 flex items-center justify-between font-bold text-sm cursor-pointer select-none bg-white/30 hover:bg-white/60 transition-colors">
                <span class="cabin-sketch-regular uppercase tracking-wider text-black/70 text-base">Rules</span>
                <ion-icon :icon="svg(mdiChevronDown)" class="text-xs text-black/50 transition-transform group-open:rotate-180" />
              </summary>
              <div class="p-4 pt-2 space-y-3 bg-white/20 text-sm">
                <p class="text-black/70 font-medium">
                  Sketchmate is for weird, expressive, personal work. To keep it safe for everyone, please follow these core boundaries:
                </p>
                <ul class="space-y-2.5">
                  <li v-for="rule in CODE_OF_CONDUCT" :key="rule.title" class="flex gap-2.5">
                    <ion-icon :icon="svg(rule.icon)" class="text-lg shrink-0 mt-0.5" />
                    <div>
                      <p class="text-base font-black text-black">{{ rule.title }}</p>
                      <p class="text-black/70 font-medium leading-snug mt-0.5">{{ rule.body }}</p>
                    </div>
                  </li>
                </ul>
              </div>
            </details>

            <details class="group border-b border-primary/10 last:border-0">
              <summary class="p-3.5 flex items-center justify-between font-bold text-sm cursor-pointer select-none bg-white/30 hover:bg-white/60 transition-colors">
                <span class="cabin-sketch-regular uppercase tracking-wider text-black/70 text-base">Review Process</span>
                <ion-icon :icon="svg(mdiChevronDown)" class="text-xs text-black/50 transition-transform group-open:rotate-180" />
              </summary>
              <div class="p-4 pt-2 space-y-2 text-sm leading-relaxed text-black/70 bg-white/20 font-medium">
                <p>
                  Reported content is human-reviewed. Valid violations shift your account down the ladder, temporarily disabling specific capabilities.
                </p>
                <p>
                  <strong class="text-black font-black">Strikes expire in 90 days.</strong> Mistakes do not trace you indefinitely. Continued safe behavior returns your profile to baseline.
                </p>
                <p>
                  <strong class="text-black font-black">Appeals:</strong> If an action was taken in error, contact support via Discord or at <a href="mailto:damian.vlaicu@gmail.com" class="underline font-bold text-black">damian.vlaicu@gmail.com</a>.
                </p>
              </div>
            </details>

            <details class="group border-b border-primary/10 last:border-0">
              <summary class="p-3.5 flex items-center justify-between font-bold text-sm cursor-pointer select-none bg-white/30 hover:bg-white/60 transition-colors">
                <span class="cabin-sketch-regular uppercase tracking-wider text-black/70 text-base">System Levels</span>
                <ion-icon :icon="svg(mdiChevronDown)" class="text-xs text-black/50 transition-transform group-open:rotate-180" />
              </summary>
              <div class="p-3 pt-1.5 space-y-1 bg-white/20">
                <div
                  v-for="(rung, idx) in LADDER"
                  :key="idx"
                  class="flex items-start gap-2.5 p-2 rounded-xl transition-all border"
                  :class="modStore.level === idx ? 'bg-white border-secondary/40 shadow-sm' : 'bg-transparent border-transparent'"
                >
                  <div
                    class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                    :class="modStore.level === idx ? 'bg-secondary text-white' : 'bg-black/5 text-black/60'"
                  >
                    L{{ idx }}
                  </div>
                  <div class="flex-1 min-w-0 pt-0.5 text-sm">
                    <p class="font-black text-black" :class="{'text-secondary': modStore.level === idx}">
                      {{ rung.name }}
                      <span v-if="modStore.level === idx" class="ml-1 text-xs uppercase tracking-wider text-black/70">(Active)</span>
                    </p>
                    <p class="text-black/70 font-medium leading-snug mt-0.5">{{ rung.description }}</p>
                  </div>
                </div>
              </div>
            </details>

          </section>

        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonContent, IonIcon } from "@ionic/vue";
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import {
	mdiAccountAlert,
	mdiAccountQuestion,
	mdiAlert,
	mdiAlertOctagon,
	mdiBalloon,
	mdiCancel,
	mdiCheckCircle,
	mdiChevronDown,
	mdiEyeOff,
	mdiHandshakeOutline,
	mdiMessageText,
	mdiPalette,
	mdiPencil,
	mdiPencilOutline,
	mdiShieldAlert,
	mdiShieldCheck,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { useModerationStore } from "@/store/moderation.store";
import SubPageBar from "@/components/general/SubPageBar.vue";
import dayjs from "dayjs";

const modStore = useModerationStore();
const { standing } = storeToRefs(modStore);

onMounted(() => modStore.fetchStanding());

const LADDER = [
	{
		name: "Good Standing",
		description: "All features unlocked. Keep sketching!",
	},
	{
		name: "First Warning",
		description:
			"Content removed. Guidelines breached—no feature restrictions active.",
	},
	{
		name: "Public Pause",
		description:
			"Public streams and balloons disabled for 30 days. Direct messaging remains active.",
	},
	{
		name: "Suspended",
		description: "Account access revoked. Contact support to dispute.",
	},
];

const CODE_OF_CONDUCT = [
	{
		icon: mdiAccountAlert,
		title: "Harassment",
		body: "Targeted behavior, bullying, or tracking sketches meant to threaten are prohibited.",
	},
	{
		icon: mdiEyeOff,
		title: "Explicit Material",
		body: "Adult, sexual, or overtly graphic illustrations are removed instantly.",
	},
	{
		icon: mdiShieldAlert,
		title: "Minor Safety",
		body: "Any material placing underage accounts at risk results in permanent closures.",
	},
	{
		icon: mdiAlertOctagon,
		title: "Hate Speech",
		body: "Slurs or attacks targeting group identity profiles are not tolerated.",
	},
	{
		icon: mdiAccountQuestion,
		title: "Impersonation",
		body: "Claiming identity confuse others is banned.",
	},
	{
		icon: mdiHandshakeOutline,
		title: "Disputes",
		body: "In a fight? Block the user, do not escalate.",
	},
];

const levelIcon = computed(() => {
	const map = [mdiShieldCheck, mdiAlert, mdiAlertOctagon, mdiCancel];
	return map[modStore.level] ?? mdiShieldCheck;
});

const levelCardClass = computed(() => {
	if (modStore.level === 0)
		return "bg-emerald-50/40 border-emerald-200/60 text-emerald-950";
	if (modStore.level >= 3) return "bg-red-50/40 border-red-200/60 text-red-950";
	return "bg-amber-50/40 border-amber-200/60 text-amber-950";
});

const levelIconBgClass = computed(() => {
	if (modStore.level === 0) return "bg-emerald-100/60 text-emerald-800";
	if (modStore.level >= 3) return "bg-red-100/60 text-red-800";
	return "bg-amber-100/60 text-amber-800";
});

function capabilityLabel(cap: string): string {
	const map: Record<string, string> = {
		CREATE_POST: "Posting drawings",
		COMMENT_ON_POST: "Commenting",
		REACT_TO_POST: "Reacting",
		SEND_INBOX_DRAWING: "Sending drawings",
		COMMENT_ON_INBOX: "Inbox comments",
		SEND_BALLOON: "Sending balloons",
		RECEIVE_BALLOON: "Receiving balloons",
		SEND_DM: "Messaging",
		SEND_MATE_REQUEST: "Mate requests",
		CREATE_LOBBY: "Creating lobbies",
		JOIN_PUBLIC_LOBBY: "Joining lobbies",
		SEND_LOBBY_MESSAGE: "Lobby chat",
		DRAW_IN_LOBBY: "Drawing in lobbies",
		CHANGE_NAME: "Name changes",
		CHANGE_PROFILE_IMG: "Profile image",
	};
	return map[cap] ?? cap;
}

function capabilityIcon(cap: string): string {
	if (cap.includes("BALLOON")) return mdiBalloon;
	if (cap.includes("POST")) return mdiPencil;
	if (cap.includes("LOBBY")) return mdiPalette;
	if (cap.includes("DM") || cap.includes("MATE")) return mdiMessageText;
	if (cap.includes("CHANGE")) return mdiPencilOutline;
	return mdiCancel;
}

function reasonLabel(reason: string): string {
	const map: Record<string, string> = {
		minor_safety: "Minor safety",
		nsfw: "Sexual content",
		violence: "Violence",
		harassment: "Harassment",
		hate_speech: "Hate speech",
		spam: "Spam",
		impersonation: "Impersonation",
		other: "Other",
	};
	return map[reason] ?? reason;
}

function actionLabel(action: string): string {
	const map: Record<string, string> = {
		strike_applied: "Strike received",
		strike_decayed: "Strike expired",
		restriction_applied: "Restriction applied",
		restriction_lifted: "Restriction lifted",
		manual_suspension: "Manual suspension",
		appeal_granted: "Appeal granted",
		appeal_denied: "Appeal denied",
	};
	return map[action] ?? action;
}

function actionIcon(action: string): string {
	if (
		action.includes("lifted") ||
		action.includes("decayed") ||
		action.includes("granted")
	)
		return mdiCheckCircle;
	if (action.includes("denied") || action.includes("suspension")) return mdiCancel;
	return mdiAlert;
}

function formatDate(iso: string): string {
	const d = dayjs(iso);
	const days = dayjs().diff(d, "day");
	if (days === 0) return d.fromNow();
	if (days < 7) return d.format("ddd, MMM D");
	return d.format("MMM D, YYYY");
}

function formatExpiry(iso: string): string {
	const d = dayjs(iso);
	if (d.isBefore(dayjs())) return "Processing update…";
	return d.format("MMM D, h:mm A");
}
</script>

<style scoped>
@reference "@/theme/main.css";

ion-content::part(scroll) {
  display: flex;
  flex-direction: column;
}

details > summary {
  list-style: none;
}
details > summary::-webkit-details-marker {
  display: none;
}
</style>