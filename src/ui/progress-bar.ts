export type ProgressBarMode = 'remaining' | 'used'

export function createProgressBar(percent: number, mode: ProgressBarMode): string {
  const clampedPercentage = Math.max(0, Math.min(100, percent))
  const width = 420
  const height = 12
  const fillWidth = Math.round((clampedPercentage / 100) * width)
  const fillColor = getFillColor(clampedPercentage, mode)
  const trackColor = '#e6e6ea'

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" rx="6" fill="${trackColor}"/>`,
    `<rect width="${fillWidth}" height="${height}" rx="6" fill="${fillColor}"/>`,
    '</svg>',
  ].join('')

  return `![${clampedPercentage.toFixed(0)} percent ${mode}](data:image/svg+xml;utf8,${encodeURIComponent(svg)})`
}

function getFillColor(percent: number, mode: ProgressBarMode): string {
  if (mode === 'used') {
    if (percent >= 85) {
      return '#f85149'
    }
    if (percent >= 70) {
      return '#d29922'
    }
    return '#2ea043'
  }

  if (percent <= 15) {
    return '#f85149'
  }
  if (percent <= 30) {
    return '#d29922'
  }
  return '#2ea043'
}
