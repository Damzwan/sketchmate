import { FRONTEND_ROUTES } from '@/types/router.types'

export interface AppColorConfig {
  statusBar: string
  navigationBar: string
}

export const primaryColor = '#FFAD83'
export const secondaryColor = '#D65239'
export const backgroundColor = '#FFD4B2'

export const photoSwiperColorConfig: AppColorConfig = { statusBar: '#000000', navigationBar: '#000000' }
export const popoverColorConfig: AppColorConfig = { statusBar: '#ad7659', navigationBar: '#ad7659' }
export const settingsModalColorConfig: AppColorConfig = { statusBar: backgroundColor, navigationBar: backgroundColor }
export const qrModalColorConfig: AppColorConfig = { statusBar: primaryColor, navigationBar: backgroundColor }
export const drawModalColorConfig: AppColorConfig = { statusBar: primaryColor, navigationBar: primaryColor }
export const colorsPerRoute: Record<FRONTEND_ROUTES, AppColorConfig> = {
  [FRONTEND_ROUTES.draw]: {
    statusBar: primaryColor,
    navigationBar: primaryColor
  },
  [FRONTEND_ROUTES.login]: {
    statusBar: backgroundColor,
    navigationBar: backgroundColor
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
    navigationBar: primaryColor
  },
}
