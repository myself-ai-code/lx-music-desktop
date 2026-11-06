import { markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { deduplicationList, getMusicSearchScore, toNewMusicInfo } from '@renderer/utils'
import { sortInsert } from '@common/utils/common'
import { apiSource } from '@renderer/store'

import { probeAccessibleLastPage } from '../probeLastPage'
import { sources, maxPages, listInfos, type ListInfo } from './state'

interface SearchResult {
  list: LX.Music.MusicInfo[]
  allPage: number
  limit: number
  total: number
  source: LX.OnlineSource
}

// 当前搜索标识（源 + 关键词），用于判断后台探测结果是否已过期
let currentSearchSignature = ''
let probingSignature = ''
// 探测得到的真实总数上限（按搜索标识缓存），避免后续翻页时被源虚报的总数重新撑大
const totalCaps = new Map<string, number>()

const getSearchTotalCap = (signature: string) => totalCaps.get(signature)

const clampTotal = (total: number, signature: string) => {
  const cap = getSearchTotalCap(signature)
  return cap == null ? total : Math.min(total, cap)
}

const setSearchTotalCap = (signature: string, total: number) => {
  totalCaps.set(signature, total)
  if (totalCaps.size > 30) {
    const oldest = totalCaps.keys().next().value
    if (oldest != null) totalCaps.delete(oldest)
  }
}

/**
 * 后台探测各源真实可访问的最后一页，修正源虚报的总页数
 */
const startLastPageProbe = (
  results: SearchResult[],
  text: string,
  signature: string,
  limit: number,
  listInfo: ListInfo,
) => {
  if (probingSignature == signature) return
  const claims = results
    .map(result => {
      const sourceLimit = result.limit || limit
      const total = Number(result.total)
      return {
        lastPage: Number.isFinite(total) && total > 0 ? Math.ceil(total / sourceLimit) : 0,
        search: (page: number) => music[result.source]?.musicSearch?.search(text, page, sourceLimit) ?? Promise.reject(new Error('source not found')),
      }
    })
    .filter(claim => claim.lastPage > 1)
  if (!claims.length) return

  probingSignature = signature
  window.setTimeout(() => {
    if (signature != currentSearchSignature) {
      if (probingSignature == signature) probingSignature = ''
      return
    }
    void probeAccessibleLastPage(claims).then(lastPage => {
      if (probingSignature == signature) probingSignature = ''
      if (lastPage == null || signature != currentSearchSignature) return
      const total = lastPage * limit
      setSearchTotalCap(signature, total)
      if (listInfo.total > total) listInfo.total = total
    }).catch(err => {
      if (probingSignature == signature) probingSignature = ''
      console.log(err)
    })
  }, 500)
}


/**
 * 按搜索关键词重新排序列表
 * @param list 歌曲列表
 * @param keyword 搜索关键词
 * @returns 排序后的列表
 */
const handleSortList = (list: LX.Music.MusicInfo[], keyword: string, rankMap: Map<string, number>) => {
  let arr: any[] = []
  for (const item of list) {
    sortInsert(arr, {
      num: getMusicSearchScore(keyword, item.name, item.singer, {
        rank: rankMap.get(item.id),
        source: item.source as LX.OnlineSource,
        currentSource: apiSource.value,
        qualitys: (item as any).meta?._qualitys,
      }),
      data: item,
    })
  }
  return arr.map(item => item.data).reverse()
}


/**
 * 从各源返回的总数中取有效最大值
 * 个别源在翻页后不再返回总数（或返回 0/NaN），需要忽略，避免分页总数变成 NaN 或缩小
 */
const getValidTotal = (totals: any[]) => {
  let total = 0
  for (const t of totals) {
    const num = Number(t)
    if (Number.isFinite(num) && num > total) total = num
  }
  return total
}

const setLists = (results: SearchResult[], page: number, text: string, signature: string): LX.Music.MusicInfo[] => {
  let pages = []
  let totals = []
  let limit = 0
  let list = []
  // 记录各歌曲在自己平台本次搜索结果中的名次，用于排序时参考平台相关度
  const rankMap = new Map<string, number>()
  for (const source of results) {
    maxPages[source.source] = source.allPage
    limit = Math.max(source.limit, limit)
    if (source.allPage < page) continue
    source.list.forEach((item, index) => {
      const id = `${item.source}_${(item as any).songmid}`
      if (!rankMap.has(id)) rankMap.set(id, index)
    })
    list.push(...source.list)
    pages.push(source.allPage)
    totals.push(source.total)
  }
  list = deduplicationList(list.map(s => markRaw(toNewMusicInfo(s))))
  let listInfo = listInfos.all
  // 所有源都没有该页数据时 limit 可能为 0，回退到聚合搜索的默认分页大小，避免页码被隐藏
  if (!limit) limit = listInfo.limit
  listInfo.maxPage = Math.max(0, ...pages)
  const total = clampTotal(getValidTotal(totals), signature)
  if (page == 1) {
    listInfo.total = total || limit
  } else if (total && list.length) {
    // 同一搜索内分页总数只增不减，避免部分源失败或缺少总数时页码跳变
    listInfo.total = Math.max(listInfo.total, total)
  } else if (listInfo.total < limit * page) {
    listInfo.total = limit * page
  }
  // 探测到的真实页数优先，避免翻页时被源虚报的总数重新撑大
  const cap = getSearchTotalCap(signature)
  if (cap != null && listInfo.total > cap) listInfo.total = cap
  // listInfo.limit = limit
  listInfo.page = page
  listInfo.list = handleSortList(list, text, rankMap)
  if (text && !list.length && page == 1) listInfo.noItemLabel = window.i18n.t('no_item')
  else listInfo.noItemLabel = ''
  return listInfo.list
}

const setList = (datas: SearchResult, page: number, text: string, signature: string): LX.Music.MusicInfo[] => {
  // console.log(datas.source, datas.list)
  let listInfo = listInfos[datas.source]!
  listInfo.list = deduplicationList(datas.list.map(s => markRaw(toNewMusicInfo(s))))
  const limit = datas.limit || listInfo.limit
  const total = clampTotal(getValidTotal([datas.total]), signature)
  if (page == 1) listInfo.total = total || limit
  else if (total && datas.list.length) listInfo.total = Math.max(listInfo.total, total)
  else if (listInfo.total < limit * page) listInfo.total = limit * page
  // 探测到的真实页数优先
  const cap = getSearchTotalCap(signature)
  if (cap != null && listInfo.total > cap) listInfo.total = cap
  listInfo.maxPage = datas.allPage
  listInfo.page = page
  listInfo.limit = datas.limit
  if (text && !datas.list.length && page == 1) listInfo.noItemLabel = window.i18n.t('no_item')
  else listInfo.noItemLabel = ''
  return listInfo.list
}

export const resetListInfo = (sourceId: LX.OnlineSource | 'all'): [] => {
  let listInfo = listInfos[sourceId]
  if (!listInfo) return []
  listInfo.list = []
  listInfo.page = 0
  listInfo.maxPage = 0
  listInfo.total = 0
  listInfo.noItemLabel = ''
  return []
}

export const search = async(text: string, page: number, sourceId: LX.OnlineSource | 'all'): Promise<LX.Music.MusicInfo[]> => {
  const listInfo = listInfos[sourceId]
  if (!text) return resetListInfo(sourceId)
  const key = `${page}__${text}`
  const signature = `${sourceId}__${text}`
  currentSearchSignature = signature
  if (sourceId == 'all') {
    // 已有数据时保留旧列表与分页，避免加载过程中整块区域被隐藏
    if (!listInfo!.list.length) listInfo!.noItemLabel = window.i18n.t('list__loading')
    listInfo!.key = key
    let task = []
    for (const source of sources) {
      if (source == 'all') continue
      task.push((music[source]?.musicSearch.search(text, page, listInfos.all.limit) ?? Promise.reject(new Error('source not found: ' + source))).catch((error: any) => {
        console.log(error)
        return {
          allPage: 1,
          limit: 30,
          list: [],
          source,
          total: 0,
        }
      }))
    }
    return Promise.all(task).then((results: SearchResult[]) => {
      if (key != listInfo!.key) return []
      const list = setLists(results, page, text, signature)
      if (page == 1 && list.length) startLastPageProbe(results, text, signature, listInfos.all.limit, listInfo!)
      return list
    })
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    if (!listInfo!.list.length) listInfo!.noItemLabel = window.i18n.t('list__loading')
    listInfo!.key = key
    return music[sourceId].musicSearch.search(text, page, listInfo!.limit).then((data: SearchResult) => {
      if (key != listInfo!.key) return []
      const list = setList(data, page, text, signature)
      if (page == 1 && list.length) startLastPageProbe([data], text, signature, listInfo!.limit, listInfo!)
      return list
    }).catch((error: any) => {
      console.log(error)
      if (page == 1) {
        resetListInfo(sourceId)
        listInfo!.noItemLabel = window.i18n.t('list__load_failed')
      } else {
        // 翻页失败时保留分页信息，避免页码消失
        listInfo!.list = []
        listInfo!.page = page
        listInfo!.noItemLabel = ''
        listInfo!.total = Math.max(listInfo!.total, listInfo!.limit * page)
      }
      throw error
    })
  }
}

