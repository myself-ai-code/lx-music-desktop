import { markRawList } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { getSongListSearchScore } from '@renderer/utils'
import { sortInsert } from '@common/utils/common'
import { apiSource } from '@renderer/store'

import { probeAccessibleLastPage } from '../probeLastPage'
import type { ListInfoItem, SearchListInfo } from './state'
import { sources, maxPages, listInfos } from './state'

interface SearchResult {
  list: ListInfoItem[]
  limit: number
  total: number
  source: LX.OnlineSource
}


/**
 * 按搜索关键词重新排序列表
 * @param list 歌曲列表
 * @param keyword 搜索关键词
 * @returns 排序后的列表
 */
const handleSortList = (list: ListInfoItem[], keyword: string, rankMap: Map<string, number>) => {
  let arr: any[] = []
  for (const item of list) {
    sortInsert(arr, {
      num: getSongListSearchScore(keyword, item.name, {
        rank: rankMap.get(`${item.source}_${item.id}`),
        source: item.source,
        currentSource: apiSource.value,
      }),
      data: item,
    })
  }
  return arr.map(item => item.data).reverse()
}


let maxTotals: Partial<Record<LX.OnlineSource, number>> = {

}

// 当前搜索标识（源 + 关键词），用于判断后台探测结果是否已过期
let currentSearchSignature = ''
let probingSignature = ''

/**
 * 后台探测各源真实可访问的最后一页，修正源虚报的总页数
 */
const startLastPageProbe = (
  results: SearchResult[],
  text: string,
  signature: string,
  limit: number,
  listInfo: SearchListInfo,
) => {
  if (probingSignature == signature) return
  const claims = results
    .map(result => {
      const sourceLimit = result.limit || limit
      const total = Number(result.total)
      return {
        lastPage: Number.isFinite(total) && total > 0 ? Math.ceil(total / sourceLimit) : 0,
        search: (page: number) => music[result.source]?.songList?.search(text, page, sourceLimit) ?? Promise.reject(new Error('source not found')),
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
      if (listInfo.total > total) listInfo.total = total
    }).catch(err => {
      if (probingSignature == signature) probingSignature = ''
      console.log(err)
    })
  }, 500)
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

const setLists = (results: SearchResult[], page: number, text: string): ListInfoItem[] => {
  let totals = []
  let limit = 0
  let list = []
  // 记录各歌单在自己平台本次搜索结果中的名次，用于排序时参考平台相关度
  const rankMap = new Map<string, number>()
  for (const source of results) {
    source.list.forEach((item, index) => {
      const key = `${item.source}_${item.id}`
      if (!rankMap.has(key)) rankMap.set(key, index)
    })
    list.push(...source.list)
    totals.push(source.total)
    maxTotals[source.source] = source.total
    const sourceTotal = Number(source.total)
    if (Number.isFinite(sourceTotal) && sourceTotal > 0) {
      maxPages[source.source] = Math.ceil(sourceTotal / (source.limit || listInfos.all.limit))
    }
    limit = Math.max(source.limit, limit)
  }
  markRawList(list)

  let listInfo = listInfos.all
  // 所有源都没有该页数据时 limit 可能为 0，回退到默认分页大小，避免页码被隐藏
  if (!limit) limit = listInfo.limit
  const total = getValidTotal(totals)
  if (page == 1) {
    listInfo.total = total || limit
  } else if (total && list.length) {
    // 同一搜索内分页总数只增不减，避免部分源失败或缺少总数时页码跳变
    listInfo.total = Math.max(listInfo.total, total)
  } else if (listInfo.total < limit * page) {
    listInfo.total = limit * page
  }
  listInfo.page = page
  listInfo.list = handleSortList(list, text, rankMap)
  if (text && !list.length && page == 1) listInfo.noItemLabel = window.i18n.t('no_item')
  else listInfo.noItemLabel = ''
  return listInfo.list
}

const setList = (datas: SearchResult, page: number, text: string): ListInfoItem[] => {
  // console.log(datas.source, datas.list)
  let listInfo = listInfos[datas.source]!
  listInfo.list = markRawList(datas.list)
  const limit = datas.limit || listInfo.limit
  const total = getValidTotal([datas.total])
  if (page == 1) listInfo.total = total || limit
  else if (total && datas.list.length) listInfo.total = Math.max(listInfo.total, total)
  else if (listInfo.total < limit * page) listInfo.total = limit * page
  listInfo.page = page
  listInfo.limit = limit
  if (text && !datas.list.length && page == 1) listInfo.noItemLabel = window.i18n.t('no_item')
  else listInfo.noItemLabel = ''
  return listInfo.list
}

export const resetListInfo = (sourceId: LX.OnlineSource | 'all'): [] => {
  let listInfo = listInfos[sourceId]
  if (!listInfo) return []
  listInfo.page = 1
  listInfo.limit = 20
  listInfo.total = 0
  listInfo.list = []
  listInfo.key = null
  listInfo.noItemLabel = ''
  listInfo.tagId = ''
  listInfo.sortId = ''
  return []
}

export const search = async(text: string, page: number, sourceId: LX.OnlineSource | 'all'): Promise<ListInfoItem[]> => {
  const listInfo = listInfos[sourceId]!
  if (!text) return resetListInfo(sourceId)
  const key = `${page}__${sourceId}__${text}`
  const signature = `${sourceId}__${text}`
  currentSearchSignature = signature
  if (listInfo.key == key && listInfo.list.length) return listInfo.list
  if (sourceId == 'all') {
    // 已有数据时保留旧列表与分页，避免加载过程中整块区域被隐藏
    if (!listInfo.list.length) listInfo.noItemLabel = window.i18n.t('list__loading')
    listInfo.key = key
    let task = []
    for (const source of sources) {
      if (source == 'all' || (page > 1 && page > (maxPages[source]!))) continue
      task.push((music[source]?.songList.search(text, page, listInfos.all.limit) ?? Promise.reject(new Error('source not found: ' + source))).catch((error: any) => {
        console.log(error)
        return {
          list: [],
          total: 0,
          limit: listInfos.all.limit,
          source,
        }
      }))
    }
    return Promise.all(task).then((results: SearchResult[]) => {
      if (key != listInfo.key) return []
      const list = setLists(results, page, text)
      if (page == 1 && list.length) startLastPageProbe(results, text, signature, listInfos.all.limit, listInfo)
      return list
    })
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    if (!listInfo.list.length) listInfo.noItemLabel = window.i18n.t('list__loading')
    listInfo.key = key
    return (music[sourceId]?.songList.search(text, page, listInfo.limit).then((data: SearchResult) => {
      if (key != listInfo.key) return []
      const list = setList(data, page, text)
      if (page == 1 && list.length) startLastPageProbe([data], text, signature, listInfo.limit, listInfo)
      return list
    }) ?? Promise.reject(new Error('source not found: ' + sourceId))).catch((error: any) => {
      console.log(error)
      if (page == 1) {
        resetListInfo(sourceId)
        listInfo.noItemLabel = window.i18n.t('list__load_failed')
      } else {
        // 翻页失败时保留分页信息，避免页码消失
        listInfo.list = []
        listInfo.page = page
        listInfo.noItemLabel = ''
        listInfo.total = Math.max(listInfo.total, listInfo.limit * page)
      }
      throw error
    })
  }
}

