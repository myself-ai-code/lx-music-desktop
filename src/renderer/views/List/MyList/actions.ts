import { addListMusics, setFetchingListStatus } from '@renderer/store/list/action'
import { showSelectDialog } from '@renderer/utils/ipc'
import { appSetting } from '@renderer/store/setting'
import { basename } from '@common/utils/nodejs'


const handleAddMusics = async(listId: string, filePaths: string[], location: LX.AddMusicLocationType) => {
  const batchSize = 200
  const batchCount = Math.ceil(filePaths.length / batchSize)
  for (let batch = 0; batch < batchCount; batch++) {
    // 顶部插入时从最后一批开始，保持整次导入的歌曲顺序。
    const index = (location == 'top' ? batchCount - batch - 1 : batch) * batchSize
    const paths = filePaths.slice(index, index + batchSize)
    const musicInfos = await window.lx.worker.main.createLocalMusicInfos(paths)
    if (musicInfos.length) await addListMusics(listId, musicInfos, location)
  }
}
export const addLocalFile = async(listInfo: LX.List.MyListInfo) => {
  const { canceled, filePaths } = await showSelectDialog({
    title: window.i18n.t('lists__add_local_file_desc'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      // https://support.google.com/chromebook/answer/183093
      // 3gp, .avi, .mov, .m4v, .m4a, .mp3, .mkv, .ogm, .ogg, .oga, .webm, .wav
      { name: 'Media File', extensions: ['mp3', 'flac', 'ogg', 'oga', 'wav', 'm4a'] },
      // { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (canceled || !filePaths.length) return

  const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
  const sortedPaths = [...filePaths].sort((a, b) => collator.compare(basename(a), basename(b)) || collator.compare(a, b))
  const location = appSetting['list.addMusicLocationType']
  setFetchingListStatus(listInfo.id, true)
  try {
    await handleAddMusics(listInfo.id, sortedPaths, location)
  } finally {
    setFetchingListStatus(listInfo.id, false)
  }
}
