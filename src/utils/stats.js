// Pearson correlation coefficient, pairwise-complete — drops only the index
// where either value is missing/NaN, not the whole series.
export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  const pairs = []
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i]
    if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) continue
    pairs.push([x, y])
  }
  if (pairs.length < 2) return { r: null, n: pairs.length }

  const mx = pairs.reduce((s, [x]) => s + x, 0) / pairs.length
  const my = pairs.reduce((s, [, y]) => s + y, 0) / pairs.length
  let sxy = 0, sxx = 0, syy = 0
  for (const [x, y] of pairs) {
    const dx = x - mx, dy = y - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return { r: null, n: pairs.length }
  return { r: sxy / Math.sqrt(sxx * syy), n: pairs.length }
}
