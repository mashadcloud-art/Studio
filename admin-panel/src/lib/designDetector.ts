/**
 * Smart Nail Art & Style Detector
 * Analyzes file naming and canvas pixel characteristics (brightness, saturation, contrast, shimmer)
 * to automatically identify and categorize nail designs.
 */

export interface DesignDetectionResult {
  detectedCategory: string
  confidence: number
  palette: string[]
  suggestedTags: string[]
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Cat Eye / Velvet': ['cat', 'eye', 'velvet', 'magnetic', 'galaxy', 'shimmer', 'aurora'],
  'French Polish / Ombre': ['french', 'ombre', 'baby', 'boomer', 'fade', 'tip', 'white'],
  'Chrome & Glazed': ['chrome', 'glazed', 'mirror', 'metallic', 'pearl', 'donut', 'hailey'],
  'Bridal & Luxury': ['bridal', 'wedding', 'bride', 'gem', 'stone', 'crystal', 'rhinestone', 'swarovski', 'gold'],
  'Detailed Nail Art': ['art', 'floral', 'flower', 'draw', 'pattern', 'abstract', 'character', 'line', 'design'],
  'Gel Extensions': ['extension', 'ext', 'tips', 'acrylic', 'polygel', 'long', 'almond', 'coffin', 'stiletto'],
  'Gel Overlay': ['overlay', 'natural', 'reinforce', 'short', 'clean'],
  'Nude & Minimalist': ['nude', 'minimal', 'simple', 'clean', 'plain', 'neutral', 'sheer', 'milky'],
  'Vibrant Gel Polish': ['red', 'blue', 'pink', 'neon', 'bright', 'black', 'dark', 'pastel', 'solid'],
}

export async function detectNailDesign(file: File): Promise<DesignDetectionResult> {
  const fileNameLower = file.name.toLowerCase()

  // 1. Check filename hints first
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (fileNameLower.includes(kw)) {
        return {
          detectedCategory: category,
          confidence: 0.95,
          palette: ['#6750A4', '#D0BCFF'],
          suggestedTags: [category, 'Auto-Tagged'],
        }
      }
    }
  }

  // 2. Canvas visual color & pattern analysis
  try {
    const imgBitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    const size = 32
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    if (!ctx) {
      return fallbackCategory()
    }

    ctx.drawImage(imgBitmap, 0, 0, size, size)
    const imgData = ctx.getImageData(0, 0, size, size).data

    let totalR = 0
    let totalG = 0
    let totalB = 0
    let totalSat = 0
    let highShimmerCount = 0
    let whiteCount = 0
    let darkCount = 0

    const totalPixels = size * size

    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i]
      const g = imgData[i + 1]
      const b = imgData[i + 2]

      totalR += r
      totalG += g
      totalB += b

      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const delta = max - min
      const sat = max === 0 ? 0 : delta / max
      totalSat += sat

      // Specular highlights (gems, chrome reflection, cat-eye beam)
      if (max > 235 && delta < 30) whiteCount++
      if (max < 50) darkCount++
      if (sat > 0.4 && max > 180) highShimmerCount++
    }

    const avgR = totalR / totalPixels
    const avgG = totalG / totalPixels
    const avgB = totalB / totalPixels
    const avgBrightness = (avgR + avgG + avgB) / 3
    const avgSat = totalSat / totalPixels

    const whiteRatio = whiteCount / totalPixels
    const darkRatio = darkCount / totalPixels
    const shimmerRatio = highShimmerCount / totalPixels

    // Heuristics based on nail photography patterns:
    if (shimmerRatio > 0.25 && darkRatio > 0.15) {
      return {
        detectedCategory: 'Cat Eye / Velvet',
        confidence: 0.88,
        palette: ['#31111D', '#D0BCFF'],
        suggestedTags: ['Cat Eye / Velvet', 'Magnetic Shimmer'],
      }
    }

    if (whiteRatio > 0.18 && avgBrightness > 160) {
      return {
        detectedCategory: 'French Polish / Ombre',
        confidence: 0.86,
        palette: ['#FFF0F5', '#E8DEF8'],
        suggestedTags: ['French Polish / Ombre', 'Clean Girl'],
      }
    }

    if (whiteRatio > 0.12 && shimmerRatio > 0.15) {
      return {
        detectedCategory: 'Bridal & Luxury',
        confidence: 0.84,
        palette: ['#FFD8E4', '#FFB3C7'],
        suggestedTags: ['Bridal & Luxury', 'Crystals / Gems'],
      }
    }

    if (avgSat > 0.35) {
      return {
        detectedCategory: 'Detailed Nail Art',
        confidence: 0.82,
        palette: ['#6750A4', '#FFD8E4'],
        suggestedTags: ['Detailed Nail Art', 'Custom Set'],
      }
    }

    if (avgBrightness > 140 && avgSat < 0.22) {
      return {
        detectedCategory: 'Nude & Minimalist',
        confidence: 0.85,
        palette: ['#F3EDF7', '#E8DEF8'],
        suggestedTags: ['Nude & Minimalist', 'Natural Overlay'],
      }
    }

    if (shimmerRatio > 0.1) {
      return {
        detectedCategory: 'Chrome & Glazed',
        confidence: 0.81,
        palette: ['#EADDFF', '#C2E7FF'],
        suggestedTags: ['Chrome & Glazed', 'Glazed Donut'],
      }
    }

    return {
      detectedCategory: 'Vibrant Gel Polish',
      confidence: 0.78,
      palette: ['#6750A4', '#E8DEF8'],
      suggestedTags: ['Gel Application', 'Gel Polish'],
    }
  } catch (e) {
    console.warn('Canvas detector exception:', e)
    return fallbackCategory()
  }
}

function fallbackCategory(): DesignDetectionResult {
  return {
    detectedCategory: 'Detailed Nail Art',
    confidence: 0.7,
    palette: ['#6750A4'],
    suggestedTags: ['Nail Art'],
  }
}
