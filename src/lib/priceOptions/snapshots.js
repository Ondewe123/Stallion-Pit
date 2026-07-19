export function priceSnapshotKey(snagId, ipcPartId) {
  return `${snagId}::${ipcPartId}`
}

function snapshotTime(snapshot) {
  return new Date(snapshot?.fetched_at || snapshot?.created_at || 0).getTime()
}

export function linkPriceSnapshots(snagId, ipcPartId, snapshots = [], latestLimit = 3) {
  const history = (snapshots || [])
    .filter(snapshot => snapshot.snag_id === snagId && snapshot.ipc_part_id === ipcPartId)
    .sort((a, b) => snapshotTime(b) - snapshotTime(a))
  return {
    latest: history.slice(0, latestLimit),
    history,
  }
}

export function formatGbp(value) {
  if (value == null) return '-'
  return `GBP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatKes(value) {
  if (value == null) return '-'
  return `KES ${Math.round(Number(value)).toLocaleString()}`
}
