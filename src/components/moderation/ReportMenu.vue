<template>
  <ion-modal :is-open="reportMenuOpen" @didDismiss="onDismiss" class="z-2000">
    <div class="bg-background p-4">
      <ion-button fill="clear" class="absolute right-0 top-0" @click="close">
        <ion-icon slot="icon-only" class="fill-black" :icon="svg(mdiClose)" />
      </ion-button>

      <p class="text-xl cabin-sketch-regular">Report content</p>
      <p class="text-md cabin-sketch-regular">
        Help us keep SketchMate safe. Tell us what's wrong with
        {{ targetLabel }}.
      </p>

      <div class="py-2" />

      <p class="cabin-sketch-regular pb-1">Reason</p>
      <ion-radio-group v-model="reason" mode="md">
        <template v-for="opt in reasonOptions" :key="opt.value">
          <ion-radio :value="opt.value" class="cabin-sketch-regular" color="secondary">
            {{ opt.label }}
          </ion-radio>
          <br />
        </template>
      </ion-radio-group>

      <div class="py-2" />

      <ion-textarea
        v-model="details"
        helper-text="Add any extra context (optional)"
        fill="outline"
        placeholder="What happened?"
        color="secondary"
        :auto-grow="true"
        :maxlength="500"
      />

      <div class="flex justify-end mt-4 gap-2">
        <ion-button fill="clear" color="medium" @click="close">Cancel</ion-button>
        <ion-button
          color="secondary"
          :disabled="!reason || isSubmittingReport"
          @click="submit"
        >
          {{ isSubmittingReport ? "Sending..." : "Submit" }}
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  IonModal,
  IonButton,
  IonIcon,
  IonRadio,
  IonRadioGroup,
  IonTextarea,
} from "@ionic/vue";
import { mdiClose } from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import type { ReportReason } from "@/types/server.types";

const menuStore = useMenuStore();
const moderationStore = useModerationStore();

const { reportMenuOpen } = storeToRefs(menuStore);
const { targetToReport, isSubmittingReport } = storeToRefs(moderationStore);

const reason = ref<ReportReason | null>(null);
const details = ref("");

// Adjust these to match your actual ReportReason enum values.
const reasonOptions: { value: ReportReason; label: string }[] = [
  { value: "minor_safety", label: "Minor safety concern" },
  { value: "nsfw", label: "Sexual or NSFW content" },
  { value: "violence", label: "Violence or self-harm" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "spam", label: "Spam or misleading" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Something else" },
];

const targetLabel = computed(() => {
  const t = targetToReport.value;
  if (!t) return "this content";
  if (t.label) return t.label;
  switch (t.type) {
    case "post": return "this post";
    case "comment": return "this comment";
    case "balloon": return "this balloon";
    case "user": return "this user";
    case "dm_message": return "this message";
    case "inbox_drawing": return "this drawing";
    case "inbox_comment": return "this comment";
    default: return "this content";
  }
});

// Reset form whenever a new target is set
watch(targetToReport, (v) => {
  if (v) {
    reason.value = null;
    details.value = "";
  }
});

function close() {
  menuStore.closeMenu?.("ReportMenu" as any);
  // Fallback: if your store uses a different close pattern, adjust accordingly
  reportMenuOpen.value = false;
}

function onDismiss() {
  reportMenuOpen.value = false;
  moderationStore.clearReportTarget();
}

async function submit() {
  if (!reason.value) return;
  const ok = await moderationStore.submitReport(reason.value, details.value || undefined);
  if (ok) close();
}
</script>

<style scoped>
ion-modal {
  --width: fit-content;
  --min-width: 280px;
  --max-width: 90%;
  --height: fit-content;
  --border-radius: 6px;
  --box-shadow: 0 28px 48px rgba(0, 0, 0, 0.4);
  --backdrop-opacity: 0.4 !important;
}
</style>