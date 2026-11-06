export interface LastPageClaim {
  /** 源声明的最后一页 */
  lastPage: number
  /** 请求指定页的搜索方法 */
  search: (page: number) => Promise<{ list?: any[] } | null | undefined>
}

interface CheckResult {
  /** 请求是否正常返回（用于区分「没有数据」和「请求失败」） */
  ok: boolean
  hasData: boolean
}

const MAX_RETRY = 2

const checkPage = async(search: LastPageClaim['search'], page: number): Promise<CheckResult> => {
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      const result = await search(page)
      return { ok: true, hasData: !!result?.list?.length }
    } catch {}
  }
  return { ok: false, hasData: false }
}

/**
 * 探测单个源真实可访问的最后一页
 * 先请求源声明的最后一页，若为空则用二分查找最后一个有数据的页
 * @returns 真实最后一页；无法判断时返回 null
 */
const probeClaim = async(claim: LastPageClaim): Promise<number | null> => {
  let anyResolved = false
  const check = async(page: number) => {
    const result = await checkPage(claim.search, page)
    if (result.ok) anyResolved = true
    return result
  }

  const last = await check(claim.lastPage)
  if (last.hasData) return claim.lastPage

  // 已知第 1 页有数据，在 (1, lastPage] 之间二分
  let low = 1
  let high = claim.lastPage
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2)
    const result = await check(mid)
    if (result.hasData) low = mid
    else high = mid
  }

  // 所有请求都失败时不修正，避免网络异常导致页码被错误缩小
  return anyResolved ? low : null
}

/**
 * 探测多个源真实可访问的最后一页，返回其中的最大值
 * 只探测声明页数可能影响最终页码的源
 * @returns 真实最后一页；无法判断时返回 null
 */
export const probeAccessibleLastPage = async(claims: LastPageClaim[]): Promise<number | null> => {
  const sorted: LastPageClaim[] = [...claims].sort((a, b) => b.lastPage - a.lastPage)
  let best = 0
  let probed = false
  for (const claim of sorted) {
    if (claim.lastPage <= best) break
    const lastPage = await probeClaim(claim)
    // 当前声明的最大页数无法验证时放弃修正，避免把页码错误缩小
    if (lastPage == null) return null
    probed = true
    if (lastPage > best) best = lastPage
  }
  return probed ? best : null
}
