import { createAnimation, Animation } from '@ionic/vue'


export const routerAnimation = (baseEl: HTMLElement, opts?: any) => {
  return createAnimation()
    .addElement(opts.enteringEl)
    .duration(100)
    .easing('ease-in')
    .fromTo('opacity', '0', '1')
}


export const slideTransition = (baseEl: HTMLElement, opts?: any): Animation => {
  const DURATION = 250
  const EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'

  const rootAnimation = createAnimation()
    .duration(DURATION)
    .easing(EASING)

  const enteringEl = createAnimation().addElement(opts.enteringEl)
  const leavingEl = createAnimation().addElement(opts.leavingEl)

  // If we are moving forward (to the Draw page)
  if (opts.direction === 'forward') {
    enteringEl
      .fromTo('transform', 'translateX(100%)', 'translateX(0)')
      .fromTo('opacity', '1', '1') // Keep opacity solid for a clean slide

    leavingEl
      .fromTo('transform', 'translateX(0)', 'translateX(-25%)')
      .fromTo('opacity', '1', '0.6')
  }
  // If we are going back (to the Home page)
  else {
    enteringEl
      .fromTo('transform', 'translateX(-25%)', 'translateX(0)')
      .fromTo('opacity', '0.6', '1')

    leavingEl
      .fromTo('transform', 'translateX(0)', 'translateX(100%)')
      .fromTo('opacity', '1', '1')
  }

  return rootAnimation.addAnimation([enteringEl, leavingEl])
}