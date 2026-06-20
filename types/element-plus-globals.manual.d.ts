import type {
  ElMessage as ElementPlusMessage,
  ElNotification as ElementPlusNotification,
} from 'element-plus'

declare global {
  const ElMessage: typeof ElementPlusMessage
  const ElNotification: typeof ElementPlusNotification
}

export {}
