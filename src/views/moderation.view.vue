<template>
  <ion-page class="slide-page">
    <SubPageBar title="Report Status" />

    <ion-content class="bg-background">
      <div class="w-full max-w-2xl mx-auto px-5 pt-5 bot-pad-safe flex flex-col min-h-full">

        <div class="grow flex flex-col gap-4">

          <!-- CURRENT STANDING — hero card -->
          <section
            class="rounded-3xl p-5 border shadow-sm transition-all flex flex-col gap-3"
            :class="levelCardClass"
          >
            <div class="flex items-center gap-4">
              <div
                class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-sm"
                :class="levelIconBgClass"
              >
                {{ levelEmoji }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="cabin-sketch-regular text-[11px] font-bold uppercase tracking-widest opacity-60">
                  Your Standing
                </p>
                <h2 class="text-xl font-black tracking-tight leading-none mt-1">
                  {{ standing?.name || 'Good Standing' }}
                </h2>
              </div>
            </div>

            <p class="text-sm opacity-80 italic leading-snug">
              {{ standing?.description || 'All features unlocked. Keep sketching!' }}
            </p>

            <!-- Expiry info — only when restricted -->
            <div
              v-if="modStore.isRestricted && standing?.restriction?.expires_at"
              class="mt-2 pt-3 border-t border-current/10 flex items-center justify-between text-sm"
            >
              <span class="opacity-70 font-medium">Restriction lifts</span>
              <span class="font-black">{{ formatExpiry(standing.restriction.expires_at) }}</span>
            </div>
          </section>

          <!-- STATS GRID -->
          <section class="grid grid-cols-2 gap-3">
            <div class="bg-primary/5 border border-black/5 rounded-3xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
              <p class="text-3xl font-black leading-none">{{ modStore.strikeSummary.active_strikes }}</p>
              <p class="cabin-sketch-regular text-[11px] font-bold opacity-50 uppercase tracking-widest mt-1">Active Strikes</p>
              <p class="text-[9px] opacity-40 mt-0.5 italic">within 90 days</p>
            </div>
            <div class="bg-primary/5 border border-black/5 rounded-3xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
              <p class="text-3xl font-black leading-none">{{ modStore.strikeSummary.total_strikes }}</p>
              <p class="cabin-sketch-regular text-[11px] font-bold opacity-50 uppercase tracking-widest mt-1">Lifetime Strikes</p>
              <p class="text-[9px] opacity-40 mt-0.5 italic">all-time record</p>
            </div>
          </section>

          <!-- BLOCKED FEATURES — grouped into pills -->
          <section
            v-if="modStore.isRestricted && standing?.restriction?.blocked_capabilities?.length"
            class="bg-red-50/50 rounded-3xl p-5 border border-red-100 shadow-sm"
          >
            <h3 class="cabin-sketch-regular text-sm font-bold text-red-900/50 mb-3 uppercase tracking-wider">
              Paused Features
            </h3>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="cap in standing.restriction.blocked_capabilities"
                :key="cap"
                class="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl border border-red-100 text-[13px] shadow-sm text-red-900"
              >
                <span class="text-base leading-none">{{ capabilityEmoji(cap) }}</span>
                <span class="font-bold">{{ capabilityLabel(cap) }}</span>
              </div>
            </div>
          </section>

          <!-- HISTORY -->
          <section
            v-if="standing?.history?.length"
            class="bg-white rounded-3xl p-5 border border-black/5 shadow-sm"
          >
            <h3 class="cabin-sketch-regular text-sm font-bold text-black/40 mb-2 uppercase tracking-wider">
              Recent History
            </h3>
            <div class="divide-y divide-black/5">
              <div
                v-for="(action, idx) in standing.history.slice(0, 10)"
                :key="idx"
                class="py-3 flex items-center justify-between text-sm first:pt-1 last:pb-0"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <span class="text-lg shrink-0">{{ actionEmoji(action.action_type) }}</span>
                  <div class="min-w-0">
                    <p class="font-bold truncate text-gray-800">{{ actionLabel(action.action_type) }}</p>
                    <p v-if="action.reason" class="text-[11px] text-gray-400 italic mt-0.5 truncate">{{ reasonLabel(action.reason) }}</p>
                  </div>
                </div>
                <span class="text-[11px] font-medium text-gray-400 shrink-0 ml-3">
                  {{ formatDate(action.created_at) }}
                </span>
              </div>
            </div>
          </section>

          <!-- EDUCATIONAL CONTENT (ACCORDIONS) -->
          <section class="bg-primary/5 rounded-3xl border border-black/5 shadow-sm overflow-hidden flex flex-col">

            <!-- Code of Conduct -->
            <details class="group border-b border-black/5 last:border-0">
              <summary class="p-4 flex items-center justify-between font-bold text-sm cursor-pointer select-none bg-white/40 hover:bg-white/60 transition-colors">
                <span class="cabin-sketch-regular uppercase tracking-wider text-black/60 text-base">Code of Conduct</span>
                <span class="opacity-40 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <div class="p-4 pt-2 space-y-4 bg-white/20 text-sm">
                <p class="opacity-80 italic">
                  Sketchmate is a creative space. We want everyone to feel free to make weird, expressive, personal work — and to feel safe doing it.
                </p>
                <ul class="space-y-3">
                  <li v-for="rule in CODE_OF_CONDUCT" :key="rule.title" class="flex gap-3">
                    <span class="text-lg shrink-0 mt-0.5">{{ rule.emoji }}</span>
                    <div>
                      <p class="font-bold text-gray-800">{{ rule.title }}</p>
                      <p class="text-gray-500 text-[13px] leading-snug mt-0.5">{{ rule.body }}</p>
                    </div>
                  </li>
                </ul>
              </div>
            </details>

            <!-- How Moderation Works -->
            <details class="group border-b border-black/5 last:border-0">
              <summary class="p-4 flex items-center justify-between font-bold text-sm cursor-pointer select-none bg-white/40 hover:bg-white/60 transition-colors">
                <span class="cabin-sketch-regular uppercase tracking-wider text-black/60 text-base">How Moderation Works</span>
                <span class="opacity-40 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <div class="p-4 pt-2 space-y-3 text-[13px] leading-relaxed text-gray-600 bg-white/20">
                <p>
                  When someone reports your content, it gets reviewed. If we agree it broke the rules, your account moves up the strike ladder — each level pauses a different set of features for a set amount of time.
                </p>
                <p>
                  <strong class="text-gray-800">Strikes fade after 90 days.</strong> A single mistake doesn't follow you forever. The further you go without another strike, the cleaner your slate becomes.
                </p>
                <p>
                  <strong class="text-gray-800">Think we got it wrong?</strong> Reach out on discord or at <a href="mailto:damian.vlaicu@gmail.com" class="underline font-bold text-black">damian.vlaicu@gmail.com</a> — every appeal goes to a human.
                </p>
              </div>
            </details>

            <!-- The Strike Ladder -->
            <details class="group border-b border-black/5 last:border-0">
              <summary class="p-4 flex items-center justify-between font-bold text-sm cursor-pointer select-none bg-white/40 hover:bg-white/60 transition-colors">
                <span class="cabin-sketch-regular uppercase tracking-wider text-black/60 text-base">The Strike Ladder</span>
                <span class="opacity-40 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <div class="p-4 pt-2 space-y-2 bg-white/20">
                <div
                  v-for="(rung, idx) in LADDER"
                  :key="idx"
                  class="flex items-start gap-3 p-3 rounded-2xl transition-all border"
                  :class="modStore.level === idx ? 'bg-white border-secondary shadow-sm' : 'bg-transparent border-transparent'"
                >
                  <div
                    class="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0"
                    :class="modStore.level === idx ? 'bg-secondary text-white' : 'bg-black/5 text-black/40'"
                  >
                    L{{ idx }}
                  </div>
                  <div class="flex-1 min-w-0 pt-0.5">
                    <p class="font-bold text-[13px] text-gray-800" :class="{'text-secondary': modStore.level === idx}">
                      {{ rung.name }}
                      <span v-if="modStore.level === idx" class="ml-1 text-[10px] uppercase tracking-wider opacity-60">(You)</span>
                    </p>
                    <p class="text-[12px] text-gray-500 leading-snug mt-0.5">{{ rung.description }}</p>
                  </div>
                </div>
              </div>
            </details>

          </section>

        </div>

        <div class="h-8"></div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonContent } from "@ionic/vue";
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useModerationStore } from "@/store/moderation.store";
import SubPageBar from "@/components/general/SubPageBar.vue";
import dayjs from "dayjs";

