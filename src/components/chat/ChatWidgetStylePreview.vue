<template>
  <!-- The real widget is narrow relative to a modern phone and consumes most
       of its height. The pager owns the 280px max-width; this taller viewport
       preserves that proportion instead of presenting the style as a card. -->
  <div
    class="relative h-[420px] rounded-[2rem] border overflow-hidden shadow-lg pointer-events-none"
    :style="surfaceStyle"
  >
    <div class="absolute inset-0 z-0 overflow-hidden rounded-[2rem]">
      <!-- ProfileWorld's sprites are sized for the full 520px widget. This
           preview is 280px wide, so 280 / 520 gives the 0.54 scale below.
           Expanding the stage by the inverse keeps its background edge-to-edge. -->
      <div class="absolute preview-world-stage">
        <ProfileWorld
          :world-id="style.worldId"
          :accent="theme.accentColor"
          :font="fontFamily"
          contained
          radius-class="rounded-none"
        />
      </div>
      <ProfileEffect
        :effect-id="style.effectId"
        contained
        radius-class="rounded-[2rem]"
      />
    </div>

    <div class="relative z-10 h-full flex flex-col" :style="{ fontFamily }">
      <div class="h-7 flex justify-center items-center shrink-0" :style="chromeStyle">
        <div class="w-10 h-1 rounded-full" :style="{ background: palette.controlBorder }"></div>
      </div>

      <div class="flex items-center gap-2 px-3 pb-2 shrink-0" :style="chromeStyle">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" :style="activeTabStyle">
          <ion-icon :icon="chatbubblesOutline" class="text-lg" />
        </div>
        <UserAvatar
          v-for="person in tabPeople"
          :key="person._id"
          :user="person"
          :customization="person.customization"
          size="xs"
          static
          class="opacity-80"
        />
        <div class="ml-auto flex items-center gap-3" :style="{ color: palette.utility }">
          <ion-icon :icon="svg(mdiPaletteOutline)" class="text-lg" />
          <ion-icon :icon="svg(mdiClose)" class="text-xl" />
        </div>
      </div>

      <div v-show="mode === 'overview'" class="flex-1 min-h-0 px-2.5 pt-3 overflow-hidden">
          <div v-if="onlinePeople.length" class="mb-3">
            <p class="px-1 mb-1.5 text-[10px] font-black uppercase tracking-widest" :style="{ color: palette.desc }">
              Online now
            </p>
            <div class="flex gap-3 px-1">
              <div v-for="person in onlinePeople" :key="person._id" class="w-11 min-w-0 text-center">
                <div class="relative inline-flex">
                  <UserAvatar :user="person" :customization="person.customization" size="xs" static />
                  <span class="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white"></span>
                </div>
                <p class="mt-1 text-[9px] font-black uppercase truncate" :style="{ color: palette.name }">
                  {{ firstName(person.name) }}
                </p>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between px-1 mb-2">
            <p class="text-xl font-black" :class="fontEffectClass" :style="headingStyle">Conversations</p>
            <span class="text-[10px] font-black uppercase" :style="{ color: palette.desc }">Recent</span>
          </div>

          <div v-if="previewChats.length" class="space-y-2">
            <!-- Reusing the production row is intentional: names, actual last
                 activity, relationship state and the other person's profile
                 styling cannot drift away from the real overview. -->
            <ConversationItem
              v-for="chat in previewChats"
              :key="chat._id"
              :chat="chat"
              :current-user-id="currentUser?._id || ''"
              :is-online="isPartnerOnline(chat)"
              :is-typing="isPartnerTyping(chat)"
            />
          </div>

          <div v-else class="mt-2 rounded-2xl border px-4 py-5 text-center backdrop-blur-sm" :style="panelStyle">
            <p class="text-base font-black" :style="{ color: palette.name }">No conversations yet</p>
            <p class="text-xs font-sans mt-1" :style="{ color: palette.desc }">
              Your recent chats will appear here.
            </p>
          </div>
      </div>

      <!-- v-show is deliberate. The overview contains production conversation
           rows with their own world canvases; destroying those rows whenever
           the pager changes was another avoidable async teardown path. -->
      <div v-show="mode === 'conversation'" class="flex-1 min-h-0 flex flex-col">
        <div v-if="previewPartner" class="flex items-center gap-2.5 px-3 py-2 border-y shrink-0" :style="chromeBorderStyle">
          <UserAvatar
            :user="previewPartner"
            :customization="previewPartner.customization"
            size="sm"
            static
          />
          <div class="min-w-0 flex-1">
            <p class="text-base font-black leading-none truncate" :class="fontEffectClass" :style="headingStyle">
              {{ previewPartner.name }}
            </p>
            <p class="text-[10px] font-sans font-extrabold uppercase mt-1" :class="partnerOnline ? 'text-green-400' : ''" :style="partnerOnline ? {} : { color: palette.desc }">
              {{ partnerOnline ? 'Online' : 'Artist' }}
            </p>
          </div>
          <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-lg" :style="{ color: palette.utility }" />
        </div>

        <div v-if="previewPartner" class="flex-1 min-h-0 flex flex-col justify-end gap-2 px-2.5 py-3 overflow-hidden">
          <div
            v-for="message in previewMessages"
            :key="message.id"
            class="flex items-end gap-1.5"
            :class="message.isMe ? 'justify-end' : 'justify-start'"
          >
            <UserAvatar
              v-if="!message.isMe"
              :user="previewPartner"
              :customization="previewPartner.customization"
              size="xs"
              static
              class="shrink-0"
            />
            <div
              class="max-w-[76%] px-3 py-2 text-[13px] shadow-sm font-sans leading-snug"
              :class="message.isMe
                ? 'rounded-2xl rounded-br-sm text-white'
                : 'rounded-2xl rounded-bl-sm bg-white/95 text-black border border-black/10'"
              :style="message.isMe ? { background: theme.accentColor } : {}"
            >
              <p class="break-words line-clamp-3">{{ message.text }}</p>
              <p class="text-[9px] mt-1 text-right opacity-70">{{ message.time }}</p>
            </div>
          </div>

          <div v-if="!previewMessages.length" class="self-center text-center px-4">
            <p class="text-base font-black" :style="{ color: palette.name }">Say hi to {{ firstName(previewPartner.name) }}!</p>
            <p class="text-xs font-sans mt-1" :style="{ color: palette.desc }">This conversation has no messages yet.</p>
          </div>
        </div>

        <div v-else class="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <p class="text-base font-black" :style="{ color: palette.name }">No chat to preview</p>
            <p class="text-xs font-sans mt-1" :style="{ color: palette.desc }">Start a conversation and it will appear here.</p>
          </div>
        </div>

        <div class="px-2 py-2 shrink-0" :style="chromeStyle">
          <div class="rounded-2xl bg-white/95 border border-black/10 px-3 py-2 text-xs font-sans font-bold text-black/45 shadow-sm">
            Write a message…
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { IonIcon } from "@ionic/vue";
import { chatbubblesOutline } from "ionicons/icons";
import { mdiClose, mdiDotsHorizontal, mdiPaletteOutline } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ConversationItem from "./ConversationItem.vue";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import { compareConversationActivity } from "@/helper/chat.helper";
import type { BaseMessage, PopulatedConversation } from "@/types/server.types";
import {
	hydrateChatCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveReadableCustomizationPalette,
	resolveTheme,
	resolveWorld,
	type ChatCustomization,
} from "@/config/profile_options.config";

