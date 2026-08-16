import { describe, expect, it } from "vitest";
import {
	classifyGpuRenderer,
	isSeverelyMemoryConstrained,
	mergeDeviceProfile,
	shouldProbeGpu,
} from "./deviceProfile";

describe("classifyGpuRenderer", () => {
	it("classes the 0.4.4 ANR cohort's GPU as weak", () => {
		expect(classifyGpuRenderer("PowerVR Rogue GE8320")).toBe("weak");
		expect(classifyGpuRenderer("PowerVR SGX 544MP")).toBe("weak");
	});

	it("classes entry Mali and pre-Bifrost Mali as weak", () => {
		expect(classifyGpuRenderer("Mali-G31")).toBe("weak");
		expect(classifyGpuRenderer("Mali-G52 MC2")).toBe("weak");
		// G57 and up ship in capable mid-range parts — not demoted.
		expect(classifyGpuRenderer("Mali-G57 MC2")).toBe("ok");
		expect(classifyGpuRenderer("Mali-T830")).toBe("weak");
		expect(classifyGpuRenderer("Mali-450 MP4")).toBe("weak");
	});

	it("classes Adreno below 600 as weak and 600+ as ok", () => {
		expect(classifyGpuRenderer("Adreno (TM) 505")).toBe("weak");
		expect(classifyGpuRenderer("Adreno (TM) 308")).toBe("weak");
		expect(classifyGpuRenderer("Adreno (TM) 619")).toBe("ok");
		expect(classifyGpuRenderer("Adreno (TM) 730")).toBe("ok");
	});

	it("classes a software rasterizer as weak", () => {
		expect(classifyGpuRenderer("Google SwiftShader")).toBe("weak");
		expect(classifyGpuRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(
			"weak",
		);
	});

	it("does not guess: capable and unrecognised GPUs are not weak", () => {
		expect(classifyGpuRenderer("Mali-G78 MP14")).toBe("ok");
		expect(classifyGpuRenderer("Apple M2")).toBe("ok");
		expect(classifyGpuRenderer("Xclipse 920")).toBe("ok");
		expect(classifyGpuRenderer("")).toBe("unknown");
		expect(classifyGpuRenderer(null)).toBe("unknown");
		expect(classifyGpuRenderer(undefined)).toBe("unknown");
	});
});

describe("mergeDeviceProfile", () => {
	it("never lets a later unknown erase a learned class", () => {
		const learned = mergeDeviceProfile(
			{ gpuClass: "unknown" },
			{ gpu: "PowerVR Rogue GE8320", gpuClass: "weak" },
		);
		expect(mergeDeviceProfile(learned, { gpuClass: "unknown" }).gpuClass).toBe(
			"weak",
		);
	});

	it("merges the native fields independently of the GPU ones", () => {
		const withGpu = mergeDeviceProfile(
			{ gpuClass: "unknown" },
			{ gpu: "Mali-G31", gpuClass: "weak" },
		);
		const withNative = mergeDeviceProfile(withGpu, {
			lowRam: true,
			totalMemMB: 1900,
			webViewPackage: "com.google.android.webview",
			webViewVersion: "138.0.7204.45",
		});
		expect(withNative).toEqual({
			gpu: "Mali-G31",
			gpuClass: "weak",
			lowRam: true,
			totalMemMB: 1900,
			webViewPackage: "com.google.android.webview",
			webViewVersion: "138.0.7204.45",
		});
	});

	it("leaves untouched fields alone", () => {
		const base = mergeDeviceProfile(
			{ gpuClass: "ok" },
			{ lowRam: false, totalMemMB: 5900 },
		);
		expect(mergeDeviceProfile(base, {})).toEqual(base);
	});
});

describe("native device policy", () => {
	it("catches the 3 GB tier that navigator.deviceMemory rounds to 4 GB", () => {
		expect(isSeverelyMemoryConstrained(2_850)).toBe(true);
		expect(isSeverelyMemoryConstrained(3_200)).toBe(true);
		expect(isSeverelyMemoryConstrained(3_700)).toBe(false);
		expect(isSeverelyMemoryConstrained(undefined)).toBe(false);
	});

	it("does not create a fresh WebGL context after a useful renderer was learned", () => {
		expect(
			shouldProbeGpu({ gpu: "PowerVR Rogue GE8320", gpuClass: "weak" }),
		).toBe(false);
		expect(shouldProbeGpu({ gpu: "Adreno (TM) 730", gpuClass: "ok" })).toBe(
			false,
		);
		expect(shouldProbeGpu({ gpuClass: "unknown" })).toBe(true);
	});
});
