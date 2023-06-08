import { useSelect } from '@/service/draw/tools/select.service'
import { exitEditing, isText } from '@/helper/draw/draw.helper'
import { useHistory } from '@/service/draw/history.service'
import { Canvas } from 'fabric/fabric-impl'
import { popoverController } from '@ionic/vue'

export function setStrokeColor(c: Canvas, options: any) {
  const color = options['color']
  const { selectedObjectsRef } = useSelect()
  if (selectedObjectsRef.length == 0) return
  const { saveState } = useHistory()
  if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0])
  selectedObjectsRef.forEach(obj => obj.set({ stroke: color }))
  saveState()
  c.renderAll()
  popoverController.dismiss()
}

export function setFillColor(c: Canvas, options: any) {
  const color = options['color']
  const { selectedObjectsRef } = useSelect()
  if (selectedObjectsRef.length == 0) return
  const { saveState } = useHistory()
  if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0])
  selectedObjectsRef.forEach(obj => obj.set({ fill: color }))
  saveState()
  c.renderAll()
  popoverController.dismiss()
}

export function setBackgroundColor(c: Canvas, options: any) {
  const color = options['color']
  const { selectedObjectsRef } = useSelect()
  if (selectedObjectsRef.length == 0) return

  const { saveState } = useHistory()
  if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0])
  selectedObjectsRef.forEach(obj => obj.set({ backgroundColor: color }))
  saveState()
  c.renderAll()
  popoverController.dismiss()
}