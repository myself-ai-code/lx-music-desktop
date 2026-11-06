import { markRawList } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { getSongListSearchScore } from '@renderer/utils'
import { sortInsert } from '@common/utils/common'
import { apiSource } from '@renderer/store'

import type { ListInfoItem } from './state'
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
    maxPages[source.source] = Math.ceil(source.total / source.limit)
    limit = Math.max(source.limit, limit)
  }
  markRawList(list)

  let listInfo = listInfos.all
  const total = Math.max(0, ...totals)
  if (page == 1 || (total && list.length)) listInfo.total = total
  else listInfo.total = limit * page
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
  if (page == 1 || (datas.total && datas.list.length)) listInfo.total = datas.total
  else listInfo.total = datas.limit * page
  listInfo.page = page
  listInfo.limit = datas.limit
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
  if (listInfo.key == key && listInfo.list.length) return listInfo.list
  if (sourceId == 'all') {
    listInfo.noItemLabel = window.i18n.t('list__loading')
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
      return setLists(results, page, text)
    })
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    listInfo.noItemLabel = window.i18n.t('list__loading')
    listInfo.key = key
    return (music[sourceId]?.songList.search(text, page, listInfo.limit).then((data: SearchResult) => {
      if (key != listInfo.key) return []
      return setList(data, page, text)
    }) ?? Promise.reject(new Error('source not found: ' + sourceId))).catch((error: any) => {
      resetListInfo(sourceId)
      listInfo.noItemLabel = window.i18n.t('list__load_failed')
      console.log(error)
      throw error
    })
  }
}

