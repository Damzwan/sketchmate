<template>
  <ion-page>
    <TopBar title="Home" />

    <ion-content class="--background-custom">
      <div class="px-4 pt-4 space-y-6 json-layout-wrapper pb-10">

        <GuestWarningBanner />

        <AgeGatedBanner />

        <CompetitionCard />

        <HomeQuickActions
          :is-under-age="isUnderAge"
          @action="handleQuickAction"
          @pointerdown.capture="prefetchDrawView"
        />

        <!-- PUBLIC LOBBIES -->
        <ActiveLobbies
          v-if="!isUnderAge"
          :lobbies="publicLobbies"
          @join="joinLobby"
          :loading="publicLobbies.length === 0"
        />

        <!-- DRAFTS -->
        <MyDrafts
          :drafts="mergedDrafts"
          :loading="isLoadingDrafts"
          :pending-ids="pendingDraftIds"
          :sync-enabled="syncEnabled"
          :sync-status="syncStatus"
          :sync-states="draftSyncStates"
          :checking-for-updates="isCheckingForUpdates"
          @open="openDraft"
          @delete="handleDeleteDraft"
          @explain="openSyncSheet"
          @check-updates="checkForUpdates"
        />

        <!-- Lazy on first use, then retained so Ionic can animate dismissal. -->
        <DraftSyncSheet
          v-if="isSyncSheetLoaded"
          :is-open="isSyncSheetOpen"
          :sync-enabled="syncEnabled"
          :sync-status="syncStatus"
          :used="syncUsed"
          :limit="syncLimit"
          @close="closeSyncSheet"
          @upgrade="upgradeForSync"
          @wipe="wipeAllDrafts"
        />

        <!-- COMMUNITY FEED -->
        <CommunityFeed
          v-if="!isUnderAge && communityFeedMounted"
          ref="communityFeed"
        />

      </div>

      <!-- Dev-only cycle controls: force phases, seed entries, announce now. -->
      <CompetitionDevPanel v-if="isDev && !isUnderAge" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonPage } from "@ionic/vue";
import { defineAsyncComponent } from "vue";
import TopBar from "@/components/general/TopBar.vue";
import ActiveLobbies from "@/components/home/ActiveLobbies.vue";
import AgeGatedBanner from "@/components/home/AgeGatedBanner.vue";
import CommunityFeed from "@/components/home/CommunityFeed.vue";
import CompetitionCard from "@/components/home/CompetitionCard.vue";
import GuestWarningBanner from "@/components/home/GuestWarningBanner.vue";
import HomeQuickActions from "@/components/home/HomeQuickActions.vue";
import MyDrafts from "@/components/home/MyDrafts.vue";
import { useHomeDrafts } from "@/composables/home/useHomeDrafts";
import { useHomeLobbies } from "@/composables/home/useHomeLobbies";
import { useHomePageLifecycle } from "@/composables/home/useHomePageLifecycle";
import { useHomeQuickActions } from "@/composables/home/useHomeQuickActions";

const isDev = import.meta.env.DEV;
const CompetitionDevPanel = defineAsyncComponent(
	() => import("@/components/competition/CompetitionDevPanel.vue"),
);
const { isUnderAge, communityFeed, communityFeedMounted } =
	useHomePageLifecycle();
const DraftSyncSheet = defineAsyncComponent(
	() => import("@/components/home/DraftSyncSheet.vue"),
);
const {
	mergedDrafts,
	pendingDraftIds,
	isLoadingDrafts,
	draftSyncStates,
	syncEnabled,
	syncStatus,
	syncUsed,
	syncLimit,
	isSyncSheetOpen,
	isSyncSheetLoaded,
	isCheckingForUpdates,
	openDraft,
	deleteDraft: handleDeleteDraft,
	openSyncSheet,
	closeSyncSheet,
	upgradeForSync,
	checkForUpdates,
	wipeAllDrafts,
} = useHomeDrafts();
const { publicLobbies, joinLobby } = useHomeLobbies(isUnderAge);
const { handleQuickAction, prefetchDrawView } = useHomeQuickActions();
</script>

<style scoped>
.--background-custom {
  --background: var(--ion-color-background) !important;
}
</style>
