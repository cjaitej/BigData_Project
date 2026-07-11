// /api/data's `end` filter only matches midnight of that date string (Flask
// compares df['datetime'] <= end, and pandas parses a bare 'YYYY-MM-DD' as
// 00:00:00 on both sides) — so a caller who wants the WHOLE end day must
// request one calendar day past it, then filter the response back down by
// ISO-string prefix. Centralized here since V4 and V5 both need this.

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Every hourly row from startDate through endDate inclusive (both
// 'YYYY-MM-DD'), with /api/data's original field names.
export async function fetchWindow(startDate, endDate) {
  const res = await fetch(`/api/data?start=${startDate}&end=${nextDay(endDate)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const rows = await res.json()
  const cutoff = endDate + 'T23:59:59'
  return rows.filter(r => r.datetime <= cutoff)
}

// One day's hourly rows (00:00-23:00).
export function fetchDay(dateStr) {
  return fetchWindow(dateStr, dateStr)
}

// Find the row for a given hour on a given date, falling back to the
// nearest available hour within ±maxOffset if that exact hour is a data gap.
export function findHourRow(rows, dateStr, hour, maxOffset = 3) {
  for (let d = 0; d <= maxOffset; d++) {
    const hours = d === 0 ? [hour] : [hour - d, hour + d]
    for (const h of hours) {
      if (h < 0 || h > 23) continue
      const key = `${dateStr}T${String(h).padStart(2, '0')}:00:00`
      const row = rows.find(r => r.datetime === key)
      if (row) return { row, hour: h, fallback: h !== hour }
    }
  }
  return null
}
