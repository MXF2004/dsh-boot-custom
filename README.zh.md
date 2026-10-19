# DSH 开机动画插件 · dsh-boot-custom（完整手册）

> 本文是完整中文手册，包含全部配置项、运行时契约与排错。
> GitHub 首页、快速开始和性能优化说明见 [README.md](README.md)；版本变更见 [CHANGELOG.md](CHANGELOG.md)。

面向 DeepSeek Harness 桌面端的开机动画插件：多视频轮播、本地视频选择、播放速度、自定义音效、六种退场转场、Logo 文字、真实加载进度、跳过倒计时、分时段问候语，以及**首帧防白屏遮罩**。

- 包名 / patch 行 id / 宿主导出名：**`dsh-boot-custom`**（三者完全一致）
- 宿主入口：`src/index.ts` → `lib/index.js`（ESM）
- 客户端入口：`src/client/index.ts` → `lib/client.js`（classic script，经 `window.__ModuleLoader__` 注入）
- 已废弃的 `src/client.ts` 单文件路径**不存在**于本工程
- 运行时契约按桌面端实际打包的 **DSH 0.2.1-rc.2** 核对（`configEditor.edit(entry, change)`、`settings.section`、`webserver/index-inject`、`shell.overlay`），并保留 0.1.x 的 `ctx.settings` 命名空间降级

---

## 1. 功能总览

| 模块 | 能力 |
| --- | --- |
| 多视频轮播 | 任意数量视频源（上限 30，防误配置撑爆内存）；随机单次 / 顺序循环；单视频失败自动切下一条；全部失败平滑降级内置 CSS 动画 |
| 本地视频 | 系统文件选择器；MP4 / WebM / MOV；优先保存 `file:///` 绝对路径；沙箱拿不到路径时可选「仅本次预览」或「跨设备携带（base64）」；>50MB 明确提示 |
| 播放控制 | 0.25x–2x、步长 0.25、默认 1.0x；背景色；速度修改实时作用于预览 |
| CSS 动画风格 | 呼吸光晕 / 极光流影 / 星河流转 / 光带扫过 / 脉冲涟漪 / 霓虹网格 / 旋转光锥 / 纯净背景；纯 CSS 伪元素实现，无额外 DOM 与 JS 计时器；作用于 CSS 模式、首帧遮罩与视频失败兜底 |
| 音效 | 视频原音 / 自定义音效；本地音频 + 网络地址；MP3 / WAV / OGG；0–100% 音量；淡入淡出；默认关闭；加载失败自动静音 |
| 转场 | 平滑淡入 / 上滑退场 / 缩放消散 / 黑场过渡 / 模糊渐隐；0.1–2s、默认 0.3s；只用 transform / opacity / filter，带 `will-change` |
| Logo | 多行文字、字号、颜色、发光及颜色、垂直位置、字体、视频模式水印叠加、独立开关；淡入 + 呼吸 |
| 进度条 | 纤细线条 / 圆角胶囊 / 渐变光效；前景色、轨道色、顶部/底部、百分比开关、真实进度开关；真实信号 + 平滑缓动 |
| 跳过倒计时 | 0–10s；启动即计时，期间锁定跳过；结束后任意非功能键或鼠标点击即可跳过；app ready 与动画时长同时满足才退场；中央 / 右下 / 进度条上方；独立字号、颜色、发光、提示文字 |
| 进入时机 | 启动动画至少播放 `bootDuration` 秒（默认 3s，可设 0–18s）；应用未就绪时继续等待；两者都满足后才显示软件页面 |
| 问候语 | 固定 / 分时段（凌晨、早晨、中午、下午、晚上、深夜）/ 随机语录；多行、Emoji；淡入上浮 / 打字机；独立开关与垂直位置；视频模式半透明叠加且层级低于 Logo |
| 首帧 | 宿主向 `webserver/index-inject` 注入 `global / style / html / script` 行；第一帧即遮罩；`end()` 交接 + 12s 未认领自保；不修改 `dist/index.html` |
| 桌面适配 | `navigator.windowControlsOverlay.getTitlebarAreaRect()` + `geometrychange` + `env(titlebar-area-height)` 降级；两者皆无时为 0，不硬编码像素 |
| 无障碍 | `prefers-reduced-motion: reduce` 时不播视频、不做入场动画，遮罩保留纯色并隐藏 CSS 装饰背景动画，app ready 后以 0.1s 转场退场 |
| 兜底 | 20s 强制结束；所有异步链路捕获；`apply` 绝不 throw |

---

## 2. 工程结构

