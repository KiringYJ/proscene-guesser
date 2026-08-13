<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
} from 'vue'

import {
  clampPan,
  clampScale,
  fitCoverSize,
  MAX_IMAGE_SCALE,
  MIN_IMAGE_SCALE,
  zoomAroundPoint,
  type Point,
  type ViewportSize,
} from '@/lib/image-viewport'
import type { QuestionPrompt } from '@/types/question'

const props = defineProps<{
  question: QuestionPrompt
  revealed: boolean
}>()

interface DragGesture {
  pointer: Point
  pan: Point
}

interface PinchGesture {
  center: Point
  content: ViewportSize
  distance: number
  pan: Point
  scale: number
  viewport: ViewportSize
}

const viewport = ref<HTMLElement>()
const scale = ref(MIN_IMAGE_SCALE)
const pan = ref<Point>({ x: 0, y: 0 })
const viewportDimensions = ref<ViewportSize>({ width: 0, height: 0 })
const naturalImageSize = ref<ViewportSize>({ width: 16, height: 9 })
const isDragging = ref(false)
const hasInteracted = ref(false)
const activePointers = new Map<number, Point>()
let dragGesture: DragGesture | undefined
let pinchGesture: PinchGesture | undefined
let resizeObserver: ResizeObserver | undefined

const zoomPercentage = computed(() => Math.round(scale.value * 100))
const canZoomIn = computed(() => scale.value < MAX_IMAGE_SCALE)
const canZoomOut = computed(() => scale.value > MIN_IMAGE_SCALE)
const fittedImageSize = computed(() =>
  fitCoverSize(viewportDimensions.value, naturalImageSize.value),
)
const imageStyle = computed<CSSProperties>(() => ({
  width: `${fittedImageSize.value.width}px`,
  height: `${fittedImageSize.value.height}px`,
  left: `calc(50% + ${pan.value.x}px)`,
  top: `calc(50% + ${pan.value.y}px)`,
  transform: `translate3d(-50%, -50%, 0) scale(${scale.value})`,
}))
const viewportLabel = computed(
  () =>
    `${props.question.imageAlt} Interactive screenshot viewer at ${zoomPercentage.value} percent zoom. ` +
    'Drag to pan, use the mouse wheel or plus and minus keys to zoom, and press zero to reset.',
)

watch(
  () => props.question.id,
  () => resetView(),
)

onMounted(() => {
  const element = viewport.value

  if (!element) {
    return
  }

  updateViewportGeometry()

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(updateViewportGeometry)
    resizeObserver.observe(element)
  } else {
    window.addEventListener('resize', clampCurrentPan)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', clampCurrentPan)
  activePointers.clear()
})

function getViewportSize(): ViewportSize {
  const rect = viewport.value?.getBoundingClientRect()

  return {
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
  }
}

function getFittedImageSize(viewportSize = getViewportSize()): ViewportSize {
  return fitCoverSize(viewportSize, naturalImageSize.value)
}

function getLocalPoint(clientX: number, clientY: number): Point {
  const rect = viewport.value?.getBoundingClientRect()

  return {
    x: clientX - (rect?.left ?? 0),
    y: clientY - (rect?.top ?? 0),
  }
}

function updateViewportGeometry(): void {
  viewportDimensions.value = getViewportSize()
  clampCurrentPan()
}

function clampCurrentPan(): void {
  const viewportSize = getViewportSize()

  pan.value = clampPan(
    pan.value,
    viewportSize,
    scale.value,
    getFittedImageSize(viewportSize),
  )
}

function handleImageLoad(event: Event): void {
  const image = event.currentTarget as HTMLImageElement

  naturalImageSize.value = {
    width: image.naturalWidth,
    height: image.naturalHeight,
  }
  clampCurrentPan()
}

function resetView(focusViewport = false): void {
  scale.value = MIN_IMAGE_SCALE
  pan.value = { x: 0, y: 0 }
  hasInteracted.value = false

  if (focusViewport) {
    viewport.value?.focus({ preventScroll: true })
  }
}

