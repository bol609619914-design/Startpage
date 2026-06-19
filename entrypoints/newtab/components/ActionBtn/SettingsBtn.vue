<script lang="ts" setup>
import { useTranslation } from 'i18next-vue'
import SearchRound from '~icons/ic/round-search'
import SettingsRound from '~icons/ic/round-settings'
import WallpaperRound from '~icons/ic/round-wallpaper'

import { useSettingsStore } from '@/shared/settings'

import usePerfClasses from '@newtab/composables/usePerfClasses'

const emit = defineEmits<{
  (e: 'open-settings'): void
  (e: 'open-changelog'): void
  (e: 'open-about'): void
  (e: 'open-search-engine-preference'): void
  (e: 'open-faq'): void
  (e: 'open-background-switcher'): void
}>()

const { t } = useTranslation()
const settings = useSettingsStore()

// Derive dropdown placement from the effective button corner position.
// Dock forces top; left/right preference is preserved.
const dropdownPlacement = computed(() => {
  const pos = settings.layout.actionBtnPosition
  const effectivePos =
    settings.dock.enabled && pos.startsWith('bottom')
      ? (pos.replace('bottom', 'top') as typeof pos)
      : pos
  const vertical = effectivePos.startsWith('top') ? 'bottom' : 'top'
  const horizontal = effectivePos.endsWith('left') ? 'start' : 'end'
  return `${vertical}-${horizontal}` as const
})

const perf = usePerfClasses(() => ({
  transparent: settings.perf.actionBtns.transparent,
  blur: settings.perf.actionBtns.blur,
}))
const popperPerfClass = perf('setting-btn__popper')
</script>

<template>
  <el-dropdown
    style="display: block"
    :popper-class="popperPerfClass"
    :show-arrow="false"
    :placement="dropdownPlacement"
    trigger="click"
    @contextmenu.prevent.stop
  >
    <div role="button" tabindex="0" class="action-btn setting-btn">
      <el-icon><settings-round /></el-icon>
    </div>
    <template #dropdown>
      <el-dropdown-menu class="noselect">
        <el-dropdown-item :icon="SettingsRound" @click="emit('open-settings')">
          <span>{{ t('settings:title') }}</span>
        </el-dropdown-item>
        <el-dropdown-item :icon="SearchRound" @click="emit('open-search-engine-preference')">
          <span>{{ t('menu.searchEnginePreference') }}</span>
        </el-dropdown-item>
        <el-dropdown-item :icon="WallpaperRound" @click="emit('open-background-switcher')">
          <span>{{ t('menu.backgroundPreference') }}</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
