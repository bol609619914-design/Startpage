# 更新日志

## v3.2.5

### 🐛 修复
- 修复移动端搜索框不居中的问题
- 修复移动端设置页面 select/input 组件溢出的问题
- 优化移动端设置项布局，label + switch 保持同一行显示
- 将各设置组件的 inline width 样式改为 CSS class，统一管理

### 💄 样式优化
- 移动端搜索框宽度改为 100%，增加左右 padding
- 移动端设置项容器 padding 缩小，增加可用宽度
- 移动端 select/input/button-group 支持换行显示
- 新增移动端专用 CSS 类：settings__select--*、settings__input--*

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
