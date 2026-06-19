import { browser } from '../shim/extension'

Reflect.set(globalThis, 'browser', browser)
Reflect.set(globalThis, 'chrome', browser)

async function bootstrapWebApp() {
  const { initI18n } = await import('@/shared/i18n')
  const { initDayjs } = await import('@newtab/shared/dayjs')

  await initI18n()
  await initDayjs()

  const { main } = await import('@newtab/main')
  await main()
}

void bootstrapWebApp()