```text
dsh-boot-custom/
├─ package.json                 # 元数据、dsh.bundle.patch、files、入口
├─ cordis.patch.yml             # bundle patch：insert 行 id = 包名
├─ tsconfig.host.json           # 宿主 tsc：src → lib
├─ tsconfig.client.json         # 客户端类型检查（jsxFactory = h）
├─ tsconfig.json                # 编辑器/全量类型检查
├─ scripts/
│  └─ build.mjs                 # tsc(host) + esbuild(client) + 模块加载器包装
├─ src/
│  ├─ index.ts                  # 宿主入口：Config、首帧注入、路由、配置存储
│  ├─ host/
│  │  ├─ schema.ts              # schemastery Config + settings 命名空间 schema
│  │  ├─ store.ts               # configEditor → settings → JSON 三层存储
│  │  ├─ routes.ts              # /plugins/dsh-boot-custom/config 读写
│  │  └─ first-frame.ts         # 首帧 CSS/HTML/脚本行生成
│  ├─ client/
│  │  ├─ index.ts               # 客户端入口：inject = ['slots'] + apply
│  │  ├─ overlay.ts             # shell.overlay 槽位注册/释放/预览
│  │  ├─ boot/                  # controller / video / audio / progress / ready / countdown / 样式
│  │  ├─ runtime/               # ledger（统一资源账本）、env、DOM
│  │  └─ settings/              # 配置面板、控件、文件处理、客户端存储
│  └─ shared/                   # 双端共用：类型、默认值、校验、CSS 背景动画、问候/轮播
├─ tests/                       # node:test：契约、首帧 VM、配置、存储、jsdom 冒烟
└─ lib/                         # 构建产物（可直接安装）
   ├─ index.js / index.d.ts
   ├─ host/…  shared/…
   └─ client.js
```

> **为什么客户端入口必须是 `src/client/index.ts`**：DSH 的客户端模块扫描以 `package.json` 的 `dsh.client` + `exports["./client"]` 为准；`src/client.ts` 单文件路径在 0.1.7+ 已停用。构建脚本固定从 `src/client/index.ts` 打包。

---

## 3. 构建

### 环境

- Node.js `^22.13.0 || >=24.0.0`
- npm（或 pnpm）
- 仅构建需要联网安装 devDependencies

### 命令

```bash
npm install
npm run typecheck      # 宿主 + 客户端严格类型检查
npm run build          # 产出 lib/index.js 与 lib/client.js
npm test               # 54 个测试（会先自动 build）
npm pack               # 生成 dsh-boot-custom-1.0.1.tgz
```

构建细节：

1. **宿主**：`tsc -p tsconfig.host.json`，`src/index.ts` → `lib/index.js`，同时输出 `lib/host/*`、`lib/shared/*` 与 `.d.ts`。ESM，`module: NodeNext`。
2. **客户端**：esbuild 将 `src/client/index.ts` 打成 CommonJS（`react` 外置），再由 `scripts/build.mjs` 包成 DSH 期望的 classic script：

   ```js
   window.__ModuleLoader__.load({
     id: "dsh-boot-custom",
     factory: (require) => {
       var module = { exports: {} };
       var exports = module.exports;
       /* esbuild bundle */
       return module.exports;
     },
   });
   ```

   `require("react")` 由壳层 `PLATFORM_MODULES` 提供；不要改成 ESM，也不要给客户端加 `import` 到浏览器外部包。

### 注意

- `lib/` 必须随包发布：`files` 已包含 `"lib"`。
- `cordis.patch.yml` 必须随包发布：`files` 已显式包含它；否则安装方拿不到配置层。
- 修改 `src/` 后要重新 `npm run build`；直接改 `lib/` 会在下次构建被覆盖。
- 构建脚本会先删除 `lib/`，避免旧 chunk 残留。

### 3.1 启动性能（1.0.0）

- 客户端 bundle 使用 esbuild `minify`，体积从约 178 KB 降到约 99 KB，减少启动时的下载、解析与执行时间。
- 默认「启动动画时长」从 5s 调整为 3s；仍可在设置中调到 0–18s。
- 启动时长从首帧绘制开始计时，首帧遮罩的展示时间计入 3s，不会在客户端挂载后额外叠加。
- 首帧注入只输出当前选中 CSS 风格的 keyframes，不再把 8 种风格全部写进 HTML。
- 视频正常播放时暂停 fallback 的 CSS 动画（`animation-play-state: paused`），避免后台空转。
- 0.2.x config-editor 路径不额外读取配置文件；首帧与客户端共享同一份规范化配置。

---

## 4. 安装

### 4.0 从旧名称升级（旧版本 → 1.0.0）

项目已从 `dsh-boot-animation` 更名为 **`dsh-boot-custom`**，包名、patch 行 id、宿主导出名、路由、设置命名空间、数据目录和 DOM id 都已统一更新。升级时请注意：

1. 先卸载旧包，避免两个开机动画同时激活：
   ```powershell
   dsh plugin --profile desktop remove dsh-boot-animation
   ```
