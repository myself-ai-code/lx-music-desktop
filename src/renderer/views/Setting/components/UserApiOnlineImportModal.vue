<template>
  <material-modal :show="show" teleport="#view" @close="handleClose" @after-enter="$refs.input.focus()">
    <main :class="$style.main">
      <h2>{{ $t('user_api_import_online__title') }}</h2>
      <base-input
        ref="input"
        v-model="url"
        :class="$style.input"
        type="url"
        :placeholder="$t('user_api_import_online__input_tip')"
        @submit="handleSubmit" @blur="verify"
      />
      <div :class="$style.footer">
        <base-btn :class="$style.btn" @click="handleClose">{{ $t('btn_close') }}</base-btn>
        <base-btn :class="$style.btn" :disabled="disabled" @click="handleSubmit">{{ btnText }}</base-btn>
      </div>
    </main>
  </material-modal>
</template>

<script>
import { dialog } from '@renderer/plugins/Dialog'
import { httpFetch } from '@renderer/utils/request'

export default {
  props: {
    show: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:show', 'import'],
  data() {
    return {
      url: '',
      disabled: false,
      btnText: '',
    }
  },
  watch: {
    show(n) {
      if (n) {
        this.url = ''
        this.disabled = false
        this.btnText = this.$t('user_api_import_online__input_confirm')
      }
    },
  },
  methods: {
    handleClose() {
      this.$emit('update:show', false)
    },
    verify() {
      if (!/^https?:\/\//.test(this.url)) this.url = ''
      return this.url
    },
    async handleSubmit() {
      let url = this.verify()
      if (!url) return
      this.disabled = true
      this.btnText = this.$t('user_api_import_online__input_loading')
      // 根据 URL 扩展名判断文件类型
      let urlLower = url.toLowerCase()
      if (urlLower.endsWith('.js')) {
        let script
        try {
          script = await httpFetch(url, { follow_max: 3 }).promise.then(resp => resp.body)
        } catch (err) {
          void dialog(this.$t('user_api_import__failed', { message: err.message }))
          return
        } finally {
          this.disabled = false
          this.btnText = this.$t('user_api_import_online__input_confirm')
        }
        if (script.length > 9_000_000) {
          void dialog(this.$t('user_api_import__failed', {
            message: 'Too large script',
            confirm: this.$t('ok'),
          }))
          return
        }
        this.$emit('import', script)
      } else if (urlLower.endsWith('.json')) {
        // 获取文件内容
        const content = await httpFetch(url).promise.then(resp => {
          // 确保 content 是字符串
          if (typeof resp.body === 'string') {
            return resp.body
          } else if (resp.body instanceof Buffer) {
            return resp.body.toString('utf8')
          } else {
            // 如果是 JSON 对象，转换为字符串
            return JSON.stringify(resp.body)
          }
        })
        // 处理 JSON 文件
        let urlArray
        try {
          // 如果 resp.body 已解析为 JSON，避免重复解析
          if (typeof content !== 'string') {
            urlArray = content // 假设已解析
          } else {
            urlArray = JSON.parse(content)
          }
          if (!Array.isArray(urlArray)) {
            void dialog(this.$t('user_api_import__failed', { message: 'JSON content is not a valid array' }))
            return
          }
        } catch (parseErr) {
          void dialog(this.$t('user_api_import__failed', { message: parseErr.message }))
          return
        }
        // 遍历 JSON 数组中的所有 URL
        for (const scriptUrl of urlArray) {
          if (typeof scriptUrl !== 'string' || !scriptUrl.startsWith('http')) {
            continue
          }
          const encodedUrl = encodeURI(scriptUrl)
          let scriptContent
          try {
            scriptContent = await httpFetch(encodedUrl, { follow_max: 3 }).promise.then(resp => resp.body)
            // 处理每个脚本
            this.$emit('import', scriptContent)
          } catch (err) {
            void dialog(this.$t('user_api_import__failed', { message: err.message }))
          }
        }
      }
      this.handleClose()
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 0 15px;
  width: 450px;
  min-width: 280px;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  h2 {
    font-size: 13px;
    color: var(--color-font);
    line-height: 1.3;
    word-break: break-all;
    // text-align: center;
    padding: 15px 0 8px;
  }
}

.input {
  // width: 100%;
  // height: 26px;
  padding: 8px 8px;
}

.footer {
  margin: 20px 0 15px auto;
}

.btn {
  // box-sizing: border-box;
  // margin-left: 15px;
  // margin-bottom: 15px;
  // height: 36px;
  // line-height: 36px;
  // padding: 0 10px !important;
  min-width: 70px;
  // .mixin-ellipsis-1();

  + .btn {
    margin-left: 10px;
  }
}


</style>
