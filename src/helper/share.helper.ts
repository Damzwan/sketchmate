import { Clipboard } from "@capacitor/clipboard";
import { CapacitorHttp } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { useShare } from "@vueuse/core";
import { isMobile, isNative } from "@/helper/platform.helper";
import { useToast } from "@/service/toast.service";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { ToastDuration } from "@/types/toast.types";

const { toast } = useToast();
const { share, isSupported } = useShare();

export async function shareUrl(
	url: string,
	title = "",
	dialogTitle = "",
	toastMessage = "Copied personal link. Share this with a friend to connect",
) {
	const can_share = await Share.canShare();
	if (isNative() && can_share.value) {
		await Share.share({
			title: title,
			text: url,
			dialogTitle: dialogTitle,
		});
	} else if (isSupported.value && isMobile()) {
		await share({
			title: title,
			url: url,
		});
	} else {
		await Clipboard.write({
			string: url,
		});
		toast(toastMessage, { duration: ToastDuration.medium });
	}
}

async function urlToBase64(img_url: string) {
	// const response = await fetch(img_url, {mode: 'cors'})
	const response = await CapacitorHttp.get({
		url: img_url,
		responseType: "blob",
	});
	return "data:image/png;base64," + response.data;
}

function base64ToBlobSync(base64: string): Blob {
	const parts = base64.split(",");
	const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
	const bstr = atob(parts[1]);
	let n = bstr.length;
	const u8arr = new Uint8Array(n);

	while (n--) {
		u8arr[n] = bstr.charCodeAt(n);
	}

	return new Blob([u8arr], { type: mime });
}
const isBase64 = (str: string) => str.startsWith("data:");
const isBlobUrl = (str: string) => str.startsWith("blob:");

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

// Resolve any image source the app hands us into a real Blob.
//   • data:  → decode inline (sync, keeps the user-gesture window)
//   • blob:  → in-webview object; plain fetch() reads it. CapacitorHttp can't
//              (it's a native HTTP client and has no handle on the JS blob).
//   • http(s) → CapacitorHttp to dodge webview CORS on remote assets.
// The old path sent blob: URLs straight to CapacitorHttp, which threw on native
// and killed the share — that was the "sharing doesn't work on mobile" bug.
async function resolveBlob(img_url: string): Promise<Blob> {
	if (isBase64(img_url)) return base64ToBlobSync(img_url);
	if (isBlobUrl(img_url)) return await (await fetch(img_url)).blob();
	return base64ToBlobSync(await urlToBase64(img_url));
}

const extForBlob = (blob: Blob) =>
	blob.type.includes("webp") ? "webp" : "png";

export async function shareImg(
	img_url: string,
	title = undefined,
	description = undefined,
	dialogTitle = "Share image",
) {
	const can_share = await Share.canShare();

	if (isNative() && can_share.value) {
		const blob = await resolveBlob(img_url);
		const base64Data = await blobToBase64(blob);
		const savedFile = await Filesystem.writeFile({
			path: `sketchmate_img.${extForBlob(blob)}`,
			data: base64Data.split(",")[1],
			directory: Directory.Cache,
		});

		await Share.share({
			title: title,
			text: description,
			files: [savedFile.uri],
			dialogTitle: dialogTitle,
		});
		return;
	}

	// Web (incl. mobile browsers). Prefer the OS share sheet with the actual
	// image file; fall back to clipboard, then to copying the link.
	try {
		const blob = await resolveBlob(img_url);
		const file = new File([blob], `sketchmate.${extForBlob(blob)}`, {
			type: blob.type || "image/png",
		});

		const nav = navigator as any;
		if (isMobile() && nav.canShare?.({ files: [file] })) {
			await nav.share({ files: [file], title, text: description });
			return;
		}

		// Clipboard wants image/png — re-wrap non-png (webp) bytes under that type.
		const clipboardBlob =
			blob.type === "image/png"
				? blob
				: new Blob([blob], { type: "image/png" });
		await navigator.clipboard.write([
			new ClipboardItem({ [clipboardBlob.type]: clipboardBlob }),
		]);
		toast("Copied image to clipboard!");
		return;
	} catch (e) {
		console.error("Failed to share/copy image:", e);
		await Clipboard.write({ string: img_url });
		toast(isBase64(img_url) ? "Copied image data!" : "Copied image link!");
	}
}

export function createPersonalShareLink(userID: string, connectRoute: string) {
	let baseUrl: string;
	if (isNative()) baseUrl = import.meta.env.VITE_FRONTEND as string;
	else baseUrl = `${window.location.origin}`;
	return `${baseUrl}${connectRoute}?mate=${userID}`;
}

export function createRoomLink(roomId: string) {
	let baseUrl: string;
	if (isNative()) baseUrl = import.meta.env.VITE_FRONTEND as string;
	else baseUrl = `${window.location.origin}`;
	return `${baseUrl}/${FRONTEND_ROUTES.draw}?room_id=${roomId}`;
}

export async function shareImages(
	img_urls: string[],
	title = "Check out my sketches!",
	dialogTitle = "Share images",
) {
	const can_share = await Share.canShare();

	if (isNative() && can_share.value) {
		const fileUris = [];

		// Convert and save all images to device cache
		for (let i = 0; i < img_urls.length; i++) {
			const base64 = await urlToBase64(img_urls[i]);
			const savedFile = await Filesystem.writeFile({
				path: `sketchmate_share_${i}.png`,
				data: base64.toString().split(",")[1],
				directory: Directory.Cache,
			});
			fileUris.push(savedFile.uri);
		}

		await Share.share({
			title: title,
			files: fileUris,
			dialogTitle: dialogTitle,
		});
	} else {
		// Ultimate fallback if sharing is totally unsupported
		toast(`Copied ${img_urls.length} image links!`);
		await Clipboard.write({ string: img_urls.join("\n") });
	}
}
