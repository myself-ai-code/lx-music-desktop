# 专辑搜索技术方案

## 1. 背景

用户搜索「诸天尽头」时：

- 「歌曲」标签能搜到大量音频，例如：
  - `诸天尽头0001 生活远比小说更扯淡（上）`
  - 歌手：喜马拉雅
  - 专辑：`诸天尽头|牛大宝|爽文热血|多人有声剧`
- 「歌单」标签搜不到这张专辑。

原因：

- 该内容是 QQ 音乐的**专辑（album）**，不是歌单（playlist）。
- App 的搜索只有「歌曲」「歌单」两类：
  - 歌曲搜索走 QQ `DoSearchForQQMusicDesktop`，索引到专辑里的每一集；
  - 歌单搜索走 `client_music_search_songlist`，只查用户歌单（dissid），不包含专辑。
- 当前版本没有「专辑」搜索入口，所以专辑无法被检索到。

## 2. 目标与范围

本期目标：

1. 搜索页新增「专辑」标签。
2. 支持 QQ 音乐专辑关键字搜索。
3. 点击专辑打开专辑详情页，展示曲目列表，支持播放、下载、多选、分页。

范围限制：

- 首期只支持 QQ（界面中显示为「小秋音乐」）。
- 其他平台（酷狗、网易、咪咕）后续扩展；酷我暂无可用的关键字专辑搜索接口。
- 专辑详情依赖 `albumMID`，接口缺失时显示空列表。

## 3. 交互流程

```
搜索框输入关键词
  → 搜索页切换到「专辑」标签
  → 源标签显示：小秋音乐 / 聚合
  → 请求 QQ 专辑搜索
  → 展示专辑卡片（封面、专辑名、歌手、发行时间、曲目数）
  → 点击卡片
  → /album/detail?source=tx&id=<albumMID>&name=...&singer=...&pic=...&date=...&count=...
  → 拉取专辑歌曲列表（每页 30 首）
  → 分页 / 播放 / 下载 / 多选 / 播放全部
```

从其他搜索类型切到「专辑」时，如果当前源不在专辑支持的源列表内（例如酷我），自动回落到「聚合」。

## 4. 接口调研

### 4.1 QQ 专辑搜索

- 地址：`https://u.y.qq.com/cgi-bin/musics.fcg?sign=<zzcSign>`
- 复用现有 QQ 签名：`src/renderer/utils/musicSdk/tx/utils/index.js` 的 `signRequest`
- 请求体与歌曲搜索一致：

```json
{
  "comm": { "...": "..." },
  "music.search.SearchCgiService": {
    "module": "music.search.SearchCgiService",
    "method": "DoSearchForQQMusicDesktop",
    "param": {
      "grp": 1,
      "num_per_page": 20,
      "page_num": 1,
      "query": "诸天尽头",
      "remoteplace": "txt.newclient.top",
      "search_type": 2,
      "searchid": "<37 位随机 ID>"
    }
  }
}
```

- `search_type: 2` 表示专辑搜索。
- 返回：

```
req.data.body.album.list[]
req.data.meta.sum   // 专辑总数
```

- 专辑字段：

| 字段 | 含义 |
|---|---|
| `albumMID` | 专辑 MID，用于详情接口 |
| `albumID` | 数字专辑 ID |
| `albumName` | 专辑名 |
| `albumPic` | 封面地址 |
| `publicTime` | 发行时间 |
| `singerName` / `singer_list` | 歌手 |
| `song_count` | 曲目数 |

- 实测（关键词「诸天尽头」）：
  - 返回 14 张专辑；
  - 命中目标专辑 `诸天尽头|牛大宝|爽文热血|多人有声剧`，`albumMID=0023P98e2kPqad`，1484 首。

### 4.2 QQ 专辑歌曲列表

- 地址：`https://u.y.qq.com/cgi-bin/musicu.fcg`
- POST JSON，无需签名：

```json
{
  "req_0": {
    "module": "music.musichallAlbum.AlbumSongList",
    "method": "GetAlbumSongList",
    "param": {
      "albumMid": "0023P98e2kPqad",
      "begin": 0,
      "num": 30,
      "order": 2
    }
  }
}
```

- 返回：

```
req_0.data.songList[].songInfo
req_0.data.totalNum
```

- `songInfo` 与歌曲搜索返回的单曲结构一致，可直接复用
  `src/renderer/utils/musicSdk/tx/musicSearch.js` 的 `handleResult`，自动映射出音质（`types` / `_types`）、歌手、专辑、时长等。
- `num` 实测最大 500；专辑详情页每页 30，播放全部时每页 500。

## 5. 架构与实现

### 5.1 SDK 层

新增 `src/renderer/utils/musicSdk/tx/album.js`：

- `search(str, page, limit)`
  - 复用 `signRequest` + `search_type: 2`
  - 映射为统一专辑项
  - 返回 `{ list, total, limit, source: 'tx' }`