2. 从 profile 的 `dsh.profile.bundles` 中移除 `dsh-boot-animation`；如果 `cordis.patch.yml` 里还留有旧 `dsh-boot-animation` 行，也一并删除。
3. 旧配置**不会自动迁移**（命名空间 `boot-animation` → `boot-custom`，数据目录同理）。可以在新设置页重新配置，或手动迁移：
   - 0.2.x：把 profile `cordis.patch.yml` 中旧行 `dsh-boot-animation` 的 `config` 复制到新行 `dsh-boot-custom`；
   - 0.1.x：把旧设置命名空间 / `<profile>/boot-animation/config.json` 的内容迁移到 `<profile>/boot-custom/config.json`。
4. 工作目录已重命名为 `dsh-boot-custom`；插件身份仍以 `package.json` 的 `dsh-boot-custom` 为准。

### 4.1 通过 DSH CLI（推荐）

桌面端自带的 CLI 会把声明了 `dsh.bundle.patch` 的依赖自动追加到 profile 的 `dsh.profile.bundles`。

```powershell
# 在工程目录构建并打包
npm install
npm run build
npm pack

# 安装到 desktop profile（路径换成你的实际路径）
dsh plugin --profile desktop add "D:\path\to\dsh-boot-custom\dsh-boot-custom-1.0.1.tgz"
```

本地开发时也可以直接装目录：

```powershell
dsh plugin --profile desktop add "file:D:\path\to\dsh-boot-custom"
```

`link:` 也可用，但 pnpm 不会为链接包安装依赖；请确保工程内已执行过 `npm install`（本工程运行期只依赖 `@deepseek-ai/schemastery`）。

### 4.2 确认 profile

安装后检查 `%USERPROFILE%\.dsh\profiles\desktop\package.json`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "...",
        "dsh-boot-custom"
      ]
    }
  }
}
```

若 CLI 没有自动追加，手动把 `"dsh-boot-custom"` 放进 `bundles` 数组。

### 4.3 重启

**完全退出并重新启动 DSH 桌面端**（不是只刷新页面）：宿主侧的 bundle patch、`Config` 与 index 注入在启动阶段装配。

### 4.4 打开设置

设置 → 左侧「开机动画」。

### 4.5 卸载

```powershell
dsh plugin --profile desktop remove dsh-boot-custom
```

并确认 `dsh.profile.bundles` 中已移除，重启桌面端。配置文件默认在：

```text
%USERPROFILE%\.dsh\profiles\desktop\boot-custom\config.json
```

（仅在最终降级到 JSON 存储时创建；使用 configEditor / settings 时不需要它。）

---

## 5. 配置项

所有字段在宿主与客户端共用 `src/shared/types.ts` 的同一套键名，保存前统一经过 `normalizeConfig()` 校验。

### 5.1 基础设置

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关。关闭后宿主不注入首帧遮罩，客户端立即认领并退出 |
| `mode` | `css` | `css` 纯 CSS 动画；`video` 视频轮播 |
| `allowSkip` | `true` | 关闭后倒计时隐藏，点击 / 任意非功能键全部无效 |
| `bootDuration` | `3` | 0–18 秒，步长 0.5；从首帧绘制开始计时，动画至少播放这么久再进入应用；应用未就绪时继续等待；0 表示不额外等待 |

### 5.2 视频轮播

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `videos` | `[]` | 视频源列表；支持 `https://`、`file:///`、`./relative`、`data:video/...`；最多 30 条 |
| `videoMode` | `random` | `random` 每次启动随机；`sequence` 按列表顺序循环（游标存 localStorage） |

### 5.3 播放控制

| 字段 | 默认 | 范围 |
| --- | --- | --- |
| `playing.rate` | `1` | 0.25–2，步长 0.25 |
| `playing.background` | `#0b1220` | 视频未覆盖时的底色 / CSS 模式背景 |
| `cssAnimation` | `breathe` | `breathe` / `aurora` / `starfield` / `sweep` / `pulse` / `grid` / `spotlight` / `none` |

**CSS 动画风格说明**（颜色自动跟随 `logo.glowColor`）：

- `breathe` 呼吸光晕：中央柔光缓慢呼吸，最克制，适合默认深色背景；
- `aurora` 极光流影：蓝 / 紫 / 青三团光斑漂移，色彩最丰富；
- `starfield` 星河流转：星点缓慢漂移并闪烁，偏安静；
- `sweep` 光带扫过：斜向高光周期性掠过，适合简洁品牌页；
- `pulse` 脉冲涟漪：两圈光环从中心扩散，节奏感强；
- `grid` 霓虹网格：底部透视网格向前流动，带一点赛博感；
- `spotlight` 旋转光锥：大面积光锥缓慢旋转，氛围最强；
- `none` 纯净背景：只保留底色与基础径向渐变，不播放装饰动画。

所有风格都只作用于背景层，Logo / 问候语 / 进度条 / 倒计时的布局与动效不变；`prefers-reduced-motion: reduce` 时装饰层整体隐藏，只保留纯色遮罩。