const props = withDefaults(
	defineProps<{
		customization?: Partial<ChatCustomization>;
		user?: any;
		mode?: "overview" | "conversation";
	}>(),
	{ mode: "overview" },
);

const authStore = useAuthStore();
const chatStore = useChatStore();
const chatWidgetStore = useChatWidgetStore();
const friendStore = useFriendStore();
const { activeChats, messagesByChat, typingStatuses } = storeToRefs(chatStore);
const { activeTab } = storeToRefs(chatWidgetStore);
const { pendingRequests, onlineFriends } = storeToRefs(friendStore);

const currentUser = computed(() => props.user || authStore.user);
const style = computed(() => hydrateChatCustomization(props.customization));
const theme = computed(() => resolveTheme(style.value.themeId));
const world = computed(() => resolveWorld(style.value.worldId));
const palette = computed(() =>
	resolveReadableCustomizationPalette(theme.value, world.value),
);
const fontFamily = computed(() => resolveFontFamily(style.value.fontId));
const fontEffectClass = computed(() =>
	resolveFontEffectClass(style.value.fontEffectId),
);

const conversations = computed(() => {
	const unique = new Map<string, PopulatedConversation>();
	for (const chat of [...activeChats.value, ...pendingRequests.value]) {
		unique.set(chat._id, chat);
	}
	return [...unique.values()].sort(compareConversationActivity);
});
const previewChats = computed(() => conversations.value.slice(0, 2));
const previewConversation = computed(() => {
	if (!["overview", "lobby"].includes(activeTab.value)) {
		const current = conversations.value.find(
			(chat) =>
				chat._id === activeTab.value ||
				chat.participants.some((person) => person._id === activeTab.value),
		);
		if (current) return current;
	}
	return conversations.value[0] || null;
});
const partnerFor = (chat?: PopulatedConversation | null) =>
	chat?.participants?.find((person) => person._id !== currentUser.value?._id) || null;
