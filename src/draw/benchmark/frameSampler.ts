import type { FrameMetrics } from "@/draw/benchmark/benchmark.types";

const SLOW_FRAME_MS = 25;

function percentile(sorted: number[], ratio: number): number {
	if (!sorted.length) return 0;
	const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
	return sorted[index];
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function summarizeFrameTimes(samples: number[]): FrameMetrics {
	const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
	const slowFrames = sorted.filter((time) => time > SLOW_FRAME_MS).length;
	return {
		samples: sorted.length,
		medianMs: round2(percentile(sorted, 0.5)),
		p95Ms: round2(percentile(sorted, 0.95)),
		maxMs: round2(sorted.at(-1) ?? 0),
		slowFrames,
		slowFrameRate: sorted.length ? slowFrames / sorted.length : 0,
	};
}

export interface FrameSampler {
	stop(): FrameMetrics;
}

export function startFrameSampler(): FrameSampler {
	const samples: number[] = [];
	let frameId = 0;
	let previous = performance.now();
	let running = true;

	const sample = (now: number) => {
		if (!running) return;
		samples.push(now - previous);
		previous = now;
		frameId = requestAnimationFrame(sample);
	};
	frameId = requestAnimationFrame((now) => {
		previous = now;
		frameId = requestAnimationFrame(sample);
	});

	return {
		stop() {
			running = false;
			cancelAnimationFrame(frameId);
			return summarizeFrameTimes(samples);
		},
	};
}
