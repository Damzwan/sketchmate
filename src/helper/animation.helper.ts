import { createAnimation } from '@ionic/vue'


export const routerAnimation = (baseEl: HTMLElement, opts?: any) => {
  return createAnimation()
    .addElement(opts.enteringEl)
    .duration(100)
    .easing('ease-in')
    .fromTo('opacity', '0', '1')
}
