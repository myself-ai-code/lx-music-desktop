import { markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { deduplicationList, getMusicSearchScore, toNewMusicInfo } from '@renderer/utils'
import { sortInsert } from '@common/utils/common'
import { apiSource } from '@renderer/store'

import { sources, maxPages, listInfos } from './state'

interface SearchResult {
  list: LX.Music.MusicInfo[]
  allPage: number
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


const setLists = (results: SearchResult[], page: number, text: string): LX.Music.MusicInfo[] => {
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
  listInfo.maxPage = Math.max(0, ...pages)
  const total = Math.max(0, ...totals)
  if (page == 1 || (total && list.length)) listInfo.total = total
  else listInfo.total = limit * page
  // listInfo.limit = limit
  listInfo.page = page
  listInfo.list = handleSortList(list, text, rankMap)
  if (text && !list.length && page == 1) listInfo.noItemLabel = window.i18n.t('no_item')
  else listInfo.noItemLabel = ''
  return listInfo.list
}

const setList = (datas: SearchResult, page: number, text: string): LX.Music.MusicInfo[] => {
  // console.log(datas.source, datas.list)
  let listInfo = listInfos[datas.source]!
  listInfo.list = deduplicationList(datas.list.map(s => markRaw(toNewMusicInfo(s))))
  if (page == 1 || (datas.total && datas.list.length)) listInfo.total = datas.total
  else listInfo.total = datas.limit * page
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
  if (sourceId == 'all') {
    listInfo!.noItemLabel = window.i18n.t('list__loading')
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
      return setLists(results, page, text)
    })
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    listInfo!.noItemLabel = window.i18n.t('list__loading')
    listInfo!.key = key
    return music[sourceId].musicSearch.search(text, page, listInfo!.limit).then((data: SearchResult) => {
      if (key != listInfo!.key) return []
      return setList(data, page, text)
    }).catch((error: any) => {
      resetListInfo(sourceId)
      listInfo!.noItemLabel = window.i18n.t('list__load_failed')
      console.log(error)
      throw error
    })
  }
}

