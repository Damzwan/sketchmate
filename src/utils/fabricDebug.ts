import { Canvas, FabricObject } from "fabric";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useDocumentStore } from "@/draw/document/document.store";

interface ObjectTypeBreakdown {
	type: string;
	count: number;
	percentage: string;
	totalPoints: number;
}

/**
 * 🎨 EZPZ Canvas Debugger (Advanced Edition)
 * Controls:
 * [Ctrl+Shift+D] - Print Interactive Inspector Dashboard
 * [→] / [←]      - Navigate Heaviest Objects
 * [Delete]       - Delete selected debug object
 * [T]            - Run Chunked Loading Benchmark
 * [R]            - Manual Re-render
 * [Esc]          - Close Debugger
 */
export function setupCanvasDebugger(canvas: Canvas) {
	const syncer = useDrawSyncer();
	const loadStore = useDocumentStore();

	let pipelineStart = 0;
	let framesTaken = 0;
	let isInspecting = false;
	let sortedReport: any[] = [];
	let currentIndex = 0;

	// --- 📈 1. TELEMETRY COMPUTATIONS ---

	const getCanvasStats = () => {
		const objects = canvas.getObjects();
		const totalCount = objects.length;

		// JSON Payload Size
		const jsonString = JSON.stringify(canvas.toObject(["id", "userId"]));
		const sizeInBytes = new Blob([jsonString]).size;
		const sizeKB = (sizeInBytes / 1024).toFixed(2);
		const sizeMB = (sizeInBytes / (1024 * 1024)).toFixed(2);

		// Type Ratios & Node Counts
		const typeCounts: Record<string, { count: number; totalPoints: number }> =
			{};
		let totalNodes = 0;
		let hiddenOrCulledCount = 0;

		objects.forEach((obj: any) => {
			const type = obj.type || "unknown";
			const nodeCount = obj.path?.length || obj._objects?.length || 1;

			totalNodes += nodeCount;
			if (!obj.visible) hiddenOrCulledCount++;

			if (!typeCounts[type]) {
				typeCounts[type] = { count: 0, totalPoints: 0 };
			}
			typeCounts[type].count += 1;
			typeCounts[type].totalPoints += nodeCount;
		});

		const typeBreakdown: ObjectTypeBreakdown[] = Object.entries(typeCounts)
			.map(([type, stats]) => ({
				type,
				count: stats.count,
				percentage:
					totalCount > 0
						? ((stats.count / totalCount) * 100).toFixed(1) + "%"
						: "0%",
				totalPoints: stats.totalPoints,
			}))
			.sort((a, b) => b.count - a.count);

		// Viewport & Dimensions
		const zoom = canvas.getZoom();
		const width = canvas.getWidth();
		const height = canvas.getHeight();
		const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];

		return {
			dimensions: {
				width,
				height,
				devicePixelRatio: window.devicePixelRatio || 1,
			},
			viewport: {
				zoom: zoom.toFixed(2),
				panX: vpt[4].toFixed(0),
				panY: vpt[5].toFixed(0),
			},
			payload: { sizeKB, sizeMB },
			objects: {
				total: totalCount,
				totalNodes,
				hiddenOrCulled: hiddenOrCulledCount,
				breakdown: typeBreakdown,
			},
		};
	};

	// --- 🧪 2. BENCHMARKING ---

	const runLoadingBenchmark = async () => {
		console.log(
			"%c 🧪 BENCHMARK: Testing Chunked Loading Performance... ",
			"background: #FF9800; color: white; padding: 4px;",
		);
		const currentData = canvas.toObject(["id", "userId"]);
		const startTime = performance.now();

		await loadStore.loadCanvas(canvas, { json: currentData, isLobby: true });

		const endTime = performance.now();
		console.log(
			`%c 🏁 DONE: Canvas reloaded in ${(endTime - startTime).toFixed(2)}ms `,
			"background: #4CAF50; color: white; padding: 4px;",
		);
	};

	// --- 🛠️ 3. INSPECTION PANELS ---

	const printDashboard = () => {
		const stats = getCanvasStats();

		console.clear();
		console.log(
			`%c 🕹️ EZPZ CANVAS DEBUGGER %c Zoom: ${stats.viewport.zoom}x | Size: ${stats.payload.sizeMB} MB `,
			"background: #673ab7; color: white; padding: 4px 8px; font-size: 14px; font-weight: bold; border-radius: 3px 0 0 3px;",
			"background: #333; color: #00BCD4; padding: 4px 8px; font-size: 14px; font-weight: bold; border-radius: 0 3px 3px 0;",
		);

		console.log(
			"\n%c 📐 CANVAS & VIEWPORT METRICS ",
			"color: #FFC107; font-weight: bold;",
		);
		console.table({
			"Canvas Dimensions": `${stats.dimensions.width}px x ${stats.dimensions.height}px`,
			"Device Pixel Ratio": stats.dimensions.devicePixelRatio,
			"Zoom Level": `${stats.viewport.zoom}x`,
			"Pan Offset (X, Y)": `(${stats.viewport.panX}, ${stats.viewport.panY})`,
			"JSON Footprint": `${stats.payload.sizeKB} KB (${stats.payload.sizeMB} MB)`,
			"Sync Room Status": syncer?.roomId
				? `ACTIVE (${syncer.roomId})`
				: "LOCAL ONLY",
		});

		console.log(
			"\n%c 📊 OBJECT TYPE BREAKDOWN & RATIOS ",
			"color: #03A9F4; font-weight: bold;",
		);
		console.table(
			stats.objects.breakdown.map((item) => ({
				"Object Type": item.type,
				Count: item.count,
				"Ratio (%)": item.percentage,
				"Total Nodes / Path Points": item.totalPoints,
			})),
		);

		console.log(
			"\n%c 🎯 RENDER & CULLING SUMMARY ",
			"color: #4CAF50; font-weight: bold;",
		);
		console.table({
			"Total Objects": stats.objects.total,
			"Total Vectors/Nodes": stats.objects.totalNodes,
			"Culled / Hidden Objects": stats.objects.hiddenOrCulled,
		});

		if (sortedReport.length > 0 && isInspecting) {
			const current = sortedReport[currentIndex];
			console.log(
				`\n%c 🔍 INSPECTING OBJECT [${currentIndex + 1}/${sortedReport.length}] `,
				"background: #E91E63; color: white; padding: 2px 6px;",
			);
			console.log(`ID: %c${current.id}`, "color: #FFC107;", current.obj);
		}

		console.log(
			"\n%c CONTROLS: %c [→/←] Nav Heavy Objects %c [Del] Delete Inspecting %c [T] Benchmark %c [R] Re-render %c [Esc] Close ",
			"font-weight: bold;",
			"color: #2196F3;",
			"color: #F44336;",
			"color: #FF9800;",
			"color: #4CAF50;",
			"color: #9E9E9E;",
		);
	};

	const startInspection = () => {
		isInspecting = true;
		const objects = canvas.getObjects();
		sortedReport = objects
			.map((obj: any) => {
				const complexity = obj.path?.length || obj._objects?.length || 1;
				const json = JSON.stringify(obj.toObject(["id", "userId"]));
				return {
					id: obj.id || "unassigned",
					type: obj.type,
					complexity,
					sizeKB: (json.length / 1024).toFixed(2),
					obj,
				};
			})
			.sort((a, b) => b.complexity - a.complexity)
			.slice(0, 30);

		currentIndex = 0;
		if (sortedReport[0]) {
			canvas.setActiveObject(sortedReport[0].obj);
			canvas.requestRenderAll();
		}
		printDashboard();
	};

	// --- ⚡ 4. PIPELINE LISTENERS ---

	const onPipelineStart = () => {
		pipelineStart = performance.now();
		framesTaken = 0;
	};
	const onPipelineChunk = () => {
		framesTaken++;
	};
	const onPipelineEnd = () => {
		const duration = performance.now() - pipelineStart;
		const objects = canvas.getObjects();
		const color =
			duration > 500 ? "#F44336" : duration > 100 ? "#FF9800" : "#4CAF50";

		console.log(
			`%c ⚡ PIPELINE %c ${duration.toFixed(2)}ms | ${framesTaken} chunks | Objs: ${objects.length} `,
			`background: ${color}; color: white; padding: 2px; font-weight: bold; border-radius: 3px 0 0 3px;`,
			`background: #333; color: white; padding: 2px; border-radius: 0 3px 3px 0;`,
		);
	};

	const onSyncActionDone = (e: any) => {
		const { type, duration } = e;
		const color = duration > 16 ? "#F44336" : "#2196F3";
		console.log(
			`%c 🛰️ SYNC %c ${type} %c ${duration.toFixed(2)}ms `,
			`background: #333; color: #00ebff; padding: 2px;`,
			`background: #444; color: white; padding: 2px;`,
			`background: ${color}; color: white; padding: 2px; font-weight: bold;`,
		);
	};

	// --- ⌨️ 5. INPUT HANDLING ---

	const handleKeys = (e: KeyboardEvent) => {
		if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
			e.preventDefault();
			startInspection();
			return;
		}

		if (!isInspecting) return;

		switch (e.key) {
			case "ArrowRight":
				if (sortedReport.length === 0) return;
				currentIndex = (currentIndex + 1) % sortedReport.length;
				canvas.setActiveObject(sortedReport[currentIndex].obj);
				canvas.requestRenderAll();
				break;
			case "ArrowLeft":
				if (sortedReport.length === 0) return;
				currentIndex =
					(currentIndex - 1 + sortedReport.length) % sortedReport.length;
				canvas.setActiveObject(sortedReport[currentIndex].obj);
				canvas.requestRenderAll();
				break;
			case "Delete":
				if (sortedReport[currentIndex]) {
					canvas.remove(sortedReport[currentIndex].obj);
					sortedReport.splice(currentIndex, 1);
					if (sortedReport.length === 0) {
						isInspecting = false;
						console.log(
							"%c Canvas Cleared! %c",
							"color: #F44336; font-weight: bold;",
						);
						return;
					}
					currentIndex = currentIndex % sortedReport.length;
					canvas.setActiveObject(sortedReport[currentIndex].obj);
					canvas.requestRenderAll();
				}
				break;
			case "t":
			case "T":
				runLoadingBenchmark();
				return;
			case "r":
			case "R":
				canvas.requestRenderAll();
				break;
			case "Escape":
				isInspecting = false;
				canvas.discardActiveObject();
				canvas.requestRenderAll();
				console.log(
					"%c ✅ Debugger Closed ",
					"color: #bada55; font-weight: bold",
				);
				return;
			default:
				return;
		}
		printDashboard();
	};

	// --- 🚀 6. LIFECYCLE ---

	const enable = () => {
		canvas.on("render:pipeline:start" as any, onPipelineStart);
		canvas.on("render:pipeline:chunk" as any, onPipelineChunk);
		canvas.on("render:pipeline:end" as any, onPipelineEnd);
		canvas.on("sync:action:done" as any, onSyncActionDone);

		window.addEventListener("keydown", handleKeys);

		console.log(
			"%c 🩺 EZPZ DEBUGGER LOADED ",
			"background: #4CAF50; color: white; padding: 4px; font-weight: bold; border-radius: 4px;",
		);
		console.log(
			"Press %cCtrl+Shift+D%c to open the console dashboard.",
			"color: #2196F3; font-weight: bold;",
			"",
		);
	};

	enable();

	return {
		disable: () => {
			canvas.off("render:pipeline:start" as any, onPipelineStart);
			canvas.off("render:pipeline:chunk" as any, onPipelineChunk);
			canvas.off("render:pipeline:end" as any, onPipelineEnd);
			canvas.off("sync:action:done" as any, onSyncActionDone);
			window.removeEventListener("keydown", handleKeys);
		},
	};
}
