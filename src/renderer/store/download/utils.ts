import { appSetting } from '@renderer/store/setting'
import { defaultList, loveList, userLists } from '@renderer/store/list/listManage'
import { filterFileName } from '@common/utils/common'
import { clipFileNameLength } from '@common/utils/tools'
import { joinPath } from '@common/utils/nodejs'

export const buildSavePath = (musicInfo: LX.Download.ListItem) => {
  let folderName = musicInfo.metadata.folderName
  if (!folderName) {
    switch (musicInfo.metadata.listId) {
      case defaultList.id:
        folderName = window.i18n.t(defaultList.name)
        break
      case loveList.id:
        folderName = window.i18n.t(loveList.name)
        break
      default:
        folderName = userLists.find(list => list.id === musicInfo.metadata.listId)?.name ??
          musicInfo.metadata.musicInfo.meta.albumName ??
          window.i18n.t(defaultList.name)
        break
    }
  }
  return joinPath(appSetting['download.savePath'], clipFileNameLength(filterFileName(folderName)))
}
