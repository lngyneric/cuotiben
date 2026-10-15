# 错题本 · 闪卡

手机端错题本：录入错题 → 闪卡翻转复习 → 一键导出单文件闪卡 HTML（离线可看、可微信转发）
→ 每道错题可调用 Workers AI 生成一道类似练习题。

参考了 [withcapsule.app](https://withcapsule.app) 的单文件、本地优先思路：
数据只存在手机浏览器 localStorage，不经过服务器。

## 功能

- 📝 错题录入：题目 / 我的答案 / 正确答案 / 原理公式 / 错因 / 标签
- 🃏 闪卡模式：点击翻面、上一张/下一张、乱序、按"未掌握"过滤、一键标记掌握
- ⤓ 导出闪卡 HTML：单个自包含文件，离线打开、微信转发
- ✨ AI 出类似题：每道错题一键生成同类型练习题，可加入练习本
- 💾 备份/恢复 JSON

## 部署（Cloudflare Workers）

1. GitHub 建仓库，把本项目推上去
2. Cloudflare Dashboard → Workers → Create → Import a repository
3. Framework preset 选 None，Build command 留空，确认 `wrangler.toml` 被识别
4. 部署后在 Worker Settings → Bindings 添加 **Workers AI** 绑定，变量名 `AI`
   （`wrangler.toml` 里已声明 `[ai] binding = "AI"`，Git 导入一般会自动带上）
5. 访问 `https://cuotiben.<你的子域>.workers.dev`，`/api/health` 应返回 ok

费用：Workers 免费版 + Workers AI 免费额度（每天 10,000 Neurons），零新增费用。

## 接口

- `GET /api/health` → `{ok:true}`
- `POST /api/similar` `{question, answer, principle, subject}` → `{question, answer, hint}`（或 `{raw}` 降级）
- `POST /api/qa` 问答模式：
  - `{action:'approaches', question, answer, principle, myAnswer, subject}` → `{options:[{text,correct}×4], followup}`（Llama 生成解题思路选项）
  - `{action:'judge', question, expected, student}` → `{correct, confidence, by}`（Clef-flash 判分，失败回退 Llama）
  - `{action:'hint', question, answer, principle, student, attempt, subject}` → `{hint}`
  - `{action:'followup', question, answer, principle}` → `{followup}`

## 开发约定（必读，避免踩坑）

### 1. 卡片 ID 前缀与种子识别正则（⚠️ 出过生产 bug）

种子卡 ID 必须用以下前缀之一：`ig-`（英文数学）、`cn-`（中文数学）、`igs-`（英文科学）。
`dist/index.html` 的种子同步逻辑用正则识别种子卡：

```js
/^(seed-|igs?-|cn-)/
```

**新增任何 ID 前缀时，必须同步更新这个正则**，否则新卡会被误判为"用户自建卡"，
每次加载重复追加，导致题目数循环增长（2026-10-15 真实故障：`igs-` 漏配，每次打开多 4 张）。

### 2. 种子同步是幂等的

每次打开页面都从 `SEED` 全量重建（保留 `mastered`、保留用户自建卡、清理废弃 ID），
不依赖一次性 localStorage 标记。改种子内容只改 `SEED` 数组即可，用户端下次打开自动同步。

### 3. 静态资源缓存

`/` 由 Cloudflare 边缘直接 serve `dist/index.html`，不经过 Worker。
想改静态资源响应头必须用 `dist/_headers` 文件，在 Worker 代码里改对 `/` 无效。

### 4. 数据只在本地

所有数据（卡片、`mastered`、问答记录、SRS）只存浏览器 localStorage。
不引入 KV / D1 / R2 / Vectorize 等付费资源。

### 5. 卡片字段

`{id, src, subject, tag, kind, question, myAnswer, answer, principle, note, diagram?, mastered, createdAt}`
`diagram` 为可选 SVG 字符串（直接嵌入，离线可用）。
