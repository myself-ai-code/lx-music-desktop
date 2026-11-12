import { getDownloadFilePath } from '@renderer/utils/music'

import {
  getMusicUrl as getOnlineMusicUrl,
  getPicUrl as getOnlinePicUrl,
  getLyricInfo as getOnlineLyricInfo,
} from './online'
import { buildLyricInfo, getCachedLyricInfo } from './utils'
import { buildSavePath } from '@renderer/store/download/utils'
import { downloadList } from '@renderer/store/download/state'
import { downloadTasksGet } from '@renderer/utils/ipc'

export const getDownloadedMusicPath = async(musicInfo: LX.Music.MusicInfoOnline): Promise<string> => {
  const findPath = async(tasks: LX.Download.ListItem[]) => {
    for (const task of tasks) {
      const original = task.metadata.musicInfo
      if (!task.isComplate || original.source != musicInfo.source || original.id != musicInfo.id) continue
      const path = await getDownloadFilePath(task, buildSavePath(task))
      if (path) return path
    }
    return ''
  }

  try {
    const path = await findPath(downloadList)
    if (path) return path
    // 下载页尚未打开时，持久化记录可能还没有载入内存。
    const savedTasks = await downloadTasksGet()
    const loadedIds = new Set(downloadList.map(task => task.id))
    return await findPath(savedTasks.filter(task => !loadedIds.has(task.id)))
  } catch (err) {
    console.error('Failed to look up downloaded music', err)
    return ''
  }
}

export const getMusicUrl = async({ musicInfo, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
  allowToggleSource?: boolean
}): Promise<string> => {
  if (!isRefresh) {
    const path = await getDownloadFilePath(musicInfo, buildSavePath(musicInfo))
    if (path) return path
  }

  return getOnlineMusicUrl({ musicInfo: musicInfo.metadata.musicInfo, isRefresh, onToggleSource, allowToggleSource })
}

export const getPicUrl = async({ musicInfo, isRefresh, listId, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  listId?: string | null
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  if (!isRefresh) {
    const path = await getDownloadFilePath(musicInfo, buildSavePath(musicInfo))
    if (path) {
      const pic = await window.lx.worker.main.getMusicFilePic(path)
      if (pic) return pic
    }

    const onlineMusicInfo = musicInfo.metadata.musicInfo
    if (onlineMusicInfo.meta.picUrl) return onlineMusicInfo.meta.picUrl
  }

  return getOnlinePicUrl({ musicInfo: musicInfo.metadata.musicInfo, isRefresh, onToggleSource }).then((url) => {
    // TODO: when listId required save url (update downloadInfo)

    return url
  })
}

export const getLyricInfo = async({ musicInfo, isRefresh, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh) {
    const lyricInfo = await getCachedLyricInfo(musicInfo.metadata.musicInfo)
    if (lyricInfo) return buildLyricInfo(lyricInfo)
  }

  return getOnlineLyricInfo({
    musicInfo: musicInfo.metadata.musicInfo,
    isRefresh,
    onToggleSource,
  }).catch(async() => {
    // 尝试读取文件内歌词
    const path = await getDownloadFilePath(musicInfo, buildSavePath(musicInfo))
    if (path) {
      const rawlrcInfo = await window.lx.worker.main.getMusicFileLyric(path)
      if (rawlrcInfo) return buildLyricInfo(rawlrcInfo)
    }

    throw new Error('failed')
  })
}
