import { defineStore } from 'pinia'
import { computed, markRaw, ref } from 'vue'
import dayjs from 'dayjs'
import {
  BaseMessage,
  Mate,
  PopulatedConversation,
  ChatStatus
} from '@/types/server.types'
import {
  getActiveChats,
  getChatMessages,
  markAllAsRead,
  markAsRead
} from '@/service/api/chat.api'
import {
  emitSendMessage,
  emitTypingStatus
} from '@/service/api/socket/chat.socket'
import { socket } from '@/service/api/socket/socket.service'
import { useAuthStore } from '@/store/auth.store'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useFriendStore } from '@/store/friend.store'
import { v4 as uuidv4 } from 'uuid'
import {
  cancelMateRequest,
  respondToRelationship
} from '@/service/api/relationship.api'
import { useUserCacheStore } from '@/store/userCache.store'
import { useQuotaStore } from '@/store/quota.store'

type FrontendMessage = BaseMessage & {
  isOptimistic?: boolean;
  localKey?: string;
  status?: 'sending' | 'sent' | 'error';
};

export const useChatStore = defineStore('chat', () => {
  // --- STATE ---
  const activeChats = ref<PopulatedConversation[]>([])
  // Deep `ref`, but every SETTLED message goes in via `freeze()` below. A
  // delivered message is immutable data — nothing ever mutates one in place, so
  // there is no reason to pay for a reactive Proxy per message and a tracked
  // dep per property. The array itself stays reactive, which is all the UI
  // needs (append / prepend / splice). Only in-flight optimistic messages stay
  // reactive, because their `status` genuinely changes under them, and there
  // are never more than a handful of those.
  const messagesByChat = ref<Record<string, FrontendMessage[]>>({})

  const freeze = <T extends object>(m: T): T => markRaw(m)
  const freezeAll = (list: any[]): FrontendMessage[] =>
    list.map((m) => freeze(m) as FrontendMessage)

  // Bound on retained messages per chat. Each message is a mounted component
  // with ~10 computeds behind it, so an unbounded thread keeps accumulating
  // instances and reactive effects for history the user has scrolled far past.
  // `content-visibility` already stops offscreen rows costing layout or paint;
  // this is about the instances themselves.
  //
  // Two thresholds, not one: trimming AT the cap would re-slice the array on
  // every single new message once a thread got long. Trimming down to
  // TRIM_TARGET means it fires once per (MAX - TARGET) messages instead.
  const MAX_RETAINED_MESSAGES = 300
  const TRIM_TARGET = 200
  // Full message histories are the expensive part of chat state. Keep only the
  // most recently used conversations resident; evicted threads reload on open.
  const MAX_CACHED_CONVERSATIONS = 8
  const messageCacheAccess = new Map<string, number>()
  let messageCacheClock = 0

  /**
   * Drop the oldest retained messages for a chat.
   *
   * ONLY safe to call while the user is pinned to the bottom of that thread —
   * removing rows above the viewport shifts the scroll anchor, which would
   * yank the view out from under someone reading history. The caller owns that
   * decision because the store has no idea where the list is scrolled; see
   * ChatWidget's length watcher.
   *
   * Re-arms `hasMore` so the top sentinel can fetch the dropped page back if
   * they do scroll up: `loadMessages(false)` pages on `existing[0].createdAt`,
   * which after the slice is simply a later cursor.
   */
  function trimOldMessages(chatId: string) {
    const msgs = messagesByChat.value[chatId]
    if (!msgs || msgs.length <= MAX_RETAINED_MESSAGES) return
    messagesByChat.value[chatId] = msgs.slice(msgs.length - TRIM_TARGET)
    hasMoreMessagesByChat.value[chatId] = true
  }

  function touchMessageCache(chatId: string) {
    if (!chatId || chatId === 'overview' || chatId === 'lobby') return
    messageCacheAccess.set(chatId, ++messageCacheClock)
  }

  function pruneMessageCaches() {
    const ids = Object.keys(messagesByChat.value)
    if (ids.length <= MAX_CACHED_CONVERSATIONS) return

    const protectedId =
      chatWidget.isExpanded &&
      !['overview', 'lobby'].includes(chatWidget.activeTab)
        ? chatWidget.activeTab
        : null

    const candidates = ids
      .filter((id) => {
        if (id === protectedId) return false
        return !(messagesByChat.value[id] || []).some(
          (m) => m.isOptimistic && m.status === 'sending'
        )
      })
      .sort(
        (a, b) =>
          (messageCacheAccess.get(a) || 0) -
          (messageCacheAccess.get(b) || 0)
      )

    let retained = ids.length
    for (const id of candidates) {
      if (retained <= MAX_CACHED_CONVERSATIONS) break
      delete messagesByChat.value[id]
      delete hasMoreMessagesByChat.value[id]
      messageCacheAccess.delete(id)
      retained--
    }
  }

  function clearRuntimeState() {
    notifications.value.forEach((notification) =>
      clearTimeout(notification.timer)
    )
    activeChats.value = []
    messagesByChat.value = {}
    typingStatuses.value = {}
    hasMoreMessagesByChat.value = {}
    notifications.value = []
    chatsHydrated.value = false
    readAcknowledged.clear()
    messageCacheAccess.clear()
    messageCacheClock = 0
  }
  const typingStatuses = ref<Record<string, boolean>>({})
  const hasMoreMessagesByChat = ref<Record<string, boolean>>({})
  const notifications = ref<any[]>([])
  // Conversations this session has already read. Kept outside `activeChats` so
  // a read survives the conversation list being re-fetched and replaced.
  const readAcknowledged = new Set<string>()
  // True once the first conversation fetch resolves — lets the overview show a
  // skeleton instead of flashing the empty state while the list loads.
  const chatsHydrated = ref(false)

  const authStore = useAuthStore()
  const friendStore = useFriendStore()
  const chatWidget = useChatWidgetStore()

  // --- GETTERS ---

  const totalUnreadCount = computed(() => {
    if (!authStore.user) return 0
    const userId = authStore.user._id
    const activeSum = activeChats.value.reduce(
      (total, chat) => total + (chat.unread_counts?.[userId] || 0),
      0
    )
    const pendingSum = friendStore.pendingRequests.reduce(
      (total, chat) => total + (chat.unread_counts?.[userId] || 0),
      0
    )
    return activeSum + pendingSum
  })

  const canSendMessage = computed(() => (tabId: string) => {
    if (tabId === 'lobby') return true
    const me = authStore.user?._id
    if (!me) return false
    const friendStore = useFriendStore()
    const chat =
      activeChats.value.find((c) => c._id === tabId) ||
      friendStore.pendingRequests.find((c) => c._id === tabId)
    if (!chat) return true

    if (chat.status === 'expired') return false
    if (chat.status === 'pending_invite') return false // blocks both sides
    if (chat.status === 'temporary' && chat.trial_expires_at) {
      if (dayjs().isAfter(dayjs(chat.trial_expires_at))) return false
    }
    return true
  })

  const chatInputPlaceholder = computed(() => (tabId: string) => {
    if (tabId === 'lobby') return 'Sketch a message...'
    const me = authStore.user?._id
    const chat =
      activeChats.value.find((c) => c._id === tabId) ||
      friendStore.pendingRequests.find((c) => c._id === tabId)

    if (chat) {
      // FIX: Using standardized ChatStatus
      if (chat.status === 'pending_invite')
        return chat.initiator_id === me
          ? 'Waiting for response...'
          : 'Accept request to reply...'
      if (chat.status === 'expired')
        return 'Chat locked. Re-match to continue.'
      if (chat.status === 'temporary' && chat.trial_expires_at) {
        if (dayjs().isAfter(dayjs(chat.trial_expires_at)))
          return 'Trial ended. Send Mate request!'
        const hoursLeft = dayjs(chat.trial_expires_at).diff(dayjs(), 'hour')
        return hoursLeft > 0
          ? `Message... (${hoursLeft}h trial left)`
          : 'Message... (Trial ending soon)'
      }
    }
    return 'Write a message...'
  })

  const isMate = computed(() => (tabId: string) => {
    const chat = activeChats.value.find((c) => c._id === tabId)
    // FIX: Using 'mate' instead of 'active'
    return chat?.status === 'mate'
  })

  const mateRequestStatus = computed(() => (tabId: string) => {
    const me = authStore.user?._id
    const chat = activeChats.value.find((c) => c._id === tabId)
    // FIX: Using 'pending_mate' instead of 'mate_pending'
    if (chat?.status !== 'pending_mate') return null
    return chat.initiator_id === me ? 'sent' : 'received'
  })

  // --- CORE ACTIONS ---

  async function loadActiveChats() {
    const userCache = useUserCacheStore()
    try {
      const chats = await getActiveChats()
      activeChats.value = chats as PopulatedConversation[]
      for (const chat of chats) {
        userCache.upsertMany(chat.participants as any)
      }
      reapplyLocalReads()
    } catch (e) {
      console.error('Failed to load active chats:', e)
    } finally {
      chatsHydrated.value = true
    }
  }

  function addIncomingMessage(
    conversation_id: string,
    message: BaseMessage,
    fullConversation?: PopulatedConversation
  ) {
    const userCache = useUserCacheStore()
    const me = authStore.user?._id

    // 1. Append message to the chat
    if (!messagesByChat.value[conversation_id])
      messagesByChat.value[conversation_id] = []
    if (
      !messagesByChat.value[conversation_id].some((m) => m._id === message._id)
    ) {
      messagesByChat.value[conversation_id].push(
        freeze(message) as FrontendMessage
      )
      // Inactive threads have no scroll anchor to preserve, so they can be
      // bounded immediately. The visible thread still trims only at the bottom.
      if (
        !chatWidget.isExpanded ||
        chatWidget.activeTab !== conversation_id
      ) {
        trimOldMessages(conversation_id)
      }
      touchMessageCache(conversation_id)
      pruneMessageCaches()
    }

    // 2. Determine if the incoming socket payload actually contains populated profiles
    const isPopulated =
      fullConversation?.participants?.length &&
      typeof fullConversation.participants[0] === 'object' &&
      '_id' in fullConversation.participants[0]

    if (isPopulated) {
      userCache.upsertMany(fullConversation.participants as any)
    }

    const activeIdx = activeChats.value.findIndex(
      (c) => c._id === conversation_id
    )
    const pendingIdx = friendStore.pendingRequests.findIndex(
      (c) => c._id === conversation_id
    )

    // 3. SMART MERGE: Find out who sent this, even if the backend gave us raw string IDs
    let partnerIdStr = ''
    if (fullConversation?.participants) {
      const p = fullConversation.participants.find(
        (p: any) =>
          (typeof p === 'object' ? p._id || p.toString() : p.toString()) !== me
      )
      // @ts-ignore
      partnerIdStr = typeof p === 'object' ? p._id : p?.toString()
    }

    const legacyConvo =
      activeChats.value.find(
        (c) =>
          c._id !== conversation_id &&
          c.participants?.some((p: any) => p._id === partnerIdStr) // <-- ADDED ?.
      ) ||
      friendStore.pendingRequests.find(
        (c) =>
          c._id !== conversation_id &&
          c.participants?.some((p: any) => p._id === partnerIdStr) // <-- ADDED ?.
      )

    const updateChatMetadata = (chat: PopulatedConversation) => {
      chat.last_message = message
      chat.updatedAt = message.createdAt

      if (fullConversation) {
        chat.status = fullConversation.status
        chat.trial_expires_at = fullConversation.trial_expires_at
        chat.unread_counts = fullConversation.unread_counts
        chat.initiator_id = fullConversation.initiator_id
        chat.relationship_id = fullConversation.relationship_id

        if (isPopulated) {
          chat.participants = fullConversation.participants
        } else if (legacyConvo?.participants) {
          // Steal the fully loaded profiles from the old chat so the UI doesn't crash!
          chat.participants = legacyConvo.participants
        }
      }
      return chat
    }

    let processedChat: PopulatedConversation | null = null

    if (activeIdx > -1) {
      processedChat = updateChatMetadata({ ...activeChats.value[activeIdx] })
      activeChats.value.splice(activeIdx, 1)
    } else if (pendingIdx > -1) {
      processedChat = updateChatMetadata({
        ...friendStore.pendingRequests[pendingIdx]
      })
      friendStore.pendingRequests.splice(pendingIdx, 1)
    } else if (fullConversation) {
      // Brand new chat from socket
      processedChat = { ...fullConversation }

      if (!isPopulated) {
        if (legacyConvo?.participants) {
          processedChat.participants = legacyConvo.participants
        } else {
          // Absolute last resort fallback
          processedChat.participants = processedChat.participants.map(
            (id: any) => {
              const idStr =
                typeof id === 'object'
                  ? id._id || id.toString()
                  : id.toString()
              const cached = userCache.getUser(idStr)
              return cached || { _id: idStr, name: 'Artist', img: '' }
            }
          ) as any
        }
      }
    }

    if (processedChat) {
      // 5. DEDUPLICATION: Purge the old dead conversation from the UI
      if (partnerIdStr) {
        const filterFn = (c: PopulatedConversation) =>
          c._id !== legacyConvo?._id
        activeChats.value = activeChats.value.filter(filterFn)
        friendStore.pendingRequests =
          friendStore.pendingRequests.filter(filterFn)
      }

      // Auto-read logic
      if (
        me &&
        chatWidget.isExpanded &&
        chatWidget.activeTab === conversation_id
      ) {
        if (!processedChat.unread_counts) processedChat.unread_counts = {}
        processedChat.unread_counts[me] = 0
        readAcknowledged.add(conversation_id)
        markAsRead(conversation_id).catch(console.error)
      } else if (message.sender_id !== me) {
        // Genuinely unread again — drop the session ack so a later
        // `loadActiveChats()` doesn't zero this badge back out.
        readAcknowledged.delete(conversation_id)
      }

      // 6. PROPER ROUTING: Push to pending if they need to accept it
      if (
        processedChat.status === 'pending_invite' &&
        processedChat.initiator_id !== me
      ) {
        friendStore.pendingRequests.unshift(processedChat)
      } else {
        activeChats.value.unshift(processedChat)
      }

      // 7. PREVENT UI FREEZE: If User B was looking at the old chat, seamlessly shift their view to the new one
      if (legacyConvo && chatWidget.activeTab === legacyConvo._id) {
        chatWidget.activeTab = conversation_id
        chatWidget.removeChatHead(legacyConvo._id)
        chatWidget.addChatHead(conversation_id, 'chat')

        // Move old messages to the new chat tab so history doesn't flicker
        if (messagesByChat.value[legacyConvo._id]) {
          messagesByChat.value[conversation_id] = [
            ...messagesByChat.value[legacyConvo._id],
            ...(messagesByChat.value[conversation_id] || [])
          ]
          delete messagesByChat.value[legacyConvo._id]
          messageCacheAccess.delete(legacyConvo._id)
          touchMessageCache(conversation_id)
        }
      }
    }
    pruneMessageCaches()
  }

  // --- MESSAGING & OPTIMISTIC ENGINE ---

  async function sendMessage(
    receiver_id: string,
    content: string,
    currentTabId: string,
    shared_post_id?: string,
    shared_inbox_item_id?: string,
    options: { silent?: boolean } = {}
  ) {
    if (!socket) throw new Error('Socket not connected')
    const tempId = uuidv4()

    const optimisticMessage = {
      _id: tempId,
      localKey: tempId,
      content,
      shared_post_id: shared_post_id || null,
      shared_inbox_item_id: shared_inbox_item_id || null,
      sender_id: authStore.user?._id,
      createdAt: new Date().toISOString(),
      status: 'sending',
      isOptimistic: true
    }

    addOptimisticMessage(currentTabId, optimisticMessage)

    try {
      const response = await emitSendMessage(
        socket,
        receiver_id,
        content,
        shared_post_id,
        shared_inbox_item_id
      )

      if (response.success && response.message && response.conversation) {
        const realChatId = response.conversation._id

        // Migrate optimistic messages from temp tab → real conversation id
        if (currentTabId !== realChatId) {
          const tempMsgs = messagesByChat.value[currentTabId] || []
          messagesByChat.value[realChatId] = [
            ...(messagesByChat.value[realChatId] || []),
            ...tempMsgs
          ]
          delete messagesByChat.value[currentTabId]
          messageCacheAccess.delete(currentTabId)
          touchMessageCache(realChatId)

          if (!activeChats.value.some((c) => c._id === realChatId)) {
            activeChats.value.unshift(
              response.conversation as PopulatedConversation
            )
          }
        }

        const existingIdx = activeChats.value.findIndex(
          (c) => c._id === realChatId
        )
        if (existingIdx !== -1) {
          activeChats.value[existingIdx] = {
            ...activeChats.value[existingIdx],
            last_message: response.message,
            status: response.conversation.status,
            trial_expires_at: response.conversation.trial_expires_at,
            initiator_id: response.conversation.initiator_id,
            relationship_id: response.conversation.relationship_id,
            updatedAt: response.message.createdAt
          }
        }

        resolveOptimisticMessage(
          realChatId,
          tempId,
          {
            ...response.message,
            localKey: tempId,
            status: 'sent',
            isOptimistic: true
          },
          realChatId
        )

        if (!options.silent && chatWidget.activeTab === currentTabId) {
          chatWidget.addChatHead(realChatId, 'chat')
          chatWidget.activeTab = realChatId
          if (currentTabId !== realChatId)
            chatWidget.removeChatHead(currentTabId)
        }

        return response
      }
    } catch (error) {
      const msgs = messagesByChat.value[currentTabId]
      if (msgs) {
        const m = msgs.find((msg) => msg._id === tempId)
        if (m) m.status = 'error'
      }
      throw error
    }
  }

  function addOptimisticMessage(chatId: string, message: any) {
    if (!messagesByChat.value[chatId]) messagesByChat.value[chatId] = []
    messagesByChat.value[chatId].push(message)
    touchMessageCache(chatId)
    pruneMessageCaches()
  }

  /**
   * Optimistically drop a "sent a sketch" DM into each recipient's thread after
   * publishing an inbox drawing. The server fans the real messages out to the
   * recipients but never echoes them back to us (the sender), so without this
   * the drawing only appears in our own chat list after a reload.
   */
  function injectSharedInboxOptimistic(
    inboxItemId: string,
    receiverIds: string[]
  ) {
    const me = authStore.user?._id
    if (!me) return
    const now = new Date().toISOString()

    for (const rid of receiverIds) {
      if (rid === me) continue
      const chat = activeChats.value.find((c) =>
        c.participants.some((p: any) => p._id === rid)
      )

      const tabId = chat?._id || rid
      const tempId = uuidv4()

      addOptimisticMessage(tabId, {
        _id: tempId,
        localKey: tempId,
        content: '',
        shared_post_id: null,
        shared_inbox_item_id: inboxItemId,
        sender_id: me,
        createdAt: now,
        status: 'sent',
        isOptimistic: true
      })

      // Freshen the overview: bump ordering + preview line for the thread.
      if (chat) {
        chat.updatedAt = now
        chat.last_message = {
          type: 'user',
          content: '',
          sender_id: me,
          shared_inbox_item_id: inboxItemId,
          createdAt: now
        } as any
      }
    }
  }

  function resolveOptimisticMessage(
    chatId: string,
    tempId: string,
    resolvedMessage: any,
    actualConversationId?: string
  ) {
    const targetId = actualConversationId || chatId
    if (!messagesByChat.value[targetId]) messagesByChat.value[targetId] = []
    const chatMessages = messagesByChat.value[chatId]
    if (!chatMessages) return
    const index = chatMessages.findIndex((msg) => msg._id === tempId)
    if (index !== -1) {
      resolvedMessage.localKey = chatMessages[index].localKey || tempId
      const targetArray = messagesByChat.value[targetId]
      const duplicateIndex = targetArray.findIndex(
        (m) => m._id === resolvedMessage._id && m._id !== tempId
      )
      if (duplicateIndex !== -1) {
        chatMessages.splice(index, 1)
        // Replaced, not mutated in place: the duplicate is a settled message and
        // therefore raw, so a property write on it would not be tracked.
        targetArray.splice(duplicateIndex, 1, {
          ...targetArray[duplicateIndex],
          status: 'sent',
          localKey: resolvedMessage.localKey
        })
      } else {
        if (actualConversationId && actualConversationId !== chatId) {
          chatMessages.splice(index, 1)
          if (!messagesByChat.value[targetId])
            messagesByChat.value[targetId] = []
          messagesByChat.value[targetId].push(freeze(resolvedMessage))
        } else chatMessages.splice(index, 1, freeze(resolvedMessage))
      }
    }
    touchMessageCache(targetId)
    pruneMessageCaches()
  }

  // --- TYPING STATUS ---

  function setTypingStatus(sender_id: string, is_typing: boolean) {
    typingStatuses.value[sender_id] = is_typing
    if (is_typing) {
      setTimeout(() => {
        if (typingStatuses.value[sender_id])
          typingStatuses.value[sender_id] = false
      }, 3000)
    }
  }

  function sendTypingIndicator(receiver_id: string, is_typing: boolean) {
    if (socket) emitTypingStatus(socket, receiver_id, is_typing)
  }

  async function loadMessages(conversationId: string, isInitial = true, force = false) {
    touchMessageCache(conversationId)
    const existing = (messagesByChat.value[conversationId] || []).filter(m => !m.isOptimistic)
    // `force` re-fetches the latest page even when we already hold messages —
    // used on app resume, where the socket was disconnected while backgrounded
    // and live messages were missed.
    if (isInitial && !force && existing.length > 0) return existing.length
    try {
      const before =
        !isInitial && existing.length ? existing[0].createdAt : undefined
      const response = (await getChatMessages(conversationId, before)) as any
      hasMoreMessagesByChat.value[conversationId] = response.hasMore

      if (isInitial && force) {
        // Merge the fresh server page with any still-pending optimistic sends so
        // an in-flight message the user just typed isn't wiped by the refetch.
        const pending = (messagesByChat.value[conversationId] || []).filter(
          (m) => m.isOptimistic && !response.data.some((s: any) => s._id === m._id)
        )
        messagesByChat.value[conversationId] = [
          ...freezeAll(response.data),
          ...pending
        ]
      } else {
        messagesByChat.value[conversationId] = isInitial
          ? freezeAll(response.data)
          : [...freezeAll(response.data), ...existing]
      }
      pruneMessageCaches()
      return response.data.length
    } catch (e) {
      console.error('History sync failed:', e)
      return 0
    }
  }

  /**
   * Refetch the currently-open conversation's latest messages. Called on app
   * resume so the open chat shows messages that arrived while backgrounded.
   */
  async function syncActiveConversation() {
    const tab = useChatWidgetStore().activeTab
    if (!tab || tab === 'overview' || tab === 'lobby') return
    await loadMessages(tab, true, true)
    clearUnreads(tab)
  }

  async function clearUnreads(conversationId: string) {
    const me = authStore.user?._id
    if (!me) return

    const chat =
      activeChats.value.find((c) => c._id === conversationId) ||
      friendStore.pendingRequests.find((c) => c._id === conversationId)

    const previousUnread = chat?.unread_counts?.[me] ?? 0
    const hadUnread = previousUnread > 0
    if (chat) {
      if (!chat.unread_counts) chat.unread_counts = {}
      chat.unread_counts[me] = 0
    }

    // Record the read even when the conversation isn't in the list yet.
    // Opening a chat from a push notification jumps straight into the tab,
    // which can beat `loadActiveChats()` to the punch — without this we'd
    // neither tell the server nor survive that fetch re-hydrating the badge.
    const wasAcknowledged = readAcknowledged.has(conversationId)
    readAcknowledged.add(conversationId)

    if (!hadUnread && wasAcknowledged) return

    try {
      await markAsRead(conversationId)
    } catch (e) {
      console.error('Failed to mark as read:', e)
      readAcknowledged.delete(conversationId)
      if (chat) {
        if (!chat.unread_counts) chat.unread_counts = {}
        chat.unread_counts[me] = Math.max(
          chat.unread_counts[me] || 0,
          previousUnread
        )
      }
    }
  }

  /**
   * Mark every conversation read in one go.
   *
   * One server-side update replaces the old request-per-conversation fan-out.
   * The local patch is optimistic, survives list re-fetches through
   * `readAcknowledged`, and restores every prior count if the bulk write fails.
   */
  async function markAllRead() {
    const me = authStore.user?._id
    if (!me) return
    const chats = [...activeChats.value, ...friendStore.pendingRequests]
    const unread = new Map<string, number>()
    for (const chat of chats) {
      const count = chat.unread_counts?.[me] || 0
      if (count > 0) unread.set(chat._id, count)
    }
    if (unread.size === 0) return

    for (const chat of chats) {
      if (!unread.has(chat._id)) continue
      if (!chat.unread_counts) chat.unread_counts = {}
      chat.unread_counts[me] = 0
      readAcknowledged.add(chat._id)
    }

    try {
      await markAllAsRead()
    } catch (e) {
      for (const chat of chats) {
        const previous = unread.get(chat._id)
        if (previous === undefined) continue
        if (!chat.unread_counts) chat.unread_counts = {}
        chat.unread_counts[me] = Math.max(chat.unread_counts[me] || 0, previous)
        readAcknowledged.delete(chat._id)
      }
      console.error('Failed to mark all chats as read:', e)
      throw e
    }
  }

  /**
   * Re-zero the unread counts of conversations the user has already opened this
   * session. `loadActiveChats()` swaps in whole server objects, which are stale
   * for any tab opened before that fetch landed.
   */
  function reapplyLocalReads() {
    const me = authStore.user?._id
    if (!me || readAcknowledged.size === 0) return
    const apply = (chat: PopulatedConversation) => {
      if (!readAcknowledged.has(chat._id)) return
      if (!chat.unread_counts) chat.unread_counts = {}
      chat.unread_counts[me] = 0
    }
    activeChats.value.forEach(apply)
    friendStore.pendingRequests.forEach(apply)
  }

  async function switchToConversation(conversationId: string) {
    if (['lobby', 'overview'].includes(conversationId)) return
    touchMessageCache(conversationId)
    pruneMessageCaches()
    const realMessages = (messagesByChat.value[conversationId] ?? []).filter(m => !m.isOptimistic)
    if (realMessages.length == 0)
      await loadMessages(conversationId, true)
    clearUnreads(conversationId)
  }

  // --- NOTIFICATIONS ---

  const MAX_VISIBLE_NOTIFICATIONS = 3

  function addNotification(notif: any) {
    if (chatWidget.isExpanded && chatWidget.activeTab === notif.tabId) return
    const existing = notifications.value.find((n) => n.tabId === notif.tabId)
    if (existing) {
      // A conversation can first arrive through a partial relationship event
      // and only later through a fully populated message payload. Refresh the
      // sender snapshot instead of permanently keeping the first, unstyled one.
      Object.assign(existing, notif)
      existing.lines.push({ id: Date.now(), text: notif.text })
      if (existing.lines.length > 2) existing.lines.shift()
      clearTimeout(existing.timer)
      existing.timer = setTimeout(() => removeNotification(notif.tabId), 8000)
    } else {
      notifications.value.push({
        ...notif,
        lines: [{ id: Date.now(), text: notif.text }],
        timer: setTimeout(() => removeNotification(notif.tabId), 8000)
      })
      // Keep each person's customized toast intact. Under bursts, discard the
      // oldest toast instead of aggregating unrelated users into one generic
      // "and others" card.
      while (notifications.value.length > MAX_VISIBLE_NOTIFICATIONS) {
        const oldest = notifications.value.shift()
        if (oldest?.timer) clearTimeout(oldest.timer)
      }
    }
  }

  function removeNotification(tabId: string) {
    notifications.value = notifications.value.filter((n) => n.tabId !== tabId)
  }

  function clearLobbyNotifications() {
    notifications.value = notifications.value.filter((n) => {
      if (n.tabId?.startsWith('lobby')) {
        clearTimeout(n.timer)
        return false
      }
      return true
    })
  }

  // --- SOCKET HANDLERS (RELATIONSHIP LIFECYCLE) ---

  function handleRequestAccepted(payload: {
    conversation: PopulatedConversation;
  }) {
    const idx = activeChats.value.findIndex(
      (c) => c._id === payload.conversation._id
    )
    if (idx !== -1) {
      activeChats.value[idx] = {
        ...activeChats.value[idx],
        ...payload.conversation
      }
    } else {
      activeChats.value.unshift(payload.conversation)
    }

    const partner = payload.conversation.participants.find(
      (p) => p._id !== authStore.user?._id
    )
    addNotification({
      tabId: payload.conversation._id,
      subtitle: partner?.name || 'Sketchmate',
      text: 'Accepted your request! You have 24h to vibe.',
      img: partner?.img || '',
      senderId: partner?._id,
      isTrial: true,
      customization: partner?.customization
    })
  }

  function handleRequestDeclined(payload: { conversation_id: string }) {
    const widgetStore = useChatWidgetStore()
    const chat = activeChats.value.find(
      (c) => c._id === payload.conversation_id
    )
    const partner = chat?.participants.find(
      (p) => p._id !== authStore.user?._id
    )

    activeChats.value = activeChats.value.filter(
      (c) => c._id !== payload.conversation_id
    )

    if (widgetStore.activeTab === payload.conversation_id) {
      widgetStore.activeTab = 'overview'
      widgetStore.removeChatHead(payload.conversation_id)
    }

    addNotification({
      tabId: 'overview',
      subtitle: partner?.name || 'Artist',
      text: 'Not ready to connect yet. Keep sketching!',
      img: partner?.img || '',
      senderId: partner?._id,
      isRequest: false,
      customization: partner?.customization
    })
  }

  function handleMateMatched(payload: { conversation: PopulatedConversation }) {
    const index = activeChats.value.findIndex(
      (c) => c._id === payload.conversation._id
    )
    if (index !== -1)
      activeChats.value[index] = {
        ...activeChats.value[index],
        ...payload.conversation,
        status: 'mate' // FIX: 'active' -> 'mate'
      }
    const partner = payload.conversation.participants.find(
      (p) => p._id !== authStore.user?._id
    ) as Mate
    if (partner) friendStore.addFriendLocally(partner as any)
    addNotification({
      tabId: payload.conversation._id,
      subtitle: partner?.name || 'New Mate!',
      text: `You and ${partner?.name} are now Mates!`,
      img: partner?.img || '',
      senderId: partner?._id,
      isMateProposal: true,
      customization: partner?.customization
    })

    useQuotaStore().refresh(true)
  }

  function handleMateDeclined(payload: {
    conversation_id: string;
    conversation: PopulatedConversation;
    status: ChatStatus; // Typed strictly now
  }) {
    const index = activeChats.value.findIndex(
      (c) => c._id === payload.conversation_id
    )
    if (index !== -1) {
      activeChats.value[index] = {
        ...activeChats.value[index],
        ...payload.conversation,
        status: payload.status,
        initiator_id: undefined
      }
    }
    const partner = payload.conversation.participants.find(
      (p) => p._id !== authStore.user?._id
    )
    const isExpired = payload.status === 'expired'
    addNotification({
      tabId: payload.conversation_id,
      subtitle: 'Proposal Update',
      text: isExpired
        ? `${partner?.name} isn't ready to re-match yet.`
        : `${partner?.name} wants to stay in the trial phase.`,
      img: partner?.img || '',
      senderId: partner?._id,
      isTrial: !isExpired,
      isRequest: false,
      customization: partner?.customization
    })
  }

  function handleMateUnfriended(payload: {
    conversation_id: string;
    conversation: PopulatedConversation;
  }) {
    const partner = payload.conversation.participants.find(
      (p) => p._id !== authStore.user?._id
    )
    const index = activeChats.value.findIndex(
      (c) => c._id === payload.conversation_id
    )
    if (index !== -1) {
      activeChats.value[index] = {
        ...activeChats.value[index],
        ...payload.conversation,
        status: 'expired'
      }
    } else {
      activeChats.value.unshift(payload.conversation)
    }
    if (partner) friendStore.removeFriendLocally(partner._id)
    addNotification({
      tabId: payload.conversation_id,
      subtitle: 'Connection Ended',
      text: `Matership with ${partner?.name || 'Artist'} has ended.`,
      img: partner?.img || '',
      senderId: partner?._id,
      isTrial: false,
      customization: partner?.customization
    })
    useQuotaStore().refresh(true)
  }

  function handleMateRequested(payload: {
    conversation_id: string;
    conversation: PopulatedConversation;
    wasExpired: boolean;
  }) {
    const index = activeChats.value.findIndex(
      (c) => c._id === payload.conversation_id
    )
    if (index !== -1)
      activeChats.value[index] = {
        ...activeChats.value[index],
        ...payload.conversation,
        status: 'pending_mate'
      }
    else activeChats.value.unshift(payload.conversation)
    const partner = payload.conversation.participants.find(
      (p) => p._id !== authStore.user?._id
    )
    addNotification({
      tabId: payload.conversation_id,
      subtitle: partner?.name || 'New Request',
      text: payload.wasExpired
        ? 'Wants to re-match as Mates! 🎨'
        : 'Wants to be Mates! 💖',
      img: partner?.img || '',
      senderId: partner?._id,
      isMateProposal: true,
      customization: partner?.customization
    })
    useChatWidgetStore().triggerNewMessageAlert(payload.conversation_id)
  }

  async function respondToRequest(
    conversationId: string,
    action: 'accept' | 'decline'
  ) {
    const chat =
      friendStore.pendingRequests.find((c) => c._id === conversationId) ||
      activeChats.value.find((c) => c._id === conversationId)

    if (!chat?.relationship_id) {
      console.error('Missing relationship_id', conversationId)
      return
    }

    try {
      const response = (await respondToRelationship(
        chat.relationship_id,
        action
      )) as any
      const widgetStore = useChatWidgetStore()

      if (action === 'accept') {
        const conversation = response.conversation as PopulatedConversation
        friendStore.pendingRequests = friendStore.pendingRequests.filter(
          (c) => c._id !== conversationId
        )
        activeChats.value = activeChats.value.filter(
          (c) => c._id !== conversationId
        )
        activeChats.value.unshift(conversation)
        widgetStore.addChatHead(conversation._id, 'chat')
        widgetStore.activeTab = conversation._id
      } else {
        friendStore.pendingRequests = friendStore.pendingRequests.filter(
          (c) => c._id !== conversationId
        )
        activeChats.value = activeChats.value.filter(
          (c) => c._id !== conversationId
        )
        widgetStore.removeChatHead(conversationId)
        if (widgetStore.activeTab === conversationId)
          widgetStore.activeTab = 'overview'
      }
    } catch (e) {
      console.error('Failed to respond to request:', e)
    }
  }

  function resetChatWithUser(userId: string) {
    const idx = activeChats.value.findIndex((c) =>
      c.participants.some((p) => p._id === userId)
    )
    if (idx > -1) {
      activeChats.value[idx] = {
        ...activeChats.value[idx],
        status: 'none'
      }
    }
  }

  // Local mirror of the server unfriend, so the relationship banner flips to
  // "Connection ended" without a refetch. It used to stamp a 48h
  // `cooldown_until` here too — that lock is gone (it was never enforced), and
  // this is the one place that could have kept resurrecting it client-side.
  function expireChat(userId: string) {
    const idx = activeChats.value.findIndex((c) =>
      c.participants.some((p) => p._id === userId)
    )
    if (idx > -1) {
      activeChats.value[idx] = {
        ...activeChats.value[idx],
        status: 'expired',
        cooldown_until: undefined,
        initiator_id: undefined
      }
    }
  }

  async function handleCancelMateRequest(conversationId: string) {
    try {
      const response = (await cancelMateRequest(conversationId)) as any
      const idx = activeChats.value.findIndex((c) => c._id === conversationId)

      if (idx !== -1) {
        activeChats.value[idx] = {
          ...activeChats.value[idx],
          status: response.status,
          initiator_id: undefined
        }
      }
    } catch (e) {
      console.error('Failed to cancel mate request', e)
    }
  }

  return {
    activeChats,
    messagesByChat,
    typingStatuses,
    notifications,
    hasMoreMessagesByChat,
    chatsHydrated,
    totalUnreadCount,
    canSendMessage,
    chatInputPlaceholder,
    isMate,
    mateRequestStatus,
    loadActiveChats,
    addIncomingMessage,
    injectSharedInboxOptimistic,
    sendMessage,
    loadMessages,
    trimOldMessages,
    clearRuntimeState,
    syncActiveConversation,
    clearUnreads,
    markAllRead,
    switchToConversation,
    addNotification,
    removeNotification,
    clearLobbyNotifications,
    handleRequestAccepted,
    handleRequestDeclined,
    handleMateMatched,
    handleMateDeclined,
    handleMateUnfriended,
    handleMateRequested,
    setTypingStatus,
    sendTypingIndicator,
    respondToRequest,
    resetChatWithUser,
    expireChat,
    handleCancelMateRequest
  }
})
