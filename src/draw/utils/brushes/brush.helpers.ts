import * as fabric from 'fabric'

/**
 * Ensures that nested properties like clipPath and shadow are converted
 * from raw JSON objects into real Fabric class instances before
 * the parent object is instantiated.
 */
export async function enlivenStrokeProps(object: any): Promise<any> {
  // 1. Enliven the ClipPath (The culprit for the 'transform' error)
  if (object.clipPath && !(object.clipPath instanceof fabric.FabricObject)) {
    const enlivened = await fabric.util.enlivenObjects([object.clipPath])
    object.clipPath = enlivened[0]
  }

  // 2. Enliven the Shadow
  if (object.shadow && !(object.shadow instanceof fabric.Shadow)) {
    object.shadow = new fabric.Shadow(object.shadow)
  }

  return object
}