# Mermaid 图表 · dsh-plugin-mermaid

一个 **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件**：在聊天回复中把已定稿的 Mermaid 代码块直接在原位置显示为图表，同时保留源码切换和复制。

> 当前 DSH 0.2.1-rc.2 原生不渲染 Mermaid：```mermaid 只会显示为等宽源码。本插件补上聊天流的展示层，不修改会话日志、不新增 Host API，也不把对话内容发送到远程渲染服务。

## 支持范围

- ✅ 已完成 Turn 的助手回复（Assistant Markdown）中的 `mermaid` / `mmd` fence
- ✅ 推理正文中的 Mermaid fence
- ✅ 流程图、时序图等 Mermaid 内置图类型
- ✅ 源码 / 图表切换、复制源码、亮暗主题、中英文界面
- ✅ 卡片内鼠标滚轮 / 触摸板缩放、拖动平移、双击复位
- ✅ 独立大图预览窗，同样支持滚轮 / 触摸板缩放、拖动平移与键盘关闭
- ✅ 多个图、重复源码、历史 Turn

不在首版范围：

- 用户消息、工具输出、文档站
- 流式输出中的逐 token 渲染（流式期间保持源码）
- 导出、编辑、图内交互链接

## 缩放与预览

图表加载完成后：

- 鼠标滚轮或触摸板双指手势直接缩放；以指针位置为中心。
- 放大后按住左键拖动平移；双击图表复位，或点工具栏中的缩放百分比复位。
- 卡片顶部有 `−` / `100%` / `+` 三个缩放控件，以及 **大图** 按钮。
- 大图窗是独立遮罩层：滚轮/双指缩放、拖动平移、`Esc` 关闭；`Tab` 焦点限制在预览窗内，关闭后回到“大图”按钮。

## 块格式

在两个独占行的围栏之间写 Mermaid：

````markdown
```mermaid
flowchart LR
    A["用户问题"] --> B["回答"]
```
````

`mmd` 也可用。节点显示文本建议使用双引号，避免 Mermaid 解析中文节点时产生歧义。

## 安装

本插件随包包含生成的 `lib/client.js`，本地路径安装不需要再构建。安装前若目录中没有 `lib/`，先在插件目录构建：

```bash
cd /Users/songer/Projects/my-dsh-plugins/dsh-plugin-mermaid
npm ci
npm run check
```

然后在 DSH 的插件管理界面添加本目录的绝对路径：

```text
/Users/songer/Projects/my-dsh-plugins/dsh-plugin-mermaid
```

安装后刷新正在使用的 Web GUI。本插件是本地路径安装，修改源码后需要重新运行 `npm run build`；刷新或 HMR 是否自动加载新 Client bundle 取决于当前 Web 开发服务状态。

卸载：在插件管理界面移除 `dsh-plugin-mermaid`，刷新页面；插件卸载时会把被隐藏的官方代码块恢复显示。

## 安全设计

Mermaid 源码是不可信模型输出，插件做了以下约束：

- 固定 Mermaid `11.16.0`，全部打进本地 bundle，不使用 CDN 或远程渲染。
- `securityLevel: "strict"`、`startOnLoad: false`、`suppressErrorRendering: true`、`htmlLabels: false`；`secure` 锁定安全、主题、文本大小和边数配置，源码里的 `%%{init}%%` 不能覆盖。
- 渲染前解析 Mermaid AST，拒绝 flowchart image 节点；只在渲染后把输出放进 `<img src="data:image/svg+xml...">`，不把 SVG 插入页面 DOM。
- Mermaid 临时测量容器在 `finally` 中删除。
- 只有原始 fence 与渲染出的代码块源码精确匹配时才处理；数量或语言有歧义时保持官方源码，不按关键字猜测。
- 流式、未完成、interrupted 消息不触发 Mermaid。

## 已知限制

- 插件是当前 DSH 版本的**兼容式展示层**。DSH 不提供 fence 级插件扩展点，所以插件依赖 `data-chat-turn`、`data-chat-flow-kind`、`md-code-block`、`data-code-block-content` 等 DOM 标记。升级 DSH 后若这些标记变化，插件会退化为只显示源码，不会崩溃或猜测。
- Mermaid 布局在浏览器主线程执行，无法被 AbortController 强制中断。插件只对视口附近的图延迟渲染，并串行执行，但很大的图仍可能短暂占用主线程。
- 当前环境没有可用的自动浏览器控制；安装后的视觉效果需要在实际 GUI 中人工确认。

## 开发

```bash
npm ci
npm run build          # 生成 lib/client.js
npm run build -- --check
npm test               # node:test，纯逻辑测试，不启动浏览器
npm run check          # 构建一致性 + 测试
```

源码结构：

- `src/client/fences.js`：Markdown fence 解析
- `src/client/mapping.js`：原始 fence 与 DSH 代码块的精确配对
- `src/client/runtime-core.js`：串行队列、源码上限、AST 安全检查
- `src/client/mermaid.js`：本地 Mermaid 运行时与主题
- `src/client/zoom.js`：纯缩放/平移数学
- `src/client/viewer.js`：共用缩放控制器与独立大图窗
- `src/client/card.js`：原位图表卡片
- `src/client/enhance.js`：Turn 范围 DOM 协调
- `src/client/index.js`：slot 注册、locale、主题订阅

依赖和再分发说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
