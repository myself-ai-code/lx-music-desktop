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
        <base-btn :class="$style.btn" :disabled="isLoading || !album.count" @click="handlePlayAll">{{ $t('list__play') }}</base-btn>
        <base-btn :class="$style.btn" @click="handleBack">{{ $t('back') }}</base-btn>
      </div>
    </div>
    <div :class="$style.list">
      <material-online-list
        :page="listInfo.page"
        :limit="listInfo.limit"
        :total="listInfo.total"
        :list="listInfo.list"
        :no-item="listInfo.noItemLabel"
        @toggle-page="togglePage"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { computed, reactive, ref, watch } from '@common/utils/vueTools'
import music from '@renderer/utils/musicSdk'
import { toNewMusicInfo } from '@renderer/utils'
import { setTempList } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player/action'
import { LIST_IDS } from '@common/constants'
import { useRouter } from '@common/utils/vueRouter'

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

    const album = computed(() => ({
      name: albumName.value,
      singer: albumSinger.value,
      pic: albumPic.value,
      date: albumDate.value,
      count: albumCount.value,
    }))

    const getAlbumApi = () => (music as any)[albumSource.value]?.album

    const load = async(page = 1) => {
      const api = getAlbumApi()
      if (!albumId.value || !api?.getAlbumDetail) {
        listInfo.list = []
        listInfo.noItemLabel = window.i18n.t('no_item')
        return
      }
      isLoading.value = true
      if (!listInfo.list.length) listInfo.noItemLabel = window.i18n.t('list__loading')
      try {
        const data = await api.getAlbumDetail(albumId.value, page, listInfo.limit)
        const list = (data.list as LX.Music.MusicInfo[]).map(item => toNewMusicInfo(item) as LX.Music.MusicInfoOnline)
        listInfo.list = list
        listInfo.total = data.total
        listInfo.page = page
        listInfo.noItemLabel = list.length ? '' : (page == 1 ? window.i18n.t('no_item') : '')
        if (!albumCount.value) albumCount.value = data.total
      } catch (err) {
        console.log(err)
        listInfo.list = []
        listInfo.noItemLabel = window.i18n.t('list__load_failed')
      } finally {
        isLoading.value = false
      }
    }

    const togglePage = (page: number) => {
      void load(page)
    }

    const handlePlayAll = async() => {
      const api = getAlbumApi()
      if (isLoading.value || !albumId.value || !api?.getAlbumDetailAll) return
      isLoading.value = true
      try {
        const rawList = await api.getAlbumDetailAll(albumId.value)
        const list = (rawList as LX.Music.MusicInfo[]).map(item => toNewMusicInfo(item) as LX.Music.MusicInfoOnline)
        if (!list.length) return
        const listId = `album__${albumSource.value}__${albumId.value}`
        await setTempList(listId, list)
        playList(LIST_IDS.TEMP, 0)
      } catch (err) {
        console.log(err)
      } finally {
        isLoading.value = false
      }
    }

    const handleBack = () => {
      router.back()
    }

    watch([albumSource, albumId], () => {
      listInfo.list = []
      listInfo.total = 0
      listInfo.page = 1
      void load(1)
    }, { immediate: true })

    return {
      album,
      listInfo,
      isLoading,
      togglePage,
      handlePlayAll,
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
