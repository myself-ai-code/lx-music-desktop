import { httpFetch } from '../../request'
import { decodeName } from '../../index'
import { formatSinger, objStr2JSON } from './util'

// let requestObj_list
export default {
  limit_list: 36,
  limit_song: 1000,
  limit: 20,
  async musicAlbumSearch(str, page, limit) {
    const request = httpFetch(`http://search.kuwo.cn/r.s?all=${encodeURIComponent(str)}&ft=album&itemset=web_2013&client=kt&pn=${page - 1}&rn=${limit}&rformat=json&encoding=utf8`)
    const { statusCode, body } = await request.promise
    if (statusCode != 200) throw new Error('search album failed')
    return typeof body == 'string' ? objStr2JSON(body) : body
  },
  handleSearchResult(rawList) {
    if (!Array.isArray(rawList)) return []
    return rawList.map(item => ({
      id: String(item.albumid ?? item.ALBUMID ?? item.id ?? ''),
      name: decodeName(item.album ?? item.ALBUM ?? item.name ?? ''),
      singer: decodeName(item.artist ?? item.ARTIST ?? item.singer ?? ''),
      img: item.img ?? item.hts_img ?? item.pic ?? item.PIC ?? '',
      publishTime: item.pub ?? item.releasedate ?? item.RELEASEDATE ?? item.publishTime ?? '',
      songCount: Number(item.musiccnt ?? item.songnum ?? item.SONGNUM ?? item.songCount) || 0,
      source: 'kw',
    })).filter(item => item.id)
  },
  async search(str, page = 1, limit = this.limit) {
    const result = await this.musicAlbumSearch(str, page, limit)
    const rawList = result.albumlist ?? result.abslist ?? result.data ?? []
    return {
      list: this.handleSearchResult(rawList),
      total: Number(result.total ?? result.totalnum ?? result.totalCount) || 0,
      page,
      limit,
      source: 'kw',
    }
  },
  filterListDetail(rawList, albumName, albumId) {
    // console.log(rawList)
    // console.log(rawList.length, rawList2.length)
    return rawList.map((item, inedx) => {
      let formats = item.formats.split('|')
      let types = []
      let _types = {}
      if (formats.includes('MP3128')) {
        types.push({ type: '128k', size: null })
        _types['128k'] = {
          size: null,
        }
      }
      // if (formats.includes('MP3192')) {
      //   types.push({ type: '192k', size: null })
      //   _types['192k'] = {
      //     size: null,
      //   }
      // }
      if (formats.includes('MP3H')) {
        types.push({ type: '320k', size: null })
        _types['320k'] = {
          size: null,
        }
      }
      // if (formats.includes('AL')) {
      //   types.push({ type: 'ape', size: null })
      //   _types.ape = {
      //     size: null,
      //   }
      // }
      if (formats.includes('ALFLAC')) {
        types.push({ type: 'flac', size: null })
        _types.flac = {
          size: null,
        }
      }
      if (formats.includes('HIRFLAC')) {
        types.push({ type: 'flac24bit', size: null })
        _types.flac24bit = {
          size: null,
        }
      }
      // types.reverse()
      return {
        singer: formatSinger(decodeName(item.artist)),
        name: decodeName(item.name),
        albumName,
        albumId,
        songmid: item.id,
        source: 'kw',
        interval: null,
        img: item.pic,
        lrc: null,
        otherSource: null,
        types,
        _types,
        typeUrl: {},
      }
    })
  },
  /**
   * 格式化播放数量
   * @param {*} num
   */
  formatPlayCount(num) {
    if (num > 100000000) return parseInt(num / 10000000) / 10 + '亿'
    if (num > 10000) return parseInt(num / 1000) / 10 + '万'
    return num
  },
  getAlbumListDetail(id, page, retryNum = 0) {
    if (retryNum > 2) return Promise.reject(new Error('try max num'))
    const requestObj_listDetail = httpFetch(`http://search.kuwo.cn/r.s?pn=${page - 1}&rn=${this.limit_song}&stype=albuminfo&albumid=${id}&show_copyright_off=0&encoding=utf&vipver=MUSIC_9.1.0`)
    return requestObj_listDetail.promise.then(({ statusCode, body }) => {
      if (statusCode !== 200) return this.getAlbumListDetail(id, page, ++retryNum)
      body = objStr2JSON(body)
      // console.log(body)
      if (!body.musiclist) return this.getAlbumListDetail(id, page, ++retryNum)
      body.name = decodeName(body.name)
      return {
        list: this.filterListDetail(body.musiclist, body.name, body.albumid),
        page,
        limit: this.limit_song,
        total: parseInt(body.songnum),
        source: 'kw',
        info: {
          name: body.name,
          img: body.img || body.hts_img,
          desc: decodeName(body.info),
          author: decodeName(body.artist),
          // play_count: this.formatPlayCount(body.playnum),
        },
      }
    })
  },
  async getAlbumDetail(id, page = 1) {
    return this.getAlbumListDetail(id, page)
  },
  async getAlbumDetailAll(id) {
    const result = await this.getAlbumListDetail(id, 1)
    return result.list
  },
  // getAlbumListDetail(id, page, retryNum = 0) {
  //   if (retryNum > 2) return Promise.reject(new Error('try max num'))
  //   return tokenRequest(`http://www.kuwo.cn/api/www/album/albumInfo?albumId=${id}&pn=${page}&rn=${this.limit_song}&httpsStatus=1`).then((resp) => {
  //     return resp.promise.then(({ statusCode, body }) => {
  //       console.log(body)
  //       return Promise.reject(new Error('failed'))
  //       // if (statusCode !== 200) return this.getAlbumListDetail(id, page, ++retryNum)
  //       // const data = body.data
  //       // console.log(data)
  //       // if (!data.musicList) return this.getAlbumListDetail(id, page, ++retryNum)
  //       // return {
  //       //   list: this.filterListDetail(data.musiclist),
  //       //   page,
  //       //   limit: this.limit_song,
  //       //   total: data.total,
  //       //   source: 'kw',
  //       //   info: {
  //       //     name: data.album,
  //       //     img: data.pic,
  //       //     desc: data.albuminfo,
  //       //     author: data.artist,
  //       //     play_count: this.formatPlayCount(data.playCnt),
  //       //   },
  //       // }
  //     })
  //   })
  // },
}