const modStore = useModerationStore();
const { standing } = storeToRefs(modStore);

onMounted(() => modStore.fetchStanding());

// =============================================================================
// LADDER
// =============================================================================
const LADDER = [
	{
		name: "Good Standing",
		description: "All features unlocked. Keep sketching!",
	},
	{
		name: "First Warning",
		description:
			"A piece of content was removed. No restrictions yet — consider this a heads-up.",
	},
	{
		name: "Balloon Pause",
		description: "Balloon privileges paused for 7 days. Everything else works.",
	},
	{
		name: "Public Pause",
		description:
			"Public posting and balloons paused for 30 days. Chat with mates still works.",
	},
	{
		name: "Account Under Review",
		description:
			"Most features paused while we review. Contact support to appeal.",
	},
	{
		name: "Suspended",
		description: "Account suspended. Reach out if you think this is a mistake.",
	},
];

const CODE_OF_CONDUCT = [
	{
		emoji: "🎨",
		title: "Make art, not weapons",
		body: "Sketches that target, threaten, or harass others get removed.",
	},
	{
		emoji: "🚫",
		title: "No sexual or explicit content",
		body: "Sketchmate is for everyone, including young artists.",
	},
	{
		emoji: "🛡️",
		title: "Protect minors",
		body: "Content that endangers minors leads to immediate suspension.",
	},
	{
		emoji: "🙅",
		title: "No hate speech",
		body: "No slurs, no targeted attacks on identity.",
	},
	{
		emoji: "👥",
		title: "Be yourself",
		body: "Impersonating others — including in your username or sketches — is not allowed.",
	},
	{
		emoji: "🤝",
		title: "Disagreements happen",
		body: "If something bothers you, use Report or Block. We'd rather you walk away than escalate.",
	},
];

