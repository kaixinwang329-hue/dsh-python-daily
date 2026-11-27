# Changelog

## Unreleased

- 修复 PEP 440 比较里 dev 版本的排序错误：此前 `1.0.dev6` 会被排到 `1.0` 与 `1.0a1` 之后，可能把开发版误报成新版本；现在按 `dev < a < b < rc < 正式版 < post` 严格排序。
- PyPI 退路（`/pypi/<name>/json`）改用最近一次上传时间；版本号缺失时链接回项目首页而不是坏链。
- GitHub 新建仓库的搜索窗口改用本地日期（此前按 UTC 截断，跨时区会漏掉本地当天凌晨的仓库）。
- 采集流程直接复用本次运行已加载的 state，去掉每次运行里多余的状态文件读取。
- `POST /config` 收到非法 JSON 时返回 400 而不是 500。
- 版本比较逻辑独立到 `src/version.mjs` 并新增离线单测；CI 增加 Node 20/22 矩阵与并发去重。

## 2.0.0 — 首次公开发布

- 包名改为 `dsh-plugin-python-daily`，以 MIT 许可开源，补上 LICENSE、CHANGELOG、CI 与完整的安装说明。
- 数据目录默认回到 `$DSH_HOME/python-daily`（可移植）；想放到别的盘用环境变量 `PYTHON_DAILY_DATA_DIR`，或在该目录写一个 `data-dir.txt`。
- 板块提示（note）现在会同时出现在侧栏卡片和 Markdown 日报里。

## 1.1.1

- 数据目录支持外部化（此前固定写在 `$DSH_HOME` 下）。
- 修复：日报/卡片里看不到「首次运行」「今日热门」这类采集提示。

## 1.1.0

- 新增第五个板块「GitHub 项目」：GitHub 搜索接口找窗口内新建的 Python 仓库，额度用尽或没有新仓库时退到 Trending 每日榜。
- 板块支持自定义排序（GitHub 按星标倒序）。

## 1.0.0

- 首个版本：官方博客、CPython 版本、PEP 动态、PyPI 更新四个板块；侧栏整页（今日 / 历史 / 设置）；每日 Markdown 日报；每天 09:00 自动采集，游标增量、失败重试。
