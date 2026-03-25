import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useToast } from '@/service/toast.service'
import { leaveRoom } from '@/service/api/socket/drawSyncing.socket'

export function performRoomExit() {
  const { roomId } = useDrawSyncer()
  if (roomId) {
    const { toast } = useToast()
    toast('Left the lobby', { color: 'danger' }) // TODO we should cause them to not leave the lobby ideally :)
    leaveRoom()

  }
}