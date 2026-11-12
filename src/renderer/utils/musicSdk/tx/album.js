import { httpFetch } from '../../request'
import { signRequest } from './utils'
import musicSearch from './musicSearch'

const SEARCH_TYPE_ALBUM = 2

export default {
  limit: 20,
  total: 0,
  page: 0,

  musicAlbumSearch(str, page, limit, retryNum = 0) {
    if (retryNum > 5) return Promise.reject(new Error('搜索失败'))
    const searchRequest = signRequest({
      comm: {
        _channelid: '0',
        _os_version: '6.2.9200-2',
        ct: '19',
        cv: '2151',
        guid: '1F70E520B2EAA7D25E11760783C53CA9',
        patch: '118',
        psrf_access_token_expiresAt: 0,
        psrf_qqaccess_token: '',
        psrf_qqopenid: '',
        psrf_qqunionid: '',
        tmeAppID: 'qqmusic',
        tmeLoginType: 0,
        uin: '0',
        wid: '7223299733393904640',
      },
      'music.search.SearchCgiService': {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicDesktop',
        param: {
          grp: 1,
          num_per_page: limit,
          page_num: page,
          query: str,
          remoteplace: 'txt.newclient.top',
          search_type: SEARCH_TYPE_ALBUM,
          searchid: musicSearch.getSearchId(),
        },
      },
    })
    return searchRequest.then(({ body }) => {
      const req = body?.['music.search.SearchCgiService'] ?? body?.req
      if (!req || body.code != 0 || req.code != 0) return this.musicAlbumSearch(str, page, limit, ++retryNum)
      return req.data
    })
  },

  handleResult(rawList) {
    if (!rawList || !Array.isArray(rawList)) return []
    return rawList.map(item => {
      return {
        id: item.albumMID || String(item.albumID ?? ''),
        name: item.albumName ?? '',
        singer: item.singerName ?? (item.singer_list ?? []).map(s => s.name).filter(Boolean).join('、'),
        img: item.albumPic ?? '',
        publishTime: item.publicTime ?? '',
        songCount: Number(item.song_count) || 0,
        source: 'tx',
      }
    }).filter(item => item.id)
  },

  search(str, page = 1, limit) {
    if (limit == null) limit = this.limit
    return this.musicAlbumSearch(str, page, limit).then(({ body, meta }) => {
      const list = this.handleResult(body.album?.list)
      this.total = meta?.sum ?? list.length
      this.page = page
      return {
        list,
        limit,
        total: this.total,
        source: 'tx',
      }
    })
  },

  getAlbumDetail(albumMid, page = 1, limit = 30) {
    const begin = (page - 1) * limit
    return httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://y.qq.com/',
      },
      body: JSON.stringify({
        req_0: {
          module: 'music.musichallAlbum.AlbumSongList',
          method: 'GetAlbumSongList',
          param: {
            albumMid,
            begin,
            num: limit,
            order: 2,
          },
        },
      }),
    }).promise.then(({ body }) => {
      const data = body?.req_0?.data
      if (!data?.songList) throw new Error('获取专辑歌曲失败')
      return {
        list: musicSearch.handleResult(data.songList.map(item => item.songInfo)),
        total: Number(data.totalNum) || 0,
        limit,
        page,
        source: 'tx',
      }
    })
  },

  async getAlbumDetailAll(albumMid) {
    const limit = 500
    const first = await this.getAlbumDetail(albumMid, 1, limit)
    const list = first.list
    if (first.total <= list.length) return list
    const maxPage = Math.ceil(first.total / limit)
    for (let page = 2; page <= maxPage; page++) {
      const data = await this.getAlbumDetail(albumMid, page, limit)
      list.push(...data.list)
    }
    return list
  },
}
