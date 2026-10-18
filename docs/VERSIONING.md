# 版本号规范

日期：2026-10-17。本项目沿用乳腺癌工作台已落地的规则，只改渠道环境变量名。

## 1. 唯一来源

仓库根 `VERSION` 是**唯一**版本号来源，一行，语义化版本，可带预发布后缀（如 `0.1.0-beta.1`）。

`lib/version.js` 是**生成物**，由 `node scripts/build-version.mjs` 从 `VERSION` + git 生成（无 git 时 `build=local`、`commit=local`）。**不要手改**。

## 2. 显示规则

| 位置 | 显示 | 说明 |
| --- | --- | --- |
| 顶栏右侧 chip | `v0.1.0` | 可点开「关于」；≤600px 隐藏，让位给功能入口 |
| 页脚右侧 | `v0.1.0 · 2026-10-17` | 窄屏唯一常驻位置 |
| 设置 → 关于 | 版本 + 构建日期 + 来源 + 渲染说明 + 渠道 | 五项齐全 |

三处由同一个 `APP_INFO.displayVersion` 渲染，禁止各写一份。原型里 `APP_INFO` 的 `version` 必须与 `VERSION` 逐字一致。

## 3. 校验

```bash
npm run check        # 含 check-version
node scripts/check-version.mjs
```

核对 5 处：

1. `prototypes/v0.1/app.js` 的 `APP_INFO.version`
2. `prototypes/v0.1/index.html` 的 `<title>` 中 `vX.Y.Z`
3. 该 HTML 内全部 `vX.Y.Z` 字面量（去重后必须只有一个值）
4. `lib/version.js` 的 `version`
5. `package.json` 的 `version`

任一不一致即退出码 1。

## 4. 何时升版本

| 变更 | 升 |
| --- | --- |
| 新增用户可见功能 / 页面 | MINOR（0.1 → 0.2） |
| 修错别字、调间距、补文档 | PATCH（0.1.0 → 0.1.1） |
| 不兼容的数据结构变更 | MAJOR（0.x 阶段仍慎重） |
| 换原型目录（v0.1 → v0.2） | 同时改 `scripts/check-version.mjs` 的路径并升 MINOR |

**升版本三步**：改 `VERSION` → `npm run build:version` → `npm run check`。提交信息写清升版原因。

## 5. 渠道

环境变量 `LYMBELL_CHANNEL` 三选一：

| 值 | 标签 |
| --- | --- |
| `prototype`（默认） | 交互原型 · 未接入 DSH |
| `beta` | 测试版 · 数据仅在本机 |
| `stable` | 正式版 · 数据仅在本机 |

发布时由构建环境注入，不在代码里写死。

## 6. 禁止

- 在页面里手写第二个版本号（含"设计草案 v0.1"这类描述——描述可以留，但不能代替版本号）。
- 用 `0.0.0`、`latest`、日期充当版本。
- 改了版本不跑 `npm run check`。
