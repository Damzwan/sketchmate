import { useDrawSyncer } from "@/draw/sync/session.store";
import { leaveRoom } from "@/service/api/socket/drawSyncing.socket";

export function performRoomExit() {
	const { roomId } = useDrawSyncer();
	if (roomId) {
		leaveRoom();
	}
}

export function isInRoom() {
	const { roomId } = useDrawSyncer();
	return !!roomId;
}
