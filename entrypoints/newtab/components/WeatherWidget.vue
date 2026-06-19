<script setup lang="ts">
import type { Component } from 'vue'

import AcUnitOutlined from '~icons/ic/outline-ac-unit'
import AirOutlined from '~icons/ic/outline-air'
import CloudOutlined from '~icons/ic/outline-cloud'
import GrainOutlined from '~icons/ic/outline-grain'
import LocationOnOutlined from '~icons/ic/outline-location-on'
import NightsStayOutlined from '~icons/ic/outline-nights-stay'
import RefreshOutlined from '~icons/ic/outline-refresh'
import ThunderstormOutlined from '~icons/ic/outline-thunderstorm'
import WbSunnyOutlined from '~icons/ic/outline-wb-sunny'

type WeatherCurrent = {
  temperature_2m?: number
  weather_code?: number
  is_day?: number
  wind_speed_10m?: number
}

type WeatherResponse = {
  current?: WeatherCurrent
  current_units?: {
    temperature_2m?: string
    wind_speed_10m?: string
  }
}

type WeatherState = {
  temp: number
  code: number
  isDay: boolean
  wind: number
  tempUnit: string
  windUnit: string
  label: string
  updatedAt: number
}

const CACHE_KEY = 'startpage:weather-widget:v1'
const FALLBACK_LOCATION = {
  latitude: 31.2304,
  longitude: 121.4737,
  label: '上海',
}

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
  return describeWeather(weather.value.code, weather.value.isDay)
})

function readCachedWeather() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WeatherState
    if (!parsed.updatedAt || Date.now() - parsed.updatedAt > 30 * 60 * 1000) return null
    return parsed
  } catch {
    return null
  }
}

function saveCachedWeather(nextWeather: WeatherState) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(nextWeather))
}

function getPosition() {
  return new Promise<typeof FALLBACK_LOCATION>((resolve) => {
    if (!navigator.geolocation) {
      resolve(FALLBACK_LOCATION)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: '当前位置',
        })
      },
      () => resolve(FALLBACK_LOCATION),
      {
        enableHighAccuracy: false,
        maximumAge: 30 * 60 * 1000,
        timeout: 3500,
      },
    )
  })
}

async function loadWeather(force = false) {
  if (loading.value) return
  if (!force && weather.value && Date.now() - weather.value.updatedAt < 30 * 60 * 1000) return

  loading.value = true
  error.value = false
  try {
    const location = await getPosition()
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: 'temperature_2m,weather_code,is_day,wind_speed_10m',
      timezone: 'auto',
      forecast_days: '1',
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
    if (!response.ok) throw new Error('weatherRequestFailed')
    const data = (await response.json()) as WeatherResponse
    const current = data.current
    if (!current || typeof current.temperature_2m !== 'number') throw new Error('weatherEmpty')

    const nextWeather: WeatherState = {
      temp: current.temperature_2m,
      code: current.weather_code ?? 0,
      isDay: current.is_day !== 0,
      wind: current.wind_speed_10m ?? 0,
      tempUnit: data.current_units?.temperature_2m ?? '°C',
      windUnit: data.current_units?.wind_speed_10m ?? 'km/h',
      label: location.label,
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

function describeWeather(code: number, isDay: boolean): { icon: Component; text: string } {
  if (code === 0) return { icon: isDay ? WbSunnyOutlined : NightsStayOutlined, text: '晴' }
  if ([1, 2, 3].includes(code)) return { icon: CloudOutlined, text: '多云' }
  if ([45, 48].includes(code)) return { icon: CloudOutlined, text: '雾' }
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { icon: GrainOutlined, text: '雨' }
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: AcUnitOutlined, text: '雪' }
  if ([95, 96, 99].includes(code)) return { icon: ThunderstormOutlined, text: '雷雨' }
  return { icon: CloudOutlined, text: '天气' }
}

onMounted(() => {
  void loadWeather()
})
</script>

<template>
  <button
    class="weather-widget noselect"
    type="button"
    :aria-label="error ? '刷新天气' : '天气'"
    @click="loadWeather(true)"
  >
    <span class="weather-widget__icon">
      <component :is="error ? RefreshOutlined : weatherMeta.icon" />
    </span>
    <span class="weather-widget__main">
      <template v-if="weather">
        <strong>{{ Math.round(weather.temp) }}{{ weather.tempUnit }}</strong>
        <span>{{ weatherMeta.text }}</span>
      </template>
      <template v-else>
        <strong>{{ error ? '重试' : '天气' }}</strong>
        <span>{{ loading ? '获取中' : '线条' }}</span>
      </template>
    </span>
    <span v-if="weather" class="weather-widget__meta">
      <air-outlined />
      {{ Math.round(weather.wind) }}{{ weather.windUnit }}
    </span>
    <span v-if="weather" class="weather-widget__place">{{ weather.label }}</span>
  </button>
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
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 1px solid rgb(255 255 255 / 30%);
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
  transition:
    border-color 180ms ease,
    color 180ms ease;

  &:hover,
  &:focus-visible {
    color: #fff;
    background: transparent;
    border-bottom-color: rgb(255 255 255 / 64%);
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
