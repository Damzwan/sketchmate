// composables/useScanner.ts

import {
	BarcodeFormat,
	BarcodeScanner,
	GoogleBarcodeScannerModuleInstallState,
} from "@capacitor-mlkit/barcode-scanning";
import QrScanner from "qr-scanner";
import { onMounted, onUnmounted, type Ref, ref } from "vue";
import { isNative } from "@/helper/platform.helper";
import { useToast } from "@/service/toast.service";

export function useScanner(
	videoRef: Ref<HTMLVideoElement | undefined> | undefined = undefined,
) {
	// 1. Encapsulated State
	const installingGoogleBarcode = ref(false);
	const installingGoogleBarcodeProgress = ref<number | undefined>(0);
	const qrScanner = ref<QrScanner | null>(null);

	const { toast } = useToast();

	onMounted(async () => {
		if (isNative()) {
			const isGoogleBarcodeScannerModuleAvailable =
				await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();

			if (!isGoogleBarcodeScannerModuleAvailable.available) {
				installingGoogleBarcode.value = true;
				await BarcodeScanner.installGoogleBarcodeScannerModule();
				BarcodeScanner.addListener(
					"googleBarcodeScannerModuleInstallProgress",
					(res) => {
						if (res.state == GoogleBarcodeScannerModuleInstallState.COMPLETED) {
							installingGoogleBarcode.value = false;
							BarcodeScanner.removeAllListeners();
						}
						installingGoogleBarcodeProgress.value = res.progress;
					},
				);
			}
		}
	});

	onUnmounted(() => {
		// Ensure the camera shuts off when the user navigates away
		stopScanning();
	});

	// 3. Methods
	async function startScanning(): Promise<string | undefined> {
		if (isNative()) {
			if (installingGoogleBarcode.value) {
				toast(
					`Still installing google barcode scanner, the status is ${installingGoogleBarcodeProgress.value}. Try again soon`,
				);
				return undefined;
			}

			const supported = await BarcodeScanner.isSupported();
			if (!supported.supported) {
				toast("Camera not supported", { color: "warning" });
				return undefined;
			}

			const status = await BarcodeScanner.requestPermissions();
			if (status.camera == "granted") {
				document.querySelector("body")?.classList.add("barcode-scanner-active");

				const { barcodes } = await BarcodeScanner.scan({
					formats: [BarcodeFormat.QrCode],
				});

				stopScanning(); // Clean up UI state immediately after scan completes

				if (barcodes.length == 0) return undefined;
				return barcodes[0].rawValue;
			} else {
				toast("Camera permission not granted or not available", {
					color: "warning",
				});
				return undefined;
			}
		} else {
			// WEB IMPLEMENTATION: Wrap the callback in a Promise to match Native behavior
			return new Promise((resolve) => {
				// Must check .value because videoRef is a Ref object
				console.log(videoRef?.value);
				if (!videoRef || !videoRef.value) {
					resolve(undefined);
					return;
				}

				if (!qrScanner.value) {
					qrScanner.value = new QrScanner(
						videoRef.value,
						(result: any) => {
							stopScanning(); // Stop the camera once we find a code
							resolve(result.data); // Resolve the promise with the barcode string
						},
						{
							highlightScanRegion: true,
							returnDetailedScanResult: true,
						},
					);
				}

				// Start the web scanner, handle any startup errors gracefully
				qrScanner.value.start().catch(() => {
					toast("Could not start web camera", { color: "warning" });
					resolve(undefined);
				});
			});
		}
	}

	function stopScanning() {
		// Ensure the native background transparency is removed
		document.querySelector("body")?.classList.remove("barcode-scanner-active");

		if (!isNative()) {
			qrScanner.value?.stop();
		} else {
			BarcodeScanner.stopScan();
		}
	}

	function resetScanning(): void {
		qrScanner.value = null;
	}

	// 4. Expose what the component needs
	return {
		startScanning,
		stopScanning,
		installingGoogleBarcode,
		installingGoogleBarcodeProgress,
		resetScanning,
	};
}
