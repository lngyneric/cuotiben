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
