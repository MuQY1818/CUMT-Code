# Contributing

## 开发环境

- Node.js 18 或更高版本
- npm

初始化本地开发环境：

```bash
npm install
npm link
cumt setup
```

## 本地开发流程

常用命令：

```bash
npm run cumt
npm run config
npm run config:test
npm run auth:status
node --check project/cumt_code.mjs
```

如果你修改了运行时逻辑，至少建议验证：

```bash
cumt --version
cumt auth status
cumt config presets
cumt config profiles
```

## 提交要求

- 保持代码与文档简洁、可读。
- 遵循仓库既有风格与约束。
- 不要提交任何个人密钥、认证信息或本地配置文件。
- 重大修改必须补充到 [project/AGENTS.md](project/AGENTS.md)。

## 文档要求

- 使用 GitHub Flavored Markdown。
- 仓库内部文件优先使用相对链接。
- README 只保留快速上手信息，详细说明拆分到独立文档。

## 提交变更

1. 新建分支并完成修改。
2. 本地执行必要验证。
3. 更新 README 或相关文档。
4. 更新 [project/AGENTS.md](project/AGENTS.md) 中的重大修改记录。
5. 提交 Pull Request。
