<template>
  <!-- Absent entirely when there is nothing to credit, which is most posts —
       a row that renders empty would still cost a line box on every card. -->
  <div v-if="groups.length" class="mt-1.5 flex flex-col gap-1">
    <div
      v-for="group in groups"
      :key="group.key"
      class="flex items-center gap-1.5 min-w-0"
    >
      <ion-icon
        :icon="svg(group.icon)"
        class="text-sm shrink-0 opacity-70"
        :style="{ color: labelColor }"
      />
      <span
        class="text-xs shrink-0 opacity-80"
        :style="{ color: labelColor, textShadow }"
      >
        {{ group.label }}
      </span>

      <!-- Overlapping stack. Plain avatars: identity only, no decoration and
           no themed ring — see the `plain` prop on UserAvatar for why that
           matters on a surface that renders one card per artwork. -->
      <span class="flex shrink-0">
        <button
          v-for="user in group.visible"
          :key="user._id"
          type="button"
          class="block -ml-1.5 first:ml-0 rounded-full active:scale-90 transition-transform cursor-pointer"
          :style="{ boxShadow: `0 0 0 1.5px ${ringColor}` }"
          :aria-label="`View ${user.name}`"
          @click.stop="emit('open-user', user._id)"
        >
          <UserAvatar :user="user" size="xxs" plain static class="block" />
        </button>
        <span
          v-if="group.overflow > 0"
          class="-ml-1.5 h-5 min-w-5 px-1 rounded-full flex items-center justify-center text-[9px] font-black"
          :style="{ background: ringColor, color: labelColor }"
        >
          +{{ group.overflow }}
        </span>
      </span>

      <button
        type="button"
        class="text-xs font-black truncate text-left active:scale-98 transition-transform cursor-pointer"
        :style="{ color: labelColor, textShadow }"
        @click.stop="emit('open-user', group.visible[0]._id)"
      >
        {{ group.names }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiAccountMultipleOutline, mdiAt, mdiSourceBranch } from "@mdi/js";
import { computed } from "vue";
import { svg } from "@/helper/general.helper";
import type { FeedPost, PostCreditUser } from "@/types/server.types";

const props = defineProps<{
	post: FeedPost;
	/** Header text colour, so credits sit in the card's own palette. */
	labelColor: string;
	/** Ring/plate colour separating stacked avatars from the card behind them. */
	ringColor: string;
	textShadow?: string;
}>();
const emit = defineEmits<(event: "open-user", userId: string) => void>();

/** Avatars shown before the stack collapses into a `+N`. */
const MAX_VISIBLE = 3;

interface CreditGroup {
	key: string;
	icon: string;
	label: string;
	visible: PostCreditUser[];
	overflow: number;
	names: string;
}

/**
 * Read as one sentence with the label in front of it: "Remix of joko",
 * "Drawn with rae, tev and 3 more". The cut is at two names because a third
 * pushes the row past a phone width once the avatars are in front of it.
 */
function joinNames(users: PostCreditUser[]): string {
	const names = users.map((user) => user.name);
	if (names.length <= 2) return names.join(" and ");
	return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

function toGroup(
	key: string,
	icon: string,
	label: string,
	users: PostCreditUser[],
): CreditGroup | null {
	if (!users.length) return null;
	return {
		key,
		icon,
		label,
		visible: users.slice(0, MAX_VISIBLE),
		overflow: Math.max(0, users.length - MAX_VISIBLE),
		names: joinNames(users),
	};
}

const groups = computed<CreditGroup[]>(() =>
	[
		toGroup(
			"remix",
			mdiSourceBranch,
			"Remix of",
			props.post.remix_of ? [props.post.remix_of.author] : [],
		),
		toGroup(
			"collab",
			mdiAccountMultipleOutline,
			"Drawn with",
			props.post.collaborators || [],
		),
		toGroup("mention", mdiAt, "Shoutout to", props.post.mentions || []),
	].filter((group): group is CreditGroup => group !== null),
);
</script>
