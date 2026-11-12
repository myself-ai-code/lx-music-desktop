import { markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { getSongListSearchScore } from '@renderer/utils'
import { sortInsert } from '@common/utils/common'

import type { AlbumItem } from './state'
import { sources, listInfos } from './state'

interface SearchResult {
  list: AlbumItem[]
  limit: number
  total: number
  source: LX.OnlineSource
}

/**
 * 按搜索关键词对专辑结果重新排序
 */
const handleSortList = (list: AlbumItem[], keyword: string) => {
  const arr: Array<{ num: number, data: AlbumItem }> = []
  for (const item of list) {
    sortInsert(arr, {
      num: getSongListSearchScore(keyword, item.name),
      data: item,
    })
  }
  return arr.map(item => item.data).reverse()
}

const setLists = (results: SearchResult[], page: number, text: string): AlbumItem[] => {
  let totals: any[] = []
  let limit = 0
  const list: AlbumItem[] = []
  for (const source of results) {
    list.push(...source.list)
    totals.push(source.total)
    limit = Math.max(source.limit, limit)
  }
  const listInfo = listInfos.all
  if (!limit) limit = listInfo.limit
  let total = 0
  for (const t of totals) {
    const num = Number(t)
    if (Number.isFinite(num) && num > total) total = num
  }
  if (page == 1) listInfo.total = total || limit
  else if (total && list.length) listInfo.total = Math.max(listInfo.total, total)
  else if (listInfo.total < limit * page) listInfo.total = limit * page
  listInfo.page = page
  listInfo.list = markRaw(handleSortList(list, text))
  if (text && !list.length && page == 1) listInfo.noItemLabel = window.i18n.t('no_item')
  else listInfo.noItemLabel = ''
  return listInfo.list
}

const setList = (datas: SearchResult, page: number, text: string): AlbumItem[] => {
  const listInfo = listInfos[datas.source]!
  listInfo.list = markRaw(datas.list)
  const limit = datas.limit || listInfo.limit
  const total = Number(datas.total) || 0
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
  const listInfo = listInfos[sourceId]
  if (!listInfo) return []
  listInfo.list = []
  listInfo.page = 1
  listInfo.total = 0
  listInfo.key = null
  listInfo.noItemLabel = ''
  return []
}

export const search = async(text: string, page: number, sourceId: LX.OnlineSource | 'all'): Promise<AlbumItem[]> => {
  const listInfo = listInfos[sourceId]!
  if (!text) return resetListInfo(sourceId)
  const key = `${page}__${sourceId}__${text}`
  if (listInfo.key == key && listInfo.list.length) return listInfo.list

  if (sourceId == 'all') {
    if (!listInfo.list.length) listInfo.noItemLabel = window.i18n.t('list__loading')
    listInfo.key = key
    const task: Array<Promise<SearchResult>> = []
    for (const source of sources) {
      if (source == 'all') continue
      const albumApi = (music[source] as any)?.album
      const promise: Promise<SearchResult> = albumApi?.search
        ? albumApi.search(text, page, listInfos.all.limit)
        : Promise.reject(new Error('source not found: ' + source))
      task.push(promise.catch((error: any) => {
        console.log(error)
        return {
          list: [],
          total: 0,
          limit: listInfos.all.limit,
          source,
        }
      }))
    }
    return Promise.all(task).then(results => {
      if (key != listInfo.key) return []
      return setLists(results, page, text)
    })
  }

  if (!listInfo.list.length) listInfo.noItemLabel = window.i18n.t('list__loading')
  listInfo.key = key
  const albumApi = (music[sourceId] as any)?.album
  const promise: Promise<SearchResult> = albumApi?.search
    ? albumApi.search(text, page, listInfo.limit)
    : Promise.reject(new Error('source not found: ' + sourceId))
  return promise.then((data: SearchResult) => {
    if (key != listInfo.key) return []
    return setList(data, page, text)
  }).catch((error: any) => {
    console.log(error)
    if (page == 1) {
      resetListInfo(sourceId)
      listInfo.noItemLabel = window.i18n.t('list__load_failed')
    } else {
      listInfo.list = []
      listInfo.page = page
      listInfo.noItemLabel = ''
      listInfo.total = Math.max(listInfo.total, listInfo.limit * page)
    }
    throw error
  })
}