// =============================================================================
// COMPUTED
// =============================================================================
const levelEmoji = computed(() => {
	const map = ["✨", "⚠️", "🎈", "📛", "🔍", "🚫"];
	return map[modStore.level] ?? "✨";
});

const levelCardClass = computed(() => {
	if (modStore.level === 0)
		return "bg-emerald-50/80 border-emerald-200 text-emerald-900";
	if (modStore.level >= 4) return "bg-red-50/80 border-red-200 text-red-900";
	return "bg-amber-50/80 border-amber-200 text-amber-900";
});

const levelIconBgClass = computed(() => {
	if (modStore.level === 0) return "bg-emerald-100 text-emerald-700";
	if (modStore.level >= 4) return "bg-red-100 text-red-700";
	return "bg-amber-100 text-amber-700";
});

// =============================================================================
// LABEL HELPERS
// =============================================================================
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

function capabilityEmoji(cap: string): string {
	if (cap.includes("BALLOON")) return "🎈";
	if (cap.includes("POST")) return "📝";
	if (cap.includes("LOBBY")) return "🎨";
	if (cap.includes("DM") || cap.includes("MATE")) return "💬";
	if (cap.includes("CHANGE")) return "✏️";
	return "🚫";
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

function actionEmoji(action: string): string {
	if (
		action.includes("lifted") ||
		action.includes("decayed") ||
		action.includes("granted")
	)
		return "✅";
	if (action.includes("denied") || action.includes("suspension")) return "🚫";
	return "⚠️";
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
	if (d.isBefore(dayjs())) return "Lifting now…";
	return d.format("MMM D, h:mm A");
}
</script>

<style scoped>
@reference "@/theme/main.css";

ion-content::part(scroll) {
  display: flex;
  flex-direction: column;
}

/* Hide default accordion arrow */
details > summary {
  list-style: none;
}
details > summary::-webkit-details-marker {
  display: none;
}
</style>