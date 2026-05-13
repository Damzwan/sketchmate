import { actionSheetController, alertController } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import {
  personOutline,
  closeCircleOutline,
  flagOutline,
  heartDislikeOutline,
  chatbubbleOutline,
  addOutline,
  alertCircleOutline,
  timerOutline
} from 'ionicons/icons'
import { mdiAccountOffOutline } from '@mdi/js'
import { svg, compareVersions } from '@/helper/general.helper'

import { useAuthStore } from '@/store/auth.store'
import { useChatStore } from '@/store/chat.store'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useFriendStore } from '@/store/friend.store'
import { useProfileInspector } from '@/composables/profile/useProfileInspector'
import { blockUser, unblockUser, unfriendUser } from '@/service/api/relationship.api'
import { useMenuStore } from '@/store/menu.store'
import dayjs from 'dayjs'
import { useToast } from '@/service/toast.service'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'

const MIN_CHAT_VERSION = '0.4.3'

export const useUserActions = () => {
  const authStore = useAuthStore()
  const chatStore = useChatStore()
  const chatWidget = useChatWidgetStore()
  const friendStore = useFriendStore()
  const menuStore = useMenuStore()
  const { toast } = useToast()

  const { user } = storeToRefs(authStore)
  const { activeTab } = storeToRefs(chatWidget)
  const { activeChats } = storeToRefs(chatStore)
  const { inspect } = useProfileInspector()

  const openUserActions = async (info: any) => {
    if (!info) return

    const targetId = info._id
    const isMe = user.value?._id === targetId

    // Use the pro resolver to get the most up-to-date relationship info
    const hydratedInfo = friendStore.resolvePartnerInfo(targetId) || info
    const status = hydratedInfo.chat_status

    const isBlocked = friendStore.isBlocked(targetId)
    const isMate = status === 'mate'
    const isTrial = status === 'temporary' || status === 'pending_mate'

    const buttons: any[] = []

    buttons.push({
      text: isMe ? 'View My Profile' : 'View Profile',
      icon: personOutline,
      handler: () => inspect(targetId, info)
    })

    if (!isMe) {
      const hasRequiredVersion = info.last_seen_version &&
        compareVersions(info.last_seen_version, MIN_CHAT_VERSION) !== -1

      if (!isBlocked) {
        if (!hasRequiredVersion) {
          buttons.push({
            text: 'App Update Required to Chat',
            icon: alertCircleOutline,
            cssClass: 'action-sheet-disabled',
            handler: () => toast(`${info.name} is using an old version.`, { color: 'warning' })
          })
        } else {
          // Contextual Messaging Button
          let btnText = 'Become Mates'
          let btnIcon = addOutline

          if (isMate) {
            btnText = 'Send Message'
            btnIcon = chatbubbleOutline
          } else if (isTrial) {
            btnText = 'Continue Chat'
            btnIcon = timerOutline
          }

          buttons.push({
            text: btnText,
            icon: btnIcon,
            handler: () => handleStartChat(targetId)
          })
        }
      }

      // Relationship Management (Unfriend)
      // Show unfriend if they are a mate OR in a trial
      if (isMate || isTrial) {
        buttons.push({
          text: isMate ? 'Unfriend Mate' : 'Cancel Connection',
          icon: heartDislikeOutline,
          role: 'destructive',
          handler: () => confirmUnfriend(hydratedInfo)
        })
      }

      buttons.push(
        {
          text: isBlocked ? 'Unblock User' : 'Block User',
          icon: isBlocked ? svg(mdiAccountOffOutline) : closeCircleOutline,
          role: 'destructive',
          handler: () => handleToggleBlock(info)
        },
        {
          text: 'Report Content',
          icon: flagOutline,
          handler: () => { /* Open Report Modal */ }
        }
      )
    }

    buttons.push({ text: 'Cancel', role: 'cancel' })

    // Subheader logic for better UX
    let subHeader = 'Artist'
    if (isBlocked) subHeader = 'Blocked'
    else if (isMate) subHeader = 'Sketching Mates'
    else if (isTrial) subHeader = 'Ink Drying (Trial)'

    const actionSheet = await actionSheetController.create({
      header: isMe ? 'My Settings' : info.name,
      subHeader: isMe ? undefined : subHeader,
      cssClass: 'liquid-action-sheet',
      buttons
    })

    await actionSheet.present()
  }

  const handleStartChat = (targetId: string) => {
    const existingChat = activeChats.value.find(c =>
      c.participants.some(p => p._id === targetId)
    )

    if (existingChat) {
      chatWidget.openPrivateChat(existingChat._id)
    } else {
      chatWidget.addChatHead(targetId, 'user')
      chatWidget.activeTab = targetId
      chatWidget.openPanel()
    }
    menuStore.viewProfileMenuOpen = false
  }

  const confirmUnfriend = async (partner: any) => {
    const isPermanent = partner.chat_status === 'mate'
    const alert = await alertController.create({
      header: isPermanent ? 'Unfriend?' : 'End Trial?',
      message: isPermanent
        ? `Remove ${partner.name}? Chat invites will be locked for 48h.`
        : `Stop chatting with ${partner.name}?`,
      buttons: [
        { text: 'Keep', role: 'cancel' },
        {
          text: isPermanent ? 'Remove' : 'End',
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
              toast(isPermanent ? `Removed ${partner.name}` : 'Trial ended')
            } catch (e) {
              toast('Action failed', { color: 'danger' })
            }
          }
        }
      ]
    })
    await alert.present()
  }

  const handleToggleBlock = async (target: any) => {
    try {
      const isBlocked = friendStore.isBlocked(target._id)

      if (isBlocked) {
        await unblockUser(target._id)
        friendStore.unblockUserLocally(target._id)
        toast(`${target.name} unblocked`)
      } else {
        await blockUser(target._id)
        friendStore.blockUserLocally(target._id)

        // Sync stats after blocking
        if (authStore.user?._id) {
        }

        if (activeTab.value === target._id) {
          chatWidget.removeChatHead(target._id)
        }

        const { isLobby } = useDrawSyncer()
        if (isLobby) {
          const { purgeBlockedObjects } = useDrawObjectManager()
          purgeBlockedObjects()
        }

        toast(`${target.name} blocked`)
      }
    } catch (e) {
      toast('Action failed', { color: 'danger' })
    }
  }

  return { openUserActions }
}