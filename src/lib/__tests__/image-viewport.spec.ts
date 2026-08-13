import { describe, expect, it } from 'vitest'

import {
  clampPan,
  clampScale,
  fitCoverSize,
  zoomAroundPoint,
} from '@/lib/image-viewport'

const viewport = { width: 1_000, height: 600 }

describe('image viewport transforms', () => {
  it('keeps zoom inside the supported range', () => {
    expect(clampScale(0.5)).toBe(1)
    expect(clampScale(2.25)).toBe(2.25)
    expect(clampScale(9)).toBe(4)
  })

  it('prevents panning beyond the visible image edge', () => {
    expect(clampPan({ x: 100, y: -100 }, viewport, 1)).toEqual({ x: 0, y: 0 })
    expect(clampPan({ x: 900, y: -900 }, viewport, 2)).toEqual({ x: 500, y: -300 })
  })

  it('allows inspection of cover-cropped image content at base zoom', () => {
    const content = { width: 1_200, height: 600 }

    expect(clampPan({ x: 300, y: 100 }, viewport, 1, content)).toEqual({ x: 100, y: 0 })
  })

  it('fits wide and tall images over the viewport without distortion', () => {
    const wideImage = fitCoverSize(viewport, { width: 1_600, height: 900 })

    expect(wideImage.width).toBeCloseTo(1_066.67)
    expect(wideImage.height).toBe(600)
    expect(fitCoverSize(viewport, { width: 600, height: 900 })).toEqual({
      width: 1_000,
      height: 1_500,
    })
  })

  it('keeps the inspected point under the pointer while zooming', () => {
    expect(
      zoomAroundPoint({
        pan: { x: 0, y: 0 },
        scale: 1,
        nextScale: 2,
        point: { x: 750, y: 300 },
        viewport,
      }),
    ).toEqual({
      pan: { x: -250, y: 0 },
      scale: 2,
    })
  })
})
