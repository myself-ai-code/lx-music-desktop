import { reactive, markRaw } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'

export interface AlbumItem {
  id: string
  name: string
  singer: string
  img: string
  publishTime: string
  songCount: number
  source: LX.OnlineSource
}

export interface AlbumListInfo {
  list: AlbumItem[]
  total: number
  page: number
  limit: number
  key: string | null
  noItemLabel: string
}

export const sources: Array<LX.OnlineSource | 'all'> = markRaw([])

interface ListInfos extends Partial<Record<LX.OnlineSource, AlbumListInfo>> {
  'all': AlbumListInfo
}

export const listInfos: ListInfos = markRaw({
  all: reactive<AlbumListInfo>({
    page: 1,
    limit: 20,
    total: 0,
    list: [],
    key: null,
    noItemLabel: '',
  }),
})
for (const source of music.sources) {
  const id = source.id as LX.OnlineSource
  if (!(music[id] as any)?.album?.search) continue
  sources.push(id)
  listInfos[id] = reactive<AlbumListInfo>({
    page: 1,
    limit: 20,
    total: 0,
    list: [],
    key: null,
    noItemLabel: '',
  })
}
sources.push('all')