function applyZoom(nextScale: number, point?: Point): void {
  const viewportSize = getViewportSize()
  const zoomPoint = point ?? {
    x: viewportSize.width / 2,
    y: viewportSize.height / 2,
  }
  const transform = zoomAroundPoint({
    content: getFittedImageSize(viewportSize),
    pan: pan.value,
    scale: scale.value,
    nextScale,
    point: zoomPoint,
    viewport: viewportSize,
  })

  scale.value = transform.scale
  pan.value = transform.pan
  hasInteracted.value = true
}

function zoomBy(amount: number): void {
  applyZoom(scale.value + amount)
}

function panBy(x: number, y: number): void {
  const viewportSize = getViewportSize()

  pan.value = clampPan(
    { x: pan.value.x + x, y: pan.value.y + y },
    viewportSize,
    scale.value,
    getFittedImageSize(viewportSize),
  )
  hasInteracted.value = true
}

function handleWheel(event: WheelEvent): void {
  const direction = event.deltaY < 0 ? 1 : -1
  const nextScale = clampScale(scale.value + direction * 0.25)

  applyZoom(nextScale, getLocalPoint(event.clientX, event.clientY))
}

function getPointerPair(): [Point, Point] | undefined {
  const points = [...activePointers.values()]

  return points.length >= 2 ? [points[0]!, points[1]!] : undefined
}

function getPointerCenter(first: Point, second: Point): Point {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

function getPointerDistance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function beginPinch(): void {
  const pair = getPointerPair()

  if (!pair) {
    return
  }

  const [first, second] = pair
  const center = getPointerCenter(first, second)
  const rect = viewport.value?.getBoundingClientRect()

  pinchGesture = {
    center: {
      x: center.x - (rect?.left ?? 0),
      y: center.y - (rect?.top ?? 0),
    },
    content: getFittedImageSize(),
    distance: Math.max(1, getPointerDistance(first, second)),
    pan: { ...pan.value },
    scale: scale.value,
    viewport: getViewportSize(),
  }
  dragGesture = undefined
}

function beginDrag(pointer: Point): void {
  dragGesture = {
    pointer: { ...pointer },
    pan: { ...pan.value },
  }
  pinchGesture = undefined
}

function handlePointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return
  }

  event.preventDefault()
  viewport.value?.focus({ preventScroll: true })
  viewport.value?.setPointerCapture(event.pointerId)
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  isDragging.value = true
  hasInteracted.value = true

  if (activePointers.size >= 2) {
    beginPinch()
  } else {
    beginDrag({ x: event.clientX, y: event.clientY })
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (!activePointers.has(event.pointerId)) {
    return
  }

  event.preventDefault()
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  const pair = getPointerPair()
  if (pair && pinchGesture) {
    const [first, second] = pair
    const rect = viewport.value?.getBoundingClientRect()
    const clientCenter = getPointerCenter(first, second)
    const currentCenter = {
      x: clientCenter.x - (rect?.left ?? 0),
      y: clientCenter.y - (rect?.top ?? 0),
    }
    const nextScale = clampScale(
      pinchGesture.scale *
        (getPointerDistance(first, second) / pinchGesture.distance),
    )
    const ratio = nextScale / pinchGesture.scale
    const startOffset = {
      x: pinchGesture.center.x - pinchGesture.viewport.width / 2,
      y: pinchGesture.center.y - pinchGesture.viewport.height / 2,
    }
    const currentOffset = {
      x: currentCenter.x - pinchGesture.viewport.width / 2,
      y: currentCenter.y - pinchGesture.viewport.height / 2,
    }
    const nextPan = {
      x: currentOffset.x - (startOffset.x - pinchGesture.pan.x) * ratio,
      y: currentOffset.y - (startOffset.y - pinchGesture.pan.y) * ratio,
    }

    scale.value = nextScale
    pan.value = clampPan(
      nextPan,
      pinchGesture.viewport,
      nextScale,
      pinchGesture.content,
    )
    return
  }

  if (dragGesture) {
    const viewportSize = getViewportSize()

    pan.value = clampPan(
      {
        x: dragGesture.pan.x + event.clientX - dragGesture.pointer.x,
        y: dragGesture.pan.y + event.clientY - dragGesture.pointer.y,
      },
      viewportSize,
      scale.value,
      getFittedImageSize(viewportSize),
    )
  }
}

