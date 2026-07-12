<template>
  <div class="h-full relative overflow-hidden" :style="{ background: theme.cardBg, transition: 'background-color 0.5s ease' }">
    <slot name="overlay" />

    <div class="absolute inset-0 pointer-events-none z-0">
      <ProfileEffect :effect-id="c.effectId" />
      <ProfileWorld :world-id="c.worldId" :accent="theme.accentColor" :font="font" />
    </div>

    <div class="h-full overflow-y-auto hide-scrollbar relative z-10" @touchmove.stop>
      <div class="px-6 pb-24 pb-safe flex flex-col transition-all duration-500" :style="{ fontFamily: font }">

        <div class="relative w-full flex flex-col items-center text-center shrink-0 pt-8 pb-6">
          <div class="absolute inset-0 pointer-events-none z-0 flex justify-center">
            <div class="w-full h-full max-w-[360px] relative">
              <BackgroundSketch
                :path="c.backgroundSketchPath"
                :view-box="c.backgroundSketchViewBox"
                :stroke-color="activeColors.name"
                class="absolute inset-0 w-full h-full"
              />
            </div>
          </div>

          <div class="relative z-10 flex flex-col items-center w-full">
            <div class="relative">
              <UserAvatar v-if="user" :user="user" :customization="c" size="xl" />
              <div v-else class="w-24 h-24 rounded-[2rem] bg-zinc-200 border-4 border-white shadow-sm animate-pulse"></div>
              <slot name="avatar-badge" />
            </div>

            <TitleBadge v-if="c.titleId" :title-id="c.titleId" :theme="theme" extra-class="mt-4" />

            <h2
              class="text-3xl font-black mt-4 leading-tight drop-shadow-sm transition-colors duration-500"
              :style="{ color: activeColors.name }"
              :class="fontEffectClass"
            >
              {{ user?.name || 'Loading...' }}
            </h2>

            <slot name="status" />

            <slot name="description">
              <p
                class="text-base font-bold italic mt-4 leading-snug whitespace-pre-wrap px-2 transition-colors duration-500"
                :style="{ color: activeColors.desc }"
              >
                "{{ user?.description || 'This artist is a mystery...' }}"
              </p>
            </slot>
          </div>
        </div>

        <slot name="actions" />

        <div
          v-if="user"
          class="grid grid-cols-3 w-full mt-8 border-t pt-5 transition-colors duration-500"
          :style="{ borderColor: theme.cardBorderColor }"
        >
          <template v-if="statsLoading && !user?.stats">
            <div v-for="i in 3" :key="i" class="flex flex-col items-center" :class="{ 'border-x': i === 1 }"
                 :style="{ borderColor: theme.cardBorderColor }">
              <div class="h-6 w-8 bg-black/5 rounded animate-pulse mb-1"></div>
              <div class="h-2 w-12 bg-black/5 rounded animate-pulse"></div>
            </div>
          </template>
          <template v-else>
            <button class="flex flex-col items-center active:scale-95 cursor-pointer transition-transform"
                    @click="$emit('go-network', 'mates')">
              <span class="text-xl font-black transition-colors duration-500" :style="{ color: theme.accentColor }">{{ user.stats?.mates || 0 }}</span>
              <span class="text-[11px] font-bold uppercase tracking-widest transition-colors duration-500" :style="{ color: activeColors.desc }">Mates</span>
            </button>
            <button class="flex flex-col items-center active:scale-95 cursor-pointer transition-transform border-x"
                    :style="{ borderColor: theme.cardBorderColor }" @click="$emit('go-network', 'followers')">
              <span class="text-xl font-black transition-colors duration-500" :style="{ color: activeColors.name }">{{ user.stats?.followers || 0 }}</span>
              <span class="text-[11px] font-bold uppercase tracking-widest transition-colors duration-500" :style="{ color: activeColors.desc }">Followers</span>
            </button>
            <button class="flex flex-col items-center active:scale-95 cursor-pointer transition-transform"
                    @click="$emit('go-network', 'following')">
              <span class="text-xl font-black transition-colors duration-500" :style="{ color: activeColors.name }">{{ user.stats?.following || 0 }}</span>
              <span class="text-[11px] font-bold uppercase tracking-widest transition-colors duration-500" :style="{ color: activeColors.desc }">Following</span>
            </button>
          </template>
        </div>

        <div
          v-if="c.signaturePath"
          class="mt-6 pt-4 border-t flex flex-col items-center transition-colors duration-500"
          :style="{ borderColor: theme.cardBorderColor }"
        >
          <span
            class="text-xs font-bold uppercase tracking-widest mb-1 transition-colors duration-500"
            :style="{ color: activeColors.desc }"
          >— Signed —</span>
          <svg
            class="w-32 h-12 drop-shadow-sm transition-colors duration-500"
            :viewBox="c.signatureViewBox || '0 0 300 150'"
            preserveAspectRatio="xMidYMid meet"
          >
            <path
              :d="c.signaturePath"
              fill="none"
              :stroke="theme.accentColor"
              :stroke-width="signatureStrokeWidth"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <div v-if="showPortfolio" class="mt-8 mb-16">
          <div class="flex items-center justify-between mb-3 px-1">
            <h3 class="text-xl font-black italic transition-colors duration-500" :style="{ color: activeColors.name }">Portfolio</h3>
          </div>
          <div v-if="postsLoading && posts.length === 0" class="grid grid-cols-3 gap-2">
            <div v-for="i in 6" :key="i" class="aspect-square bg-black/5 rounded-[1.5rem] animate-pulse"></div>
          </div>
          <div v-else-if="posts.length === 0"
               class="text-center py-10 rounded-[2rem] border-2 border-dashed transition-colors duration-500"
               :style="{ borderColor: theme.cardBorderColor, backgroundColor: 'rgba(0,0,0,0.02)' }">
            <p class="text-sm font-bold italic transition-colors duration-500" :style="{ color: activeColors.desc }">No public sketches yet.</p>
          </div>
          <div v-else class="grid grid-cols-3 gap-2">
            <div v-for="(post, index) in posts" :key="post._id"
                 class="aspect-square rounded-[1.5rem] shadow-sm relative overflow-hidden active:scale-95 cursor-pointer transition-transform duration-200"
                 :style="{ backgroundColor: theme.cardBorderColor }" @click="$emit('open-post', index)">
              <img :src="post.thumbnail_url" class="w-full h-full object-cover" loading="lazy" alt="sketch" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import BackgroundSketch from "@/components/profile/customization/BackgroundSketch.vue";
