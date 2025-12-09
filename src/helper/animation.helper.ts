import { createAnimation } from '@ionic/vue'
import { getCurrentRoute, setAppColors } from '@/helper/general.helper'
import { FRONTEND_ROUTES } from '@/types/router.types'
import router from '@/router'
import { colorsPerRoute } from '@/config/colors.config'


export const routerAnimation = (baseEl: HTMLElement, opts?: any) => {
  return createAnimation()
    .addElement(opts.enteringEl)
    .duration(100)
    .easing('ease-in')
    .beforeAddWrite(() => {
      const exception = getCurrentRoute() === FRONTEND_ROUTES.gallery && router.currentRoute.value.query.item
      if (!exception) setTimeout(() => setAppColors(colorsPerRoute[getCurrentRoute()]), 50)
    })
    .fromTo('opacity', '0', '1')
}
