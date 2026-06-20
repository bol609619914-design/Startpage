<script setup lang="ts">
import { ElMessage } from 'element-plus'
import CloseRound from '~icons/ic/round-close'
import ConfirmationNumberRound from '~icons/ic/round-confirmation-number'
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

type PersonalCenterPage = 'invites' | 'notes' | 'rss'

const model = defineModel<boolean>({ required: true })
const props = defineProps<{
  session: AuthSession
}>()

const { isComposing } = useImeAwareDialog()
const busy = ref(false)
const dashboard = ref<DashboardData | null>(null)
const noteBody = ref('')
const rssTitle = ref('')
const rssUrl = ref('')
const activePage = ref<PersonalCenterPage>('notes')

const cloudReady = computed(() => isStartCloudEnabled())
const isInviteAdmin = computed(() => props.session.email.toLowerCase() === INVITE_ADMIN_EMAIL)
const currentPageTitle = computed(() => {
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

function mergeDashboardInvites(remoteDashboard: DashboardData, cachedInvites: InviteCode[]) {
  return {
    ...remoteDashboard,
    invites: mergeInvites([...(remoteDashboard.invites ?? []), ...cachedInvites]),
  }
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
    const remoteDashboard = await fetchDashboard(email)
    const validCachedInvites = isInviteAdmin.value
      ? await validateCachedInvites(email, [...cachedInvites, ...(remoteDashboard.invites ?? [])])
      : []
    if (isInviteAdmin.value) writeCachedInvites(email, validCachedInvites)
    dashboard.value = mergeDashboardInvites(remoteDashboard, validCachedInvites)
  } catch (error) {
    if (isInviteAdmin.value && cachedInvites.length) {
      dashboard.value = {
        notes: dashboard.value?.notes ?? [],
        rssSources: dashboard.value?.rssSources ?? [],
        invitedCount: dashboard.value?.invitedCount ?? 0,
        invitePoints: dashboard.value?.invitePoints ?? 0,
        canCreateInvites: true,
        invites: cachedInvites,
      }
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
    dashboard.value = {
      notes: dashboard.value?.notes ?? [],
      rssSources: dashboard.value?.rssSources ?? [],
      invitedCount: dashboard.value?.invitedCount ?? 0,
      invitePoints: dashboard.value?.invitePoints ?? 0,
      canCreateInvites: true,
      invites: mergeInvites([invite, ...(dashboard.value?.invites ?? []), ...cachedInvites]),
    }
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
    await createNote(props.session.email, body)
    noteBody.value = ''
    await loadDashboard()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  }
}

async function handleToggleNote(id: string, done: number | boolean) {
  try {
    await updateNote(props.session.email, id, { done: !done })
    await loadDashboard()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新失败')
  }
}

async function handleDeleteNote(id: string) {
  try {
    await deleteNote(props.session.email, id)
    await loadDashboard()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

async function handleAddRss() {
  const url = rssUrl.value.trim()
  if (!url) return
  try {
    await createRssSource(props.session.email, rssTitle.value.trim(), url)
    rssTitle.value = ''
    rssUrl.value = ''
    await loadDashboard()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  }
}

async function handleDeleteRss(id: string) {
  try {
    await deleteRssSource(props.session.email, id)
    await loadDashboard()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

function handleMenuSelect(key: string) {
  activePage.value = key as PersonalCenterPage
}

function handleClose(close: () => void) {
  close()
}

watch(model, (visible) => {
  if (visible) {
    activePage.value = isInviteAdmin.value ? 'invites' : 'notes'
    void loadDashboard()
  }
})
</script>

<template>
  <SettingsDialog
    v-model="model"
    :width="760"
    class="settings__dialog personal-center settings-container--two-column"
    draggable
    :show-close="false"
    append-to-body
    :close-on-press-escape="!isComposing"
    header-class="settings-header noselect"
  >
    <template #header="{ close, titleId }">
      <div :id="titleId" class="base-dialog-title">
        {{ currentPageTitle }}
      </div>
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
      <aside class="settings-aside personal-center__aside">
        <el-menu
          :default-active="activePage"
          class="settings-menu"
          @select="handleMenuSelect"
        >
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

    <el-scrollbar class="personal-center__scroll">
      <el-alert
        v-if="!cloudReady"
        title="还没有配置 VITE_CLOUD_API_URL，云端 Dock、便签和推荐码会在部署后启用。"
        type="warning"
        :closable="false"
        show-icon
      />

      <div v-else v-loading="busy" class="personal-center__content">
        <section v-if="activePage === 'invites' && isInviteAdmin" class="settings__items-container">
          <div class="settings__item settings__item--horizontal">
            <div>
              <div class="settings__label">推荐码</div>
              <p class="settings__item--note">
                已邀请 {{ dashboard?.invitedCount ?? 0 }} 人，可无限生成
              </p>
            </div>
            <el-button type="primary" round @click="handleCreateInvite">生成推荐码</el-button>
          </div>
          <div class="personal-center__codes">
            <span
              v-for="item in dashboard?.invites ?? []"
              :key="item.code"
              class="personal-center__code"
            >
              {{ item.code }}
              <small>{{ item.status === 'active' ? '可用' : '已用' }}</small>
            </span>
            <p v-if="!dashboard?.invites?.length" class="personal-center__empty">暂无推荐码</p>
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
                <span :class="{ 'is-done': Boolean(note.done) }">{{ note.body || note.title }}</span>
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

    .base-dialog-title {
      flex: 1;
      text-align: left;
    }
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
    padding: 0 20px 20px 30px;
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

  .is-done {
    color: var(--el-text-color-placeholder);
    text-decoration: line-through;
  }
}

@media (width <= 720px) {
  .personal-center.el-dialog {
    max-width: 93%;
  }

  .personal-center__aside {
    display: none;
  }

  .personal-center__content {
    padding: 0 20px 20px;
  }
}
</style>
