<template>
  <div :class="$style.container">
    <div v-show="!listInfo.noItemLabel" ref="listRef" :class="$style.listContent" class="scroll">
      <ul>
        <li v-for="item in listInfo.list" :key="item.source + '_' + item.id" :class="$style.item" @click="toDetail(item)">
          <div :class="$style.image">
            <img :class="$style.img" loading="lazy" decoding="async" :src="item.img">
          </div>
          <div :class="$style.desc">
            <h4 :title="item.name">{{ item.name }}</h4>
            <p :class="$style.author" :title="item.singer">{{ item.singer }}</p>
            <p v-if="item.publishTime" :class="$style.time">{{ item.publishTime }}</p>
            <div :class="$style.album_info">
              <span v-if="item.songCount"><svg-icon name="music" />{{ item.songCount }}</span>
              <span v-if="visibleSource">{{ item.source }}</span>
            </div>
          </div>
        </li>
        <li v-for="(i, index) in 6" :key="index" :class="$style.item" style="margin-bottom: 0;height: 0;" />
      </ul>
      <div :class="$style.pagination">
        <material-pagination :count="listInfo.total" :limit="listInfo.limit" :page="listInfo.page" @btn-click="togglePage" />
      </div>
    </div>
    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
      <div v-show="listInfo.noItemLabel" :class="$style.noitem">
        <p v-text="listInfo.noItemLabel" />
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from '@common/utils/vueTools'
import { searchText } from '@renderer/store/search/state'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import type { AlbumItem } from '@renderer/store/search/album'
import useList, { type SearchSource } from './useList'

interface Props {
  sourceId: SearchSource
  page: number
}

const props = defineProps<Props>()
const router = useRouter()
const route = useRoute()

const {
  listRef,
  listInfo,
  search,
} = useList()

const visibleSource = computed(() => props.sourceId == 'all')

watch(() => [props.sourceId, props.page], ([sourceId, page]) => {
  setTimeout(() => {
    search(searchText.value, sourceId as SearchSource, (page as number) || 1)
  })
})
watch(searchText, (text) => {
  setTimeout(() => {
    search(text, props.sourceId, props.page)
  })
}, {
  immediate: true,
})

const toDetail = (item: AlbumItem) => {
  void router.push({
    path: '/album/detail',
    query: {
      source: item.source,
      id: item.id,
      name: item.name,
      singer: item.singer,
      pic: item.img,
      date: item.publishTime,
      count: String(item.songCount),
    },
  })
}

const togglePage = (page: number) => {
  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      page,
    },
  })
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.container {
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  position: relative;
}

.listContent {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  font-size: 14px;
  box-sizing: border-box;
  padding: 15px 15px 0;

  ul {
    display: flex;
    flex-flow: row wrap;
    justify-content: space-between;
  }
}
.item {
  max-width: 360px;
  width: 32%;
  box-sizing: border-box;
  display: flex;
  margin-bottom: 20px;
  cursor: pointer;
  transition: opacity @transition-normal;
  &:hover {
    opacity: .7;
  }
}
.image {
  flex: none;
  width: 40%;
  display: flex;
  background-position: center;
  background-size: cover;
  border-radius: 4px;
  overflow: hidden;
  opacity: .9;
  aspect-ratio: 1 / 1;
  box-shadow: 0 0 2px 0 rgba(0,0,0,.2);
}
.img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.desc {
  flex: auto;
  padding: 2px 15px 2px 7px;
  overflow: hidden;
  h4 {
    font-size: 14px;
    text-align: justify;
    line-height: 1.3;
    .mixin-ellipsis-2();
  }
}
.album_info {
  display: flex;
  flex-flow: row nowrap;
  gap: 15px;
  margin-top: 8px;
  font-size: 12px;
  .mixin-ellipsis-1();
  text-align: justify;
  line-height: 1.2;
  color: var(--color-font-label);
  svg {
    margin-right: 2px;
  }
}
.author {
  margin-top: 6px;
  font-size: 12px;
  .mixin-ellipsis-1();
  text-align: justify;
  line-height: 1.3;
  color: var(--color-font-label);
}
.time {
  margin-top: 3px;
  font-size: 12px;
  .mixin-ellipsis-1();
  text-align: justify;
  line-height: 1.3;
  color: var(--color-font-label);
}
.pagination {
  text-align: center;
  padding: 15px 0;
}
.noitem {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;

  p {
    font-size: 24px;
    color: var(--color-font-label);
  }
}
</style>
