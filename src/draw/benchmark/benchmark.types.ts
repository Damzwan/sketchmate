import type { DrawMetricsSnapshot } from "@/draw/rendering/renderMetrics";

export type MetricStatus = "good" | "warning" | "critical" | "unavailable";
export type MetricUnit = "ms" | "count" | "percent" | "objects" | "tiles";

export interface FrameMetrics {
	samples: number;
	medianMs: number;
	p95Ms: number;
	maxMs: number;
	slowFrames: number;
	slowFrameRate: number;
}

export interface BenchmarkMetric {
	id: string;
	label: string;
	value: number | null;
	formattedValue: string;
	status: MetricStatus;
	budget: string;
	summary: string;
	meaning: string;
	whenHigh: string;
}

export interface BenchmarkReport {
	version: 1;
	name: string;
	startedAt: string;
	durationMs: number;
	metrics: BenchmarkMetric[];
	frames: FrameMetrics;
	engine: DrawMetricsSnapshot;
}
