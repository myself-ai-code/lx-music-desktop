import { httpFetch } from '../../request'
import { eapiRequest } from './utils'
import { weapi } from './utils/crypto'
import musicDetail from './musicDetail'

const cache = new Map()

export default {
  limit: 20,
  handleSearchResult(rawList) {
    if (!Array.isArray(rawList)) return []
    return rawList.map(item => ({
      id: String(item.id ?? ''),
      name: item.name ?? '',
      singer: item.artist?.name ?? item.artists?.map(artist => artist.name).join('、') ?? '',
      img: item.picUrl ?? item.blurPicUrl ?? '',
      publishTime: item.publishTime ? new Date(item.publishTime).toISOString().slice(0, 10) : '',
      songCount: Number(item.size) || 0,
      source: 'wy',
    })).filter(item => item.id)
  },
  async search(str, page = 1, limit = this.limit) {
    const { body } = await eapiRequest('/api/cloudsearch/pc', {
      s: str,
      type: 10,
      limit,
      total: page == 1,
      offset: limit * (page - 1),
    }).promise
    if (body.code != 200) throw new Error('search album failed')
    return {
      list: this.handleSearchResult(body.result?.albums),
      total: Number(body.result?.albumCount) || 0,
      page,
      limit,
      source: 'wy',
    }
  },
  getAll(id) {
    if (cache.has(id)) return cache.get(id)
    const promise = httpFetch(`https://music.163.com/weapi/v1/album/${id}`, {
      method: 'post',
      form: weapi({}),
    }).promise.then(async({ body }) => {
      if (body.code != 200 || !Array.isArray(body.songs)) throw new Error('get album detail failed')
      const ids = body.songs.map(song => song.id)
      const result = ids.length ? await musicDetail.getList(ids) : { list: [] }
      return {
        list: result.list,
        total: Number(body.album?.size) || result.list.length,
      }
    }).catch(error => {
      cache.delete(id)
      throw error
    })
    cache.set(id, promise)
    return promise
  },
  async getAlbumDetail(id, page = 1, limit = 100) {
    const result = await this.getAll(id)
    return {
      list: result.list.slice((page - 1) * limit, page * limit),
      total: result.total,
      page,
      limit,
      source: 'wy',
    }
  },
  async getAlbumDetailAll(id) {
    return (await this.getAll(id)).list
  },
}
