/**
 * python-daily —— 每日 Python 情报（client 半端）
 *
 * 这是浏览器侧的手写模块：不经过构建，直接由 __ModuleLoader__ 加载，
 * 只 require('react') 这个运行时依赖。它做两件事：
 *   1. 在侧栏加一行「每日情报」（sidebar.panellist）
 *   2. 在 main 槽位注册同名整页（三个 tab：今日 / 历史 / 设置）
 *
 * 数据全部来自宿主半端注册的 /python-daily/* 接口，样式走 --dsw-alias-* 主题变量。
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-python-daily',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'python-daily'
    const PANEL_ID = 'python-daily'
    const PANEL_ORDER = 20

    /* ------------------------------------------------------------ 文案 */

    const DICT = {
      zh: {
        nav: '每日情报',
        title: 'Python 每日情报',
        subtitle: '官方博客 · CPython 版本 · PEP 变更 · PyPI 热门包',
        tabToday: '今日',
        tabHistory: '历史',
        tabSettings: '设置',
        refresh: '立即采集',
        collecting: '采集中…',
        collected: '采集完成，共',
        ready: '已就绪',
        partial: '部分数据源失败',
        never: '还没采集过',
        statToday: '今日新增',
        statLast: '上次采集',
        statNext: '下次更新',
        dueNow: '已到时间，待采集',
        autoOff: '自动采集已关闭',
        emptyTitle: '今天的日报还没生成',
        emptyBody: '到设定的每日时间会自动采集；也可以现在手动跑一次，抓完会写一份 Markdown 日报。',
        emptyButton: '现在采集',
        secBlog: '官方博客',
        secBlogHint: 'Python Insider',
        secReleases: '版本发布',
        secReleasesHint: 'python.org',
        secPeps: 'PEP 动态',
        secPepsHint: '新建与状态变更',
        secPackages: 'PyPI 更新',
        secPackagesHint: '关注的包',
        secGithub: 'GitHub 项目',
        secGithubHint: '新建的 Python 仓库',
        sectionEmpty: '本窗口内暂无新条目',
        window: '采集窗口',
        generatedAt: '生成于',
        total: '共',
        openReport: '查看 Markdown',
        failed: '采集异常',
        historyEmpty: '还没有历史日报',
        historySelect: '选一个日期看看当天的日报。',
        loading: '加载中…',
        loadFailed: '加载失败',
        itemsUnit: '条',
        settingsTitle: '设置',
        settingsHint: '改完点保存，下一次采集生效。',
        fieldEnabled: '自动采集',
        fieldHour: '每天几点',
        fieldMinute: '分钟',
        fieldMax: '每个板块最多几条',
        fieldKeep: '历史保留天数',
        fieldPre: '包含预发布版本',
        fieldPackages: '关注的 PyPI 包',
        fieldPackagesHint: '一行一个包名（最多 40 个）；第一次见到只记基线，版本变了才报。',
        fieldReportsDir: '日报目录',
        fieldReportsDirHint: '留空 = 数据目录下的 reports；相对路径按数据目录解析。',
        save: '保存',
        saving: '保存中…',
        saved: '已保存',
        saveFailed: '保存失败',
        pathsTitle: '数据位置',
        dataDir: '数据目录',
        reportsDir: '日报目录',
        todayReport: '今日日报',
        logFile: '日志',
        noteTitle: '说明',
        noteFirst: '首次运行会回看 7～14 天，之后只看增量。',
        noteReport: '每天一份 YYYY-MM-DD.md，历史文件不会被自动删除。',
        noteKeep: '「历史保留天数」只控制页面与状态文件里的记录范围。',
      },
      en: {
        nav: 'Python Daily',
        title: 'Python Daily',
        subtitle: 'Official blog · CPython releases · PEP changes · PyPI packages',
        tabToday: 'Today',
        tabHistory: 'History',
        tabSettings: 'Settings',
        refresh: 'Collect now',
        collecting: 'Collecting…',
        collected: 'Collected, total',
        ready: 'Ready',
        partial: 'Some sources failed',
        never: 'Never collected',
        statToday: 'New today',
        statLast: 'Last run',
        statNext: 'Next run',
        dueNow: 'Due now',
        autoOff: 'Auto collection is off',
        emptyTitle: 'No report for today yet',
        emptyBody: 'It collects automatically at the daily time — or run it now and it will write a Markdown report.',
        emptyButton: 'Collect now',
        secBlog: 'Official blog',
        secBlogHint: 'Python Insider',
        secReleases: 'Releases',
        secReleasesHint: 'python.org',
        secPeps: 'PEP updates',
        secPepsHint: 'new & status changes',
        secPackages: 'PyPI updates',
        secPackagesHint: 'watched packages',
        secGithub: 'GitHub projects',
        secGithubHint: 'new Python repositories',
        sectionEmpty: 'Nothing new in this window',
        window: 'Window',
        generatedAt: 'Generated',
        total: 'Total',
        openReport: 'Open Markdown',
        failed: 'Collection issues',
        historyEmpty: 'No reports yet',
        historySelect: 'Pick a date to read its report.',
        loading: 'Loading…',
        loadFailed: 'Failed to load',
        itemsUnit: 'items',
        settingsTitle: 'Settings',
        settingsHint: 'Save first; changes apply to the next collection.',
        fieldEnabled: 'Auto collect',
        fieldHour: 'Hour',
        fieldMinute: 'Minute',
        fieldMax: 'Max items per section',
        fieldKeep: 'Keep state (days)',
        fieldPre: 'Include pre-releases',
        fieldPackages: 'Watched PyPI packages',
        fieldPackagesHint: 'One package per line, up to 40. First sight only records a baseline; only version changes are reported.',
        fieldReportsDir: 'Reports directory',
        fieldReportsDirHint: 'Empty = reports/ under the data dir; relative paths resolve against it.',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved',
        saveFailed: 'Save failed',
        pathsTitle: 'Data locations',
        dataDir: 'Data dir',
        reportsDir: 'Reports dir',
        todayReport: "Today's report",
        logFile: 'Log file',
        noteTitle: 'Notes',
        noteFirst: 'The first run looks back 7–14 days; later runs only fetch the delta.',
        noteReport: 'One YYYY-MM-DD.md per day; old files are never deleted automatically.',
        noteKeep: '"Keep state" only limits what the page and state file remember.',
      },
    }

    /* ------------------------------------------------------------ 图标 */

    const PYTHON_PATH =
      'M11.858 0c-.978.005-1.913.088-2.736.234C6.7.662 6.26 1.558 6.26 3.21v2.182h5.725v.727H4.111c-1.664 0-3.121 1-3.577 2.903-.526 2.181-.549 3.542 0 5.82.407 1.694 1.379 2.902 3.043 2.902h1.969v-2.616c0-1.89 1.635-3.557 3.576-3.557h5.72c1.591 0 2.862-1.31 2.862-2.91v-5.45c0-1.553-1.309-2.718-2.863-2.977A18 18 0 0 0 11.858 0M8.762 1.755c.591 0 1.074.491 1.074 1.095 0 .601-.483 1.087-1.074 1.087A1.08 1.08 0 0 1 7.688 2.85c0-.604.48-1.095 1.074-1.095m9.656 4.364v2.543c0 1.971-1.671 3.63-3.577 3.63H9.122c-1.566 0-2.862 1.34-2.862 2.91v5.452c0 1.551 1.349 2.464 2.862 2.91 1.813.532 3.55.628 5.72 0 1.44-.418 2.862-1.258 2.862-2.91V18.47h-5.719v-.727h8.582c1.664 0 2.284-1.16 2.862-2.903.598-1.793.573-3.518 0-5.819-.41-1.656-1.196-2.903-2.862-2.903zm-3.216 13.807a1.08 1.08 0 0 1 1.074 1.088c0 .604-.48 1.094-1.074 1.094-.592 0-1.075-.49-1.075-1.094 0-.601.483-1.088 1.075-1.088'

    function PythonIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 16
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block' },
        },
        h('path', { d: PYTHON_PATH, fill: 'currentColor' }),
      )
    }

    /* ------------------------------------------------------------ 样式 */

    const CSS = `
      .pd-root{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55;-webkit-font-smoothing:antialiased}
      .pd-head{flex:0 0 auto;display:flex;flex-direction:column;gap:14px;padding:calc(20px + var(--dsh-frame-top-clearance,0px)) 28px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
      .pd-head-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .pd-brand{display:flex;align-items:center;gap:12px;min-width:0}
      .pd-brand-icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;flex:0 0 auto;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);color:var(--dsw-alias-brand-primary)}
      .pd-brand-text{min-width:0}
      .pd-title{margin:0;font-size:16px;font-weight:650;letter-spacing:.01em}
      .pd-subtitle{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
      .pd-head-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .pd-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;font-size:11.5px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);white-space:nowrap}
      .pd-pill-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:0 0 auto}
      .pd-pill-ok .pd-pill-dot{background:var(--dsw-alias-state-success-primary)}
      .pd-pill-warn .pd-pill-dot{background:var(--dsw-alias-state-warn-primary)}
      .pd-pill-busy .pd-pill-dot{background:var(--dsw-alias-brand-primary);animation:pd-pulse 1.1s ease-in-out infinite}
      @keyframes pd-pulse{0%,100%{opacity:1}50%{opacity:.3}}
      .pd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;cursor:pointer;transition:background .15s ease,border-color .15s ease}
      .pd-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
      .pd-btn:disabled{opacity:.55;cursor:default}
      .pd-btn-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
      .pd-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);filter:brightness(1.08)}
      .pd-stats{display:flex;gap:26px;flex-wrap:wrap}
      .pd-stat{display:flex;flex-direction:column;gap:1px;min-width:0}
      .pd-stat-key{font-size:11px;color:var(--dsw-alias-label-secondary);letter-spacing:.02em}
      .pd-stat-value{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
      .pd-tabs{display:flex;gap:18px}
      .pd-tab{position:relative;height:34px;padding:0 2px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-family:inherit;cursor:pointer}
      .pd-tab:hover{color:var(--dsw-alias-label-primary)}
      .pd-tab.is-active{color:var(--dsw-alias-label-primary);font-weight:600}
      .pd-tab.is-active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--dsw-alias-brand-primary)}
      .pd-body{flex:1 1 auto;min-height:0;overflow:auto}
      .pd-inner{margin:0 auto;max-width:1080px;padding:16px 28px 40px}
      .pd-notice{margin:0 0 12px;padding:8px 12px;border-radius:8px;font-size:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
      .pd-notice-ok{color:var(--dsw-alias-state-success-primary)}
      .pd-notice-warn{color:var(--dsw-alias-state-warn-primary)}
      .pd-notice-error{color:var(--dsw-alias-state-error-primary)}
      .pd-metabar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
      .pd-metabar > span{white-space:nowrap}
      .pd-linkbtn{margin-left:auto;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font-size:11.5px;font-family:inherit;cursor:pointer;padding:2px 6px;border-radius:5px}
      .pd-linkbtn:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)}
      .pd-warn{margin-bottom:12px;padding:9px 12px;border-radius:10px;border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);font-size:11.5px;overflow-wrap:anywhere}
      .pd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;align-items:start}
      .pd-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px 6px;min-width:0}
      .pd-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
      .pd-card-title{margin:0;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;min-width:0}
      .pd-card-hint{font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary);white-space:nowrap}
      .pd-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:#3b82f6}
      .pd-tone-amber .pd-dot{background:var(--dsw-alias-state-warn-primary)}
      .pd-tone-violet .pd-dot{background:#8b5cf6}
      .pd-tone-teal .pd-dot{background:#14b8a6}
      .pd-tone-green .pd-dot{background:#22c55e}
      .pd-count{min-width:22px;height:20px;padding:0 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;display:inline-flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
      .pd-items{display:flex;flex-direction:column}
      .pd-item{padding:9px 0;border-top:1px dashed var(--dsw-alias-border-l1);min-width:0}
      .pd-item:first-child{border-top:0}
      .pd-item-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
      .pd-item-title{color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:600;text-decoration:none;overflow-wrap:anywhere}
      .pd-item-title:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline;text-underline-offset:2px}
      .pd-item-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary)}
      .pd-tag{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);font-size:10.5px;color:var(--dsw-alias-label-secondary)}
      .pd-chip-change{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:4px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);color:var(--dsw-alias-brand-primary);font-size:10.5px;font-variant-numeric:tabular-nums}
      .pd-item-summary{margin:4px 0 0;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
      .pd-empty{margin:8px 0 12px;font-size:12px;color:var(--dsw-alias-label-secondary)}
      .pd-muted{margin:24px 0;font-size:12px;color:var(--dsw-alias-label-secondary);text-align:center}
      .pd-emptybox{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:56px 24px;border:1px dashed var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1)}
      .pd-emptybox-icon{display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:16px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);color:var(--dsw-alias-brand-primary)}
      .pd-emptybox-title{margin:4px 0 0;font-size:14px;font-weight:600}
      .pd-emptybox-body{margin:0;max-width:430px;font-size:12px;color:var(--dsw-alias-label-secondary)}
      .pd-history{display:grid;grid-template-columns:200px minmax(0,1fr);gap:18px;align-items:start}
      .pd-daylist{display:flex;flex-direction:column;gap:2px;max-height:calc(100vh - 280px);overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:6px}
      .pd-daybtn{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;cursor:pointer;text-align:left;white-space:nowrap}
      .pd-daybtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
      .pd-daybtn.is-active{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
      .pd-daybtn-date{font-variant-numeric:tabular-nums}
      .pd-daybtn-meta{font-size:11px;color:var(--dsw-alias-label-secondary)}
      .pd-daybody{min-width:0}
      .pd-settings{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;align-items:start}
      .pd-form{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:16px 18px}
      .pd-form-title{margin:0 0 2px;font-size:13px;font-weight:600}
      .pd-form-hint{margin:0 0 14px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
      .pd-field{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
      .pd-field-label{font-size:12px;font-weight:600}
      .pd-field-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}
      .pd-input,.pd-textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;padding:7px 10px;outline:none}
      .pd-input:focus,.pd-textarea:focus{border-color:var(--dsw-alias-brand-primary)}
      .pd-textarea{resize:vertical;min-height:120px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.6}
      .pd-row{display:flex;gap:12px;flex-wrap:wrap}
      .pd-row > .pd-field{flex:1 1 110px}
      .pd-switch{display:flex;align-items:center;gap:8px;font-size:12.5px}
      .pd-checkbox{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary);margin:0}
      .pd-form-foot{display:flex;align-items:center;gap:10px;margin-top:2px}
      .pd-save-note{font-size:11.5px}
      .pd-note{margin:0 0 8px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
      .pd-sidecol{display:flex;flex-direction:column;gap:16px;min-width:0}
      .pd-card-plain{padding:16px 18px}
      .pd-paths{display:flex;flex-direction:column;gap:10px;margin:10px 0 0}
      .pd-path-row{display:flex;flex-direction:column;gap:2px;min-width:0}
      .pd-path-row dt{font-size:11px;color:var(--dsw-alias-label-secondary)}
      .pd-path-row dd{margin:0;font-size:11.5px;overflow-wrap:anywhere}
      .pd-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}
      .pd-notes{margin:10px 0 0;padding-left:16px;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.65}
      @media (max-width:900px){.pd-settings{grid-template-columns:1fr}}
      @media (max-width:860px){.pd-history{grid-template-columns:1fr}.pd-daylist{flex-direction:row;max-height:none;overflow-x:auto}}
      @media (prefers-reduced-motion:reduce){.pd-pill-dot{animation:none}}
    `

    function ensureStyle() {
      if (typeof document === 'undefined') return
      const id = 'python-daily-style'
      if (document.getElementById(id)) return
      const style = document.createElement('style')
      style.id = id
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /* ------------------------------------------------------------ 小工具 */

    const pad2 = (value) => String(value).padStart(2, '0')

    function fmtStamp(value) {
      if (!value) return '—'
      const at = new Date(value)
      if (!Number.isFinite(at.getTime())) return '—'
      return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())} ${pad2(at.getHours())}:${pad2(at.getMinutes())}`
    }

    const API = {
      state: '/python-daily/state',
      day: (date) => `/python-daily/day?date=${encodeURIComponent(date)}`,
      report: (date) => `/python-daily/report?date=${encodeURIComponent(date)}`,
      refresh: '/python-daily/refresh',
      config: '/python-daily/config',
    }

    async function requestJson(url, init) {
      const options = { cache: 'no-store', ...(init ?? {}) }
      const response = await fetch(url, options)
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok || !payload || payload.ok !== true) {
        const reason = payload && payload.error ? payload.error : `HTTP ${response.status}`
        throw new Error(reason)
      }
      return payload
    }

    const SECTIONS = [
      { key: 'blog', title: 'secBlog', hint: 'secBlogHint', tone: 'blue' },
      { key: 'releases', title: 'secReleases', hint: 'secReleasesHint', tone: 'amber' },
      { key: 'peps', title: 'secPeps', hint: 'secPepsHint', tone: 'violet' },
      { key: 'packages', title: 'secPackages', hint: 'secPackagesHint', tone: 'teal' },
      { key: 'github', title: 'secGithub', hint: 'secGithubHint', tone: 'green' },
    ]

    const TABS = [
      { id: 'today', label: 'tabToday' },
      { id: 'history', label: 'tabHistory' },
      { id: 'settings', label: 'tabSettings' },
    ]

    /* ------------------------------------------------------------ 数据 */

    function useDashboard() {
      const [payload, setPayload] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [loading, setLoading] = React.useState(true)

      const load = React.useCallback(async (options) => {
        const silent = Boolean(options && options.silent)
        if (!silent) setLoading(true)
        try {
          const data = await requestJson(API.state)
          setPayload(data)
          setError(null)
        } catch (failure) {
          if (!silent) setError(String(failure && failure.message ? failure.message : failure))
        } finally {
          if (!silent) setLoading(false)
        }
      }, [])

      React.useEffect(() => {
        load()
        const timer = setInterval(() => {
          load({ silent: true })
        }, 45_000)
        return () => clearInterval(timer)
      }, [load])

      return { payload, error, loading, load, update: setPayload }
    }

    /* ------------------------------------------------------------ 视图 */

    function Item(props) {
      const item = props.item
      return h(
        'article',
        { className: 'pd-item' },
        h(
          'div',
          { className: 'pd-item-row' },
          h('a', { className: 'pd-item-title', href: item.url, target: '_blank', rel: 'noreferrer noopener' }, item.title),
          item.change ? h('span', { className: 'pd-chip-change' }, `${item.change.from} → ${item.change.to}`) : null,
        ),
        item.meta || (item.tags && item.tags.length)
          ? h(
              'div',
              { className: 'pd-item-meta' },
              item.meta ? h('span', null, item.meta) : null,
              (item.tags ?? []).map((tag) => h('span', { key: tag, className: 'pd-tag' }, tag)),
            )
          : null,
        item.summary ? h('p', { className: 'pd-item-summary' }, item.summary) : null,
      )
    }

    function SectionCard(props) {
      const spec = props.spec
      const items = props.items
      const translate = props.t
      const note = String(props.note ?? '').trim()
      return h(
        'section',
        { className: `pd-card pd-tone-${spec.tone}` },
        h(
          'header',
          { className: 'pd-card-head' },
          h(
            'h2',
            { className: 'pd-card-title' },
            h('span', { className: 'pd-dot' }),
            h('span', null, translate(spec.title)),
            h('span', { className: 'pd-card-hint' }, translate(spec.hint)),
          ),
          h('span', { className: 'pd-count' }, String(items.length)),
        ),
        note ? h('p', { className: 'pd-note' }, note) : null,
        items.length
          ? h('div', { className: 'pd-items' }, items.map((item) => h(Item, { key: item.id, item })))
          : h('p', { className: 'pd-empty' }, translate('sectionEmpty')),
      )
    }

    function DigestView(props) {
      const digest = props.digest
      const translate = props.t
      const sections = digest && digest.sections ? digest.sections : {}
      const sources = digest && digest.sources ? digest.sources : {}
      const failures = digest && Array.isArray(digest.failures) ? digest.failures : []
      const reportUrl = props.reportUrl
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'pd-metabar' },
          h('span', null, `${translate('window')} ${fmtStamp(digest.window && digest.window.from)} → ${fmtStamp(digest.window && digest.window.to)}`),
          h('span', null, `${translate('generatedAt')} ${fmtStamp(digest.generatedAt)}`),
          h('span', null, `${translate('total')} ${digest.counts ? digest.counts.total : 0}`),
          reportUrl
            ? h(
                'button',
                { type: 'button', className: 'pd-linkbtn', onClick: () => window.open(reportUrl, '_blank', 'noopener') },
                translate('openReport'),
              )
            : null,
        ),
        failures.length
          ? h('div', { className: 'pd-warn' }, h('strong', null, `${translate('failed')}：`), failures.join(' · '))
          : null,
        h(
          'div',
          { className: 'pd-grid' },
          SECTIONS.map((spec) =>
            h(SectionCard, {
              key: spec.key,
              spec,
              t: translate,
              note: sources[spec.key] && sources[spec.key].note,
              items: Array.isArray(sections[spec.key]) ? sections[spec.key] : [],
            }),
          ),
        ),
      )
    }

    function EmptyToday(props) {
      const translate = props.t
      return h(
        'div',
        { className: 'pd-emptybox' },
        h('div', { className: 'pd-emptybox-icon' }, h(PythonIcon, { size: 34 })),
        h('h2', { className: 'pd-emptybox-title' }, translate('emptyTitle')),
        h('p', { className: 'pd-emptybox-body' }, translate('emptyBody')),
        h(
          'button',
          { type: 'button', className: 'pd-btn pd-btn-primary', onClick: props.onRefresh, disabled: props.busy },
          props.busy ? translate('collecting') : translate('emptyButton'),
        ),
      )
    }

    function HistoryView(props) {
      const translate = props.t
      const payload = props.payload
      const days = payload && Array.isArray(payload.days) ? payload.days : []
      if (!days.length) {
        return h(
          'div',
          { className: 'pd-emptybox' },
          h('div', { className: 'pd-emptybox-icon' }, h(PythonIcon, { size: 34 })),
          h('h2', { className: 'pd-emptybox-title' }, translate('historyEmpty')),
        )
      }
      return h(
        'div',
        { className: 'pd-history' },
        h(
          'div',
          { className: 'pd-daylist' },
          days.map((row) =>
            h(
              'button',
              {
                key: row.date,
                type: 'button',
                className: `pd-daybtn${row.date === props.dayDate ? ' is-active' : ''}`,
                onClick: () => props.openDay(row.date),
              },
              h('span', { className: 'pd-daybtn-date' }, row.date),
              h('span', { className: 'pd-daybtn-meta' }, `${row.total} ${translate('itemsUnit')}${row.failures ? ' ⚠' : ''}`),
            ),
          ),
        ),
        h(
          'div',
          { className: 'pd-daybody' },
          props.dayLoading
            ? h('p', { className: 'pd-muted' }, translate('loading'))
            : props.dayDigest
              ? h(DigestView, { digest: props.dayDigest, t: translate, reportUrl: API.report(props.dayDigest.date) })
              : h('p', { className: 'pd-muted' }, translate('historySelect')),
        ),
      )
    }

    function Field(props) {
      return h(
        'label',
        { className: 'pd-field' },
        h('span', { className: 'pd-field-label' }, props.label),
        props.children,
        props.hint ? h('span', { className: 'pd-field-hint' }, props.hint) : null,
      )
    }

    function SettingsView(props) {
      const translate = props.t
      const config = props.payload.config
      const initial = {
        ...config,
        packagesText: Array.isArray(config.packages) ? config.packages.join('\n') : '',
      }
      const [draft, setDraft] = React.useState(initial)
      const [saving, setSaving] = React.useState(false)
      const [message, setMessage] = React.useState(null)

      const patch = (name, value) => {
        setDraft((previous) => ({ ...previous, [name]: value }))
      }

      const submit = async (event) => {
        if (event && event.preventDefault) event.preventDefault()
        setSaving(true)
        setMessage(null)
        try {
          const body = {
            enabled: Boolean(draft.enabled),
            hour: Number(draft.hour),
            minute: Number(draft.minute),
            maxPerSection: Number(draft.maxPerSection),
            keepDays: Number(draft.keepDays),
            includePrerelease: Boolean(draft.includePrerelease),
            packages: String(draft.packagesText ?? '')
              .split(/[\s,]+/)
              .map((name) => name.trim())
              .filter(Boolean),
            reportsDir: String(draft.reportsDir ?? ''),
          }
          const data = await requestJson(API.config, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          setDraft({ ...data.config, packagesText: (data.config.packages ?? []).join('\n') })
          setMessage({ tone: 'ok', text: translate('saved') })
          if (typeof props.onSaved === 'function') props.onSaved(data)
        } catch (failure) {
          setMessage({
            tone: 'error',
            text: `${translate('saveFailed')}：${String(failure && failure.message ? failure.message : failure)}`,
          })
        } finally {
          setSaving(false)
        }
      }

      const paths = props.payload.paths ?? {}
      const pathRows = [
        ['dataDir', paths.dataDir],
        ['reportsDir', paths.reportsDir],
        ['todayReport', paths.todayReport],
        ['logFile', paths.log],
      ]

      return h(
        'div',
        { className: 'pd-settings' },
        h(
          'form',
          { className: 'pd-form', onSubmit: submit },
          h('h2', { className: 'pd-form-title' }, translate('settingsTitle')),
          h('p', { className: 'pd-form-hint' }, translate('settingsHint')),
          h(
            'div',
            { className: 'pd-field' },
            h(
              'label',
              { className: 'pd-switch' },
              h('input', {
                className: 'pd-checkbox',
                type: 'checkbox',
                checked: Boolean(draft.enabled),
                onChange: (event) => patch('enabled', event.target.checked),
              }),
              h('span', null, translate('fieldEnabled')),
            ),
          ),
          h(
            'div',
            { className: 'pd-row' },
            h(
              Field,
              { label: translate('fieldHour') },
              h('input', {
                className: 'pd-input',
                type: 'number',
                min: 0,
                max: 23,
                value: draft.hour,
                onChange: (event) => patch('hour', event.target.value),
              }),
            ),
            h(
              Field,
              { label: translate('fieldMinute') },
              h('input', {
                className: 'pd-input',
                type: 'number',
                min: 0,
                max: 59,
                value: draft.minute,
                onChange: (event) => patch('minute', event.target.value),
              }),
            ),
          ),
          h(
            'div',
            { className: 'pd-row' },
            h(
              Field,
              { label: translate('fieldMax') },
              h('input', {
                className: 'pd-input',
                type: 'number',
                min: 3,
                max: 30,
                value: draft.maxPerSection,
                onChange: (event) => patch('maxPerSection', event.target.value),
              }),
            ),
            h(
              Field,
              { label: translate('fieldKeep') },
              h('input', {
                className: 'pd-input',
                type: 'number',
                min: 1,
                max: 365,
                value: draft.keepDays,
                onChange: (event) => patch('keepDays', event.target.value),
              }),
            ),
          ),
          h(
            'div',
            { className: 'pd-field' },
            h(
              'label',
              { className: 'pd-switch' },
              h('input', {
                className: 'pd-checkbox',
                type: 'checkbox',
                checked: Boolean(draft.includePrerelease),
                onChange: (event) => patch('includePrerelease', event.target.checked),
              }),
              h('span', null, translate('fieldPre')),
            ),
          ),
          h(
            Field,
            { label: translate('fieldPackages'), hint: translate('fieldPackagesHint') },
            h('textarea', {
              className: 'pd-textarea',
              rows: 7,
              spellCheck: false,
              value: draft.packagesText,
              onChange: (event) => patch('packagesText', event.target.value),
            }),
          ),
          h(
            Field,
            { label: translate('fieldReportsDir'), hint: translate('fieldReportsDirHint') },
            h('input', {
              className: 'pd-input pd-mono',
              type: 'text',
              value: draft.reportsDir ?? '',
              placeholder: 'reports',
              onChange: (event) => patch('reportsDir', event.target.value),
            }),
          ),
          h(
            'div',
            { className: 'pd-form-foot' },
            h('button', { type: 'submit', className: 'pd-btn pd-btn-primary', disabled: saving }, saving ? translate('saving') : translate('save')),
            message
              ? h(
                  'span',
                  { className: `pd-save-note pd-notice-${message.tone}`, style: { border: '0', background: 'transparent', padding: 0, margin: 0 } },
                  message.text,
                )
              : null,
          ),
        ),
        h(
          'div',
          { className: 'pd-sidecol' },
          h(
            'section',
            { className: 'pd-card pd-card-plain' },
            h('header', { className: 'pd-card-head' }, h('h2', { className: 'pd-card-title' }, translate('pathsTitle'))),
            h(
              'dl',
              { className: 'pd-paths' },
              pathRows.map(([key, value]) =>
                h(
                  'div',
                  { className: 'pd-path-row', key },
                  h('dt', null, translate(key)),
                  h('dd', { className: 'pd-mono' }, value || '—'),
                ),
              ),
            ),
          ),
          h(
            'section',
            { className: 'pd-card pd-card-plain' },
            h('header', { className: 'pd-card-head' }, h('h2', { className: 'pd-card-title' }, translate('noteTitle'))),
            h(
              'ul',
              { className: 'pd-notes' },
              h('li', null, translate('noteFirst')),
              h('li', null, translate('noteReport')),
              h('li', null, translate('noteKeep')),
            ),
          ),
        ),
      )
    }

    function Page(props) {
      const translate = props.t
      const dashboard = useDashboard()
      const [tab, setTab] = React.useState('today')
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [dayDate, setDayDate] = React.useState(null)
      const [dayDigest, setDayDigest] = React.useState(null)
      const [dayLoading, setDayLoading] = React.useState(false)
      const [localeTick, setLocaleTick] = React.useState(0)

      React.useEffect(() => {
        ensureStyle()
        if (typeof props.subscribe !== 'function') return undefined
        return props.subscribe(() => setLocaleTick((value) => value + 1))
      }, [props.subscribe])

      const refresh = React.useCallback(async () => {
        setBusy(true)
        setNotice(null)
        try {
          const data = await requestJson(API.refresh, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          dashboard.update(data)
          const digest = data.result && data.result.digest ? data.result.digest : null
          const total = digest && digest.counts ? digest.counts.total : 0
          const failures = digest && Array.isArray(digest.failures) ? digest.failures : []
          if (failures.length) setNotice({ tone: 'warn', text: failures.join(' · ') })
          else setNotice({ tone: 'ok', text: `${translate('collected')} ${total}` })
        } catch (failure) {
          setNotice({ tone: 'error', text: String(failure && failure.message ? failure.message : failure) })
        } finally {
          setBusy(false)
        }
      }, [dashboard, translate])

      const openDay = React.useCallback(async (date) => {
        if (!date) return
        setDayDate(date)
        setDayLoading(true)
        try {
          const data = await requestJson(API.day(date))
          setDayDigest(data.digest ?? null)
        } catch {
          setDayDigest(null)
        } finally {
          setDayLoading(false)
        }
      }, [])

      React.useEffect(() => {
        if (tab !== 'history') return
        const days = dashboard.payload && Array.isArray(dashboard.payload.days) ? dashboard.payload.days : []
        if (!days.length) {
          setDayDate(null)
          setDayDigest(null)
          return
        }
        const exists = dayDate && days.some((row) => row.date === dayDate)
        if (!exists) openDay(days[0].date)
      }, [tab, dashboard.payload, dayDate, openDay])

      const payload = dashboard.payload
      const config = payload ? payload.config : null
      const digest = payload ? payload.digest : null
      const lastRun = payload ? payload.lastRun : null
      const running = Boolean(payload && payload.running)
      const totalToday = digest && digest.counts ? digest.counts.total : 0
      const tone = running ? 'busy' : lastRun && lastRun.ok === false ? 'warn' : lastRun ? 'ok' : 'idle'
      const statusText = running
        ? translate('collecting')
        : lastRun
          ? lastRun.ok === false
            ? translate('partial')
            : translate('ready')
          : translate('never')

      let nextText = '—'
      if (payload && payload.nextRun) {
        const next = payload.nextRun
        if (next.enabled === false) nextText = translate('autoOff')
        else nextText = next.due ? translate('dueNow') : fmtStamp(next.at)
      }

      let content = null
      if (dashboard.loading && !payload) {
        content = h('p', { className: 'pd-muted' }, translate('loading'))
      } else if (!payload) {
        content = h('p', { className: 'pd-muted' }, translate('loadFailed'))
      } else if (tab === 'history') {
        content = h(HistoryView, {
          payload,
          t: translate,
          dayDate,
          dayDigest,
          dayLoading,
          openDay,
        })
      } else if (tab === 'settings') {
        content = config
          ? h(SettingsView, {
              payload,
              t: translate,
              onSaved: (data) => {
                dashboard.update(data)
                setNotice({ tone: 'ok', text: translate('saved') })
              },
            })
          : h('p', { className: 'pd-muted' }, translate('loading'))
      } else if (digest) {
        content = h(DigestView, { digest, t: translate, reportUrl: API.report(digest.date) })
      } else {
        content = h(EmptyToday, { t: translate, onRefresh: refresh, busy: busy || running })
      }

      return h(
        'div',
        { className: 'pd-root', 'data-locale-tick': localeTick },
        h(
          'header',
          { className: 'pd-head' },
          h(
            'div',
            { className: 'pd-head-top' },
            h(
              'div',
              { className: 'pd-brand' },
              h('span', { className: 'pd-brand-icon' }, h(PythonIcon, { size: 24 })),
              h(
                'div',
                { className: 'pd-brand-text' },
                h('h1', { className: 'pd-title' }, translate('title')),
                h('p', { className: 'pd-subtitle' }, translate('subtitle')),
              ),
            ),
            h(
              'div',
              { className: 'pd-head-actions' },
              h('span', { className: `pd-pill pd-pill-${tone}` }, h('i', { className: 'pd-pill-dot' }), statusText),
              h(
                'button',
                {
                  type: 'button',
                  className: 'pd-btn pd-btn-primary',
                  disabled: busy || running,
                  onClick: refresh,
                },
                busy || running ? translate('collecting') : translate('refresh'),
              ),
            ),
          ),
          h(
            'div',
            { className: 'pd-stats' },
            h(
              'div',
              { className: 'pd-stat' },
              h('span', { className: 'pd-stat-key' }, translate('statToday')),
              h('span', { className: 'pd-stat-value' }, String(totalToday)),
            ),
            h(
              'div',
              { className: 'pd-stat' },
              h('span', { className: 'pd-stat-key' }, translate('statLast')),
              h('span', { className: 'pd-stat-value' }, lastRun ? fmtStamp(lastRun.at) : translate('never')),
            ),
            h(
              'div',
              { className: 'pd-stat' },
              h('span', { className: 'pd-stat-key' }, translate('statNext')),
              h('span', { className: 'pd-stat-value' }, nextText),
            ),
          ),
          h(
            'nav',
            { className: 'pd-tabs' },
            TABS.map((item) =>
              h(
                'button',
                {
                  key: item.id,
                  type: 'button',
                  className: `pd-tab${tab === item.id ? ' is-active' : ''}`,
                  onClick: () => setTab(item.id),
                },
                translate(item.label),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'pd-body' },
          h(
            'div',
            { className: 'pd-inner' },
            notice ? h('p', { className: `pd-notice pd-notice-${notice.tone}` }, notice.text) : null,
            dashboard.error
              ? h('p', { className: 'pd-notice pd-notice-error' }, `${translate('loadFailed')}：${dashboard.error}`)
              : null,
            content,
          ),
        ),
      )
    }

    /* ------------------------------------------------------------ 装配 */

    function apply(ctx) {
      ensureStyle()

      ctx.effect(
        () => {
          const disposers = ['zh', 'en'].map((localeId) => ctx.locale.register(NS, localeId, DICT[localeId]))
          return () => {
            for (const dispose of disposers) {
              if (typeof dispose === 'function') dispose()
            }
          }
        },
        'python-daily:locale',
      )

      const translate = ctx.locale.bind(NS)
      const subscribe = (listener) => ctx.locale.subscribe(listener)

      ctx.effect(
        () => {
          const mainDispose = ctx.slots.inject('main', () =>
            ctx.slots.register(
              { name: 'main', key: PANEL_ID, locale: NS },
              () => h(Page, { t: translate, subscribe }),
            ),
          )
          const navDispose = ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              { name: 'sidebar.panellist', id: PANEL_ID, order: PANEL_ORDER, label: () => translate('nav'), locale: NS },
              (slotProps) => h(PythonIcon, { size: slotProps && typeof slotProps.size === 'number' ? slotProps.size : 16 }),
            ),
          )
          return () => {
            if (typeof mainDispose === 'function') mainDispose()
            if (typeof navDispose === 'function') navDispose()
          }
        },
        'python-daily:slots',
      )
    }

    return { name: NS, inject: ['slots', 'locale'], apply }
  },
})
