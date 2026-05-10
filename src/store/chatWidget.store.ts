import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ChatHead = { id: string; type: 'chat' | 'friend' }

export const useChatWidgetStore = defineStore('chatWidget', () => {
  const isVisible = ref(true)
  const isExpanded = ref(false)
  const activeTab = ref<'overview' | 'lobby' | string>('overview')
  const activeChatHeads = ref<ChatHead[]>([])

  const bouncingBubbles = ref<string[]>([])
  const showLobbyPreview = ref(false) // Controls the lobby preview popup

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

  const addChatHead = (id: string, type: 'chat' | 'friend') => {
    if (!activeChatHeads.value.some((h) => h.id === id)) {
      activeChatHeads.value.unshift({ id, type })
    }
  }

  const openPrivateChat = (chatId: string) => {
    addChatHead(chatId, 'chat')
    activeTab.value = chatId
    openPanel()
  }

  const removeChatHead = (id: string) => {
    activeChatHeads.value = activeChatHeads.value.filter((h) => h.id !== id)
    if (activeTab.value === id) activeTab.value = 'overview'
  }

  // Called from Socket Handlers when a new message arrives
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
    showWidget, hideWidget, openPanel, closePanel, togglePanel,
    openOverview, openLobby, openPrivateChat, addChatHead, removeChatHead,
    triggerNewMessageAlert
  }
})