### 5.4 Logo

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `logo.enabled` | `true` | 独立开关 |
| `logo.text` | `DeepSeek` | 多行，`white-space: pre-line` |
| `logo.fontSize` | `64` | 12–160px |
| `logo.color` | `#eaf4ff` | CSS 颜色 |
| `logo.glow` / `logo.glowColor` | `true` / `#4f9dff` | 发光 |
| `logo.vertical` | `40` | 相对标题栏安全区 0–100% |
| `logo.fontFamily` | `system-ui` | 允许字母、数字、空格、引号、逗号、连字符 |
| `logo.overlayInVideo` | `true` | 视频模式下半透明水印 |

### 5.5 问候语

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `greeting.enabled` | `true` | 独立开关 |
| `greeting.mode` | `time` | `fixed` / `time` / `random` |
| `greeting.fixedText` | `欢迎回来` | 固定文本 |
| `greeting.timeTexts` | 6 段默认文案 | `dawn/morning/noon/afternoon/evening/night` |
| `greeting.randomTexts` | 4 条 | 每行一条 |
| `greeting.fontSize` | `20` | 8–96px |
| `greeting.color` / `glow` / `glowColor` | `#a9c4e4` / `false` / `#4f9dff` | 样式 |
| `greeting.fontFamily` | `system-ui` | 末尾附带系统 Emoji fallback |
| `greeting.vertical` | `52` | 与 Logo 错开排布，层级低于 Logo |
| `greeting.animation` | `fade` | `fade` 淡入上浮 / `typewriter` 打字机 |
| `greeting.overlayInVideo` | `true` | 视频模式半透明叠加 |

时段划分：凌晨 0–4、早晨 5–8、中午 9–11、下午 12–17、晚上 18–22、深夜 23。

### 5.6 进度条

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `progress.enabled` | `true` | 显示开关 |
| `progress.style` | `capsule` | `line` / `capsule` / `glow` |
| `progress.color` | `#4f9dff` | 前景色 |
| `progress.trackColor` | `rgba(255,255,255,0.14)` | 轨道色 |
| `progress.position` | `bottom` | `top` / `bottom` |
| `progress.showPercent` | `false` | 百分比数字 |
| `progress.realProgress` | `true` | 真实信号；关闭则时间模拟 |

### 5.7 跳过倒计时

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `countdown.enabled` | `true` | 启用开关（`allowSkip=false` 时自动隐藏） |
| `countdown.seconds` | `3` | 0–10；0 表示立即可跳过 |
| `countdown.fontSize` | `15` | 8–56px |
| `countdown.color` / `glow` / `glowColor` | `#cfe2f7` / `false` / `#4f9dff` | 样式 |
| `countdown.position` | `bottom-right` | `center` / `bottom-right` / `above-progress` |
| `countdown.hintText` | `秒后可跳过` | 数字后的提示 |
| `countdown.showHint` | `true` | 是否显示提示；解锁后固定显示「点击/按键跳过」 |

### 5.8 转场

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `transition.style` | `fade` | `fade` / `slide-up` / `zoom` / `black` / `blur` |
| `transition.duration` | `0.3` | 0.1–2s，步长 0.1 |

### 5.9 音效

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `audio.enabled` | `false` | 总开关 |
| `audio.source` | `video` | `video` 原音 / `custom` 自定义 |
| `audio.file` | `''` | 本地路径、http(s)、相对路径或 `data:audio/...` |
| `audio.volume` | `50` | 0–100 |
| `audio.fade` | `true` | 淡入淡出 |

---

## 6. 运行时契约

### 6.1 命名与 patch

`package.json`：

```json
{
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib", "src", "cordis.patch.yml", "README.md", "README.zh.md", "icon.svg"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }
  }
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: dsh-boot-custom
      name: 'dsh-boot-custom'
```

宿主 `src/index.ts`：

```ts
export const name = PACKAGE_NAME   // 'dsh-boot-custom'
export const inject = ['webServer']
export { Config }
export function apply(ctx, config) { /* 永不 throw */ }
```

### 6.2 Config 的 volatile 锚点

`src/host/schema.ts` 中 `Config` 的每个顶层分组都调用 `.volatile()`。这是 0.1.7+ 的硬性契约：

- 没有 volatile 字段，宿主不会为该条目渲染设置表单，`configEditor.edit()` 也会拒绝写入；
- volatile 字段解析为 `Volatile<T>` 引用，`apply` 收到的是引用而不是普通值；
- `readField()` 同时兼容两种形态：

```ts
function readField(value) {
  return value && typeof value.get === 'function' ? value.get() : value
}
```

低于 schemastery 3.18.4 时，`maybeVolatile()` 检测不到 `.volatile` 方法会自动退化为普通字段，插件仍可加载，只是热更新不可用。

### 6.3 配置存储三层

