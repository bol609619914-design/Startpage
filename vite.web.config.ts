import { fileURLToPath, URL } from 'node:url'

import Vue from '@vitejs/plugin-vue'
import postcss from 'postcss'
import AutoImport from 'unplugin-auto-import/vite'
import Icons from 'unplugin-icons/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import Markdown from 'unplugin-vue-markdown/vite'
import i18nextLoader from 'vite-plugin-i18next-loader'
import svgLoader from 'vite-svg-loader'
import type { Plugin, ViteDevServer } from 'vite'
import { defineConfig, loadEnv } from 'vite'

import { keepFirst5H2Plugin } from './scripts/mdit-keep-first-5-h2'
import { removeH1Plugin } from './scripts/mdit-remove-h1'
import { handleAuthCodeRequest } from './web/server/resendAuthCode'

const elementPlusResolver = ElementPlusResolver({
  importStyle: 'sass',
})

const elementPlusLayerPlugin: postcss.Plugin = {
  postcssPlugin: 'element-plus-layer',
  Once(root, { result }) {
    const from: string = (result.opts.from ?? '').replace(/\\/g, '/')
    if (!from.includes('/node_modules/element-plus/')) return
    if (!root.nodes?.length) return

    const nodes = root.nodes.map((n) => n.clone())
    root.removeAll()
    const layer = postcss.atRule({ name: 'layer', params: 'element-plus' })
    layer.append(...nodes)
    root.append(layer)
  },
}

const authCodeApiPlugin: Plugin = {
  name: 'retail-auth-code-api',
  configureServer(server: ViteDevServer) {
    server.middlewares.use('/api/auth/code', (req, res) => {
      void handleAuthCodeRequest(req, res)
    })
  },
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  process.env.RESEND_API_KEY ||= env.RESEND_API_KEY
  process.env.RESEND_FROM ||= env.RESEND_FROM

  return {
    root: 'web',
    publicDir: '../public',
    plugins: [
      Vue({
        include: [/\.vue$/, /\.md$/],
      }),
      i18nextLoader({
        paths: [fileURLToPath(new URL('./locales', import.meta.url))],
        namespaceResolution: 'basename',
      }),
      svgLoader(),
      Icons({ compiler: 'vue3' }),
      Markdown({
        include: [/CHANGELOG.*\.md$/],
        markdownItSetup(md) {
          md.use(removeH1Plugin)
          md.use(keepFirst5H2Plugin)
        },
      }),
      Markdown({
        include: [/\.md$/],
        exclude: [/CHANGELOG.*\.md$/],
      }),
      AutoImport({
        include: [/\.[tj]sx?$/, /\.vue$/, /\.vue\?vue/, /\.vue\.[tj]sx?\?vue/],
        imports: ['vue'],
        resolvers: [elementPlusResolver],
        viteOptimizeDeps: true,
        dts: '../types/web-auto-imports.d.ts',
      }),
      Components({
        resolvers: [elementPlusResolver],
        dts: '../types/web-components.d.ts',
      }),
      authCodeApiPlugin,
    ],
    define: {
      'import.meta.env.CHROME': 'true',
      'import.meta.env.EDGE': 'false',
      'import.meta.env.FIREFOX': 'false',
      'import.meta.env.OPERA': 'false',
      'import.meta.env.WEB': 'true',
      'import.meta.env.VITE_CLOUD_API_URL': JSON.stringify(env.VITE_CLOUD_API_URL ?? ''),
    },
    server: {
      proxy: {
        '/api/bing': {
          target: 'https://www.bing.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/bing/, ''),
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./', import.meta.url)),
        '@newtab': fileURLToPath(new URL('./entrypoints/newtab', import.meta.url)),
      },
    },
    css: {
      postcss: {
        plugins: [elementPlusLayerPlugin],
      },
      preprocessorOptions: {
        scss: {
          additionalData: `@use "@/assets/styles/element/index.scss" as *;`,
        },
      },
    },
    optimizeDeps: {
      include: [
        'element-plus/es',
        'element-plus/es/components/alert/style/index',
        'element-plus/es/components/backtop/style/index',
        'element-plus/es/components/badge/style/index',
        'element-plus/es/components/base/style/index',
        'element-plus/es/components/button/style/index',
        'element-plus/es/components/col/style/index',
        'element-plus/es/components/collapse-item/style/index',
        'element-plus/es/components/collapse-transition/style/index',
        'element-plus/es/components/collapse/style/index',
        'element-plus/es/components/color-picker/style/index',
        'element-plus/es/components/config-provider/style/index',
        'element-plus/es/components/dialog/style/index',
        'element-plus/es/components/divider/style/index',
        'element-plus/es/components/drawer/style/index',
        'element-plus/es/components/dropdown-item/style/index',
        'element-plus/es/components/dropdown-menu/style/index',
        'element-plus/es/components/dropdown/style/index',
        'element-plus/es/components/form-item/style/index',
        'element-plus/es/components/form/style/index',
        'element-plus/es/components/icon/style/index',
        'element-plus/es/components/image/style/index',
        'element-plus/es/components/input-number/style/index',
        'element-plus/es/components/input/style/index',
        'element-plus/es/components/loading/style/index',
        'element-plus/es/components/link/style/index',
        'element-plus/es/components/main/style/index',
        'element-plus/es/components/menu-item/style/index',
        'element-plus/es/components/menu/style/index',
        'element-plus/es/components/message-box/style/index',
        'element-plus/es/components/message/style/index',
        'element-plus/es/components/notification/style/index',
        'element-plus/es/components/option-group/style/index',
        'element-plus/es/components/option/style/index',
        'element-plus/es/components/overlay/style/index',
        'element-plus/es/components/popconfirm/style/index',
        'element-plus/es/components/row/style/index',
        'element-plus/es/components/scrollbar/style/index',
        'element-plus/es/components/segmented/style/index',
        'element-plus/es/components/select/style/index',
        'element-plus/es/components/slider/style/index',
        'element-plus/es/components/space/style/index',
        'element-plus/es/components/switch/style/index',
        'element-plus/es/components/tag/style/index',
        'element-plus/es/components/text/style/index',
        'element-plus/es/components/tooltip/style/index',
        'element-plus/es/components/upload/style/index',
      ],
    },
    build: {
      outDir: '../dist-web',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 2000,
    },
  }
})
