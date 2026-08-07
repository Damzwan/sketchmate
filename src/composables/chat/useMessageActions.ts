import { Clipboard } from "@capacitor/clipboard";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { actionSheetController } from "@ionic/vue";
import {
	mdiAccountAlertOutline,
	mdiContentCopy,
	mdiFlagVariantOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { isNative } from "@/helper/platform.helper";
import { safeText } from "@/helper/profanity.helper";
import { useModerationStore } from "@/store/moderation.store";

const LONG_PRESS_MS = 450;

/** Past this much finger travel it was a scroll, not a press. */
const MOVE_TOLERANCE_PX = 10;

/**
 * A 24-char hex id is a real persisted message; a uuid is an optimistic row that
 * hasn't come back from the server yet and has nothing a report could point at.
 */
const OBJECT_ID = /^[a-f\d]{24}$/i;

/**
 * Long-press actions on a chat bubble — report first among them.
 *
 * ONE set of listeners, on the thread container, not one per bubble. The list
 * is the hot surface in this app (see the notes in ChatMessageFlow about
 * TransitionGroup and v-memo); attaching four pointer listeners to every row
 * would put the cost back in exactly the place those notes spent effort taking
 * it out of. The bubble carries `data-msg-id` and the handler looks the message
 * up on the way out.
 */
export function useMessageActions(opts: {
	messages: () => any[];
	currentUserId: () => string | undefined;
	isLobby: () => boolean;
}) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let startX = 0;
	let startY = 0;

	const cancel = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};

	const onPointerDown = (ev: PointerEvent) => {
		cancel();
		const row = (ev.target as HTMLElement | null)?.closest?.(
			"[data-msg-id]",
		) as HTMLElement | null;
		if (!row) return;

		const id = row.dataset.msgId;
		if (!id) return;

		startX = ev.clientX;
		startY = ev.clientY;
		timer = setTimeout(() => {
			timer = null;
			const msg = opts.messages().find((m) => (m._id || m.id) === id);
			if (msg) openMessageActions(msg);
		}, LONG_PRESS_MS);
	};

	const onPointerMove = (ev: PointerEvent) => {
		if (!timer) return;
		if (
			Math.abs(ev.clientX - startX) > MOVE_TOLERANCE_PX ||
			Math.abs(ev.clientY - startY) > MOVE_TOLERANCE_PX
		) {
			cancel();
		}
	};

	async function openMessageActions(msg: any) {
		const moderationStore = useModerationStore();
		const senderId = msg.sender_id || msg.member?._id;
		const senderName = msg.member?.name;
		const isMine = senderId === opts.currentUserId();

		// The raw text, deliberately. A censored copy is worthless as evidence,
		// and the moderator needs to see what was actually sent.
		const rawText: string = msg.content || msg.message || "";

		const buttons: any[] = [];

		if (rawText) {
			buttons.push({
				text: "Copy text",
				icon: svg(mdiContentCopy),
				handler: () => {
					// Copies what the reader sees. Someone with the filter on asked
					// not to have that word in front of them; the clipboard is no
					// different from the bubble.
					Clipboard.write({
						string: safeText(
							rawText,
							msg.content_filtered ?? msg.message_filtered,
						),
					}).catch((e) => console.error("copy failed:", e));
				},
			});
		}

		if (!isMine && senderId) {
			// Lobby messages live in an in-memory buffer on the server and are never
			// written to a collection, so there is no id a report could be attached
			// to. Reporting the artist is the honest equivalent there — and the
			// moderator still gets the lobby context from the user's other reports.
			if (opts.isLobby() || !OBJECT_ID.test(msg._id ?? "")) {
				buttons.push({
					text: "Report artist",
					role: "destructive",
					icon: svg(mdiAccountAlertOutline),
					handler: () => {
						moderationStore.openReport({
							type: "user",
							id: senderId,
							label: senderName ? `${senderName}` : "this artist",
						});
					},
				});
			} else {
				buttons.push({
					text: "Report message",
					role: "destructive",
					icon: svg(mdiFlagVariantOutline),
					handler: () => {
						moderationStore.openReport({
							type: "dm_message",
							id: msg._id,
							label: "this message",
							blockUserId: senderId,
						});
					},
				});
			}
		}

		// Nothing but Cancel — an empty own-message bubble. Don't open a sheet.
		if (!buttons.length) return;
		buttons.push({ text: "Cancel", role: "cancel" });

		if (isNative()) {
			await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
		}

		const sheet = await actionSheetController.create({
			header: "Message",
			cssClass: "liquid-action-sheet",
			buttons,
		});
		await sheet.present();
	}

	return {
		onPointerDown,
		onPointerMove,
		onPointerUp: cancel,
		onPointerCancel: cancel,
	};
}
