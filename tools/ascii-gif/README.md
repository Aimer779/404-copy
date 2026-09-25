# ASCII GIF

把 GIF 收成可复用的字符动画。模块自己完成解码、帧合成、灰度取样和 Canvas 绘制。页面提供时钟和颜色。

运行时不请求 CDN。`gifuct-js` 的发布入口是 CommonJS，浏览器用的是已经打好的 `vendor/gifuct.mjs`。

## 处理链

GIF → `parseGIF` / `decompressFrame`（打开 patch）→ 按 `disposalType` 合成整帧 → 立刻收成灰度网格 → 按列数和字符宽高比取样 → 外部时钟按每帧 `delay` 选画面 → 用 0 和 1 画到 Canvas。

`pixels` 是颜色表索引。只有 `buildPatch` 之后的 `patch` 才是 RGBA。透明像素的 alpha 为 0，合成时不覆盖底下的画面。

## 预览

在 `404-copy/` 启动静态服务：

```powershell
python -m http.server 4174 --bind 127.0.0.1
```

打开 `http://127.0.0.1:4174/tools/ascii-gif/demo/`。顶栏右侧的「导入 GIF」读取本机文件，在浏览器里合成并转成字符，文件不会发到别处。「导出 PNG」保存当前这一帧字符画面，背景色和画面上看到的一致。「字体」切换字符用的等宽字体，默认是 Consolas。VT323 是原来的像素等宽字。

默认人物是 `fixtures/bust.gif`。`?gif=` 仍然可以指定一个地址，`?gif=../fixtures/disposal.gif` 用来看局部帧和帧处置。

## 调用

```js
import { loadAsciiClip, AsciiPlayer } from './src/index.mjs'

const clip = await loadAsciiClip(url, { pixelColumns: 180 })
const player = new AsciiPlayer(canvas, clip, {
  columns: 110,
  font: 'Consolas, ui-monospace, monospace',
  color: '#000013',
  ink: 'auto',
})

player.sync({
  time: gifTimeMs,
  color: inkColor,
})
```

`sync` 适合放进页面已有的 `requestAnimationFrame`。`time` 决定 GIF 帧。改 `color` 只改绘制颜色。

行数按 `round(列数 × 画面高 / 画面宽 × 字符宽高比)` 计算。画面是不透明内容的范围，周围的空白不占列数。字符宽高比是 `0` 的进宽除以行高。省略时，播放器会按 `font` 测量。桌面可以先试 100–120 列，窄屏试 50–70 列。

颜色先收成亮度。`ink: 'auto'` 用第一帧四角判断纸色，再按主体自身的暗部到亮部把对比拉开：眼睛、喙这类更暗的结构印得更实，身体仍留着字符。`0` 和 `1` 由格子坐标决定，换帧不会整表重排。

## 帧处置

显示完一帧之后：

- `0` 和 `1`：留下这帧。
- `2`：这帧带透明色时，把占过的矩形擦成透明，避免背景色留下一块不透明的底。没有透明色时才恢复成逻辑屏幕背景色。`clearDisposal: 'background'` 可以强制恢复背景色，`clearDisposal: 'transparent'` 则一律擦除。
- `3`：恢复成绘制这帧之前的画面。

`gifuct-js` 把文件里的 0 厘秒写成 100 毫秒。播放使用它返回的 `delay`。

## 内存

合成用一块可复用的屏幕缓冲。每帧只留下灰度：默认横向最多 360 格，每格 1 字节亮度加 1 字节透明度。解码过程中仍会短暂持有压缩后的原始帧；素材大到这里不够时，再改成逐帧解压。

## 重建与测试

```powershell
pnpm install
pnpm build
pnpm test
python test/make_fixtures.py
```

`pnpm test` 核对透明像素不擦画面、disposal 2/3、局部帧尺寸、原 delay，以及人物头部在取样后仍然是墨。

## 接到 404 页面

主页面目前不引用这个模块。`tests/verify.py` 仍要求文档里没有 `canvas`，参考角色的 GIF 也还没放进 `assets/`。

接入时在 `.data-mass` 中加一层 Canvas，放在色块之上、故障线之下。颜色用当前 `--ink`。人物换帧走 GIF 的 `delay`，轮廓和故障继续走原来的 16 秒时钟。