- `getAlbumDetail(albumMid, page, limit)`
  - 调 `GetAlbumSongList`
  - 用 `musicSearch.handleResult` 映射歌曲
  - 返回 `{ list, total, limit, page, source: 'tx' }`
- `getAlbumDetailAll(albumMid)`
  - 每页 500，循环拉取全部曲目，供「播放全部」使用

在 `src/renderer/utils/musicSdk/tx/index.js` 注册 `album` 能力。

专辑项数据结构（`src/renderer/store/search/album/state.ts`）：

```ts
interface AlbumItem {
  id: string          // albumMID
  name: string
  singer: string
  img: string
  publishTime: string
  songCount: number
  source: LX.OnlineSource
}
```

### 5.2 搜索 Store

新增 `src/renderer/store/search/album/`：

- `state.ts`
  - 只注册存在 `music[source].album.search` 的源（当前为 `tx`）
  - 每个源和 `all` 各维护一份 `listInfos`
- `action.ts`
  - `search(text, page, sourceId)`
  - 单源直接调 `music[source].album.search`
  - 「聚合」并发所有专辑源，拼接后按专辑名相似度排序（复用 `getSongListSearchScore`）
  - `total` 取各源最大值，`limit` 缺省 20
  - key 带 `sourceId`，支持缓存与请求竞态判断
  - 专辑搜索总数可靠，本期不接末页探测

### 5.3 搜索页

`src/renderer/views/Search/index.vue`：

- 类型标签增加「专辑」
- 模板按类型挂载对应列表组件
- 源标签随类型切换：

| 搜索类型 | 源列表 |
|---|---|
| 歌曲 | 歌曲支持源 |
| 歌单 | 歌单支持源 |
| 专辑 | 专辑支持源（QQ + 聚合） |

- 切换类型或通过 URL 进入时校验当前源，不支持则回落 `all`

### 5.4 专辑结果列表

新增 `src/renderer/views/Search/AlbumList/`：

- 卡片布局：封面、专辑名、歌手、发行时间、曲目数、来源
- 底部 `material-pagination`
- 点击卡片跳转：

```
/album/detail?source=tx&id=<albumMID>&name=...&singer=...&pic=...&date=...&count=...
```

### 5.5 专辑详情页

新增 `src/renderer/views/album/Detail/index.vue`，路由 `/album/detail`：

- 头部：封面、专辑名、歌手、发行时间、曲目数
- 按钮：播放全部、返回
- 曲目列表复用 `material-online-list`：
  - 分页、播放、下载、多选、全选、右键批量操作均复用现有能力
- 数据：
  - `getAlbumDetail(albumMid, page, 30)`
  - `toNewMusicInfo` 转换为客户端歌曲结构
- 播放全部：
  - `getAlbumDetailAll` 拉全量
  - `setTempList` + `playList(LIST_IDS.TEMP, 0)`

### 5.6 国际化

四个语言文件新增：

```json
"search__type_album": "专辑"
```

- `zh-cn`：专辑
- `zh-tw`：專輯
- `en-us`：Album
- `ko-kr`：앨범

## 6. 改动文件

新增：

```
src/renderer/utils/musicSdk/tx/album.js
src/renderer/store/search/album/state.ts
src/renderer/store/search/album/action.ts
src/renderer/store/search/album/index.ts
src/renderer/views/Search/AlbumList/index.vue
src/renderer/views/Search/AlbumList/useList.ts
src/renderer/views/album/Detail/index.vue
```

修改：

```
src/renderer/utils/musicSdk/tx/index.js
src/renderer/views/Search/index.vue
src/renderer/router.ts
src/lang/zh-cn.json
src/lang/zh-tw.json
src/lang/en-us.json
src/lang/ko-kr.json
```

## 7. 验证

1. `eslint` 检查新增/修改文件。
2. `npx webpack --config build-config/renderer/webpack.config.prod.js` 构建通过。
3. 手动验证：
   - 搜索「诸天尽头」→「专辑」标签；
   - 应出现 `诸天尽头|牛大宝|爽文热血|多人有声剧`（1484 首）；
   - 进入详情页，分页、播放、下载、多选、播放全部正常；
   - 从「专辑」切回「歌曲/歌单」时，源自动校正且页面正常。

## 8. 风险与后续

- 首期只支持 QQ；其他平台在「专辑」标签下不会出现。
- QQ 专辑搜索结果的相关度由平台决定，客户端只按专辑名做一次重排。
- 播放超大专辑（如 1484 首）需要多次请求拉全量，加入试听列表的数据量较大。
- 后续扩展其他平台时的接入点：
  - 酷狗：`kg/album.js` 已有按 ID 取详情/歌曲，需要补关键字专辑搜索；
  - 网易：`/api/cloudsearch/pc` 的 `type: 10` 可返回专辑；
  - 咪咕：`searchAll` 可开启 `album` 类型；
  - 酷我：暂未找到可用的关键字专辑搜索接口。
