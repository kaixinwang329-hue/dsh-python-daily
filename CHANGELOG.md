# Changelog

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
