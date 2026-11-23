# dsh-plugin-python-daily

[DeepSeek Harness](https://github.com/deepseek-ai) 的 Python 每日情报插件：侧栏多一个页面，每天 09:00 自动把 Python 世界的动静捞一遍，整理成日报卡片，同时写出本地 Markdown 存档。

> **English**: A daily Python digest plugin for DeepSeek Harness. It collects the Python Insider blog, CPython/Python releases, PEP activity, PyPI package releases and trending GitHub Python projects, renders them in a sidebar panel (today / history / settings) and writes one Markdown report per day. Install by adding this directory in **Plugins → Add plugin**. Default schedule: 09:00 local time, incremental cursors per source, retry after failure. UI text is localized (中文 / English).

```
Python 每日情报
┌──────────────────────────────────────────────────────────┐
│ 今日 10 条 · 上次 09:00 · 下次 明天 09:00      [立即采集] │
│ 官方博客 3  版本发布 1  PEP 动态 1  PyPI 2  GitHub 8      │
└──────────────────────────────────────────────────────────┘
```

![面板预览：顶部状态条、三个视图标签页、五张板块卡片](docs/preview.svg)

## 它看哪五个地方

| 板块 | 数据源 | 判新的方式 |
| --- | --- | --- |
| 官方博客 | `https://blog.python.org/feeds/posts/default?alt=json&max-results=40`（实际返回 RSS 2.0，插件自己拆） | 发布时间落在采集窗口内 |
| CPython / Python 版本 | `https://www.python.org/api/v2/downloads/release/?is_published=true` | `release_date` 落在窗口内，可按需过滤预发布版 |
| PEP 动态 | `https://peps.python.org/api/peps.json` | 新建（`created` 在窗口内）+ 状态变更（和上次基线比对，比如 Draft → Final） |
| PyPI 更新 | `https://pypi.org/rss/project/<包名>/releases.xml`（每个包一份十几 KB 的小 RSS，比整包 JSON 省流量） | 取 feed 里**版本号最大且非预发布**的那条，和上次基线比；只有比基线新才报（维护分支回补、dev/beta 升级、基线倒退都不报） |
| GitHub 项目 | 主路 `https://api.github.com/search/repositories?q=language:python created:>=<窗口起点>`；退路 `https://github.com/trending/python?since=daily`（今日涨星榜，不需要额度） | 主路：仓库创建时间真正落在采集窗口内（搜索接口只精确到天，拿回来再按时间戳滤一遍），按星标从高到低；没有新建仓库或接口被限流时改抓 Trending 榜，卡片上会注明「这里显示今日热门项目」 |

每个源有自己独立的游标：抓成功才推进，抓失败就保留旧游标，下一轮自动把这段时间补上。同一天里手动多刷几次也只是合并进当天日报（按条目 id 去重），不会把同一篇文章报两遍。

PyPI 板块特意不看 feed 的第一条：feed 按上传时间排，django 发 LTS 补丁时 `5.2.19` 会排在新功能线 `6.1.3` 前面，照抄就会把「降级」当新闻。插件自己按 PEP 440 规则比版本号，取最大的那个稳定版。

GitHub 搜索接口未登录额度是 10 次/分钟，一天跑一次绰绰有余；被限流（403 提示额度耗尽）时给一个 `GITHUB_TOKEN` 环境变量就能放宽到 30 次/分钟，插件会自动带上。它也不通，就退到 Trending 的 `?since=daily` 榜单，那份 HTML 不需要任何额度，条目写成 `owner/repo` + `今日 +1,716 ★`。

## 安装

需要 DeepSeek Harness 桌面版或 `dsh web`（插件系统可用即可），Node 20+；不需要额外安装任何依赖 —— 插件没有运行时依赖，也不做构建。

**方式一：本地目录（推荐）**

```bash
git clone https://github.com/kaixinwang329-hue/dsh-python-daily.git
```

然后打开 DeepSeek Harness 的 **插件（Plugins）** 页，点 **添加插件**，选中刚克隆的目录。插件包名是 `dsh-plugin-python-daily`，装好后侧栏会多出「Python 每日情报」图标。

**方式二：npm**（发布到 npm 之后）

```
插件 → 添加插件 → 输入 dsh-plugin-python-daily
```

**方式三：让 Agent 装**：把目录路径告诉 DSH，让它执行 `plugin_manager` → `install_bundle` → 目标填这个目录的绝对路径。

装完刷新页面即可看到侧栏图标；如果没出现，到插件页确认 `python-daily` 这一行是启用的。

## 什么时候跑

- 默认每个自然日 **09:00** 之后的第一分钟自动跑一次（插件每 60 秒检查一次，启动 5 秒后检查第一次）。
- 当天已经有日报就跳过；没到点就等着；所有源全失败时不写空日报，15 分钟后自动重试。
- 页面上的「立即采集」随时可以手动跑一轮。

## 页面

侧栏「Python 每日情报」点开是三块：

- **今日**：状态条（今日新增 / 上次采集 / 下次采集）、五个板块的卡片、作者和日期、`旧 → 新` 的状态变更标记、打开当日报表。
- **历史**：左边日期列表，右边看那天的日报（页面保留 `keepDays` 天，Markdown 文件不会被自动删除）。
- **设置**：开关、每天几点、每板块最多几条、保留多少天、是否包含预发布、追踪哪些包、日报存到哪儿。改完立刻生效，不用重启。

## 配置项

设置页可改，也可以直接编辑数据目录里的 `config.json`：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 关掉就只留手动采集 |
| `hour` / `minute` | `9` / `0` | 每天几点跑（本地时间） |
| `maxPerSection` | `8` | 每个板块最多收录几条（3–30） |
| `keepDays` | `30` | 历史保留天数（1–365） |
| `includePrerelease` | `true` | 是否收录 alpha/beta/rc 版本 |
| `packages` | 20 个常用包 | 要盯的 PyPI 包，最多 40 个 |
| `reportsDir` | 空 = `<数据目录>/reports` | 日报 Markdown 的输出目录，可以填绝对路径 |

环境变量：

| 变量 | 作用 |
| --- | --- |
| `PYTHON_DAILY_DATA_DIR` | 数据目录（绝对路径），优先级最高 |
| `GITHUB_TOKEN` / `GH_TOKEN` | 可选，提高 GitHub 搜索接口额度 |

## 数据都在哪

默认 `$DSH_HOME/python-daily/`（Windows 上是 `C:\Users\<你>\.dsh\python-daily\`）。想换盘：设 `PYTHON_DAILY_DATA_DIR`，或者在该目录写一个 `data-dir.txt`，里面只放一行绝对路径，例如 `D:\python-daily-data`。

```
config.json            你的设置
state.json             游标、各天的日报摘要、上次看到的 PEP 状态和包版本
reports/YYYY-MM-DD.md  每天的日报
log.txt                运行日志（超过 256KB 自动截断）
data-dir.txt           可选：把数据目录指到别处
```

## 接口

宿主上注册了 `/python-daily/` 前缀的接口，页面靠它们工作；不开浏览器也能直接 curl（端口就是当前 DSH Web GUI 的端口）：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/python-daily/state` | 设置、路径、今日日报、历史日期、上次运行、下次运行 |
| GET | `/python-daily/day?date=YYYY-MM-DD` | 某一天的日报 JSON |
| GET | `/python-daily/report?date=YYYY-MM-DD` | 那天的 Markdown 原文 |
| POST | `/python-daily/refresh` | 立刻采集一轮（会真联网，约 15–45 秒） |
| GET/POST | `/python-daily/config` | 读 / 写设置 |

## 开发

没有构建步骤：`index.js` 是宿主半端（ESM），`client.js` 是浏览器半端（手写 `__ModuleLoader__` 模块），改成什么样直接把目录装进 DSH 就能跑。

改完代码在插件管理器里把 `python-daily` 停用再启用一次即可生效（不需要重启应用）。

```bash
npm run check        # node --check 两个入口
npm test             # 离线：客户端模块形态 / 槽位注册 / 首屏 / 中英词条（10 项）
npm run test:all     # 再加两套联网冒烟（host 27 项、增量 10 项）
```

三套脚本都会把 `DSH_HOME` 和 `PYTHON_DAILY_DATA_DIR` 指到临时目录，不会碰你真实的日报；联网那两套在断网时会失败在「条目有 title/url/id」。

发布新版本：改 `package.json` 的 `version`、补一条 `CHANGELOG.md`，然后

```bash
git tag v2.1.0 && git push origin main --tags   # 用目录安装的同事 git pull 后重启插件即可
npm publish --access public                     # 可选：发到 npm，别人就能直接按包名装
```

## 限制

- 首次运行会回看 7–14 天，所以第一份日报会比平时厚。
- GitHub 搜索接口按出口 IP 限流（共享网络里可能被别人用光），限流时自动退到 Trending 榜，内容语义会略有不同（今日热门 vs 今日新建）。
- 采集是单进程内的定时器，应用没运行时不会补跑；下次启动会把断档期一次性补上。
- 插件只读取公开数据，不需要任何账号或密钥。

## 许可

MIT。图标里的 Python 双蛇标志来自 [simple-icons](https://simpleicons.org/)（CC0 1.0），仅作示意。
