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
  content?: ViewportSize
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

export function fitCoverSize(viewport: ViewportSize, image: ViewportSize): ViewportSize {
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
    ? { width: viewport.height * imageRatio, height: viewport.height }
    : { width: viewport.width, height: viewport.width / imageRatio }
}

export function clampPan(
  pan: Point,
  viewport: ViewportSize,
  scale: number,
  content: ViewportSize = viewport,
): Point {
  const clampedScale = clampScale(scale)
  const maxX = Math.max(0, (content.width * clampedScale - viewport.width) / 2)
  const maxY = Math.max(0, (content.height * clampedScale - viewport.height) / 2)

  return {
    x: maxX === 0 ? 0 : clamp(pan.x, -maxX, maxX),
    y: maxY === 0 ? 0 : clamp(pan.y, -maxY, maxY),
  }
}

export function zoomAroundPoint({
  content,
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
    pan: clampPan(nextPan, viewport, clampedScale, content),
    scale: clampedScale,
  }
}
