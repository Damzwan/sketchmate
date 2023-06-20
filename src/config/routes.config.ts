import { FRONTEND_ROUTES } from '@/types/router.types'
import { backgroundColor, primaryColor } from '@/config/colors.config'

export interface AppColorConfig {
  statusBar: string
  navigationBar: string
}
export const colorsPerRoute: Record<FRONTEND_ROUTES, AppColorConfig> = {
  [FRONTEND_ROUTES.draw]: {
    statusBar: primaryColor,
    navigationBar: primaryColor
  },
  [FRONTEND_ROUTES.gallery]: {
    statusBar: backgroundColor,
    navigationBar: primaryColor
  },
  [FRONTEND_ROUTES.mate]: {
    statusBar: backgroundColor,
    navigationBar: primaryColor
  },
  [FRONTEND_ROUTES.connect]: {
    statusBar: backgroundColor,
    navigationBar: backgroundColor
  }
}
