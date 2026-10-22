# 变更记录

## 未发布 — 2026-10-22（MinerU 统一口径）

- **显式提交 `model_version: 'pipeline'`**：原先不传该参数、吃 MinerU 服务端默认值，等于把口径交给上游；现在写死并导出 `MINERU_MODEL_DEFAULT`，显式传 vlm 仍可覆盖。
- **Token 优先级改为文件优先**：显式 > `.secrets/mineru.json` > `MINERU_TOKEN`（2026-10-22 跨仓统一）。
- 单测 68 条仍全绿。

## 2026-10-20 · 开发快照（包版本 0.3.0）

- 补齐宿主入口、身份/布局/桥接模块、构建生成客户端与独立页面API前缀适配；资料目录选择回调与虚构数据种子同步更新。真实Desktop视觉/业务验收仍待完成。
- `npm run check`：通过（退出码0）；tests=68, pass=68, fail=0。
- 详细范围见 [Git同步记录](docs/GIT-SYNC-2026-10-20.md)；本次未创建正式发布tag。
