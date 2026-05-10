import { actionSheetController, alertController } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import {
  personOutline,
  closeCircleOutline,
  flagOutline,
  heartDislikeOutline,
  chatbubbleOutline,
  addOutline
} from 'ionicons/icons'
import { mdiAccountOffOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'

import { useAuthStore } from '@/store/auth.store'
import { useChatStore } from '@/store/chat.store'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useFriendStore } from '@/store/friend.store'
import { useProfileInspector } from '@/composables/profile/useProfileInspector'
import { blockUser, unblockUser, unfriendUser } from '@/service/api/user.api'
import { useMenuStore } from '@/store/menu.store'
import dayjs from 'dayjs'
import { useToast } from '@/service/toast.service'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'

export const useUserActions = () => {
  const authStore = useAuthStore()
  const chatStore = useChatStore()
  const chatWidget = useChatWidgetStore()
  const friendStore = useFriendStore()
  const menuStore = useMenuStore()

  const { user } = storeToRefs(authStore)
  const { activeTab } = storeToRefs(chatWidget)
  const { activeChats } = storeToRefs(chatStore)
  const { inspect } = useProfileInspector()

  /**
   * Primary Entry Point: Shows the high-level management menu
   */
  const openUserActions = async (info: any) => {
    if (!info) return

    const targetId = info._id
    const isMe = user.value?._id === targetId

    // 1. Initial Button: Always View Profile
    const buttons: any[] = [
      {
        text: isMe ? 'View My Profile' : 'View Profile',
        icon: personOutline,
        handler: () => inspect(targetId, info)
      }
    ]

    // 2. Logic for other users only
    if (!isMe) {
      const isBlocked = user.value?.blocked_users?.includes(targetId)
      const isFriend = user.value?.friends?.includes(targetId)

      const currentChat = activeChats.value.find(c =>
        c.participants.some(p => p._id === targetId)
      )
      const isExpired = currentChat?.status === 'expired'

      // Messaging / Mating Logic
      if (!isBlocked) {
        buttons.push({
          text: isFriend ? 'Send Message' : 'Become Mates',
          icon: isFriend ? chatbubbleOutline : addOutline,
          handler: () => handleStartChat(targetId)
        })
      }

      // Unfriend Logic
      if (!isExpired && currentChat) {
        buttons.push({
          text: 'Unfriend',
          icon: heartDislikeOutline,
          role: 'destructive',
          handler: () => confirmUnfriend(info)
        })
      }

      // Safety Logic
      buttons.push(
        {
          text: isBlocked ? 'Unblock User' : 'Block User',
          icon: isBlocked ? svg(mdiAccountOffOutline) : closeCircleOutline,
          role: 'destructive',
          handler: () => handleToggleBlock(info)
        },
        {
          text: 'Report',
          icon: flagOutline,
          handler: () => { /* Logic for reporting */
          }
        }
      )
    }

    buttons.push({
      text: 'Cancel',
      role: 'cancel'
    })

    const actionSheet = await actionSheetController.create({
      header: isMe ? 'My Settings' : `Manage ${info.name}`,
      cssClass: 'liquid-action-sheet',
      buttons
    })

    await actionSheet.present()
  }

  /**
   * Logic to open or initialize a chat session
   */
  const handleStartChat = (targetId: string) => {
    const existingChat = activeChats.value.find(c =>
      c.participants.some(p => p._id === targetId)
    )

    if (existingChat) {
      chatWidget.openPrivateChat(existingChat._id)
    } else {
      chatWidget.addChatHead(targetId, 'friend')
      chatWidget.activeTab = targetId
      chatWidget.openPanel()
    }

    menuStore.viewProfileMenuOpen = false
  }

  /**
   * Relationship: Unfriend Logic
   */
  const confirmUnfriend = async (partner: any) => {
    const alert = await alertController.create({
      header: 'Unfriend?',
      message: `Remove ${partner.name}? History is saved, but invites will be locked for a while.`,
      cssClass: 'liquid-unfriend-alert',
      buttons: [
        { text: 'Keep', role: 'cancel' },
        {
          text: 'Remove',
          role: 'confirm',
          handler: async () => {
            try {
              await unfriendUser(partner._id)
              friendStore.removeFriendLocally(partner._id)

              const chatIndex = activeChats.value.findIndex(c =>
                c.participants.some(p => p._id === partner._id)
              )

              if (chatIndex !== -1) {
                activeChats.value[chatIndex] = {
                  ...activeChats.value[chatIndex],
                  status: 'expired',
                  cooldown_until: dayjs().add(48, 'hours').toISOString()
                }
              }
            } catch (e) {
              console.error('Failed to unfriend', e)
            }
          }
        }
      ]
    })
    await alert.present()
  }

  /**
   * Safety: Block/Unblock Toggle
   */
  const handleToggleBlock = async (target: any) => {
    if (!user.value) return
    const { toast } = useToast()

    try {
      const currentBlocks = user.value.blocked_users || []
      const isBlocked = currentBlocks.includes(target._id)

      if (isBlocked) {
        await unblockUser(target._id)
        user.value.blocked_users = currentBlocks.filter(id => id !== target._id)
        toast(`${target.name} unblocked`)
      } else {
        await blockUser(target._id)
        user.value.blocked_users = [...currentBlocks, target._id]

        if (activeTab.value === target._id) {
          chatWidget.removeChatHead(target._id)
        }

        const {isLobby} = useDrawSyncer()
        if (isLobby) {
          const {purgeBlockedObjects} = useDrawObjectManager()
          purgeBlockedObjects()
        }

        toast(`${target.name} has been blocked`)
      }
    } catch (e) {
      console.error('Safety Action Failed:', e)
      toast('Action failed. Check your connection.', { color: 'danger' })
    }
  }

  return {
    openUserActions
  }
}