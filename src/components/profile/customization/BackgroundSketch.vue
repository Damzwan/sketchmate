<template>
  <div v-if="parsedStrokes.length > 0" class="absolute inset-0 pointer-events-none flex justify-center">

    <svg
      class="w-full h-full max-w-[360px]"
      :viewBox="viewBox || '0 0 300 360'"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        v-for="(stroke, i) in parsedStrokes"
        :key="i"
        :d="stroke.path"
        fill="none"
        :stroke="strokeColor"
        :stroke-width="stroke.width"
        stroke-linecap="round"
        stroke-linejoin="round"
        :opacity="opacity"
      />
    </svg>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
	defineProps<{
		path?: string;
		viewBox?: string;
		strokeColor: string;
		opacity?: number;
	}>(),
	{
		opacity: 0.25,
	},
);

const fallbackWidth = computed(() => {
	if (!props.viewBox) return 6;
	const parts = props.viewBox.split(/\s+/).map(Number);
	if (parts.length !== 4) return 6;
	const diag = Math.sqrt(parts[2] * parts[2] + parts[3] * parts[3]);
	return Math.max(3, Math.min(10, diag * 0.013));
});

const parsedStrokes = computed<{ path: string; width: number }[]>(() => {
	if (!props.path) return [];

	const hasWidthPrefixes = /\[\d+(?:\.\d+)?\]/.test(props.path);

	if (!hasWidthPrefixes) {
		return [{ path: props.path, width: fallbackWidth.value }];
	}

	const out: { path: string; width: number }[] = [];
	const segments = props.path.split(/\s*(?=\[\d)/);
	for (const seg of segments) {
		const m = seg.match(/^\[(\d+(?:\.\d+)?)\](.*)$/s);
		if (!m) continue;
		const width = Number(m[1]) || fallbackWidth.value;
		const pathData = m[2].trim();
		if (pathData) out.push({ path: pathData, width });
	}
	return out;
});
</script>