1. **`ctx.configEditor`（桌面端 0.2.x 实际路径）**

   从 `app.asar` 中 `@deepseek-ai/dsh-config-editor` 提取到的真实签名：

   ```ts
   edit(entry, change: (current, inherited) => nextConfig)
   ```

   - 第一个参数是**当前 Loader entry 对象**，不是 patch 行 id 字符串；
   - 第二个参数是**函数**，返回下一份原始配置；
   - 写入后由 Loader 完成 volatile 提交与热更新。

   宿主通过 `ctx.fiber.entry` 取得 entry，取不到时回退 `loader.entries()` 中 `options.id === 'dsh-boot-custom'` 的条目。两者都不可用时自动降级到下一层。

2. **`ctx.settings` 命名空间（0.1.x）**

   注册 `boot-custom` 命名空间；启动时若发现旧 `config.json` 且命名空间为空，会一次性迁移。`scope.replace(fullConfig)` 写入，`scope.watch` 实时重读。

3. **`<profile>/boot-custom/config.json`**

   原子写（临时文件 + rename）。仅在以上两层都不可用时启用。

宿主同时监听：

- `settings/updated`（0.1.x 提交）
- `loader/volatile-update`（0.2.x volatile 提交，引用原地更新）

### 6.4 首帧闭环（严格顺序）

1. 宿主订阅 `webserver/index-inject`，向注入表 push：
   - `global`：`__BOOT_ANIM_CONFIG__`、`__BOOT_ANIM_META__`
   - `style`：首帧遮罩 CSS
   - `html`（body）：遮罩节点
   - `script`（body）：首帧控制器
2. 遮罩节点在应用根节点之前渲染，所以**第一帧就是遮罩**，不经过原生 Loading / 白屏。
3. 脚本定义：

   ```js
   globalThis.__BOOT_ANIM_FIRST_FRAME__ = { end() { ... } }
   ```

   `end()` 内**先**置 `__BOOT_ANIM_FIRST_FRAME_CLAIMED__ = true`，再隐藏/移除遮罩。
4. 客户端退场时调用 `end()`；即使 `end()` 缺失也会直接移除节点。
5. 脚本自带 **12s** 自保定时器：只有 `CLAIMED` 不为 true 时才自动隐藏。
6. 优先级：客户端主动交接 > 自保兜底。既避免无障碍场景下自保抢先隐藏导致白屏，也保证客户端异常时遮罩不会永久挡住界面。
7. 遮罩移除时脚本会一并移除自己注入的 `<style>`，避免 `html, body` 的背景色长期覆盖应用主题。

相关测试：`tests/first-frame.test.mjs` 用 `node:vm` 真正执行脚本，验证认领顺序、12s 未认领隐藏、已认领不隐藏、重复安装幂等。

### 6.5 槽位

- 动画容器：`shell.overlay`（list / root 作用域，常驻、点击穿透，条目自行开启 `pointer-events`）。
  - `apply` 中先尝试直接 `ctx.slots.register()`；若布局尚未声明该槽位，自动回退 `ctx.slots.inject('shell.overlay', …)`，两种情况都不会阻塞启动。
  - 退场完成后**注销槽位条目**；下次预览再按需注册。
- 设置页：`settings.section`（list / root）。0.2.1 的设置壳仍渲染该槽位（已从 `ui-settings-general` 源码核对），因此「开机动画」会出现在系统设置左侧导航。

### 6.6 失败行为

- 宿主 `apply` 外层 try/catch，只 `console.warn`，绝不向调用栈抛错。
- 客户端 `apply` 同理；失败时调用 `claimFirstFrame()`，保证遮罩不会挡住界面。
- 路由、媒体、音频、文件读取、设置写入全部 catch；没有未处理的 Promise rejection。
- 硬超时 20s 强制退场，避免异常卡死。

### 6.7 真实进度

浏览器端无法直接读取 Loader 的逐插件 ACTIVE 状态，因此进度采用**真实信号 + 平滑缓动**：

- `app/ready` 事件（可用时）；
- 客户端运行时若存在 `internal/plugin` 装载变化事件，每次变化都会抬高真实进度上限；不存在时不影响其它信号；
- `#root` 已挂载且有子节点；
- `[data-slot="shell.overlay"]`、`sidebar`、`main` 等壳层座位出现；
- `document.readyState === 'complete'`；
- `document.fonts.status === 'loaded'`；
- `__DSH_BOOT_READY__`（宿主注入状态就绪，仅作为门闩，不代表 UI 就绪）；
- 4s UI 探测保底；
- `progress.realProgress=false` 时退化为时间曲线（上限 94%，app ready 后补满）。

进度值只增不减，用 rAF 做指数缓动，避免生硬跳变。

### 6.8 媒体与清理

- 只有当前视频创建 `<video>`，`preload="auto"`；其余仅保留字符串。
- 切换/失败/退场时：`pause()` → 移除 `src` → `load()` → 移除节点。
- 所有定时器、rAF、事件监听、媒体实例都由 `Ledger` 记录，`endRun()` 逆序释放；`Ledger` 的生命周期挂在 `ctx.effect()` 上。
- 预览用 `Object URL` 时，控件把 `onDispose` 传给控制器，退场即 `revokeObjectURL`。
- 顺序游标随 `localStorage` 持久化，异常时静默回到 0。