const previewPartner = computed(() => partnerFor(previewConversation.value));
const tabPeople = computed(() =>
	conversations.value
		.map((chat) => partnerFor(chat))
		.filter(Boolean)
		.slice(0, 2) as any[],
);
const onlinePeople = computed(() =>
	onlineFriends.value
		.filter((person) =>
			["mate", "temporary"].includes(person.chat_status || ""),
		)
		.slice(0, 4),
);
const partnerOnline = computed(() =>
	previewPartner.value
		? friendStore.isFriendOnline(previewPartner.value._id)
		: false,
);
const isPartnerOnline = (chat: PopulatedConversation) => {
	const partner = partnerFor(chat);
	return partner ? friendStore.isFriendOnline(partner._id) : false;
};
const isPartnerTyping = (chat: PopulatedConversation) => {
	const partner = partnerFor(chat);
	return partner ? typingStatuses.value[partner._id] || false : false;
};

const messageText = (message: BaseMessage) => {
	if (message.content) return message.content;
	if (message.shared_post_id) return "Shared a post";
	if (message.shared_inbox_item_id) return "Sent a sketch";
	if (message.type === "system") return "New activity";
	return "Sent a message";
};
const messageTime = (value?: string) => {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const previewMessages = computed(() => {
	const chat = previewConversation.value;
	if (!chat) return [];
	const cached = messagesByChat.value[chat._id] || [];
	const source = cached.length ? cached : chat.last_message ? [chat.last_message] : [];
	return source.slice(-3).map((message) => ({
		id: message._id,
		text: messageText(message),
		time: messageTime(message.createdAt),
		isMe: message.sender_id === currentUser.value?._id,
	}));
});

const firstName = (name?: string) => name?.split(" ")[0] || "Artist";
const surfaceStyle = computed(() => ({
	background: theme.value.cardBg,
	borderColor: theme.value.cardBorderColor,
}));
const chromeStyle = computed(() => ({ background: palette.value.scrim }));
const chromeBorderStyle = computed(() => ({
	background: palette.value.scrim,
	borderColor: palette.value.controlBorder,
}));
const panelStyle = computed(() => ({
	background: palette.value.scrim,
	borderColor: palette.value.controlBorder,
}));
const headingStyle = computed(() => ({
	color: fontEffectClass.value ? undefined : palette.value.name,
	textShadow: fontEffectClass.value ? undefined : palette.value.textShadow,
}));
const activeTabStyle = computed(() => ({
	background: theme.value.accentColor,
	color: "#ffffff",
}));
</script>

<style scoped>
.preview-world-stage {
	inset: -42.6%;
	transform: scale(0.54);
	transform-origin: center;
}
</style>
