<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import ChevronRightRound from '~icons/ic/round-chevron-right'
import CloseRound from '~icons/ic/round-close'
import ConfirmationNumberRound from '~icons/ic/round-confirmation-number'
import KeyboardArrowLeftRound from '~icons/ic/round-keyboard-arrow-left'
import RssFeedRound from '~icons/ic/round-rss-feed'
import StickyNote2Round from '~icons/ic/round-sticky-note-2'

import SettingsDialog from './SettingsPage/components/SettingsDialog.vue'
import {
  createInvite,
  createNote,
  createRssSource,
  deleteNote,
  deleteRssSource,
  fetchDashboard,
  fetchInvites,
  isStartCloudEnabled,
  updateNote,
  validateInviteCode,
  type DashboardData,
  type InviteCode,
} from '@/shared/cloud/startApi'
import { useImeAwareDialog } from '@newtab/composables/useImeAwareDialog'
import type { AuthSession } from '@newtab/shared/auth'

const INVITE_ADMIN_EMAIL = 'abo_bb@qq.com'
const INVITE_CACHE_KEY = 'startpage.invites.v1'
const MOBILE_BREAKPOINT = 600
const DONE_STYLE = { color: 'var(--el-text-color-placeholder)', textDecoration: 'line-through' }

type PersonalCenterPage = 'invites' | 'notes' | 'rss'

const model = defineModel<boolean>({ required: true })
const props = defineProps<{
  session: AuthSession
}>()

const { isComposing } = useImeAwareDialog()
const { width: windowWidth } = useWindowSize({ type: 'visual' })
const busy = ref(false)
const dashboard = ref<DashboardData | null>(null)
const inviteCodes = ref<InviteCode[]>([])
const inviteMeta = ref({
  invitedCount: 0,
  invitePoints: 0,
  canCreateInvites: false,
})
const noteBody = ref('')
const rssTitle = ref('')
const rssUrl = ref('')
const activePage = ref<PersonalCenterPage>('notes')
const mobileAtMenu = ref(false)
const pageHistory = ref<PersonalCenterPage[]>([])

const isMobile = computed(() => windowWidth.value < MOBILE_BREAKPOINT)
const cloudReady = computed(() => isStartCloudEnabled())
const isInviteAdmin = computed(() => props.session.email.toLowerCase() === INVITE_ADMIN_EMAIL)
const canGoBack = computed(() => (isMobile.value ? !mobileAtMenu.value : pageHistory.value.length > 0))
const currentPageTitle = computed(() => {
  if (isMobile.value && mobileAtMenu.value) return '个人中心'
  if (activePage.value === 'invites') return '推荐码'
  if (activePage.value === 'rss') return '订阅源'
  return '便签 / 待办'
})
const menuItems = computed(() => [
  ...(isInviteAdmin.value
    ? [
        {
          key: 'invites' as const,
          title: '推荐码',
          icon: ConfirmationNumberRound,
        },
      ]
    : []),
  {
    key: 'notes' as const,
    title: '便签 / 待办',
    icon: StickyNote2Round,
  },
  {
    key: 'rss' as const,
    title: '订阅源',
    icon: RssFeedRound,
  },
])

function normalizedSessionEmail() {
  return props.session.email.trim().toLowerCase()
}

function readCachedInvites(email: string) {
  if (typeof localStorage === 'undefined') return []
  try {
    const cache = JSON.parse(localStorage.getItem(INVITE_CACHE_KEY) || '{}') as Record<string, InviteCode[]>
    return Array.isArray(cache[email]) ? cache[email] : []
  } catch {
    return []
  }
}

