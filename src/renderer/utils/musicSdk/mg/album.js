import { createHttpFetch } from './utils'
import { filterMusicInfoList } from './musicInfo'
import { formatPlayCount } from '../../index'
import { createSignature } from './musicSearch'

export default {
  limit: 20,
  async musicAlbumSearch(str, page, limit) {
    const time = Date.now().toString()
    const signData = createSignature(time, str)
    return createHttpFetch(`https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A0%2C%22album%22%3A1%2C%22singer%22%3A0%2C%22tagSong%22%3A0%2C%22mvSong%22%3A0%2C%22bestShow%22%3A0%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(str)}&pageNo=${page}&sort=0&sid=USS`, {
      headers: {
        uiVersion: 'A_music_3.6.1',
        deviceId: signData.deviceId,
        timestamp: time,
        sign: signData.sign,
        channel: '0146921',
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
      },
    })
  },
  handleSearchResult(rawList) {
    const list = Array.isArray(rawList) ? rawList.flat() : []
    return list.map(item => ({
      id: String(item.albumId ?? item.id ?? ''),
      name: item.albumName ?? item.name ?? '',
      singer: item.singerName ?? item.singer ?? item.artist ?? '',
      img: item.img ?? item.imgUrl ?? item.albumImg ?? item.imgItems?.[0]?.img ?? '',
      publishTime: item.publishTime ?? item.publishDate ?? '',
      songCount: Number(item.songCount ?? item.totalCount) || 0,
      source: 'mg',
    })).filter(item => item.id)
  },
  async search(str, page = 1, limit = this.limit) {
    const result = await this.musicAlbumSearch(str, page, limit)
    const data = result.albumResultData
    if (!data) throw new Error('search album failed')
    return {
      list: this.handleSearchResult(data.resultList ?? data.result),
      total: Number(data.totalCount) || 0,
      page,
      limit,
      source: 'mg',
    }
  },
  /**
   * 通过AlbumId获取专辑
   * @param {*} id
   * @param {*} page
   */
  async getAlbumDetail(id, page = 1, limit = 100) {
    const list = await createHttpFetch(`http://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/queryAlbumSong?albumId=${id}&pageNo=${page}&pageSize=${limit}`)
    if (!list.songList) return Promise.reject(new Error('Get album list error.'))

    const songList = filterMusicInfoList(list.songList)
    const listInfo = await this.getAlbumInfo(id)

    return {
      list: songList || [],
      page,
      limit,
      total: listInfo.total,
      source: 'mg',
      info: {
        name: listInfo.name,
        img: listInfo.image,
        desc: listInfo.desc,
        author: listInfo.author,
        play_count: listInfo.play_count,
      },
    }
  },
  /**
   * 通过AlbumId获取专辑信息
   * @param {*} id
   * @param {*} page
   */
  async getAlbumInfo(id) {
    const info = await createHttpFetch(`https://app.c.nf.migu.cn/MIGUM3.0/resource/album/v2.0?albumId=${id}`)
    if (!info) return Promise.reject(new Error('Get album info error.'))

    return {
      name: info.title,
      image: info.imgItems.length ? info.imgItems[0].img : null,
      desc: info.summary,
      author: info.singer,
      play_count: formatPlayCount(info.opNumItem.playNum),
      total: info.totalCount,
    }
  },
  async getAlbumDetailAll(id) {
    const limit = 100
    const first = await this.getAlbumDetail(id, 1, limit)
    const list = [...first.list]
    const maxPage = Math.ceil(first.total / limit)
    for (let page = 2; page <= maxPage; page++) {
      const result = await this.getAlbumDetail(id, page, limit)
      list.push(...result.list)
    }
    return list
  },
}
