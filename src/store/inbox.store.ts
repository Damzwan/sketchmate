import { defineStore } from 'pinia'
import { ref } from 'vue'
import { InboxItem, Mate, CommentRes } from '@/types/server.types'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import { ToastDuration } from '@/types/toast.types'
import { viewCommentButton } from '@/config/toast.config'
import { useAuthStore } from '@/store/auth.store'

export const useInboxStore = defineStore('inbox', () => {
  const inbox = ref<InboxItem[]>([])
  const inboxUsers = ref<Mate[]>([])

  const isInboxLoading = ref(false)
  const hasFetchedInbox = ref(false)


  const api = useAPI()


  async function getInbox() {
    try {
      const { user } = useAuthStore()
      if (!user) return
      isInboxLoading.value = true

      if (user.inbox.length === 0) {
        inbox.value = []
        isInboxLoading.value = false
        return
      }

      const retrievedInbox = await api.getInbox({ _ids: user.inbox })
      if (!retrievedInbox) throw new Error()

      // Reverse so newest is first
      inbox.value = [...retrievedInbox.inboxItems].reverse()

      // Merge unique users
      for (const u of retrievedInbox.userInfo) {
        if (!inboxUsers.value.find(x => x._id === u._id)) {
          inboxUsers.value.push(u)
        }
      }

      hasFetchedInbox.value = true
    } catch (e) {
      console.error(e)
    } finally {
      isInboxLoading.value = false
    }
  }

  async function addComment(commentRes: CommentRes) {
    if (!inbox.value.length) {
      await getInbox()
    }

    const index = inbox.value.findIndex(i => i._id === commentRes.inbox_item_id)
    if (index === -1) return

    // Add comment
    inbox.value[index].comments.push(commentRes.comment)
    inbox.value[index].comments_seen_by = [commentRes.comment.sender]

    // Don't toast for own comments
    const { user } = useAuthStore()

    if (!user || commentRes.comment.sender === user._id) {
      return
    }

    const sender = findUserInInboxUsers(commentRes.comment.sender)
    if (!sender) return

    // Toast for comments from others
    const { toast } = useToast()
    toast(`${sender.name} commented on a drawing`, {
      buttons: [viewCommentButton(commentRes.inbox_item_id)],
      duration: ToastDuration.medium
    })
  }

  function findUserInInboxUsers(id: string): Mate | undefined {
    return inboxUsers.value.find(u => u._id === id)
  }

  return {
    inbox,
    inboxUsers,
    isInboxLoading,

    getInbox,
    addComment,
    findUserInInboxUsers,
    hasFetchedInbox
  }
})