function handlePointerEnd(event: PointerEvent): void {
  activePointers.delete(event.pointerId)

  if (viewport.value?.hasPointerCapture(event.pointerId)) {
    viewport.value.releasePointerCapture(event.pointerId)
  }

  if (activePointers.size >= 2) {
    beginPinch()
    return
  }

  const remainingPointer = activePointers.values().next().value as Point | undefined
  if (remainingPointer) {
    beginDrag(remainingPointer)
    return
  }

  dragGesture = undefined
  pinchGesture = undefined
  isDragging.value = false
}

function handleDoubleClick(event: MouseEvent): void {
  if (scale.value >= MAX_IMAGE_SCALE) {
    resetView()
    return
  }

  applyZoom(scale.value + 1, getLocalPoint(event.clientX, event.clientY))
}

function handleKeydown(event: KeyboardEvent): void {
  const panStep = 48
  let handled = true

  switch (event.key) {
    case '+':
    case '=':
      zoomBy(0.25)
      break
    case '-':
    case '_':
      zoomBy(-0.25)
      break
    case '0':
    case 'Home':
      resetView()
      break
    case 'ArrowLeft':
      panBy(panStep, 0)
      break
    case 'ArrowRight':
      panBy(-panStep, 0)
      break
    case 'ArrowUp':
      panBy(0, panStep)
      break
    case 'ArrowDown':
      panBy(0, -panStep)
      break
    default:
      handled = false
  }

  if (handled) {
    event.preventDefault()
  }
}
</script>

<template>
  <figure class="screenshot-panel">
    <div
      ref="viewport"
      class="screenshot-frame"
      :class="{
        'screenshot-frame--revealed': revealed,
        'screenshot-frame--dragging': isDragging,
      }"
      role="group"
      tabindex="0"
      :aria-label="viewportLabel"
      @wheel.prevent="handleWheel"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerEnd"
      @pointercancel="handlePointerEnd"
      @dblclick.prevent="handleDoubleClick"
      @keydown="handleKeydown"
    >
      <img
        :src="question.image"
        :alt="question.imageAlt"
        :style="imageStyle"
        draggable="false"
        @dragstart.prevent
        @load="handleImageLoad"
      />
      <div class="scene-vignette" aria-hidden="true"></div>

      <div v-if="!hasInteracted" class="scene-inspection-hint" aria-hidden="true">
        <span class="scene-inspection-hint__drag">Drag to inspect</span>
        <span>Scroll to zoom</span>
      </div>

      <div
        class="scene-controls"
        role="toolbar"
        aria-label="Screenshot zoom controls"
        @pointerdown.stop
        @dblclick.stop
      >
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          :disabled="!canZoomIn"
          @click="zoomBy(0.25)"
        >
          +
        </button>
        <output :aria-label="`${zoomPercentage} percent zoom`">{{ zoomPercentage }}%</output>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          :disabled="!canZoomOut"
          @click="zoomBy(-0.25)"
        >
          −
        </button>
        <button
          class="scene-controls__reset"
          type="button"
          aria-label="Reset screenshot view"
          title="Reset view"
          :disabled="scale === MIN_IMAGE_SCALE && pan.x === 0 && pan.y === 0"
          @click="resetView(true)"
        >
          ↺
        </button>
      </div>

      <p class="sr-only" aria-live="polite">Screenshot zoom: {{ zoomPercentage }} percent.</p>
    </div>

    <figcaption class="sr-only">
      {{ question.archiveLabel }}. Analyst note: {{ question.clue }}
    </figcaption>
  </figure>
</template>
