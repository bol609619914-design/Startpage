import type { ElMessage, ElNotification } from 'element-plus'

declare global {
  const ElMessage: typeof ElMessage
  const ElNotification: typeof ElNotification
}

export {}
