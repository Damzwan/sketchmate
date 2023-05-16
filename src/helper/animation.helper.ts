import { createAnimation } from '@ionic/vue'

export const modalPopAnimation = (baseEl: HTMLElement) => {
  const root = baseEl.shadowRoot

  const backdropAnimation = createAnimation()
    .addElement(root?.querySelector('ion-backdrop') as Element)
    .fromTo('opacity', '0.01', 'var(--backdrop-opacity)')

  const wrapperAnimation = createAnimation()
    .addElement(root?.querySelector('.modal-wrapper') as Element)
    .keyframes([
      { offset: 0, opacity: '0', transform: 'scale(0)' },
      { offset: 1, opacity: '0.99', transform: 'scale(1)' }
    ])

  return createAnimation()
    .addElement(baseEl)
    .easing('ease-out')
    .duration(100)
    .addAnimation([backdropAnimation, wrapperAnimation])
}

export const leaveAnimation = (baseEl: HTMLElement) => {
  return modalPopAnimation(baseEl).direction('reverse')
}
