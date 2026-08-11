<template>
  <div class="relative inline-block" :style="containerStyle">
    <!-- Applied dynamic borderClass -->
    <div
      class="avatar-frame w-full h-full rounded-full flex items-center justify-center overflow-hidden transition-all duration-500"
      :class="borderClass"
      :style="{ borderColor: borderColor }"
    >
<img
        width="1"
        height="1"
        loading="lazy"
        decoding="async"
        :src="img || user?.img"
        alt=""
        class="w-full h-full object-cover "
      />
    </div>

    <!-- Pass the static prop down -->
    <AvatarDecoration
      :decoration-id="customization?.decorationId"
      :def="decorationDef"
      :static="static"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
	type Customization,
	type Decoration,
	resolveTheme,
} from "@/config/profile_options.config";
import AvatarDecoration from "./AvatarDecoration.vue";

const props = defineProps<{
	user?: any;
	customization?: Partial<Customization>;
	decorationDef?: Decoration;
	size?: "xs" | "sm" | "md" | "lg" | "xl";
	img?: string;
	static?: boolean; // <-- NEW PROP
}>();

const containerStyle = computed(() => {
	const sizes = { xs: "32px", sm: "48px", md: "64px", lg: "96px", xl: "128px" };
	const dim = sizes[props.size || "md"];
	return { width: dim, height: dim };
});

const borderClass = computed(() => {
	if (props.size === "sm" || props.size === "xs") return "border-2";
	if (props.size === "md") return "border-[3px]";
	return "border-4";
});

const borderColor = computed(() => {
	if (!props.customization?.themeId) return "rgba(0,0,0,0.1)";
	return resolveTheme(props.customization.themeId).accentColor;
});
</script>

<style scoped>
/* An animated GIF avatar repaints every frame. Without its own compositor layer
   that repaint invalidates the whole card region — so the shattered-glass
   mix-blend layers and the animated foil name re-rasterise at the GIF's frame
   rate too → tearing/flicker on the WebView. Promote the avatar to its own
   isolated layer (`translateZ` + paint containment) so the GIF's repaint is
   confined to its circle and never touches the effect/text layers. */
.avatar-frame {
	transform: translateZ(0);
	-webkit-transform: translateZ(0);
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
	contain: paint;
	isolation: isolate;
}
</style>
