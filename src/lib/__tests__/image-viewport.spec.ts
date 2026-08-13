import { describe, expect, it } from 'vitest'

import {
  clampScale,
  fitContainSize,
  zoomAroundPoint,
} from '@/lib/image-viewport'

const viewport = { width: 1_000, height: 600 }

describe('image viewport transforms', () => {
  it('keeps zoom inside the supported range', () => {
    expect(clampScale(0.5)).toBe(1)
    expect(clampScale(2.25)).toBe(2.25)
    expect(clampScale(9)).toBe(4)
  })

  it('fits wide and tall images entirely inside the viewport without distortion', () => {
    const wideImage = fitContainSize(viewport, { width: 1_600, height: 900 })

    expect(wideImage.width).toBe(1_000)
    expect(wideImage.height).toBe(562.5)
    expect(fitContainSize(viewport, { width: 600, height: 900 })).toEqual({
      width: 400,
      height: 600,
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

  it('keeps translations outside the viewport boundary while zooming', () => {
    expect(
      zoomAroundPoint({
        pan: { x: 700, y: -500 },
        scale: 1,
        nextScale: 2,
        point: { x: 500, y: 300 },
        viewport,
      }),
    ).toEqual({
      pan: { x: 1_400, y: -1_000 },
      scale: 2,
    })
  })
})
