<template>
  <!-- DEV-only competition controls. A weekly feature is untestable if the only
       way to see a transition is to wait a week; these buttons walk the whole
       cycle in about a minute against the real server code. -->
  <div class="fixed z-[9999] bottom-24 right-3 cabin-sketch-regular">
    <button
      v-if="!open"
      class="w-11 h-11 rounded-full bg-black/80 text-white shadow-lg active:scale-90 transition-all"
      aria-label="Open competition developer tools"
      @click="open = true"
    >
      DEV
    </button>

    <div
      v-else
      class="w-[268px] max-h-[70vh] overflow-y-auto rounded-2xl bg-black/85 backdrop-blur text-white p-3 shadow-2xl space-y-2"
    >
      <div class="flex items-center justify-between">
        <p class="font-black text-sm">Competition dev</p>
        <button class="text-white/80 text-xs px-2 py-1" @click="open = false">close</button>
      </div>

      <p class="text-[11px] leading-snug text-white/80 break-words">
        <template v-if="store.competition">
          {{ store.competition.week_key }} · {{ store.phase }}<br />
          "{{ store.competition.theme }}" · {{ store.competition.entry_count }} entries
        </template>
        <template v-else>No active competition</template>
      </p>

      <p v-if="message" class="text-[11px] bg-white/10 rounded-lg p-2 break-words">{{ message }}</p>

      <button
        class="w-full text-[11px] font-bold rounded-lg bg-white/20 hover:bg-white/30 active:scale-95 transition-all px-2 py-2"
        @click="openPage"
      >
        Open competition page
      </button>

      <div class="grid grid-cols-2 gap-1.5">
        <button v-for="action in actions" :key="action.label"
                class="text-[11px] font-bold rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 transition-all px-2 py-2 disabled:opacity-40"
                :disabled="busy || (action.needsComp && !store.competition)"
                @click="run(action)">
          {{ action.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { useIonRouter } from "@ionic/vue";
import { onMounted, ref } from "vue";
import { masterAnimation } from "@/helper/animation.helper";
import { useCompetitionStore } from "@/store/competition.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const store = useCompetitionStore();
const r = useIonRouter();

const openPage = () =>
	r.push(`/${FRONTEND_ROUTES.competition}`, masterAnimation);

onMounted(() => {
	void store.refresh();
});

const open = ref(false);
const busy = ref(false);
const message = ref("");

const BASE = `${import.meta.env.VITE_BACKEND as string}/dev/competition`;

async function call(path: string, body?: unknown, method = "POST") {
	const { token } = await FirebaseAuthentication.getIdToken();
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	if (!res.ok) throw new Error(text);
	return text ? JSON.parse(text) : {};
}

interface DevAction {
	label: string;
	needsComp?: boolean;
	run: (id?: string) => Promise<unknown>;
}

const actions: DevAction[] = [
	{
		label: "Start test cycle",
		run: () => call("/create", { minutes: 6, submissions_minutes: 4 }),
	},
	{
		label: "Seed 20 entries",
		needsComp: true,
		run: (id) => call(`/${id}/seed-entries`, { count: 20 }),
	},
	{
		label: "Seed 60 votes",
		needsComp: true,
		run: (id) => call(`/${id}/seed-votes`, { votes: 60 }),
	},
	{
		label: "→ open",
		needsComp: true,
		run: (id) => call(`/${id}/phase`, { phase: "open" }),
	},
	{
		label: "→ voting",
		needsComp: true,
		run: (id) => call(`/${id}/phase`, { phase: "voting" }),
	},
	{
		label: "Announce now",
		needsComp: true,
		run: (id) => call(`/${id}/score`),
	},
	{
		label: "Make me win",
		needsComp: true,
		run: (id) => call(`/${id}/force-win`),
	},
	{
		label: "Run notifications",
		needsComp: true,
		run: (id) => call(`/${id}/notify`, { clear: true }),
	},
	{
		label: "Reset seen",
		needsComp: true,
		run: (id) => call(`/${id}/reset-seen`),
	},
	{
		label: "Delete test comp",
		needsComp: true,
		run: (id) => call(`/${id}`, undefined, "DELETE"),
	},
];

async function run(action: DevAction) {
	busy.value = true;
	message.value = "";
	try {
		const result = await action.run(store.competition?._id);
		message.value = `${action.label}: ok`;
		console.log(`[competition dev] ${action.label}`, result);
	} catch (e) {
		message.value = `${action.label} failed: ${(e as Error).message.slice(0, 120)}`;
	} finally {
		// Every action changes server state the UI reads — always re-pull.
		await store.refresh(true);
		busy.value = false;
	}
}
</script>
