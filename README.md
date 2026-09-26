# 404-copy

**本项目的全部灵感来自 B 站视频《[再花里胡哨一点？在网页里使用ASCII动画](https://www.bilibili.com/video/BV1H6eyzYE3V)》。**

404 故障页和 GIF → ASCII 动画工具，都是对着这条片子里「在网页里用 ASCII 动画」的想法做的学习实验，不是原作者实现的搬运。

- 视频：[BV1H6eyzYE3V](https://www.bilibili.com/video/BV1H6eyzYE3V)
- 404 页：https://aimer779.github.io/404-copy/
- ASCII GIF 工具：https://aimer779.github.io/404-copy/tools/ascii-gif/demo/

## ASCII GIF 工具能做什么

这是一个**纯浏览器**的 GIF → ASCII 动画工作台。把已经处理好的 GIF 拖进来，在页面上调成字符动画，再把设定交给你自己的 Agent，嵌进任意站点。文件不会上传到服务器。

![ASCII GIF demo](docs/ascii-gif-demo.gif)

公开演示默认是暂停的章鱼哥。上面这段是从当前工作台录下来的循环预览。

### 你在页面上能做的事

1. **导入 GIF**  
   在浏览器里解码、合成 disposal、抽灰度。素材留在本机。

2. **预览 ASCII 动画**  
   舞台上用 `0`/`1` 或其他字符集播放。换帧跟 GIF 自己的 `delay`。默认暂停，点播放后循环。

3. **调观感**  
   - **Columns**：列数，决定疏密  
   - **Font**：Consolas、Cascadia Mono、Courier New、Lucida Console、VT323  
   - **Glyphs**：`01`、`@%#*` 字形、`█▓▒░` 字块、混合、点字 `⣿`、`OX`  
   - **Color / Light / Dark**：墨色和底色

4. **Random recipe**  
   悬浮条上的火花按钮。一点就随机一套列数、字体、字符集和配色，当前 GIF 立刻换装。再导出 recipe，拿走的就是这一套灵感。

5. **导出 recipe**  
   打开可编辑的 JSON：列数、字体、颜色、字符集、来源信息。**不含像素网格。** 动画内容仍是那份 GIF。  
   面板里可以改、复制、下载 `{name}-ascii.json`。

6. **Copy for Agent**  
   下载同一份 JSON，并把安装说明复制到剪贴板。发给 Agent 时带上原 GIF。

7. **导入 recipe**  
   把以前导出的 JSON 读回来，旋钮复原。要再播，还需要原 GIF。

8. **导出 PNG**  
   只保存当前这一帧，带舞台背景，当静帧备份。

### 嵌进自己的网页

Agent（或你自己）拷贝 `tools/ascii-gif/src/` 和 `vendor/gifuct.mjs`，把 GIF 和 recipe JSON 放到站点里：

```js
import { mountAsciiGif } from './ascii-gif/mount.mjs'

const recipe = await fetch('./clip-ascii.json').then((r) => r.json())
mountAsciiGif(document.querySelector('#ascii-slot'), './clip.gif', recipe)
```

容器需要明确宽高或 `aspect-ratio`（recipe 里的 `look.aspect`）。墨色、底色可以换成站点里的实色。不要重写转换器。

404 页是这条链路的第一个例子：它直接 `loadAsciiClip` + `AsciiPlayer`，用 `assets/squidward.gif` 在故障轮廓里播。

### 技术要点

- 无构建即可打开；转换、取样、绘制都在浏览器里。  
- `gifuct-js` 以 `vendor/gifuct.mjs` 同源托管，运行时不请求 CDN。  
- 透明像素不擦下面一帧；disposal 2/3 按 GIF 规则合成。  
- 默认路径不等 VT323，GIF 与模块并行加载。

更细的解码、取样和 recipe 字段见 [`tools/ascii-gif/README.md`](tools/ascii-gif/README.md)。

## 本地运行

```powershell
python -m http.server 4174 --bind 127.0.0.1
```

打开 `http://127.0.0.1:4174/` 或 `http://127.0.0.1:4174/tools/ascii-gif/demo/`。