import TitleBadge from "@/components/profile/TitleBadge.vue";
import {
	calculateSignatureStroke,
	hydrateCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveWorld,
	type Customization,
} from "@/config/profile_options.config";

const props = withDefaults(
	defineProps<{
		user: any;
		customization?: Partial<Customization>;
		posts?: any[];
		postsLoading?: boolean;
		statsLoading?: boolean;
		showPortfolio?: boolean;
	}>(),
	{
		posts: () => [],
		postsLoading: false,
		statsLoading: false,
		showPortfolio: true,
	},
);

defineEmits(["open-post", "go-network"]);

const c = computed(() => hydrateCustomization(props.customization || {}));
const theme = computed(() => resolveTheme(c.value.themeId));
const font = computed(() => resolveFontFamily(c.value.fontId));
const fontEffectClass = computed(() =>
	resolveFontEffectClass(c.value.fontEffectId),
);
const signatureStrokeWidth = computed(() =>
	calculateSignatureStroke(c.value.signatureViewBox),
);

// Contrast check configuration layout lookup
const activeWorld = computed(() => resolveWorld(c.value.worldId));
const isWorldDark = computed(() => activeWorld.value.isDark === true);

const activeColors = computed(() => ({
	name: isWorldDark.value ? theme.value.nameColorDark : theme.value.nameColor,
	desc: isWorldDark.value ? theme.value.descColorDark : theme.value.descColor,
}));

// Expose theme/font to hosts that style slotted content (action menu).
defineExpose({ theme, font });
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.pb-safe {
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);
}
</style>