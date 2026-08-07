import type { Canvas } from "fabric";
import { defineStore, storeToRefs } from "pinia";
import { v4 as uuidv4 } from "uuid";
import { computed, ref, type WatchStopHandle, watch } from "vue";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import {
	type ClaimViolation,
	claimViolation,
	rectsOverlap,
	canEditAt as rulesCanEditAt,
} from "@/draw/claims/claimRules";
import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useSelect } from "@/draw/tools/select.store";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { socket } from "@/service/api/socket/socket.service";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { ToastDuration } from "@/types/toast.types";

/**
 * A lobby-scoped rectangular region claimed by one user. Two rules, both in
 * claimRules.ts: someone else's area is read-only to us whoever drew what is in
 * it (no selecting, moving, erasing or drawing inside it), and our OWN area
 * accepts only our own objects — so a claim cannot be used to impound other
 * people's work. Areas are synced through the room socket and cleared when the
 * owner leaves.
 *
 * Rendering lives in the DOM overlay (ClaimAreaOverlay.vue), NOT the canvas
 * renderer — the tile compositor clears the top context between frames, which
 * made a canvas-drawn overlay flicker.
 */
export interface ClaimedArea {
	id: string;
	userId: string;
	userName?: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

const MAX_AREAS_PER_USER = 2;
// Fixed WORLD size — constant world extent means zooming out can't be used to
// grab a huge region.
const AREA_W = 1200;
const AREA_H = 1200;
const TOAST_THROTTLE_MS = 2500;

export interface AreaGhost {
	x: number;
	y: number;
	w: number;
	h: number;
	valid: boolean;
}

export const useClaimArea = defineStore("claimArea", () => {
	let c: Canvas | undefined;
	const areas = ref<ClaimedArea[]>([]);
	const isClaiming = ref(false);
	const ghost = ref<AreaGhost | null>(null);
	let lastToastAt = 0;
	let stopRoomWatch: WatchStopHandle | null = null;

	const auth = useAuthStore();
	const me = () => (auth.user?._id ? String(auth.user._id) : undefined);

	const myAreas = computed(() =>
		areas.value.filter((a) => String(a.userId) === me()),
	);
	const foreignAreas = computed(() =>
		areas.value.filter((a) => String(a.userId) !== me()),
	);
	const canClaimMore = computed(
		() => myAreas.value.length < MAX_AREAS_PER_USER,
	);

	function inLobby(): boolean {
		return !!useDrawSyncer().roomId;
	}

	function init(canvas: Canvas) {
		stopRoomWatch?.();
		c = canvas;
		// Areas live only for the current lobby session — drop them on leave.
		const { roomId } = storeToRefs(useDrawSyncer());
		stopRoomWatch = watch(roomId, (id) => {
			if (!id) {
				areas.value = [];
				exitClaimMode();
			}
		});
	}

	function destroy() {
		stopRoomWatch?.();
		stopRoomWatch = null;
		areas.value = [];
		exitClaimMode();
		c = undefined;
	}

	// ── enforcement API (read by Fabric setup overrides + eraser) ────────────
	function pointInForeignArea(x: number, y: number): ClaimedArea | null {
		for (const a of foreignAreas.value)
			if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a;
		return null;
	}

	/** See claimRules.canEditAt — the rules live there, pure and tested. */
	function canEditAt(x: number, y: number, ownerId?: string): boolean {
		return rulesCanEditAt(areas.value, x, y, me(), ownerId);
	}

	function objectOwner(obj: any): string | undefined {
		return obj?.userId ? String(obj.userId) : undefined;
	}

	function isObjectProtected(obj: any): boolean {
		if (areas.value.length === 0 || !obj) return false;
		try {
			const b = obj.getBoundingRect();
			return !canEditAt(
				b.left + b.width / 2,
				b.top + b.height / 2,
				objectOwner(obj),
			);
		} catch {
			return false;
		}
	}

	/**
	 * Would this object, where it is NOW, violate a claim? See
	 * claimRules.claimViolation — notably it checks EVERY area, not only the ones
	 * foreign to us, which is what stops a claim being used to impound other
	 * people's drawings. The reason it returns drives which toast the user sees.
	 */
	function objectClaimViolation(obj: any): ClaimViolation {
		if (areas.value.length === 0 || !obj) return "none";
		try {
			const b = obj.getBoundingRect();
			return claimViolation(
				areas.value,
				{ x: b.left, y: b.top, w: b.width, h: b.height },
				me(),
				objectOwner(obj),
			);
		} catch {
			return "none";
		}
	}

	/** Whether an object's bounding box OVERLAPS a foreign area at all. Used to
	 *  reject a freshly-drawn stroke that starts outside a foreign area but
	 *  crosses into it (the mouse-down guard only checks the start point). */
	function objectIntersectsForeignArea(obj: any): boolean {
		if (foreignAreas.value.length === 0 || !obj) return false;
		try {
			const b = obj.getBoundingRect();
			const r = { x: b.left, y: b.top, w: b.width, h: b.height };
			return foreignAreas.value.some((a) => rectsOverlap(r, a));
		} catch {
			return false;
		}
	}

	/**
	 * Called at the top of the object:modified sync handler. If any active object
	 * ended up intersecting a foreign area, revert the whole selection to its
	 * pre-transform state (captured on before:transform), repaint, warn, and
	 * return true so the caller skips the sync emit — the move never happened.
	 */
	function rejectMoveIfProtected(): boolean {
		if (areas.value.length === 0) return false;
		const canvas = useDrawStore().getCanvas();
		if (!canvas) return false;
		const active = canvas.getActiveObjects();
		if (active.length === 0) return false;

		// Snapshot the objects + their pre-transform absolute states now, but do the
		// actual revert one frame later: the transform release (which stamps the
		// moved bitmap into tiles) still runs after this handler, and discarding the
		// selection mid-release would fight it. By the rAF the release is done.
		const originals = useSelect().getSelectedObjectOriginalStates();
		const snapshot = active.map((o) => ({
			o,
			orig: originals.get((o as any).id),
		}));

		// Where it ENDED and where it STARTED both disqualify a move.
		//
		// The end check is `objectClaimViolation`, NOT "does it touch a foreign
		// area" — an area is only foreign to people who don't own it, so the
		// foreign-only test silently permitted the one move that matters: dragging
		// somebody else's object into your OWN claim.
		//
		// The start check stops the mirror image, a claim being emptied by dragging
		// its contents out. Targeting already refuses to hand those objects over,
		// but a multi-object selection assembled before the claim arrived can still
		// carry one along.
		// The reason is carried through so the toast can say what actually went
		// wrong. "That's someone's area" is simply untrue when the area is YOURS and
		// the problem is whose drawing you tried to put in it.
		let reason: ClaimViolation = "none";
		for (const o of active) {
			const violation = objectClaimViolation(o);
			if (violation === "foreign-area") {
				reason = violation;
				break; // strongest reason; stop looking
			}
			if (violation !== "none") reason = violation;
		}
		const blockedBefore = snapshot.some(({ o, orig }) => {
			const from = orig as any;
			if (!from) return false;
			return !canEditAt(from.left, from.top, objectOwner(o));
		});
		if (reason === "none" && !blockedBefore) return false;

		requestAnimationFrame(() => {
			const mgr = useDrawObjectManager();
			const footprints: { x: number; y: number; w: number; h: number }[] = [];
			for (const { o } of snapshot) footprints.push(mgr.getObjectBounds(o)); // moved

			// Ungroup so each object's left/top become absolute, then restore.
			canvas.discardActiveObject();
			for (const { o, orig } of snapshot) {
				if (!orig) continue;
				o.set({
					left: (orig as any).left,
					top: (orig as any).top,
					scaleX: (orig as any).scaleX,
					scaleY: (orig as any).scaleY,
					angle: (orig as any).angle,
				});
				o.setCoords();
				mgr.updateQuadTree(o);
				footprints.push(mgr.getObjectBounds(o)); // restored
			}

			// Sync per-region rebuilds so the stamped moved pixels vanish at once.
			for (const r of footprints) mgr.patchRectSync(r);
			mgr.renderMain();
		});

		if (reason === "own-area-intrusion") notifyOwnAreaIntrusion();
		else notifyBlocked();
		return true;
	}

	function toastBlocked(message: string) {
		const now = Date.now();
		if (now - lastToastAt < TOAST_THROTTLE_MS) return;
		lastToastAt = now;
		useToast().toast(message, {
			color: "warning",
		});
	}

	function notifyBlocked(area?: ClaimedArea | null) {
		const who = area?.userName ? `${area.userName}'s` : "a claimed";
		toastBlocked(`That's ${who} area — you can't edit here`);
	}

	/** Your own area, someone else's drawing. Naming the actual rule matters here:
	 *  the generic "that's a claimed area" message reads as a bug when the area is
	 *  visibly yours. */
	function notifyOwnAreaIntrusion() {
		toastBlocked("You can't move other people's drawings into your area");
	}

	// ── claim placement (fixed-size, tap to place) ─────────────────────────────
	function rectFromCenter(cx: number, cy: number) {
		return { x: cx - AREA_W / 2, y: cy - AREA_H / 2, w: AREA_W, h: AREA_H };
	}

	/** A rect is claimable only if it holds no OTHER user's objects and does not
	 *  overlap another user's area. Own objects are fine. */
	function isRectClaimable(rect: {
		x: number;
		y: number;
		w: number;
		h: number;
	}): boolean {
		for (const a of foreignAreas.value) if (rectsOverlap(rect, a)) return false;

		const mine = me();
		const hits = useDrawObjectManager().query(rect);
		for (const o of hits) {
			if ((o as any).userId && String((o as any).userId) !== mine) return false;
		}
		return true;
	}

	function updateGhost(cx: number, cy: number) {
		const r = rectFromCenter(cx, cy);
		ghost.value = { ...r, valid: isRectClaimable(r) };
	}

	const claimEvents: FabricEvent[] = [
		{
			on: "mouse:down",
			handler: (e: any) => {
				const p = c!.getScenePoint(e.e);
				updateGhost(p.x, p.y);
			},
		},
		{
			on: "mouse:move",
			handler: (e: any) => {
				if (!ghost.value) return;
				const p = c!.getScenePoint(e.e);
				updateGhost(p.x, p.y);
			},
		},
		{
			on: "mouse:up",
			handler: (e: any) => {
				const p = c!.getScenePoint(e.e);
				commitClaimAt(p.x, p.y);
			},
		},
	];

	function enterClaimMode() {
		if (!c) return;
		if (!inLobby()) {
			useToast().toast("Join a lobby to claim an area", { color: "warning" });
			return;
		}
		if (!canClaimMore.value) {
			useToast().toast(`You can claim at most ${MAX_AREAS_PER_USER} areas`, {
				color: "warning",
			});
			return;
		}
		isClaiming.value = true;
		ghost.value = null;
		c.isDrawingMode = false;
		c.selection = false;
		c.skipTargetFind = true;
		c.discardActiveObject();
		useDrawEventManager().activateExclusiveEvents(claimEvents);
		// Instruction is shown by the ToolDockClaimArea pill, not a toast.
	}

	function exitClaimMode() {
		if (!isClaiming.value) return;
		isClaiming.value = false;
		ghost.value = null;
		useDrawEventManager().deActivateExclusiveEvents();
		// Restore the tool the user had before entering claim mode (re-runs its
		// select() so isDrawingMode / skipTargetFind / brush are correct again).
		const ts = useToolSelection();
		ts.selectTool(ts.selectedTool, { skipOpenMenu: true });
	}

	function commitClaimAt(cx: number, cy: number) {
		const rect = rectFromCenter(cx, cy);
		const claimable = isRectClaimable(rect);
		exitClaimMode();
		if (!claimable) {
			notifyOccupied();
			return;
		}
		if (!canClaimMore.value || !me()) return;
		const area: ClaimedArea = {
			id: uuidv4(),
			userId: me()!,
			userName: auth.user?.name,
			...rect,
		};
		// Optimistic — server echoes area-claimed (idempotent upsert).
		areas.value = [...areas.value, area];
		socket?.emit("claim-area", { roomId: useDrawSyncer().roomId, area });
	}

	function notifyOccupied() {
		useToast().toast("Can't claim here — it overlaps others' work or area", {
			color: "warning",
			duration: ToastDuration.medium,
		});
	}

	function releaseArea(id: string) {
		areas.value = areas.value.filter((a) => a.id !== id);
		socket?.emit("release-area", {
			roomId: useDrawSyncer().roomId,
			areaId: id,
		});
	}

	function releaseMine() {
		const mine = myAreas.value;
		if (mine.length === 0) return;
		for (const a of mine)
			socket?.emit("release-area", {
				roomId: useDrawSyncer().roomId,
				areaId: a.id,
			});
		areas.value = foreignAreas.value;
	}

	// ── socket-driven state (called from drawRoomHandlers) ─────────────────────
	function setAreas(list: ClaimedArea[] | undefined) {
		areas.value = Array.isArray(list) ? list : [];
	}

	function upsertArea(area: ClaimedArea) {
		if (!area?.id) return;
		const i = areas.value.findIndex((a) => a.id === area.id);
		if (i === -1) areas.value = [...areas.value, area];
		else {
			const next = areas.value.slice();
			next[i] = area;
			areas.value = next;
		}
	}

	function removeAreaById(id: string) {
		areas.value = areas.value.filter((a) => a.id !== id);
	}

	return {
		areas,
		isClaiming,
		ghost,
		myAreas,
		foreignAreas,
		canClaimMore,
		init,
		destroy,
		pointInForeignArea,
		isObjectProtected,
		objectIntersectsForeignArea,
		rejectMoveIfProtected,
		notifyBlocked,
		enterClaimMode,
		exitClaimMode,
		releaseArea,
		releaseMine,
		setAreas,
		upsertArea,
		removeAreaById,
	};
});
