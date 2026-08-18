<template>
  <ion-popover
    :is-open="isOpen"
    :event="event"
    @didDismiss="$emit('close')"
    :show-backdrop="false"
    class="liquid-popover"
    side="top"
    alignment="center"
  >
    <div class="reaction-tray animate-tray-in">
      <button
        v-for="(imgSrc, type, i) in reactionImages"
        :key="type"
        @click="$emit('select', type)"
        class="reaction-item group"
        :style="{ '--i': i }"
      >
<img
          width="1"
          height="1"
          loading="lazy"
          decoding="async"
          :src="imgSrc"
          class="reaction-img"
          :class="{ 'reaction-img--active': userReaction === type }"
          alt="reaction"
        />

        <span
          v-if="userReaction === type"
          class="reaction-dot"
        />
      </button>
    </div>
  </ion-popover>
</template>

<script setup lang="ts">
import { IonPopover } from "@ionic/vue";
import { reactionImages } from "@/config/post.config";

defineProps<{
	isOpen: boolean;
	event: Event | null;
	userReaction?: string;
}>();

defineEmits(["close", "select"]);
</script>

<style scoped>
ion-popover.liquid-popover {
  --background: transparent;
  --box-shadow: none;
  --width: auto;
  overflow: visible;
}

ion-popover.liquid-popover::part(content) {
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

/* Themed frosted tray — reads on both the light feed and the dark viewer. */
.reaction-tray {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.4rem 0.55rem;
  border-radius: 9999px;
  background: rgba(var(--ion-color-tertiary-rgb, 255, 242, 228), 0.92);
  border: 1.5px solid rgba(var(--ion-color-primary-rgb, 250, 224, 194), 0.9);
  box-shadow:
    0 10px 30px -6px rgba(var(--ion-color-secondary-rgb, 185, 70, 58), 0.25),
    0 2px 8px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.reaction-item {
  position: relative;
  width: 3.35rem;
  height: 3.35rem;
  padding: 0.3rem;
  cursor: pointer;
  background: transparent;
  border: none;
  /* Cascade in, one after another. */
  opacity: 0;
  transform: translateY(8px) scale(0.6);
  animation: itemIn 0.34s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: calc(var(--i) * 45ms + 60ms);
}

.reaction-img {
  height: 100%;
  width: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.28s ease;
}

/* Hover / focus lift — springy and prominent, Messenger-style. */
.reaction-item:hover .reaction-img,
.reaction-item:focus-visible .reaction-img {
  transform: translateY(-0.7rem) scale(1.3);
  filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.25));
}

.reaction-item:active .reaction-img {
  transform: translateY(-0.3rem) scale(1.12);
}

.reaction-img--active {
  transform: scale(1.12);
}


/* Active selection marker under the current reaction. */
.reaction-dot {
  position: absolute;
  bottom: 0.05rem;
  left: 50%;
  width: 0.3rem;
  height: 0.3rem;
  transform: translateX(-50%);
  border-radius: 9999px;
  background: rgb(var(--ion-color-secondary-rgb, 185, 70, 58));
  box-shadow: 0 0 6px rgba(var(--ion-color-secondary-rgb, 185, 70, 58), 0.8);
}

@keyframes itemIn {
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.animate-tray-in {
  animation: trayIn 0.24s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes trayIn {
  from { opacity: 0; transform: scale(0.85) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .reaction-item,
  .animate-tray-in { animation-duration: 0.01ms; }
  .reaction-item { opacity: 1; transform: none; }
}
</style>
