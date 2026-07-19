<template>

  <div class="absolute cursor-pointer bottom-full right-0 pb-2">
    <!-- Expanded panel -->
    <Transition name="peek-panel">
      <div
        v-if="visible && comments.length > 0"
        class="peek-panel"
      >
        <div class="flex items-center justify-between gap-2 pl-3 pr-1.5 pt-1.5 pb-1">
          <span class="text-[10px] font-black uppercase tracking-widest text-white/55">
            Comments
          </span>
          <!-- Arrow, not a cross. A cross says "destroy this"; the arrow points
               the way the panel physically travels when it collapses, and the
               handle's mirrored arrow points the way it comes back. -->
          <button
            type="button"
            class="peek-icon-btn"
            aria-label="Hide comment preview"
            @click.stop="$emit('update:visible', false)"
          >
            <ion-icon :icon="svg(mdiChevronRight)" class="w-4 h-4" />
          </button>
        </div>

        <!-- The whole body opens the full thread — same destination as the
             footer comment button, so there's one meaning for "comments". -->
        <button
          type="button"
          class="w-full text-left px-3 pb-2 cursor-pointer active:opacity-75 transition-opacity"
          aria-label="Open all comments"
          @click.stop="$emit('open-comments')"
        >
          <div
            v-for="(comment, i) in visibleComments"
            :key="comment._id || i"
            class="flex items-center gap-2 min-w-0 py-[3px]"
          >
            <ion-avatar class="w-[22px] h-[22px] shrink-0 border border-white/25 overflow-hidden">
              <img
                :src="comment.author?.img || senderImg(resolveUser(comment.sender || comment.author_id))"
                class="block object-cover w-full h-full"
                alt=""
              />
            </ion-avatar>

            <!-- min-w-0 on BOTH the row and this <p> is what actually lets
                 `truncate` bite — without it the flex item refuses to shrink
                 below its content and long comments blow the panel width. -->
            <p class="text-[12.5px] cabin-sketch-regular leading-tight truncate min-w-0 flex-1">
              <span class="font-black text-white">
                {{ comment.author?.name || senderName(resolveUser(comment.sender || comment.author_id)) }}
              </span>
              <span class="text-white/85 ml-1.5">{{ comment.message }}</span>
            </p>
          </div>

          <p class="text-[11px] font-bold text-white/60 italic cabin-sketch-regular mt-1 pl-[30px] truncate">
            {{ hiddenCount > 0 ? `View all ${commentCount} comments` : 'View thread' }}
          </p>
        </button>
      </div>
    </Transition>

    <!-- Collapsed handle: the way back. Same edge, same axis, so the motion
         reads as the panel folding into it and unfolding out of it. -->
    <Transition name="peek-handle">
      <button
        v-if="!visible && comments.length > 0"
        type="button"
        class="peek-handle"
        aria-label="Show comment preview"
        @click.stop="$emit('update:visible', true)"
      >
        <ion-icon :icon="svg(mdiChevronLeft)" class="w-4 h-4 opacity-80" />
        <ion-icon :icon="svg(mdiChatOutline)" class="w-[18px] h-[18px]" />
        <span v-if="commentCount > 0" class="text-[11px] font-black leading-none">
          {{ commentCount }}
        </span>
      </button>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonAvatar, IonIcon } from "@ionic/vue";
import { mdiChatOutline, mdiChevronLeft, mdiChevronRight } from "@mdi/js";
import { senderImg, senderName, svg } from "@/helper/general.helper";

// Two, deliberately. People opened fullscreen to look at the DRAWING — the peek
// exists to show the conversation is alive, not to replace the comment drawer.
const MAX_VISIBLE = 2;

const props = defineProps<{
	comments: any[];
	commentCount: number;
	resolveUser: (id: string) => any;
	visible: boolean;
}>();

