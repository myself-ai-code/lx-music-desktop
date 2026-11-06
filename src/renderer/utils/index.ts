import { dateFormat, similar } from '@common/utils/common'

export * from '@common/utils/renderer'
export * from '@common/utils/nodejs'
export * from '@common/utils/common'
export * from '@common/utils/tools'

/**
 * 格式化播放数量
 * @param {*} num 数字
 */
export const formatPlayCount = (num: number): string => {
  if (num > 100000000) return `${Math.trunc(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.trunc(num / 1000) / 10}万`
  return String(num)
}


/**
 * 时间格式化
 */
export const dateFormat2 = (time: number): string => {
  let differ = Math.trunc((Date.now() - time) / 1000)
  if (differ < 60) {
    return window.i18n.t('date_format_second', { num: differ })
  } else if (differ < 3600) {
    return window.i18n.t('date_format_minute', { num: Math.trunc(differ / 60) })
  } else if (differ < 86400) {
    return window.i18n.t('date_format_hour', { num: Math.trunc(differ / 3600) })
  } else {
    return dateFormat(time)
  }
}


/**
 * 设置标题
 */
let dom_title = document.getElementsByTagName('title')[0]
export const setTitle = (title: string | null) => {
  title ||= 'LX Music'
  dom_title.innerText = title
}


// export const getProxyInfo = () => {
//   return proxy.enable && proxy.host
//     ? `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
//     : proxy.envProxy
//       ? `http://${proxy.envProxy.host}:${proxy.envProxy.port}`
//       : undefined
// }


export const getFontSizeWithScreen = (screenWidth: number = window.innerWidth): number => {
  return screenWidth <= 1440
    ? 16
    : screenWidth <= 1920
      ? 18
      : screenWidth <= 2560
        ? 20
        : screenWidth <= 2560 ? 20 : 22
}


export const deduplicationList = <T extends LX.Music.MusicInfo>(list: T[]): T[] => {
  const ids = new Set<string>()
  return list.filter(s => {
    if (ids.has(s.id)) return false
    ids.add(s.id)
    return true
  })
}

const normalizeSearchText = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

const isAscii = (text: string) => {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) return false
  }
  return true
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 判断文本是否包含关键词
 * 英文、数字按词边界匹配（避免 love 误命中 glove），中文按普通包含匹配
 */
