import { storage } from '@/web/shim/extension'

export const searchHistoriesStorage = storage.defineItem<string[]>('local:searchHistories', {
  fallback: [],
})
