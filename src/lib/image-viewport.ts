export const MIN_IMAGE_SCALE = 1
export const MAX_IMAGE_SCALE = 4

export interface Point {
  x: number
  y: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface ImageTransform {
  pan: Point
  scale: number
}

interface ZoomAroundPointInput extends ImageTransform {
  nextScale: number
  point: Point
  viewport: ViewportSize
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function clampScale(scale: number): number {
  return clamp(scale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE)
}

export function fitContainSize(viewport: ViewportSize, image: ViewportSize): ViewportSize {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    return { ...viewport }
  }

  const viewportRatio = viewport.width / viewport.height
  const imageRatio = image.width / image.height

  return imageRatio >= viewportRatio
    ? { width: viewport.width, height: viewport.width / imageRatio }
    : { width: viewport.height * imageRatio, height: viewport.height }
}

export function zoomAroundPoint({
  pan,
  scale,
  nextScale,
  point,
  viewport,
}: ZoomAroundPointInput): ImageTransform {
  const clampedScale = clampScale(nextScale)
  const ratio = clampedScale / scale
  const offsetX = point.x - viewport.width / 2
  const offsetY = point.y - viewport.height / 2
  const nextPan = {
    x: offsetX - (offsetX - pan.x) * ratio,
    y: offsetY - (offsetY - pan.y) * ratio,
  }

  return {
    pan: nextPan,
    scale: clampedScale,
  }
}
