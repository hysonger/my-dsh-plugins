# my-dsh-plugins

[English](README.md) | **简体中文**

个人定制的 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 插件集合。所有插件在同一个 Git 仓库中维护；每个插件目录仍是独立的 DSH bundle，分别保留自己的依赖、版本、测试和文档。

## 插件

| 目录 | 当前版本 | 功能 |
|---|---|---|
| [dsh-plugin-usage-board](dsh-plugin-usage-board/README.md) | 0.7.0 | DeepSeek、GLM Coding Plan、Kimi Code 和 OpenCode Go 用量看板、输入框额度信息条及 `usage_query` 工具 |
| [dsh-plugin-kimi-web-search](dsh-plugin-kimi-web-search/README.md) | 0.2.1 | 独立的 `kimi_web_search` / `kimi_web_fetch` 工具及结果卡片 |
| [dsh-plugin-open-here](dsh-plugin-open-here/README.md) | 0.1.0 | 从终端和 Finder 在 DSH 中打开本地工作区 |
| [dsh-plugin-mermaid](dsh-plugin-mermaid/README.md) | 0.2.0 | Mermaid 图表渲染、缩放、平移和大图预览 |
| [dsh-plugin-sleep-control](dsh-plugin-sleep-control/README.md) | 0.1.0 | 会话运行时防睡眠及经管理员授权的 macOS 睡眠控制 |

## 本地安装

DSH 继续按各插件的本地绝对路径安装。将整个仓库放在固定位置后，选择需要的插件目录。例如，在仓库根目录运行：

```sh
dsh plugin --profile desktop add "$PWD/dsh-plugin-mermaid"
```

其他插件同理，替换最后的目录名即可。在新环境中，先按对应插件 README 安装其依赖。当前工作区已有的本地链接和依赖可以继续使用，整合仓库后不需要重新安装。

插件目录保持自包含，不依赖根目录的 npm workspace。各插件的 `lib/`、图标和其他运行资源继续随源码保存；修改和构建方式见各自 README。

## 检查

在仓库根目录分别运行现有检查：

```sh
npm --prefix dsh-plugin-usage-board run check
npm --prefix dsh-plugin-kimi-web-search run check
npm --prefix dsh-plugin-open-here test
npm --prefix dsh-plugin-mermaid run check
npm --prefix dsh-plugin-sleep-control run check
```

这些命令使用各插件现有的离线测试。真实上游 API 冒烟测试使用单独的 `live` 脚本，按需执行。

## 版本控制与历史

提交和分支统一在本仓库管理，插件子目录不再各自维护 `.git`。建议每次提交聚焦一个插件，并在提交说明中写明插件名或功能范围。

2026-11-15 从五个本地插件仓库整合而来：原有 21 个提交保留为目录前缀统一后的历史；Kimi 插件和防睡眠插件尚未提交的开发成果分别建立快照提交。原提交与新提交的对应关系见 [迁移说明](docs/migration/README.md) 和 [提交映射](docs/migration/commit-map.tsv)。

`_upstream/`、`research/`、`.dsh-feasibility-*/`、依赖和缓存属于本地材料，由根目录 `.gitignore` 排除。

## 许可证

许可证沿用各插件的声明、`LICENSE` 和 `THIRD_PARTY_NOTICES.md`；本次整合不调整代码、图标或第三方资源的授权范围。
