import type { EstimateScale } from './types'

export const TSHIRT: Array<[string, number]> = [
  ['XS', 1],
  ['S', 2],
  ['M', 3],
  ['L', 5],
  ['XL', 8]
]

const VALUES: Record<EstimateScale, number[]> = {
  fibonacci: [0, 1, 2, 3, 5, 8, 13, 21],
  tshirt: TSHIRT.map(([, v]) => v),
  linear: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  off: []
}

/** The values a picker offers for a scale. T-shirt sizes are stored as their mapped number. */
export function scaleValues (scale: EstimateScale): number[] {
  return VALUES[scale]
}

export function formatPoints (value: number | null | undefined, scale: EstimateScale): string {
  if (value === null || value === undefined) return '–'
  if (scale === 'tshirt') {
    const hit = TSHIRT.find(([, v]) => v === value)
    if (hit !== undefined) return hit[0]
  }
  return String(value)
}

export function isEstimateScale (value: unknown): value is EstimateScale {
  return value === 'fibonacci' || value === 'tshirt' || value === 'linear' || value === 'off'
}
