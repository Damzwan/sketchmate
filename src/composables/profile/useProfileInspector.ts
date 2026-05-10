import { useMenuStore } from '@/store/menu.store'
import { useFriendStore } from '@/store/friend.store'
import { Menu } from '@/draw/types/draw.types'
import { Mate } from '@/types/server.types'

export function useProfileInspector() {
  const menuStore = useMenuStore()
  const friendStore = useFriendStore()

  const inspect = (userId: string, memberData?: Partial<Mate>) => {
    if (memberData) {
      friendStore.targetProfile = {
        _id: userId,
        name: memberData.name || 'Artist',
        img: memberData.img || '',
        description: '',
        stats: { posts: 0, followers: 0, following: 0, friends: 0 },
        relationship: { isFollowing: false, isFriend: false },
        ...memberData
      }
    }

    friendStore.getProfile(userId)

    menuStore.openMenu(Menu.ViewProfileMenu)
  }

  return {
    inspect
  }
}