// The API hands back the most recent page sorted OLDEST → NEWEST (the route
// sorts by createdAt desc, then reverses). Taking the first N therefore showed
// the oldest of that page; take from the end so the preview is genuinely the
// latest comments, still in reading order.
const visibleComments = computed(() => props.comments.slice(-MAX_VISIBLE));

// Count against the real total, not the page — `comments` only ever holds the
// prefetched page, so subtracting its length would under-report.
const hiddenCount = computed(() =>
	Math.max(0, (props.commentCount ?? 0) - visibleComments.value.length),
);

defineEmits(["open-comments", "update:visible"]);
</script>

<style scoped>
@reference "@/theme/main.css";

/* Flush to the right edge — rounded on the left only, so it reads as a panel
   attached to the screen edge and gets the largest possible tap target. */
/* black/90, not /80. The worst case is a pure-white drawing under white text:
   at 0.8 the plate composites to #333 (~12.6:1), at 0.9 to #191919 (~18.3:1).
   backdrop-blur is decoration here — the alpha alone has to carry legibility,
   because Android WebViews can drop backdrop-filter entirely. */
/* No backdrop-blur here, deliberately. This panel sits inside the footer, which
   is itself a backdrop-filter surface — a second, ANIMATING backdrop-filter
   nested in it forces the compositor to re-resolve the footer's backdrop every
   frame of the enter/leave, which reads as the footer flickering. The alpha
   already carries legibility on its own (see the note above), so the blur was
   pure cost. */
.peek-panel {
  @apply w-[230px] max-w-[78vw] rounded-l-2xl bg-black/90
  border border-r-0 border-white/15 shadow-xl;
  /* Stated in CSS, not as a utility class, so it can't be lost to class-order
     or to a transition class being applied on top. */
  pointer-events: auto;
  /* Skips the 300ms tap delay and stops the browser treating a tap here as the
     start of a pan gesture. */
  touch-action: manipulation;
}

.peek-icon-btn {
  @apply w-6 h-6 rounded-full flex items-center justify-center shrink-0
  bg-white/10 border border-white/20 text-white/80
  active:scale-90 hover:bg-white/20 transition-all cursor-pointer;
}

.peek-handle {
  @apply flex items-center gap-1 pl-2 pr-2.5 py-2.5 rounded-l-xl
  bg-black/90 border border-r-0 border-white/15
  text-white shadow-xl active:scale-95 transition-transform cursor-pointer;
  pointer-events: auto;
  touch-action: manipulation;
}

/* Both states travel on X from the right edge. */
.peek-panel-enter-active,
.peek-handle-enter-active {
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out;
  /* Own compositor layer for the duration of the move, so sliding it across the
     footer repaints the layer instead of the bar underneath it. */
  will-change: transform, opacity;
}

/* The two states overlap for the duration of a toggle: the outgoing panel is
   still in the DOM while the handle enters. Taken out of flow so they don't
   stack and push each other around — and critically `pointer-events: none`, so
   the outgoing ghost can never swallow a tap aimed at what replaced it. If a
   leave transition ever fails to complete, a ghost without this would sit on
   top and silently eat every click on the panel. */
.peek-panel-leave-active,
.peek-handle-leave-active {
  transition: transform 200ms cubic-bezier(0.4, 0, 1, 1), opacity 150ms ease-in;
  will-change: transform, opacity;
  position: absolute;
  right: 0;
  bottom: 0.5rem;
  pointer-events: none;
}

.peek-panel-enter-from,
.peek-panel-leave-to,
.peek-handle-enter-from,
.peek-handle-leave-to {
  transform: translateX(105%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .peek-panel-enter-active,
  .peek-panel-leave-active,
  .peek-handle-enter-active,
  .peek-handle-leave-active {
    transition: opacity 120ms linear;
  }

  .peek-panel-enter-from,
  .peek-panel-leave-to,
  .peek-handle-enter-from,
  .peek-handle-leave-to {
    transform: none;
  }
}
</style>
