# 安全边界与安装前审查

## 运行时数据流

常驻部分仅在 DSH 的 `llm-pi-ai/request-headers` waterfall 上工作：当 provider 精确为 `opencode-go`、URL origin 精确为 `https://opencode.ai` 且没有已有同名头时，将有效的 `request.sessionId` 写进该请求自己的 `x-opencode-session`。它不读取认证头，也不保留 Headers 对象或会话缓存。ASCII 校验拒绝 CRLF、空格、控制字符、Unicode 和超过 512 字符的标识，避免异常头注入。

主机不匹配、HTTP、非标准端口、URL 内嵌用户名/口令、自定义 provider 别名、缺失 sessionId 均不补头。已有同名头按大小写不敏感匹配并保留，避免覆盖显式配置或其他补丁。

## 一次性配置权限

安装 patch 只插入本插件。显式的 `repairProtocolOnLoad: true` 迁移请求通过已安装 DSH 的公开业务服务执行：

1. `llm.listConfigurableProviders()` 找到现有路由及其 settings namespace。
2. `settings.describe({redactSecrets:true})` 取得可编辑配置及 revision；不访问凭据服务。
3. 检查 endpoint 恰为已验证的官方 Go Chat Completions base、models 非空，且没有其他显式协议。
4. `settings.mutate()` 带读取时 revision，仅设置 `providers.opencode-go.api`。配置冲突或校验失败即停止，不重试覆盖。
5. `configEditor.edit()` 仅将本插件的迁移标志设为 false，保留其他自有字段。

DSH 自己负责 profile 锁、校验、原子写入和失败回滚。插件不读取或重写 profile YAML，不拼接文件路径，不访问 credential resolve/readRecord/set/unset，不调用系统 Keychain，也不把任何配置或错误对象写入日志。失败仅写固定文案；若第二步保存失败，下一次在已正确的 api 上只重试消费迁移标志，不反复写 provider。

两次配置保存不是跨文档事务：api 可能已修复，但标志仍为 true。必须检查两者，不能仅看“安装成功”。迁移由 Cordis inject fiber 上的一次性 `tools/result` emit 监听器触发，监听器不读取工具执行对象或结果，触发即撤销，且不会改变工具调度或输出。关闭/卸载会撤销未触发的监听器。已开始的官方配置提交应让其正常结束，不通过强杀 Host 回滚。

## 刻意不具备的能力

- 无外部依赖、构建/安装脚本、动态下载或新增子进程。
- 无 fetch/HTTP 路由、Agent Tool、RPC endpoint、浏览器脚本或全局 monkey patch。
- 不获取 API Key，不更换凭据引用，不修改其他提供商、模型列表、容量或隐私/模型访问权限。
- 不把无 sessionId 的辅助调用伪装成其他会话。
- 不修改 DSH ASAR 或 pi-ai 的安装文件；所有持久文件均通过 Plugin Manager / DSH 配置服务正常管理。

## 审查和测试

安装前应检查所有运行文件、manifest、patch、依赖/脚本字段和元数据导出，运行离线测试，并检查实际 Cordis 加载/卸载的效果。独立安全与 UX 复核、测试数量及真实调用结果记录在[调查报告](</Users/songer/Projects/my-dsh-plugins/dsh-plugin-opencode-go-session/docs/REPORT.md>)。渲染和 UI 可视检查若不可用，必须单独说明，不能以 Host 激活代替。
