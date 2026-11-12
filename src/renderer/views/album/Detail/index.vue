<template>
  <div :class="$style.container">
    <div :class="$style.header">
      <div :class="$style.cover" :style="{ backgroundImage: 'url('+(album.pic)+')' }" />
      <div :class="$style.info">
        <h3 :title="album.name">{{ album.name }}</h3>
        <p :class="$style.singer" :title="album.singer">{{ album.singer }}</p>
        <p v-if="album.date || album.count" :class="$style.meta">
          <span v-if="album.date">{{ album.date }}</span>
          <span v-if="album.count"><svg-icon name="music" />{{ album.count }}</span>
        </p>
      </div>
      <div :class="$style.buttons">
        <base-btn :class="$style.btn" :disabled="isFetchingAll || !listInfo.list.length" @click="handlePlayAll">{{ $t('list__play') }}</base-btn>
        <base-btn :class="$style.btn" :disabled="isFetchingAll || !listInfo.list.length" @click="handleCollect">{{ $t('list__collect') }}</base-btn>
        <base-btn :class="$style.btn" :disabled="isFetchingAll || !listInfo.list.length" @click="handleDownloadAll">{{ isFetchingAll ? $t('lists__download_all_loading') : $t('lists__download_all') }}</base-btn>
        <base-btn :class="$style.btn" @click="handleBack">{{ $t('back') }}</base-btn>
      </div>
    </div>
    <div :class="$style.list">
      <material-online-list
        :hide-pagination="true"
        :page="listInfo.page"
        :limit="listInfo.limit"
        :total="listInfo.total"
        :list="listInfo.list"
        :no-item="listInfo.noItemLabel"
      />
    </div>
    <common-download-multiple-modal v-model:show="isShowDownloadMultiple" :list="downloadMusicList" teleport="#view" />
  </div>
</template>

<script lang="ts">
import { computed, reactive, ref, shallowRef, watch } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { toMD5, toNewMusicInfo } from '@renderer/utils'
import { createUserList, setTempList } from '@renderer/store/list/action'
import { userLists } from '@renderer/store/list/state'
import syncSourceList from '@renderer/store/list/syncSourceList'
import { playList } from '@renderer/core/player/action'
import { LIST_IDS } from '@common/constants'
import { useRouter } from '@common/utils/vueRouter'
import { assertApiSupport } from '@renderer/store/utils'
import { dialog } from '@renderer/plugins/Dialog'

const albumSource = ref('tx')
const albumId = ref('')
const albumName = ref('')
const albumSinger = ref('')
const albumPic = ref('')
const albumDate = ref('')
const albumCount = ref(0)

interface Query {
  source?: string
  id?: string
  name?: string
  singer?: string
  pic?: string
  date?: string
  count?: string
}

const verifyQueryParams = function(to: { query: Query, path: string }, from: any, next: (route?: { path: string, query: any }) => void) {
  const query = to.query
  if (!query.id) {
    next({ path: '/search', query: { ...query, type: 'album' } })
    return
  }
  albumSource.value = query.source ? String(query.source) : 'tx'
  albumId.value = String(query.id)
  albumName.value = query.name ? String(query.name) : ''
  albumSinger.value = query.singer ? String(query.singer) : ''
  albumPic.value = query.pic ? String(query.pic) : ''
  albumDate.value = query.date ? String(query.date) : ''
  albumCount.value = query.count ? Number(query.count) || 0 : 0
  next()
}