### 6.9 标题栏安全区域

1. `navigator.windowControlsOverlay.getTitlebarAreaRect()` 精确几何；
2. `geometrychange` + `resize` 实时更新 `--dba-titlebar`；
3. CSS 默认 `env(titlebar-area-height, 0px)`；
4. 都不可用时为 0，不硬编码像素。

Logo / 问候语的垂直位置以 `--dba-titlebar` 之后的安全区为基准，不覆盖窗口控制按钮。视频本身铺满全屏（含标题栏区域），文字与倒计时在安全区内。

### 6.9.1 全窗口定位与预览展示

动画容器的生命周期仍由 `shell.overlay` 槽位条目持有，但视觉宿主由该条目的 React effect 挂载到 `<body>` 下（`.dba-slot { display: contents }`）。因此 `#dsh-boot-custom-root { position: fixed; inset: 0; }` 的包含块是视口，而不是 AppFrame 的 grid/transform 祖先：遮罩完整覆盖左侧侧边栏、顶部标题栏与整个窗口，Logo / 问候语 / 进度条 / 倒计时始终以整个窗口为基准居中，侧边栏展开或收起不会造成横向偏移。

> 定位 wrapper（`.dba-logo-wrap` / `.dba-greeting-wrap`）只负责 `left:50% + translate(-50%,-50%)` 的居中变换；入场、呼吸、打字机动画分别放在内层 `.dba-logo` / `.dba-logo-text` / `.dba-greeting` 上。这样 CSS animation 的 `transform` 不会覆盖居中变换——这是此前整体右移、文字从左半边开始的直接原因。

预览时，设置面板（0.2.x settings shell 的 body 级 portal）会被临时隐藏：

- `<html>` 增加 `dba-previewing`，CSS 精确命中 `body > div:has([data-shortcut-modal="settings"])`；
- 同时对该 portal 写入内联 `visibility:hidden / pointer-events:none / opacity:0`，覆盖不支持 `:has()` 的环境；
- 不关闭 modal、不卸载面板，因此当前分区与草稿原样保留；
- 预览期间点击任意位置或按任意非功能键可立即关闭预览（仅预览路径；真实开机仍受「允许跳过」与倒计时约束）；
- 动画结束、跳过、视频结束、超时或 15s 安全计时任一到达，都会移除隐藏状态并恢复设置面板。

### 6.10 系统标题栏与右上角按钮融合

Windows 桌面端的最小化 / 最大化 / 关闭按钮是 **Electron 原生 caption buttons**（`titleBarOverlay`），不是插件绘制的控件。桌面 preload 通过一个隐藏探针读取 `--dsw-specific-sidebar-fill` 与 `--dsw-alias-label-primary`，再把计算值发给主进程 `setTitleBarOverlay()`；这正是默认会出现「独立系统栏颜色」的原因。

插件不覆盖应用主题 token（避免影响遮罩后面的界面），而是：

- 在首帧 CSS 与客户端样式表中，用 `body > :is([style*="--dsw-specific-sidebar-fill"], [style*="--dsw-alias-label-primary"])` 精确命中该探针；
- 把探针背景设为 `rgba(0, 0, 0, 0) !important`，原生标题栏因此透明，按钮区域直接显示开机遮罩 / 全窗口背景；
- 把探针颜色设为 `var(--dba-titlebar-symbol, <自动对比色>)`：深色背景用 `#f9fafb`，浅色背景用 `#0f1115`；
- 客户端在视频首帧与每 1.6s 采样视频右上角（按 `object-fit: cover` 的裁切映射），更新对比色；CSS 模式使用配置的背景色；
- 退场后移除探针规则与私有变量，原生标题栏恢复应用主题色。

边界：原生按钮的边框、阴影与 hover 高亮由 Windows / Electron 绘制，插件无法改写；本方案移除了插件侧的任何底色、边框与阴影，让标题栏透明并让图标颜色自适应。原生 hover 本身已是轻微半透明状态提示。如果以后增加图片背景，只需在图片层采样后调用 `updateTitlebarFusion(color)`；透明标题栏会自动透出图片，Logo、问候语与动画主体不受影响。

### 6.11 无障碍

- `prefers-reduced-motion: reduce`：不创建视频、不做入场动画、不呼吸；保留首帧纯色遮罩；app ready 后 0.1s 退场。
- 倒计时 `role="status" aria-live="polite"`。
- 任意非功能键（不限于 Esc / 空格；F1–F12 除外）或鼠标点击仅在动画运行、倒计时已解锁且 `document.activeElement` 不是 `input / textarea / select / contenteditable` 时生效。

---

## 7. 本地文件选择说明

浏览器沙箱默认不把真实路径交给渲染进程。插件按以下顺序处理：

1. **能拿到绝对路径**（Electron preload 暴露 `getPathForFile`，或旧版 `File.path`）：
   保存 `file:///C:/...` 字符串，预览与下次启动都直接使用。