const containsText = (text: string, keyword: string) => {
  if (!text || !keyword) return false
  if (!isAscii(keyword)) return text.includes(keyword)
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}(?=$|[^a-z0-9])`).test(text)
}

const startsWithText = (text: string, keyword: string) => {
  if (!text || !keyword || !text.startsWith(keyword)) return false
  if (!isAscii(keyword)) return true
  const next = text.charAt(keyword.length)
  return next == '' || !/[a-z0-9]/.test(next)
}

/**
 * 计算关键词分词在文本中的命中比例
 */
const getTokenCoverage = (tokens: string[], text: string) => {
  if (!tokens.length || !text) return 0
  let hit = 0
  for (const token of tokens) {
    if (containsText(text, token)) hit++
  }
  return hit / tokens.length
}

/**
 * 获取歌曲可用音质的等级，用于同分时的偏好排序
 */
const getBestQualityRank = (qualitys: any) => {
  if (!qualitys) return 0
  if (qualitys.flac24bit || qualitys.flac32bit) return 3
  if (qualitys.flac || qualitys.ape || qualitys.wav) return 2
  if (qualitys['320k']) return 1
  return 0
}

export interface SearchScoreOptions {
  /** 歌曲/歌单在该平台本次搜索结果中的名次（从 0 开始） */
  rank?: number
  /** 条目所属平台 */
  source?: LX.OnlineSource
  /** 当前生效的音源 */
  currentSource?: string | null
  /** 歌曲可用音质 */
  qualitys?: any
}

/**
 * 计算歌曲与搜索关键词的匹配分数，分数越高越靠前
 * 分数由歌名匹配、歌手匹配、编辑距离、多关键词覆盖度、平台名次、当前音源/音质偏好累加组成
 */
export const getMusicSearchScore = (keyword: string, name: string, singer: string, options: SearchScoreOptions = {}) => {
  const kw = normalizeSearchText(keyword)
  const songName = normalizeSearchText(name ?? '')
  const singerName = normalizeSearchText(singer ?? '')
  if (!kw) return 0

  const tokens = kw.split(' ').filter(Boolean)

  // 歌名匹配：0~60
  let nameScore = 0
  if (songName) {
    if (songName == kw) nameScore = 60
    else if (startsWithText(songName, kw)) nameScore = 52
    else if (containsText(songName, kw)) nameScore = 45
    else {
      nameScore = getTokenCoverage(tokens, songName) * 35
      // 搜索词比歌名更完整，例如搜「周杰伦 稻香」命中歌名「稻香」，按歌名覆盖率折算
      if (containsText(kw, songName)) nameScore = Math.max(nameScore, 15 + 20 * (songName.length / kw.length))
    }
  }

  // 歌手匹配：0~35
  let singerScore = 0
  if (singerName) {
    if (singerName == kw) singerScore = 35
    else if (startsWithText(singerName, kw)) singerScore = 30
    else if (containsText(singerName, kw)) singerScore = 26
    else {
      singerScore = getTokenCoverage(tokens, singerName) * 20
      if (containsText(kw, singerName)) singerScore = Math.max(singerScore, 10 + 15 * (singerName.length / kw.length))
    }
  }

  // 编辑距离兜底：0~15
  const fuzzyScore = similar(kw, songName) * 10 + similar(kw, singerName) * 5
  // 多关键词覆盖度：0~8
  const coverageScore = tokens.length > 1 ? getTokenCoverage(tokens, `${songName} ${singerName}`) * 8 : 0
  // 平台内名次：0~6，平台认为越相关分越高
  const rankScore = options.rank == null ? 0 : 6 / (options.rank + 1)
  // 当前音源与音质偏好：0~3.8，只用于微调分数接近的条目
  let preferScore = 0
  if (options.source && options.currentSource && options.source == options.currentSource) preferScore += 2
  if (options.qualitys) preferScore += getBestQualityRank(options.qualitys) * 0.6

  return nameScore + singerScore + fuzzyScore + coverageScore + rankScore + preferScore
}

/**
 * 计算歌单与搜索关键词的匹配分数，分数越高越靠前
 */
export const getSongListSearchScore = (keyword: string, name: string, options: Pick<SearchScoreOptions, 'rank' | 'source' | 'currentSource'> = {}) => {
  const kw = normalizeSearchText(keyword)
  const listName = normalizeSearchText(name ?? '')
  if (!kw) return 0

  const tokens = kw.split(' ').filter(Boolean)

  // 歌单名匹配：0~100
  let nameScore = 0
  if (listName) {
    if (listName == kw) nameScore = 100
    else if (startsWithText(listName, kw)) nameScore = 85
    else if (containsText(listName, kw)) nameScore = 75
    else {
      nameScore = getTokenCoverage(tokens, listName) * 60
      // 搜索词比歌单名更完整，按歌单名覆盖率折算
      if (containsText(kw, listName)) nameScore = Math.max(nameScore, 25 + 35 * (listName.length / kw.length))
    }
  }

  // 编辑距离兜底：0~15
  const fuzzyScore = similar(kw, listName) * 15
  // 多关键词覆盖度：0~8
  const coverageScore = tokens.length > 1 ? getTokenCoverage(tokens, listName) * 8 : 0
  // 平台内名次：0~6
  const rankScore = options.rank == null ? 0 : 6 / (options.rank + 1)
  // 当前音源偏好：0~2
  const preferScore = options.source && options.currentSource && options.source == options.currentSource ? 2 : 0

  return nameScore + fuzzyScore + coverageScore + rankScore + preferScore
}

export const langS2T = async(str: string) => {
  return window.lx.worker.main.langS2t(Buffer.from(str).toString('base64')).then(b64 => Buffer.from(b64, 'base64').toString())
}

export const decodeName = (str: string | null = '') => {
  if (!str) return ''
  return new window.DOMParser().parseFromString(str, 'text/html').body.textContent
}
