<template>
  <div class="flex justify-center w-full my-1.5 select-none">
    <div
      v-if="msg.system_kind === 'balloon_match'"
      class="flex items-center gap-2 px-3 py-1 bg-white border border-primary/50 shadow-sm rounded-full"
    >
      <ion-icon :icon="svg(mdiBalloon)" class="text-sm leading-none mt-[-2px] text-secondary" />
      <span class="text-xs font-black cabin-sketch-regular text-black/80 uppercase tracking-wide">
        <template v-if="isAcceptor">
          You caught <span class="text-black font-black">{{ otherPartyName }}</span>'s balloon
        </template>
        <template v-else>
          <span class="text-black font-black">{{ otherPartyName }}</span> caught your balloon
        </template>
      </span>
    </div>

    <div
      v-else
      class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer active:opacity-60 transition-opacity"
      @click="$emit('inspect-profile', $event, sender)"
    >
      <div class="origin-left scale-[0.7] w-8 h-8 flex items-center justify-center -mr-1.5">
        <UserAvatar
          v-if="sender"
          :user="sender"
          :customization="senderCustomization"
          size="xs"
          static
          class="shrink-0"
        />
      </div>
      <span class="text-xs cabin-sketch-regular text-black/80 uppercase tracking-tight">
        <span class="text-black/80 font-black">{{ sender?.name }}</span>
        <span class="ml-1">{{ msg.type === "join" ? "entered" : "left" }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiBalloon } from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useSenderStyle } from "@/composables/chat/useSenderStyle";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";

const props = defineProps<{ msg: any; partner: any }>();

defineEmits<
	(event: "inspect-profile", pointerEvent: Event, user: any) => void
>();

const { user: me } = storeToRefs(useAuthStore());
const sender = computed(() => props.msg.member || props.partner);
const senderStyle = useSenderStyle(sender);
const senderCustomization = computed(() => senderStyle.value.customization);
const isAcceptor = computed(
	() => props.msg.system_payload?.acceptor_id === me.value?._id,
);
const otherPartyName = computed(() => {
	const payload = props.msg.system_payload;
	if (!payload) return "someone";
	return isAcceptor.value
		? props.partner?.name || "someone"
		: payload.acceptor_name || props.partner?.name || "someone";
});
</script>
