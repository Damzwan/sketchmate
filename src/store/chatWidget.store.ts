import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useChatStore } from './chat.store'

export type ChatHead = { id: string; type: 'chat' | 'user' }

export const useChatWidgetStore = defineStore('chatWidget', () => {
  const isVisible = ref(true)
  const isExpanded = ref(false)
  const activeTab = ref<'overview' | 'lobby' | string>('overview')
  const activeChatHeads = ref<ChatHead[]>([])

  const bouncingBubbles = ref<string[]>([])
  const showLobbyPreview = ref(false)

  // Chats whose relationship banner the user has collapsed. Remembered so a
  // temporary-trial nudge they've already seen stays out of the way instead of
  // re-inflating every time they reopen the thread.
  const minimizedBanners = ref<string[]>([])
  const isBannerMinimized = (chatId: string) =>
    minimizedBanners.value.includes(chatId)
  const toggleBannerMinimized = (chatId: string) => {
    if (isBannerMinimized(chatId))
      minimizedBanners.value = minimizedBanners.value.filter((id) => id !== chatId)
    else minimizedBanners.value.push(chatId)
  }

  const showWidget = () => (isVisible.value = true)
  const hideWidget = () => {
    isVisible.value = false
    isExpanded.value = false
  }

  const openPanel = () => (isExpanded.value = true)
  const closePanel = () => (isExpanded.value = false)
  const togglePanel = () => (isExpanded.value = !isExpanded.value)

  const openOverview = () => { activeTab.value = 'overview'; openPanel() }
  const openLobby = () => { activeTab.value = 'lobby'; openPanel() }

  const addChatHead = (id: string, type: 'chat' | 'user') => {
    if (!activeChatHeads.value.some((h) => h.id === id)) {
      activeChatHeads.value.unshift({ id, type })
    }
  }

  const openPrivateChat = (chatId: string) => {
    addChatHead(chatId, 'chat')
    activeTab.value = chatId
    openPanel()
  }

  /**
   * NEW: The master routing action.
   * Components call this with a User ID, and the store figures out the rest.
   */
  const openChatWithUser = (userId: string) => {
    const chatStore = useChatStore()

    // Check if we already have an active conversation object
    const existingChat = chatStore.activeChats.find(c =>
      c.participants.some(p => p._id === userId)
    )

    if (existingChat) {
      openPrivateChat(existingChat._id)
    } else {
      // Create a temporary user chat head
      addChatHead(userId, 'user')
      activeTab.value = userId
      openPanel()
    }
  }

  const removeChatHead = (id: string) => {
    activeChatHeads.value = activeChatHeads.value.filter((h) => h.id !== id)
    if (activeTab.value === id) activeTab.value = 'overview'
  }

  const triggerNewMessageAlert = (chatId: string) => {
    addChatHead(chatId, 'chat')
    if (!bouncingBubbles.value.includes(chatId)) {
      bouncingBubbles.value.push(chatId)
      setTimeout(() => {
        bouncingBubbles.value = bouncingBubbles.value.filter(b => b !== chatId)
      }, 3000)
    }
  }

  return {
    isVisible, isExpanded, activeTab, activeChatHeads, bouncingBubbles, showLobbyPreview,
    minimizedBanners, isBannerMinimized, toggleBannerMinimized,
    showWidget, hideWidget, openPanel, closePanel, togglePanel,
    openOverview, openLobby, openPrivateChat, openChatWithUser, addChatHead, removeChatHead,
    triggerNewMessageAlert
  }
})