2. **拿不到路径**：弹出选择框
   - 「跨设备携带（base64）」：`FileReader` 转 data URL 后写入配置；
   - 「仅本次预览」：创建 Object URL 交给控制器，退场即回收，不写入配置；
   - 「取消」：立即回收 Object URL。
3. **手动输入框**始终保留，可直接粘贴 `file:///` 绝对路径或网络地址。

限制与保护：

- 视频 base64 源文件硬上限 72MiB（data URL 约 96Mi 字符 / 100.7MB），超出按钮禁用；
- 单次请求体上限 128MB；
- 文件 >50MB 时提示优先使用本地路径；
- 浏览器禁用了 `file://` 跨源读取时，改用网络地址或 base64。

---

## 8. 自动播放与音效

- 音效关闭时视频强制 `muted`，符合浏览器自动播放策略。
- 音效开启时先尝试有声播放；若被策略拒绝：
  - 视频层自动改 `muted` 并重试；
  - 音效控制器标记 `blocked`，动画继续、无声；
  - 自定义音频 `Audio.play()` 被拒绝时同样静音降级。
- 音效与视频的 `play / pause / ended / seeked` 同步；`timeupdate` 驱动结尾淡出。
- 音效加载失败只 `console.warn`，不影响动画。

---

## 9. 测试与验证

```bash
npm test
```

共 54 个测试：

- `tests/config.test.mjs`：默认值、范围/步长、颜色/字体/URL 白名单、视频去重与上限、六时段、问候语三种模式、轮播游标、Windows 路径转 URL、原型污染、输入不可变性；新增 CSS 颜色解析、相对亮度与标题栏图标对比色、UNC/远程 `file://` 拒绝，以及中英文区域判断。
- `tests/first-frame.test.mjs`：注入行顺序、启用/禁用分支、HTML 转义、无 `</script` / `</style`；`node:vm` 执行首帧脚本，验证 `end()` 认领顺序、12s 未认领自保、已认领不自保、重复安装幂等、只删除带标记的首帧样式；新增 `pointer-events:none`、纯 CSS 12s 兜底与透明标题栏探针规则。
- `tests/contract.test.mjs`：`package.json` 强制字段、patch 行 id / 包名 / 宿主导出名一致、volatile 锚点、`src/client.ts` 不存在、客户端 bundle 的加载器外壳与 `inject = ['slots']`、宿主 ESM/schemastery 外置、注入版本与 `package.json` 一致。
- `tests/store.test.mjs`：0.2.1 `configEditor.edit(entry, changeFn)` 真实契约、settings 命名空间优先级/写入/watch、JSON 原子写与恢复默认；新增“恢复默认会删除遗留 `config.json`，旧值不会回弹”。
- `tests/routes.test.mjs`：配置读写接口只接受 loopback `Host` 和本次激活的会话 token；缺少 token、DNS rebinding Host 均返回 403。
- `tests/dom-smoke.test.mjs`：jsdom + React 真实挂载 `shell.overlay` 条目，验证 app ready 提前到达时仍受 bootDuration 下限约束（不会提前进入页面）、随后正常退场、遮罩被认领并移除、槽位条目释放、标题栏融合样式安装与退场清理、宿主为 body 直系子节点（视口定位）、无 activation 失败。
- `tests/preview-presentation.test.mjs`：用 esbuild 内存构建后直接测试真实 `preview-presentation.ts`，验证设置 portal 隐藏/精确恢复、焦点释放、重复调用与引用计数、以及找不到 portal 时的安全降级。
- `tests/preview-controller.test.mjs`：内存打包真实 controller，验证预览在 allowSkip=false、10s 倒计时锁定时仍可立即关闭，并只触发一次 onDispose / onFinished、移除遮罩与标题栏融合；新增 CSS 模式 + 无视频时自定义音效仍会创建并播放。
- `tests/css-effects.test.mjs`：校验 8 种风格均有标签与选择器规则、`none` 不生成动画规则、首帧注入只包含当前风格、输出不含 `</style`。

### 契约核对来源

本工程的运行时契约不是猜测：已从桌面端 `app.asar` 中提取并核对了：

- `@deepseek-ai/dsh-config-editor`：`edit(entry, change)` 的真实签名；
- `@deepseek-ai/dsh-host-webserver`：`index-inject` 的 `global/style/html/script` 行类型与 `collectIndexInjections()`；
- `@deepseek-ai/dsh-client-ui-settings-general`：`settings.section` 槽位与 `{close}` owner props；
- `@deepseek-ai/dsh-client-ui-layout`：`shell.overlay` 为 list/root；
- `lib/preload-app.cjs` 的 `syncWindowsAppearance`：隐藏探针读取 `--dsw-specific-sidebar-fill` / `--dsw-alias-label-primary` 并转发 `setTitleBarOverlay()`，本插件据此实现标题栏自适应；
- `@deepseek-ai/dsh-settings`：0.2.x 表单向导与 0.1.x 命名空间的关系。

