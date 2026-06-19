// 搜索框聚焦状态（由 App.vue provide，搜索框及相关组件 inject）
export interface FocusState {
  isFocused: boolean
  focus: () => void
  blur: () => void
}
export const FOCUS_STATE: InjectionKey<FocusState> = Symbol('focusState')

// 打开设置页面
export const OPEN_SETTINGS: InjectionKey<() => void> = Symbol('openSettings')

// 打开搜索引擎偏好弹窗
export const OPEN_SEARCH_ENGINE_PREFERENCE: InjectionKey<() => void> = Symbol(
  'openSearchEnginePreference',
)

// 打开背景偏好弹窗
export const OPEN_BACKGROUND_PREFERENCE: InjectionKey<() => void> = Symbol(
  'openBackgroundPreference',
)

// 打开快速导航分组选择弹窗
export const OPEN_QUICK_LINK_GROUP_SELECT_DIALOG: InjectionKey<
  (options?: { title?: string; currentGroupId?: string }) => Promise<string | null>
> = Symbol('openQuickLinkGroupSelectDialog')

// 关闭已打开的快速导航菜单的函数
export const QUICK_LINK_OPENED_MENU_CLOSE_FN: InjectionKey<Ref<(() => void) | null>> = Symbol(
  'quickLinkOpenedMenuCloseFn',
)

// 关闭已打开的自定义搜索引擎菜单的函数
export const CUSTOM_ENGINE_OPENED_MENU_CLOSE_FN: InjectionKey<Ref<(() => void) | null>> = Symbol(
  'customEngineOpenedMenuCloseFn',
)
