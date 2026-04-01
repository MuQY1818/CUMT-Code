# AGENTS

## 2026-03-31

- 补充根目录 `package.json`，把当前源码快照包装成可运行的本地 Node 工程。
- 运行入口改为官方发布的 `@anthropic-ai/claude-code@2.1.87`，通过 `npm start`、`npm run claude`、`npm run help`、`npm run version`、`npm run auth:status` 启动。
- 保留当前 `src/` 目录作为源码参考，不直接从该目录构建。原因是缺失原始工程根配置，并依赖 `bun:bundle`、`MACRO` 宏和私有 `@ant/*` 模块。
- 已验证本地启动链路正常，`claude --version`、`claude --help`、`claude auth status` 可用。
- 当前环境下真实模型调用失败的原因是用户级 `~/.claude/settings.json` 把请求转发到了 `https://open.bigmodel.cn/api/anthropic`，并返回“余额不足或无可用资源包”。

## 2026-04-01

- 本地运行包装层从 `@anthropic-ai/claude-code` 切换为 `@openai/codex@0.117.0`。
- 根因已确认：用户目标 provider `ylscode` 在 `~/.codex/config.toml` 中声明为 OpenAI 兼容的 `responses` API，不能通过仅修改 `ANTHROPIC_BASE_URL` 的方式接入 Claude Code 运行时。
- 更新根目录 `package.json` 脚本：`npm start`、`npm run claude`、`npm run codex` 指向 `codex`，`npm run exec` 指向 `codex exec`，`npm run auth:status` 指向 `codex login status`。
- 更新根目录 `README.md`，明确说明当前仓库的可运行入口、配置来源 `~/.codex/config.toml`、认证入口 `OPENAI_API_KEY` 与现有 `codex` 登录态，以及为什么保留 `src/` 仅作源码参考。
- 已验证基础入口正常：`codex --version` 返回 `codex-cli 0.117.0`，`codex --help` 与 `codex exec --help` 可用。
- 已完成一次真实 provider 验证：`npm run exec -- --skip-git-repo-check '只回复 OK，不调用任何工具。'` 显示 `provider: ylscode`、`model: gpt-5.4`，并成功返回 `OK`。
- 上述 Codex CLI 包装方案已被后续实现替换，不再是当前有效运行架构。
- 新增 `project/claude_ylscode_proxy.mjs`，实现本地 Anthropic Messages 到 OpenAI Responses 的协议桥接，让官方 `@anthropic-ai/claude-code` 运行时继续工作，同时把真实模型请求转发到 `ylscode`。
- 启动 Claude Code 时增加 `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1`，并由宿主注入 `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` 与 Claude 兼容模型别名，避免 `~/.claude/settings.json` 再把请求改回其它上游。
- 更新根目录 `package.json`，当前主入口恢复为代理包装层；新增 `npm run cumt` 作为品牌入口，保留 `npm run kuangbing` 作为兼容别名；`npm run auth:status` 改为输出本地 `ylscode` provider/auth 状态。
- 更新根目录 `README.md`，把本地运行说明改为当前真实架构：`CUMT Code` 品牌层 + Claude Code 运行时 + `ylscode` 本地代理。
- 品牌名从“矿兵CLI”改为 `CUMT Code`，保留矿大蓝 `#1e3264` 作为启动横幅主色。
- 启动包装层默认追加系统提示：`你是一个中国矿业大学的自主编码Agent，叫 CUMT Coder。`，用来固定品牌身份，同时不破坏 Claude Code 自带的工具与权限提示结构。
- 进一步收紧默认身份提示与适配器说明：对外自我介绍时统一说自己运行在 `CUMT Code` 中，不主动提及 `Claude Code`，只有在用户明确询问底层实现时才解释兼容层。
- 已验证真实链路可用：在设置 `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` 与 `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1` 后，`claude -p '只回复OK'` 可通过代理成功返回 `OK`。
- `project/claude_ylscode_proxy.mjs` 新增启动前自修复逻辑：自动把代理用的 `ANTHROPIC_API_KEY` 写入 Claude 全局配置的 `customApiKeyResponses.approved`，用于消除交互界面的 `Not logged in · Run /login`。
- `project/claude_ylscode_proxy.mjs` 现在向子进程注入 `DISABLE_INSTALLATION_CHECKS=1`，用于关闭 `Claude Code has switched from npm to native installer` 启动提示。
- `project/claude_ylscode_proxy.mjs` 增加运行时品牌补丁：启动前对 `node_modules/@anthropic-ai/claude-code/cli.js` 做幂等文本替换，把高频可见的 `Claude Code` 欢迎语和标题替换成 `CUMT Code`。
- `project/claude_ylscode_proxy.mjs` 统一代理 key 常量，并把 `--version` 输出改为 `CUMT Code <version> (runtime <version>)`，避免对外暴露 `Claude Code` 品牌字样。
- 继续收口首屏残留元素：包装层现在会额外屏蔽 `Opus 1M` 启动提示，并把 project onboarding 中 `CLAUDE.md` 的 `/init` 引导文案替换为更中性的仓库指南描述；同时把 help 中显示的命令名从 `claude` 改成 `cumt`。
- 进一步加入中国矿业大学校徽识别元素：启动横幅新增 `中国矿业大学 · CUMT · 1909` 校徽识别线，首屏欢迎区第一条提示前插入校徽标识，滚动横幅也合并学校识别信息，整体继续保持矿大蓝风格。
- 撤回上一版校徽识别元素：启动横幅、欢迎区和滚动文案不再显示学校识别线，统一收口为 `CUMT Code` 品牌。
- 滚动横幅文案收窄为 `自主研发，遥遥领先`，并保留矿大蓝包边样式，不再混入 `崇德尚学` 或校徽信息。
- 重做运行时矿工字符画：改成更明确的矿工头盔、矿灯、工装和靴子轮廓，同时让运行时文本替换兼容“原始 bundle”和“旧校徽补丁 bundle”两种状态，保证幂等回收。
- 已在仓库根目录执行 `git init -b main`，正式建立本地 Git 仓库；同时更新 `.gitignore`，忽略 `.serena/`、`.spec-workflow/` 和打包产物，避免把本地工作流元数据误纳入版本控制。
- 更新根目录 `package.json` 的打包边界：新增 `bin` 映射，把 CLI 命令统一指向 `project/claude_ylscode_proxy.mjs`；新增 `files` 白名单，只保留代理包装脚本进入 npm 包，为后续拆分“可发布的干净包”做准备。
- 通过 `npm pack --dry-run` 验证当前现状：在未收紧前会把 `src/` 泄露源码快照和本地工作流目录一并打入 tarball，因此当前仓库不能直接作为公开 npm 包发布；后续需要继续清理 `README.md` 和公开发布元数据。
- `project/claude_ylscode_proxy.mjs` 新增用户级配置层：运行时优先读取 `~/.cumt-code/config.json` 与 `~/.cumt-code/auth.json`，再回退到 `~/.codex/auth.json`；这样 API Key 和上游地址都不再需要写入仓库，也不会进入发布包。
- 在现有主脚本中内嵌交互式配置向导与测试命令：支持 `cumt config`、`cumt config show`、`cumt config test`、`cumt config clear-auth`，并新增 `npm run config` / `npm run config:test` 作为快捷入口。
- 运行时上游不再写死为 `ylscode` 常量，现已改为从用户配置动态读取 `provider/baseUrl/model/envKey/claudeCompatModel`；同时保留 `responses` 兼容链路，并通过 `npm run config:test` 验证默认 `ylscode -> gpt-5.4` 可返回 `OK`。
- 默认 agent 名从 `CUMT Coder` 改为 `小矿`，并同步更新默认系统提示、欢迎语、状态栏与鉴权状态输出。
- 继续收紧仓库中的个人信息风险：`.gitignore` 新增 `.env` / `.env.*` 忽略，`README.md` 顶部说明改为用户家目录配置路径，强调密钥不会写入仓库或源码包。
- 主入口文件正式统一为 `project/cumt_code.mjs`，`package.json` 的 `bin/files/scripts` 全部改为 `cumt` 命名，不再暴露旧文件名。
- 用户配置目录正式收口到独立的 `~/.cumt`：`config.json`、`auth.json`、`runtime/` 三层结构固定；`cumt config init` 会把 legacy 运行目录复制到 `~/.cumt/runtime`，但不会与旧目录混用。
- 新增多 profile 配置模型：`config.json` 采用 `activeProfile + profiles` 结构，支持 `cumt config use`、`cumt config apply-preset`、`cumt config set-model`、`cumt config rm`、`cumt config clear-auth` 等命令。
- 运行时新增热重载配置能力：代理在每次请求前执行 `refreshRuntimeConfig()`，因此切换 provider 或 model 后无需重启进程，下一条消息立即生效。
- 运行目录会自动生成 `/cumt-profiles`、`/cumt-use`、`/cumt-model`、`/cumt-preset` 四个 slash commands，用于在 CLI 会话内直接热切换 profile、provider 和 model。
- `project/cumt_code.mjs` 的对外输出进一步去旧品牌化：用户可见文案、状态行、帮助提示、banner 和认证状态统一改成 `CUMT Code` 语义；底层仅保留必要的兼容字段与环境变量。
- 内置 provider preset 继续扩展并校正：保留 `default/openai/volcengine/glm/minimax/kimi/custom`，其中 `MiniMax` 默认地址更新为 `https://api.minimaxi.com/anthropic`，`Kimi` 默认地址更新为 `https://api.moonshot.ai/anthropic`，同时把运行时可读的预设摘要补充了描述字段。
- `README.md` 已完全重写为公开可发布版本，内容聚焦安装、`~/.cumt` 目录、交互式配置、热切换、slash commands、本地网关接口、打包发布与密钥隔离策略。
- `package.json` 增补了 `config:init`、`config:show`、`config:profiles`、`config:presets` 等脚本，方便本地安装后直接验证配置与预设。
- 仓库文档层继续标准化：`README.md` 现已按开源项目首页结构重写，覆盖“项目作用、为什么有用、快速开始、帮助资源、维护者与贡献、许可证”等核心信息，并显式说明当前实际入口是 `project/cumt_code.mjs`。
- 新增根目录 `CONTRIBUTING.md`，提供最小可用的本地开发、验证和提交流程说明；README 中所有仓库内跳转均改为相对链接。
- 新增根目录 `LICENSE`，与 `package.json` 中的 `MIT` 许可证声明保持一致，避免 README 引用空链接。
- `package.json` 的发布白名单补充了 `CONTRIBUTING.md` 与 `LICENSE`，确保发布包中的 README 相对链接和许可证文件可用。
- 修复全局安装场景下的启动路径问题：运行时依赖与版本信息不再相对 `process.cwd()` 解析，而是固定相对 `project/cumt_code.mjs` 所在包目录解析，因此 `cumt` 现在可以在任意工作目录直接启动。
- 运行时启动方式从执行 `.bin/claude` 壳脚本改为 `node <runtime-cli.js>`，规避了补丁写入后立即执行脚本时偶发的 `spawn ETXTBSY`。
- 继续收口用户可见旧品牌残留：`--help` 中残留的 `ylscode` 和 `Claude` 提示已补充二次替换规则，当前帮助输出已不再出现这些旧词。
- 新增安装后可直接使用的交互式配置入口：支持 `cumt setup`，并且在首次安装、尚无 `~/.cumt` 配置时，直接执行 `cumt` 会自动进入配置向导，体验上更接近 zcf。
- README 现已插入仓库内总览图 `figures/overview.png`，并同步把该图片加入 npm 发布白名单，保证发布后的 README 图片链接不失效。
- README 首页表述已更新为“中国矿业大学的开源 CUMT Code Agent”，并明确项目定位是一个支持多种 provider 和多种 API 接入形式的编码 Agent；同时新增 `figures/setup.png` 的相对路径展示，并将该图片加入 npm 发布白名单。
