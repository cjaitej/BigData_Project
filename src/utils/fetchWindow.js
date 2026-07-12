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