export default {
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const router = useRouter()

    const listInfo = reactive<{
      page: number
      limit: number
      total: number
      list: LX.Music.MusicInfoOnline[]
      noItemLabel: string
    }>({
      page: 1,
      limit: 30,
      total: 0,
      list: [],
      noItemLabel: '',
    })
    const isLoading = ref(false)
    const isFetchingAll = ref(false)
    const isShowDownloadMultiple = ref(false)
    const downloadMusicList = shallowRef<LX.Music.MusicInfoOnline[]>([])
    const BATCH_LIMIT = 100
    let loadVersion = 0
    let loadPromise: Promise<boolean> | null = null

    const album = computed(() => ({
      name: albumName.value,
      singer: albumSinger.value,
      pic: albumPic.value,
      date: albumDate.value,
      count: albumCount.value,
    }))

    const getAlbumApi = () => (music as any)[albumSource.value]?.album

    const load = async() => {
      const version = ++loadVersion
      const api = getAlbumApi()
      if (!albumId.value || !api?.getAlbumDetail) {
        listInfo.list = []
        listInfo.noItemLabel = window.i18n.t('no_item')
        return false
      }
      isLoading.value = true
      listInfo.noItemLabel = window.i18n.t('list__loading')
      try {
        let page = 1
        while (true) {
          const data = await api.getAlbumDetail(albumId.value, page, BATCH_LIMIT)
          if (version != loadVersion) return false
          const list = (data.list as LX.Music.MusicInfo[]).map(item => toNewMusicInfo(item) as LX.Music.MusicInfoOnline)
          listInfo.list.push(...list)
          listInfo.total = Number(data.total) || listInfo.list.length
          listInfo.limit = Math.max(listInfo.total, 1)
          listInfo.page = 1
          listInfo.noItemLabel = listInfo.list.length ? '' : window.i18n.t('no_item')
          if (!albumCount.value) albumCount.value = listInfo.total
          if (!list.length || listInfo.list.length >= listInfo.total) return true
          page++
        }
      } catch (err) {
        console.log(err)
        if (!listInfo.list.length) listInfo.noItemLabel = window.i18n.t('list__load_failed')
        return false
      } finally {
        if (version == loadVersion) isLoading.value = false
      }
    }

    const ensureAllLoaded = async() => {
      if (!loadPromise) loadPromise = load()
      const isComplete = await loadPromise
      if (!isComplete) throw new Error('获取专辑歌曲失败')
      return listInfo.list
    }

    const handlePlayAll = async() => {
      if (isFetchingAll.value || !albumId.value) return
      isFetchingAll.value = true
      try {
        const list = await ensureAllLoaded()
        if (!list.length) return
        const listId = `album__${albumSource.value}__${albumId.value}`
        await setTempList(listId, list)
        playList(LIST_IDS.TEMP, 0)
      } catch (err) {
        console.log(err)
      } finally {
        isFetchingAll.value = false
      }
    }

    const handleCollect = async() => {
      if (isFetchingAll.value || !albumId.value) return
      isFetchingAll.value = true
      try {
        const sourceListId = `album__${albumId.value}`
        const targetList = userLists.find(list => list.source == albumSource.value && list.sourceListId == sourceListId)
        if (targetList) {
          const confirm = await dialog.confirm({
            message: window.i18n.t('duplicate_list_tip', { name: targetList.name }),
            cancelButtonText: window.i18n.t('lists__import_part_button_cancel'),
            confirmButtonText: window.i18n.t('confirm_button_text'),
          })
          if (confirm) await syncSourceList(targetList)
          return
        }
        const list = await ensureAllLoaded()
        const listId = `album__${albumSource.value}__${albumId.value}`
        await createUserList({
          name: albumName.value,
          id: `${albumSource.value}_${toMD5(listId)}`,
          list,
          source: albumSource.value as LX.OnlineSource,
          sourceListId,
        })
      } catch (err) {
        console.log(err)
      } finally {
        isFetchingAll.value = false
      }
    }

    const handleDownloadAll = async() => {
      if (isFetchingAll.value) return
      isFetchingAll.value = true
      try {
        const targets = (await ensureAllLoaded()).filter(item => assertApiSupport(item.source))
        if (!targets.length) {
          void dialog({ message: window.i18n.t('lists__download_all_empty'), confirmButtonText: window.i18n.t('ok') })
          return
        }
        downloadMusicList.value = targets
        isShowDownloadMultiple.value = true
      } catch (err) {
        console.log(err)
        void dialog({ message: window.i18n.t('lists__download_all_failed'), confirmButtonText: window.i18n.t('ok') })
      } finally {
        isFetchingAll.value = false
      }
    }

    const handleBack = () => {
      router.back()
    }

    watch([albumSource, albumId], () => {
      loadVersion++
      loadPromise = null
      listInfo.list = []
      listInfo.total = 0
      listInfo.page = 1
      loadPromise = load()
      void loadPromise
    }, { immediate: true })

    return {
      album,
      listInfo,
      isLoading,
      isFetchingAll,
      isShowDownloadMultiple,
      downloadMusicList,
      handlePlayAll,
      handleCollect,
      handleDownloadAll,
      handleBack,
    }
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
}

.header {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  padding: 10px 15px;
  box-sizing: border-box;
}
.cover {
  flex: none;
  height: 88px;
  aspect-ratio: 1 / 1;
  border-radius: 4px;
  background-position: center;
  background-size: cover;
  opacity: .9;
  box-shadow: 0 0 2px 0 rgba(0, 0, 0, .2);
}
.info {
  flex: auto;
  min-width: 0;
  padding: 0 15px;
  h3 {
    .mixin-ellipsis-2();
    font-size: 16px;
    line-height: 1.3;
    color: var(--color-font);
  }
  .singer {
    margin-top: 5px;
    font-size: 13px;
    .mixin-ellipsis-1();
    color: var(--color-font-label);
  }
  .meta {
    display: flex;
    flex-flow: row nowrap;
    gap: 15px;
    margin-top: 5px;
    font-size: 12px;
    color: var(--color-font-label);
    svg {
      margin-right: 2px;
    }
  }
}
.buttons {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  gap: 10px;
}
.btn {
  min-width: 88px;
}
.list {
  flex: auto;
  min-height: 0;
  position: relative;
}
</style>
