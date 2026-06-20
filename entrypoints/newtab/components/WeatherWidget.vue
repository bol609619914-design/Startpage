<script setup lang="ts">
import type { Component } from 'vue'

import AcUnitOutlined from '~icons/ic/outline-ac-unit'
import AirOutlined from '~icons/ic/outline-air'
import CloudOutlined from '~icons/ic/outline-cloud'
import GrainOutlined from '~icons/ic/outline-grain'
import LocationOnOutlined from '~icons/ic/outline-location-on'
import NightsStayOutlined from '~icons/ic/outline-nights-stay'
import ThunderstormOutlined from '~icons/ic/outline-thunderstorm'
import WbSunnyOutlined from '~icons/ic/outline-wb-sunny'

import { fetchDomesticWeather } from '@/shared/cloud/startApi'

type WeatherState = {
  temp: number
  type: string
  tempUnit: string
  windUnit: string
  label: string
  updatedAt: number
}

const CACHE_KEY = 'startpage:weather-widget:v1'

const weather = ref<WeatherState | null>(readCachedWeather())
const loading = ref(false)
const error = ref(false)

const weatherMeta = computed(() => {
  if (!weather.value) {
    return {
      icon: LocationOnOutlined,
      text: loading.value ? '定位中' : '天气',
    }
  }
  return describeWeather(weather.value.type)
})

function readCachedWeather() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WeatherState
    if (!parsed.updatedAt || Date.now() - parsed.updatedAt > 30 * 60 * 1000) return null
    if (typeof parsed.type !== 'string' || typeof parsed.temp !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function saveCachedWeather(nextWeather: WeatherState) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(nextWeather))
}

async function loadWeather(force = false) {
  if (loading.value) return
  if (!force && weather.value && Date.now() - weather.value.updatedAt < 30 * 60 * 1000) return

  loading.value = true
  error.value = false
  try {
    const data = await fetchDomesticWeather()
    const nextWeather: WeatherState = {
      temp: data.temp,
      type: data.type,
      tempUnit: '°C',
      windUnit: data.wind || data.quality || data.humidity || '',
      label: data.city.replace(/市$/, ''),
      updatedAt: Date.now(),
    }
    weather.value = nextWeather
    saveCachedWeather(nextWeather)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

function describeWeather(type: string): { icon: Component; text: string } {
  if (type.includes('晴')) return { icon: WbSunnyOutlined, text: type }
  if (type.includes('云') || type.includes('阴')) return { icon: CloudOutlined, text: type }
  if (type.includes('雨')) return { icon: GrainOutlined, text: type }
  if (type.includes('雪')) return { icon: AcUnitOutlined, text: type }
  if (type.includes('雷')) return { icon: ThunderstormOutlined, text: type }
  if (type.includes('夜')) return { icon: NightsStayOutlined, text: type }
  return { icon: CloudOutlined, text: type || '天气' }
}

onMounted(() => {
  void loadWeather()
})
</script>

<template>
  <div
    class="weather-widget noselect"
    role="status"
    :aria-label="error ? '天气加载失败' : '天气'"
  >
    <span class="weather-widget__icon">
      <component :is="weatherMeta.icon" />
    </span>
    <span class="weather-widget__main">
      <template v-if="weather">
        <strong>{{ Math.round(weather.temp) }}{{ weather.tempUnit }}</strong>
        <span>{{ weatherMeta.text }}</span>
      </template>
      <template v-else>
        <strong>天气</strong>
        <span>{{ loading ? '获取中' : '线条' }}</span>
      </template>
    </span>
    <span v-if="weather" class="weather-widget__meta">
      <air-outlined />
      {{ weather.windUnit }}
    </span>
    <span v-if="weather" class="weather-widget__place">{{ weather.label }}</span>
  </div>
</template>

<style lang="scss">
.weather-widget {
  display: inline-flex;
  gap: 9px;
  align-items: center;
  max-width: min(340px, calc(100vw - 48px));
  min-height: 30px;
  padding: 4px 2px;
  margin: 0 0 8px;
  color: rgb(255 255 255 / 88%);
  text-shadow: 0 1px 8px rgb(0 0 0 / 22%);
  cursor: default;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
  transition:
    color 180ms ease,
    transform 0.25s cubic-bezier(0.5, 0, 0.5, 2);

  &:hover,
  &:focus-visible {
    color: #fff;
    background: transparent;
    transform: scale(1.1);
  }

  &:focus-visible {
    outline: none;
  }

  &__icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 22px;
    height: 22px;
    color: var(--el-color-primary);

    svg {
      width: 22px;
      height: 22px;
      stroke-width: 1.7;
    }
  }

  &__main {
    display: inline-flex;
    gap: 6px;
    align-items: baseline;
    min-width: 0;
    font-size: 12px;

    strong {
      font-size: 15px;
      font-weight: 650;
      line-height: 1;
      white-space: nowrap;
    }

    span {
      color: rgb(255 255 255 / 74%);
      white-space: nowrap;
    }
  }

  &__meta,
  &__place {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    font-size: 12px;
    color: rgb(255 255 255 / 68%);
    white-space: nowrap;
  }

  &__place {
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (width <= 520px) {
    &__meta,
    &__place {
      display: none;
    }
  }
}
</style>