---

## 10. 兼容性

| 运行时 | 行为 |
| --- | --- |
| 桌面端 0.2.1-rc.2（当前 `app.asar`） | 走 `configEditor.edit(entry, change)`；`settings.section` 正常显示；首帧注入与 `shell.overlay` 契约一致 |
| 0.1.7+（按用户规范） | volatile Config、`configEditor`、`loader/volatile-update` 路径均已实现；`apply` 同时兼容引用/普通值 |
| 0.1.x（无 configEditor） | 自动回退 `ctx.settings` 的 `boot-custom` 命名空间；再回退 JSON 文件 |
| 无 settings 插件 | 设置页仍会向 `settings.section` 等待声明；动画与首帧不受影响 |
| schemastery < 3.18.4 | `.volatile()` 自动退化，插件正常加载，仅热更新不可用 |

> 说明：工程在当前机器上完成了构建、54 项自动化测试与 jsdom 真挂载冒烟；未在正在运行的桌面 GUI 内做安装回归（避免修改用户 profile）。安装到 profile 后建议先看宿主/客户端控制台的 `[dsh-boot-custom]` 日志。

---

## 11. 故障排查

| 现象 | 排查 |
| --- | --- |
| 插件不加载 / PENDING | 客户端是否 `export const inject = ['slots']`；profile 是否含 `@deepseek-ai/dsh-client-ui-renderer`；控制台是否有 activation 警告 |
| 设置页没有「开机动画」 | 设置壳是否加载；`settings.section` 是否被声明；客户端是否在 `apply` 阶段报错 |
| 首帧白屏后进入应用 | 宿主是否加载 `webServer`；`webserver/index-inject` 是否被收集；`dist/index.html` 是否被别的东西覆盖 |
| 遮罩一直不消失 | 客户端是否异常；正常路径 12s 自保、20s 硬超时；遮罩本身 `pointer-events:none` 且 12s 纯 CSS 淡出，不会再锁住输入；看 `[dsh-boot-custom]` 日志 |
| 视频黑屏 | 编码/容器是否受 Chromium 支持；`file://` 是否被允许；换网络地址或 base64 测试；看 `every video source failed` 警告；UNC/远程 `file://` 已被拒绝 |
| 没有声音 | 自动播放策略；首屏无用户手势时大概率被拒；CSS 模式、无视频或减少动态效果下自定义音效仍会启动，被拒后自动静音降级 |
| 保存失败 | 面板状态会显示具体错误；检查 `/plugins/dsh-boot-custom/config` 是否 403/400；确认 `configEditor` entry 或 settings 命名空间可用；若宿主重启过，刷新页面以取得新的会话 token |
| 设置面板空白 / 看不到 × | 插件会把设置壳外层 dialog 固定为 `overflow:clip`，并在操作区提供「关闭设置」；如果仍出现，检查 profile 是否残留旧 `dsh-boot-animation` 行，完全退出桌面端后重启 |
| 配置重启后丢失 | 是否用了「仅本次预览」；base64 是否超过上限；`dsh.profile.bundles` 是否仍包含本包 |

---

## 12. 已知限制与设计取舍

1. **同时只有一个 `<video>`**：这是预加载策略的要求，不做多实例预加载。
2. **视频源上限 30**：避免误粘贴几十条 base64 撑爆配置与内存；可在 `LIMITS.maxVideos` 调整。
3. **base64 硬上限 72MiB 源文件**：再大建议用绝对路径；这是对配置文件和宿主内存的保护。
4. **`file://` 受 Electron 安全策略约束**：若桌面端禁止本地文件跨源，选择器仍可用于「仅本次预览 / base64」。
5. **客户端无法读取 Loader 逐插件状态**：用 `app/ready` + DOM/槽位探测 + `__DSH_BOOT_READY__` 门闩 + 时间模拟兜底，已在 README 6.7 说明。
6. **首帧遮罩铺满全屏（含标题栏）**：这是防白屏的需要；文字与倒计时在安全区内，不遮挡窗口按钮。
7. **音效可能被自动播放策略拒绝**：这是 Chromium 的行为，插件选择静音降级而不是阻塞动画。
8. **随机问候语一致性**：宿主在渲染 index 时解析一次并写入 `__BOOT_ANIM_META__.greeting`，客户端启动复用同一句，避免遮罩与动画文案跳变。
9. **右上角按钮是 Windows 原生 caption buttons**：插件能把标题栏背景变透明、把图标颜色按启动背景自适应，但无法改写 Windows 自己绘制的按钮边框、阴影与 hover 动画；原生 hover 本身就是轻微半透明提示。详见 6.10。
10. **图片背景的对比色采样**：当前自动采样覆盖视频右上角与纯色背景；若未来加入图片背景，在图片层调用 `updateTitlebarFusion(sampledColor)` 即可复用同一机制。

---

## 13. 许可

MIT。见 [LICENSE](LICENSE)。
