<!-- components/chat/ConversationItem.vue -->
<template>
  <div
    @click="$emit('open', chat._id)"
    class="conversation-row group relative w-full flex items-center gap-3 p-3 rounded-[1.6rem] border cursor-pointer overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.97]"
    :class="cardClass"
    :style="showTheme ? cardStyle : {}"
  >
    <!-- Soft accent glow, only when this card wants attention -->
    <div
      v-if="rel.actionable && !isBlocked"
      class="absolute -left-6 -bottom-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
      :class="accent.glow"
    ></div>

    <!-- Partner's profile surface on resting mate/active rows: their theme cardBg
         is painted on the card root, their effect and world layered over it.
         The world runs in `mini` + `static-mode` — a frozen frame, not a live
         lottie per list row. -->
    <div v-if="showTheme" class="absolute inset-0 z-0 pointer-events-none">
      <ProfileWorld
        :world-id="partnerCustomization.worldId"
        :accent="theme.accentColor"
        :dark="theme.isDark"
        static-mode
        mini
        contained
        radius-class="rounded-[1.6rem]"
      />
      <!-- Effects belong above worlds. Rendering Space after crumpled paper
           hid the paper texture and made the selected theme/effect disappear. -->
      <ProfileEffect
        :effect-id="partnerCustomization.effectId"
        radius-class="rounded-[1.6rem]"
        static-effect
        contained
      />
    </div>

    <!-- Avatar + single contextual badge -->
    <div class="relative z-10 shrink-0">
      <UserAvatar
        v-if="partner"
        :user="partner"
        static
        :customization="partner.customization"
        size="sm"
        class="transition-transform duration-300 group-hover:scale-105"
        :class="avatarFilter"
      />
      <span
        v-else
        class="flex items-center justify-center w-11 h-11 bg-secondary/10 text-base font-black text-secondary rounded-full border border-primary/40"
      >
        ?
      </span>

      <!-- One badge to rule them all: the most important state wins -->
      <div
        v-if="avatarBadge"
        class="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full border-2 border-white flex items-center justify-center shadow-sm z-20"
        :class="avatarBadge.bg"
      >
        <ion-icon v-if="avatarBadge.icon" :icon="avatarBadge.icon" class="text-[8px] text-white" />
        <div v-else class="w-1.5 h-1.5 bg-white rounded-full"></div>
      </div>
      <div
        v-else-if="showOnlinePip"
        class="absolute -bottom-0.5 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-20 shadow-sm"
      ></div>
    </div>

    <!-- Body -->
    <div class="relative z-10 flex-1 min-w-0">
      <!-- Row 1 — name · status chip · time -->
      <div class="flex items-center gap-1.5 min-w-0">
        <span
          class="text-[15px] leading-none font-black truncate tracking-tight"
          :class="[nameClass, showTheme ? fontEffectClass : '', themeTextOnDark ? 'on-world' : '']"
          :style="showTheme ? { color: themedNameColor, fontFamily: resolvedFontFamily } : {}"
        >
          {{ partner?.name || 'Unknown User' }}
        </span>

        <span
          v-if="showChip"
          class="shrink-0 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider whitespace-nowrap"
          :class="chipClass"
          :style="chipStyle"
        >
          {{ chipText }}
        </span>

        <span
          class="ml-auto shrink-0 text-[11px] leading-none font-black uppercase tracking-wide whitespace-nowrap mt-0.5"
          :style="timestampStyle"
        >
          {{ rel.kind === 'live_invite' ? 'NOW' : formattedTime }}
        </span>
      </div>

      <!-- Row 2 — status line · unread -->
      <div class="flex items-center gap-1.5 mt-1.5">
        <p
          class="flex-1 min-w-0 text-[13px] truncate tracking-wide leading-none"
          :class="[statusClass, themeTextOnDark ? 'on-world' : '']"
          :style="showTheme && !isTyping ? { color: themedDescColor } : {}"
        >
          {{ statusLine }}
        </p>

        <div
          v-if="unreadCount > 0 && !isBlocked && rel.kind !== 'live_invite'"
          class="shrink-0 min-w-[16px] h-4 px-1 bg-red-500 rounded-full flex items-center justify-center shadow-sm animate-bounce-in"
        >
          <span class="text-[8px] font-black text-white leading-none mb-[0.5px]">{{ unreadCount }}</span>
        </div>
        <ion-icon
          v-else-if="isBlocked || isExpired"
          :icon="svg(mdiChevronRight)"
          class="shrink-0 text-black/20 text-base transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </div>

      <!-- Row 3 — the journey rail, only while a relationship is in flight.
           RelationshipJourney's `compact` mode renders exactly this markup;
           it was duplicated here byte for byte, so the two drifted whenever
           only one got touched. -->
      <RelationshipJourney
        v-if="showJourney"
        class="mt-2.5 pr-1"
        :step="rel.step"
        :accent="rel.accent"
        :dark="onDarkSurface"
        :name-color="themedNameColor"
        :desc-color="themedDescColor"
        compact
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiChevronRight } from "@mdi/js";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import { svg } from "@/helper/general.helper";
import { PopulatedConversation } from "@/types/server.types";
import RelationshipJourney from "./RelationshipJourney.vue";
import { useConversationItemPresentation } from "./useConversationItemPresentation";

const props = defineProps<{
	chat: PopulatedConversation;
	currentUserId: string;
	isOnline: boolean;
	isTyping: boolean;
}>();

defineEmits(["open"]);

const {
	partner,
	isBlocked,
	isExpired,
	rel,
	accent,
	partnerCustomization,
	theme,
	resolvedFontFamily,
	fontEffectClass,
	showTheme,
	onDarkSurface,
	cardStyle,
	themeTextOnDark,
	themedNameColor,
	themedDescColor,
	timestampStyle,
	unreadCount,
	formattedTime,
	showOnlinePip,
	showJourney,
	statusLine,
	showChip,
	chipText,
	avatarBadge,
	cardClass,
	avatarFilter,
	nameClass,
	chipClass,
	chipStyle,
	statusClass,
} = useConversationItemPresentation(props);
</script>

<style scoped>
.conversation-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 76px;
}

/* Legibility over a dark world, matching ChatRelationshipStrip: the theme's
   *Dark colours carry the contrast, this only holds the glyph edges against a
   busy starfield. No plate behind the text — that would hide the world. */
.on-world {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
}

.animate-bounce-in {
  animation: bounceIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes bounceIn {
  0% { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes subtlePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(0.995); }
}
.animate-pulse-subtle {
  animation: subtlePulse 2s ease-in-out infinite;
}
</style>