function writeCachedInvites(email: string, invites: InviteCode[]) {
  if (typeof localStorage === 'undefined') return
  const activeInvites = mergeInvites(invites).filter((item) => item.status === 'active')
  try {
    const cache = JSON.parse(localStorage.getItem(INVITE_CACHE_KEY) || '{}') as Record<string, InviteCode[]>
    cache[email] = activeInvites
    localStorage.setItem(INVITE_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage may be unavailable in strict privacy modes; cloud data still works.
  }
}

function mergeInvites(invites: InviteCode[]) {
  const map = new Map<string, InviteCode>()
  for (const invite of invites) {
    if (!invite.code) continue
    map.set(invite.code, invite)
  }
  return [...map.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

async function validateCachedInvites(email: string, invites: InviteCode[]) {
  const checked = await Promise.all(
    mergeInvites(invites).map(async (invite) => {
      try {
        await validateInviteCode(email, invite.code)
        return invite
      } catch {
        return null
      }
    }),
  )
  return checked.filter((item): item is InviteCode => Boolean(item))
}

async function loadDashboard() {
  if (!cloudReady.value) return
  busy.value = true
  const email = normalizedSessionEmail()
  const cachedInvites = readCachedInvites(email)
  try {
    const [remoteDashboard, remoteInvites] = await Promise.all([
      fetchDashboard(email),
      isInviteAdmin.value ? fetchInvites(email) : Promise.resolve(null),
    ])
    dashboard.value = remoteDashboard
    if (remoteInvites) {
      const invites = mergeInvites(remoteInvites.invites ?? [])
      inviteCodes.value = invites
      inviteMeta.value = {
        invitedCount: remoteInvites.invitedCount,
        invitePoints: remoteInvites.invitePoints,
        canCreateInvites: Boolean(remoteInvites.canCreateInvites),
      }
      writeCachedInvites(email, invites)
    }
  } catch (error) {
    if (isInviteAdmin.value && cachedInvites.length) {
      const validCachedInvites = await validateCachedInvites(email, cachedInvites)
      inviteCodes.value = validCachedInvites.length ? validCachedInvites : cachedInvites
      inviteMeta.value = { invitedCount: 0, invitePoints: 0, canCreateInvites: true }
    }
    ElMessage.error(error instanceof Error ? error.message : '加载失败')
  } finally {
    busy.value = false
  }
}

async function handleCreateInvite() {
  if (!isInviteAdmin.value) return
  const email = normalizedSessionEmail()
  try {
    const result = await createInvite(email)
    const invite = result.invite ?? {
      code: result.code,
      status: 'active',
      usedCount: 0,
      maxUses: 1,
      createdAt: new Date().toISOString(),
      usedAt: null,
    }
    const cachedInvites = mergeInvites([invite, ...readCachedInvites(email)])
    writeCachedInvites(email, cachedInvites)
    inviteCodes.value = mergeInvites([invite, ...inviteCodes.value, ...cachedInvites])
    inviteMeta.value = { ...inviteMeta.value, canCreateInvites: true }
    ElMessage.success(`推荐码：${result.code}`)
    await loadDashboard()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '生成失败')
  }
}

async function handleAddNote() {
  const body = noteBody.value.trim()
  if (!body) return
  try {
    const result = await createNote(props.session.email, body)
    noteBody.value = ''
    const notes = dashboard.value?.notes
    if (notes) notes.unshift({ id: result.note.id, title: result.note.title, body: result.note.body, done: 0 })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  }
}

async function handleToggleNote(id: string, done: number | boolean) {
  const note = dashboard.value?.notes?.find((n) => n.id === id)
  if (note) note.done = done ? 0 : 1
  try {
    await updateNote(props.session.email, id, { done: !done })
  } catch (error) {
    if (note) note.done = done ? 1 : 0
    ElMessage.error(error instanceof Error ? error.message : '更新失败')
  }
}

async function handleDeleteNote(id: string) {
  const notes = dashboard.value?.notes
  const idx = notes?.findIndex((n) => n.id === id) ?? -1
  const removed = idx >= 0 ? notes!.splice(idx, 1)[0] : null
  try {
    await deleteNote(props.session.email, id)
  } catch (error) {
    if (removed && notes) notes.splice(idx, 0, removed)
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

async function handleAddRss() {
  const url = rssUrl.value.trim()
  if (!url) return
  try {
    const result = await createRssSource(props.session.email, rssTitle.value.trim(), url)
    rssTitle.value = ''
    rssUrl.value = ''
    const sources = dashboard.value?.rssSources
    if (sources) sources.unshift({ id: result.source.id, title: result.source.title, url: result.source.url })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  }
}

async function handleDeleteRss(id: string) {
  const sources = dashboard.value?.rssSources
  const idx = sources?.findIndex((s) => s.id === id) ?? -1
  const removed = idx >= 0 ? sources!.splice(idx, 1)[0] : null
  try {
    await deleteRssSource(props.session.email, id)
  } catch (error) {
    if (removed && sources) sources.splice(idx, 0, removed)
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

function setActivePage(page: PersonalCenterPage) {
  if (page === activePage.value) {
    mobileAtMenu.value = false
    return
  }
  if (!isMobile.value) pageHistory.value.push(activePage.value)
  activePage.value = page
  mobileAtMenu.value = false
}

function handleMenuSelect(key: string) {
  setActivePage(key as PersonalCenterPage)
}

function handleClose(close: () => void) {
  close()
}

function handleBack() {
  if (isMobile.value) {
    if (!mobileAtMenu.value) mobileAtMenu.value = true
    return
  }
  const previousPage = pageHistory.value.pop()
  if (previousPage) activePage.value = previousPage
}

watch(
  model,
  (visible) => {
    if (visible) {
      activePage.value = isInviteAdmin.value ? 'invites' : 'notes'
      mobileAtMenu.value = isMobile.value
      pageHistory.value = []
      inviteCodes.value = isInviteAdmin.value ? readCachedInvites(normalizedSessionEmail()) : []
      void loadDashboard()
    }
  },
  { immediate: true },
)

watch(isMobile, (mobile) => {
  if (model.value) {
    mobileAtMenu.value = mobile
    pageHistory.value = []
  }
})
</script>

<template>
  <SettingsDialog
    v-model="model"
    :width="760"
    class="settings__dialog personal-center settings-container--two-column"
    :class="[
      { 'is-mobile': isMobile },
      { 'is-mobile-main-menu': isMobile && mobileAtMenu },
    ]"
    draggable
    :show-close="false"
    append-to-body
    :close-on-press-escape="!isComposing"
    header-class="settings-header noselect"
  >
    <template #header="{ close, titleId }">
      <button
        v-if="isMobile ? !mobileAtMenu : true"
        class="settings-back-btn"
        :disabled="!canGoBack"
        @click="handleBack"
        @keydown.enter="handleBack"
      >
        <el-icon color="currentColor" :size="20">
          <component :is="KeyboardArrowLeftRound" />
        </el-icon>
      </button>
      <div v-if="!(isMobile && mobileAtMenu)" :id="titleId" class="base-dialog-title">
        {{ currentPageTitle }}
      </div>
      <div v-else style="flex-grow: 1"></div>
      <div
        role="button"
        tabindex="0"
        class="base-dialog-close-btn"
        @click="handleClose(close)"
        @keydown.enter="handleClose(close)"
      >
        <component :is="CloseRound" />
      </div>
    </template>

    <template #aside>
      <aside v-if="!isMobile" class="settings-aside personal-center__aside">
        <el-menu :default-active="activePage" class="settings-menu" @select="handleMenuSelect">
          <div class="settings-menu__icon">
            <img src="/favicon.png" alt="Startpage" />
          </div>
          <el-menu-item
            v-for="item in menuItems"
            :key="item.key"
            :index="item.key"
            class="settings-menu-item noselect"
            tabindex="0"
            @keydown.enter="$event.currentTarget.click()"
          >
            <el-icon>
              <component :is="item.icon" />
            </el-icon>
            <template #title>
              <span class="menu-title">{{ item.title }}</span>
            </template>
          </el-menu-item>
        </el-menu>
      </aside>
    </template>

    <aside v-if="isMobile && mobileAtMenu" class="settings-aside personal-center__mobile-menu">
      <el-menu :default-active="activePage" class="settings-menu" @select="handleMenuSelect">
        <div class="settings-menu__icon">
          <img src="/favicon.png" alt="Startpage" />
          <span>个人中心</span>
        </div>
        <el-menu-item
          v-for="item in menuItems"
          :key="item.key"
          :index="item.key"
          class="settings-menu-item noselect"
          tabindex="0"
          @keydown.enter="$event.currentTarget.click()"
        >
          <el-icon>
            <component :is="item.icon" />
          </el-icon>
          <template #title>
            <span class="menu-title">{{ item.title }}</span>
          </template>
          <el-icon class="menu-chevron">
            <component :is="ChevronRightRound" />
          </el-icon>
        </el-menu-item>
      </el-menu>
    </aside>

    <el-scrollbar v-else class="personal-center__scroll">
      <el-alert
        v-if="!cloudReady"
        title="还没有配置 VITE_CLOUD_API_URL，云端 Dock、便签和推荐码会在部署后启用。"
        type="warning"
        :closable="false"
        show-icon
      />

      <div v-else class="personal-center__content">
        <div v-if="busy" class="personal-center__loading" aria-label="加载中"></div>
        <section v-if="activePage === 'invites' && isInviteAdmin" class="settings__items-container">
          <div class="settings__item settings__item--horizontal">
            <div>
              <div class="settings__label">推荐码</div>
              <p class="settings__item--note">
                已邀请 {{ inviteMeta.invitedCount }} 人，可无限生成
              </p>
            </div>
            <el-button type="primary" round @click="handleCreateInvite">生成推荐码</el-button>
          </div>
          <div class="personal-center__codes">
            <span
              v-for="item in inviteCodes"
              :key="item.code"
              class="personal-center__code"
            >
              {{ item.code }}
              <small>{{ item.status === 'active' ? '可用' : '已用' }}</small>
            </span>
            <p v-if="!inviteCodes.length" class="personal-center__empty">暂无推荐码</p>
          </div>
        </section>

        <section v-if="activePage === 'notes'" class="settings__items-container">
          <div class="settings__item settings__item--vertical">
            <div class="settings__label">便签 / 待办</div>
            <div class="personal-center__inline-form">
              <el-input v-model="noteBody" placeholder="今天要做什么" @keyup.enter="handleAddNote" />
              <el-button round @click="handleAddNote">添加</el-button>
            </div>
          </div>
          <div class="personal-center__list">
            <div v-for="note in dashboard?.notes ?? []" :key="note.id" class="personal-center__row">
              <el-checkbox
                :model-value="Boolean(note.done)"
                @change="handleToggleNote(note.id, note.done)"
              >
                <span :style="note.done ? DONE_STYLE : null">{{ note.body || note.title }}</span>
              </el-checkbox>
              <el-button text @click="handleDeleteNote(note.id)">删除</el-button>
            </div>
            <p v-if="!dashboard?.notes?.length" class="personal-center__empty">还没有便签</p>
          </div>
        </section>

        <section v-if="activePage === 'rss'" class="settings__items-container">
          <div class="settings__item settings__item--vertical">
            <div class="settings__label">订阅源</div>
            <div class="personal-center__stack-form">
              <el-input v-model="rssTitle" placeholder="名称，例如 技术日报" />
              <el-input
                v-model="rssUrl"
                placeholder="https://example.com/feed.xml"
                @keyup.enter="handleAddRss"
              />
              <el-button round @click="handleAddRss">添加订阅</el-button>
            </div>
          </div>
          <div class="personal-center__list">
            <div
              v-for="source in dashboard?.rssSources ?? []"
              :key="source.id"
              class="personal-center__row"
            >
              <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
              <el-button text @click="handleDeleteRss(source.id)">删除</el-button>
            </div>
            <p v-if="!dashboard?.rssSources?.length" class="personal-center__empty">还没有订阅源</p>
          </div>
        </section>
      </div>
    </el-scrollbar>
  </SettingsDialog>
</template>

<style lang="scss">
.personal-center.el-dialog {
  .el-dialog__body {
    min-width: 0;
  }

  .settings-header {
    padding: 0 30px;
  }
}

.personal-center {
  &__aside {
    .settings-menu.el-menu:not(.el-menu--collapse) {
      width: 200px;
    }
  }

  &__scroll {
    height: calc(100% - 50px);

    .el-scrollbar__view {
      min-height: 100%;
    }
  }

  &__content {
    position: relative;
    min-height: 220px;
    padding: 0 20px 20px 30px;
  }

  &__loading {
    position: absolute;
    top: 92px;
    left: 50%;
    z-index: 3;
    width: 34px;
    height: 34px;
    pointer-events: none;
    border: 3px solid color-mix(in srgb, var(--el-color-primary) 18%, transparent);
    border-top-color: var(--el-color-primary);
    border-radius: 50%;
    filter: drop-shadow(0 8px 18px rgb(0 0 0 / 14%));
    transform: translateX(-50%);
    animation: personal-center-loading-spin 780ms linear infinite;
  }

  &__inline-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-top: 10px;
  }

  &__stack-form {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }

  &__codes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  &__code {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    padding: 7px 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--el-text-color-primary);
    background: var(--el-fill-color-light);
    border-radius: 7px;

    small {
      font-family: inherit;
      color: var(--el-text-color-secondary);
    }
  }

  &__list {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }

  &__row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;

    a {
      max-width: 360px;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--el-text-color-primary);
      white-space: nowrap;
      text-decoration: none;
    }
  }

  &__empty {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--el-text-color-placeholder);
  }
}

@media (width <= 720px) {
  .personal-center.el-dialog {
    max-width: 93%;
  }

  .personal-center__content {
    padding: 0 20px 20px;
  }

  .personal-center__mobile-menu {
    flex: 1 1 auto;
    min-height: 0;
  }

  .personal-center__scroll {
    height: calc(100% - 50px);
  }
}

@keyframes personal-center-loading-spin {
  to {
    transform: translateX(-50%) rotate(360deg);
  }
}
</style>
