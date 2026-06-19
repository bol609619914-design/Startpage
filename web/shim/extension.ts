/* eslint-disable @typescript-eslint/no-explicit-any -- 网页降级层需要兼容原扩展存储迁移函数和 browser polyfill 的宽松类型 */
/* eslint-disable @typescript-eslint/no-namespace -- 保留 Browser.* / TopSites.* 命名空间以兼容原扩展代码的类型引用 */

type StorageAreaName = 'local' | 'session' | 'sync'

export namespace Browser {
  export namespace bookmarks {
    export interface BookmarkTreeNode {
      id: string
      parentId?: string
      index?: number
      url?: string
      title: string
      dateAdded?: number
      dateGroupModified?: number
      children?: BookmarkTreeNode[]
      type?: 'bookmark' | 'folder' | 'separator'
    }
  }
}

export namespace TopSites {
  export interface MostVisitedURL {
    title: string
    url: string
    favicon?: string
  }
}

interface DefineItemOptions<T> {
  fallback: T
  version?: number
  migrations?: Record<number, (value: any) => unknown>
}

const watchers = new Map<string, Set<(value: unknown) => void>>()

function storageArea(area: StorageAreaName) {
  return area === 'session' ? sessionStorage : localStorage
}

function parseStorageKey(key: string) {
  const [maybeArea, ...rest] = key.split(':')
  const area = ['local', 'session', 'sync'].includes(maybeArea)
    ? (maybeArea as StorageAreaName)
    : 'local'
  return {
    area,
    key: rest.length ? rest.join(':') : key,
  }
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

function readValue<T>(fullKey: string, fallback: T) {
  const { area, key } = parseStorageKey(fullKey)
  const raw = storageArea(area).getItem(key)
  if (!raw) return clone(fallback)
  try {
    return JSON.parse(raw) as T
  } catch {
    return clone(fallback)
  }
}

function writeValue<T>(fullKey: string, value: T) {
  const { area, key } = parseStorageKey(fullKey)
  storageArea(area).setItem(key, JSON.stringify(value))
  watchers.get(fullKey)?.forEach((watcher) => watcher(value))
}

function removeValue(fullKey: string) {
  const { area, key } = parseStorageKey(fullKey)
  storageArea(area).removeItem(key)
}

function normalizeKeys(keys?: string | string[] | Record<string, unknown> | null) {
  if (!keys) return null
  if (typeof keys === 'string') return [keys]
  if (Array.isArray(keys)) return keys
  return Object.keys(keys)
}

function createBrowserStorageArea(area: StorageAreaName) {
  return {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      const normalizedKeys = normalizeKeys(keys)
      if (!normalizedKeys) {
        const result: Record<string, unknown> = {}
        const target = storageArea(area)
        for (let index = 0; index < target.length; index += 1) {
          const key = target.key(index)
          if (key) {
            result[key] = JSON.parse(target.getItem(key) || 'null')
          }
        }
        return result
      }

      const result: Record<string, unknown> = {}
      for (const key of normalizedKeys) {
        const raw = storageArea(area).getItem(key)
        result[key] = raw
          ? JSON.parse(raw)
          : keys && typeof keys === 'object' && !Array.isArray(keys)
            ? keys[key]
            : undefined
      }
      return result
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) {
        storageArea(area).setItem(key, JSON.stringify(value))
      }
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        storageArea(area).removeItem(key)
      }
    },
    async clear() {
      storageArea(area).clear()
    },
  }
}

export const storage = {
  defineItem<T>(key: string, options: DefineItemOptions<T>) {
    return {
      async getValue() {
        return readValue(key, options.fallback)
      },
      async setValue(value: T) {
        writeValue(key, value)
      },
      async removeValue() {
        removeValue(key)
      },
      watch(callback: (value: T) => void) {
        const list = watchers.get(key) ?? new Set()
        list.add(callback as (value: unknown) => void)
        watchers.set(key, list)
        return () => {
          list.delete(callback as (value: unknown) => void)
        }
      },
    }
  },
  async clear(area: StorageAreaName) {
    storageArea(area).clear()
  },
}

function createEventTarget() {
  const listeners = new Set<(...args: unknown[]) => void>()
  return {
    addListener(listener: (...args: unknown[]) => void) {
      listeners.add(listener)
    },
    removeListener(listener: (...args: unknown[]) => void) {
      listeners.delete(listener)
    },
    hasListener(listener: (...args: unknown[]) => void) {
      return listeners.has(listener)
    },
  }
}

export const browser: any = {
  i18n: {
    getUILanguage: () => navigator.language || 'zh-CN',
    getMessage: (key: string) => {
      const messages: Record<string, string> = {
        extension_name: 'Startpage',
      }
      return messages[key] ?? key
    },
  },
  storage: {
    local: createBrowserStorageArea('local'),
    session: createBrowserStorageArea('session'),
    sync: createBrowserStorageArea('sync'),
  },
  permissions: {
    contains: async () => true,
    request: async () => true,
    remove: async () => true,
  },
  runtime: {
    getURL: (path: string) => path,
    sendMessage: async () => undefined,
    onMessage: createEventTarget(),
  },
  alarms: {
    create: () => undefined,
    clear: async () => true,
    onAlarm: createEventTarget(),
  },
  topSites: {
    get: async (_options?: { includeFavicon?: boolean }) => [] as TopSites.MostVisitedURL[],
  },
  bookmarks: {
    get: async (id: string) => [{ id, title: '', children: [] }] as Browser.bookmarks.BookmarkTreeNode[],
    getTree: async () => [],
    search: async () => [],
    update: async () => undefined,
    move: async () => undefined,
    remove: async () => undefined,
    removeTree: async () => undefined,
    create: async ({ title, url }: { title?: string; url?: string }) =>
      ({
        id: crypto.randomUUID(),
        title: title ?? '',
        url,
      }) as Browser.bookmarks.BookmarkTreeNode,
  },
  windows: {
    create: async ({ url }: { url?: string }) => {
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    },
  },
  tabs: {
    query: async () => [],
    create: async ({ url }: { url?: string }) => {
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    },
    sendMessage: async () => undefined,
  },
  scripting: {
    executeScript: async () => [],
  },
}

export function defineBackground(callback: () => void) {
  return callback
}

export default browser
