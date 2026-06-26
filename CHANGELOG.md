# 更新日志

## v3.2.5

### 🐛 修复
- 修复移动端搜索框不居中的问题
- 修复移动端设置页面 select/input 组件溢出的问题
- 优化移动端设置项布局，label + switch 保持同一行显示
- 将各设置组件的 inline width 样式改为 CSS class，统一管理

### ⚡ 性能优化
- 修复 6 处 `transition: all` 为精确属性列表，减少 GPU 合成层负担
- 移除 YiYan 组件中冗余的 transition 声明
- 移除 YiYan 和 Launchpad 中 `backdrop-filter` 的 transition，避免每帧重算模糊
- 修复 4 处隐式 `transition: all`（settings.scss、action-btn.scss）
- 删除 YiYan ripple 的静态 `will-change` 声明
- 删除 index.scss 中冗余的 `text-rendering` 声明

### 💄 样式优化
- 移动端搜索框宽度改为 100%，增加左右 padding
- 移动端设置项容器 padding 缩小，增加可用宽度
- 移动端 select/input/button-group 支持换行显示
- 新增移动端专用 CSS 类：settings__select--*、settings__input--*
- 新增全局 `prefers-reduced-motion` 支持，尊重用户减少动画偏好

## v3.2.4

### ✨ 新功能
- 便签支持点击切换完成状态（删除线标记），侧边栏和个人中心均已适配

### ⚡ 性能优化
- 便签增删改操作改为本地即时更新，不再每次重新拉取全部数据，响应速度显著提升
- 个人中心便签/订阅源的增删改同步优化，操作后无需等待全量刷新

### 🧹 代码清理
- 移除未使用的 `.is-done` CSS 类（已改用内联样式方案）
- 移除无效的 `text-decoration` CSS 过渡动画（该属性不支持 transition）
- 提取 `DONE_STYLE` 常量，消除模板中的重复样式对象
- 移除 `toggleNote` 中多余的 `await load()` 调用
