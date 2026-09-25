(() => {
  const page = document.querySelector('.error-page');
  const mass = document.querySelector('.data-mass');
  const reconnect = document.querySelector('.reconnect');
  const status = document.querySelector('.status');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // [top, bottom, left, right] measured approximately from 1280×720 frames.
  // The recording's 30px letterboxing is removed when mapping vertical positions.
  const shapes = [
    [ // frame-006
      [95, 102, 550, 773], [102, 148, 550, 930], [148, 160, 550, 1050],
      [160, 212, 430, 1050], [212, 242, 275, 1050], [242, 253, 275, 858],
      [253, 277, 394, 858], [277, 307, 394, 900], [307, 322, 430, 900],
      [322, 336, 405, 900], [336, 351, 358, 900], [351, 449, 303, 991],
      [449, 467, 392, 980], [467, 501, 392, 910], [501, 555, 430, 910],
      [555, 619, 459, 908], [619, 633, 580, 908],
    ],
    [ // frame-018
      [44, 94, 356, 609], [94, 171, 356, 841], [171, 199, 374, 841],
      [199, 205, 374, 941], [205, 239, 289, 941], [239, 307, 280, 941],
      [307, 322, 294, 913], [322, 349, 294, 951], [349, 365, 321, 951],
      [365, 384, 306, 951], [384, 446, 306, 986], [446, 469, 199, 986],
      [469, 515, 199, 1021], [515, 537, 411, 1021], [537, 552, 444, 871],
      [552, 584, 575, 870], [584, 616, 607, 826],
    ],
    [ // frame-030, clean envelope underneath the recorded tearing
      [148, 169, 275, 765], [169, 191, 275, 902], [191, 252, 275, 975],
      [252, 280, 376, 982], [280, 376, 238, 1000], [376, 397, 238, 895],
      [397, 427, 316, 897], [427, 503, 207, 1010], [503, 519, 252, 915],
      [519, 540, 252, 784], [540, 558, 388, 784], [558, 650, 388, 1018],
      [650, 678, 611, 1018],
    ],
    [ // frame-048
      [58, 122, 677, 937], [122, 151, 595, 937], [151, 247, 313, 937],
      [247, 269, 313, 841], [269, 347, 313, 948], [347, 358, 345, 864],
      [358, 378, 345, 757], [378, 391, 310, 923], [391, 434, 310, 1026],
      [434, 498, 310, 1045], [498, 519, 420, 864], [519, 573, 420, 864],
      [573, 591, 440, 864], [591, 628, 546, 864], [628, 652, 579, 864],
    ],
    [ // frame-072
      [93, 126, 777, 915], [126, 149, 505, 915], [149, 169, 390, 915],
      [169, 225, 390, 880], [225, 244, 390, 840], [244, 257, 390, 880],
      [257, 301, 390, 992], [301, 340, 351, 992], [340, 354, 313, 992],
      [354, 441, 313, 948], [441, 457, 385, 948], [457, 488, 385, 899],
      [488, 576, 419, 898], [576, 609, 538, 874], [609, 633, 538, 704],
    ],
  ];
  // Shared row boundaries let differently segmented silhouettes morph without popping.
  const bounds = shapes.map(shape => [shape[0][0], shape.at(-1)[1]]);
  const rows = [...new Set(shapes.flatMap((shape, i) => shape.flatMap(([top, bottom]) =>
    [top, bottom].map(y => (y - bounds[i][0]) / (bounds[i][1] - bounds[i][0])))))].sort((a, b) => a - b);
  const profiles = shapes.map((shape, index) => rows.slice(0, -1).map((top, i) => {
    const middle = bounds[index][0] + (top + rows[i + 1]) / 2 * (bounds[index][1] - bounds[index][0]);
    const band = shape.find(([a, b]) => middle >= a && middle < b);
    return band ? [band[2], band[3], band[0]] : [640, 640, top];
  }));
  const strips = Array.from({ length: rows.length - 1 }, () => {
    const strip = document.createElement('i');
    strip.className = 'mass-strip absolute';
    mass.append(strip);
    return strip;
  });
  document.querySelector('.mass-fallback').hidden = true;
  const asciiCanvas = document.createElement('canvas');
  asciiCanvas.className = 'ascii-figure absolute inset no-pointer';
  mass.append(asciiCanvas);
  let asciiPlayer = null;

  const tears = Array.from({ length: 52 }, (_, i) => {
    const line = document.createElement('i');
    line.className = `tear-line absolute${i % 4 === 0 ? ' is-dropout' : ''}`;
    mass.append(line);
    return line;
  });
  const code = document.querySelector('.error-code');
  const digitSlices = Array.from({ length: 36 }, (_, i) => {
    const slice = document.createElement('span');
    slice.className = 'digit-slice absolute';
    slice.setAttribute('aria-hidden', 'true');
    slice.textContent = '404';
    slice.style.clipPath = `inset(${20 + i * 64 / 36}% 0 ${80 - (i + 1) * 64 / 36}%)`;
    code.append(slice);
    return slice;
  });

  const clusterPositions = [[2, 30], [77, 72], [72, 38], [20, 80]];
  const lineSegments = [[0, 27, 65], [12, 43, 38], [22, 8, 46], [31, 31, 58], [39, 0, 32], [48, 48, 43]];
  const signalField = document.querySelector('.signal-field');
  const clusters = clusterPositions.map(([left, top], index) => {
    const cluster = document.createElement('div');
    cluster.className = 'signal-cluster absolute';
    cluster.style.left = `${left}%`;
    cluster.style.top = `${top}%`;
    for (const [y, x, width] of lineSegments) {
      const line = document.createElement('i');
      line.className = 'signal-line absolute';
      line.style.cssText = `top:${y}px;left:${(x + index * 7) % 55}%;width:${width}%;`;
      cluster.append(line);
    }
    signalField.append(cluster);
    return cluster;
  });

  // Visual fit to the recording. Continuous morphing is independent of palette changes.
  const duration = 16000;
  const palette = [[0, 'dark'], [2800, 'inverse'], [4400, 'surge'], [6800, 'inverse'], [10000, 'electric'], [13300, 'dark']];
  const outlines = [[0, 0], [1400, 1], [2800, 3], [4000, 1], [4400, 2], [5900, 0], [6800, 3], [8400, 1], [10000, 4], [11700, 0], [13300, 4], [14800, 0]];
  const bursts = [[820, 380], [2500, 420], [4300, 2320], [9140, 460], [12480, 480], [14640, 340]];
  const params = new URLSearchParams(window.location.search);
  const requestedTime = params.has('at') ? Number(params.get('at')) : NaN;
  const fixedTime = Number.isFinite(requestedTime) ? Math.max(0, requestedTime) : null;
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
  const swatches = {
    dark: [[0, 0, 19], [243, 243, 243], [0, 0, 19]],
    inverse: [[243, 243, 243], [0, 0, 19], [243, 243, 243]],
    electric: [[7, 28, 233], [243, 243, 243], [0, 0, 19]],
    surge: [[0, 0, 19], [17, 17, 244], [234, 220, 40]],
  };
  const noise = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  const hot = [241, 38, 99];
  const cold = [20, 44, 255];
  const rgb = color => `rgb(${color.map(Math.round).join(' ')})`;
  const foreground = color => {
    const linear = color.map(v => v / 255 <= .04045 ? v / 3294.6 : ((v / 255 + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722 > .179 ? '#000013' : '#f3f3f3';
  };
  let animationFrame = 0;
  let reloadTimer = 0;
  let elapsed = 0;
  let gifElapsed = 0;
  let gifStamp = 0;
  let startedAt = 0;
  let lastPaint = -Infinity;

  function sameSwatch(a, b) {
    return a.every((color, i) => color.every((channel, j) => channel === b[i][j]));
  }

  // Five hard steps, 48ms each. Channels and surfaces arrive apart, then the swatch locks.
  function collapseColors(before, after, frame) {
    const [pageColor, mass, button] = before;
    const [nextPage, nextMass, nextButton] = after;
    const torn = (from, to, index) => [to[0], from[1], index === 1 ? 0 : 255];
    return [
      [hot, cold, hot],
      [nextPage, mass, cold],
      [torn(pageColor, nextPage, 0), torn(mass, nextMass, 1), nextButton],
      [pageColor, nextMass, hot],
      [nextPage, nextMass, button],
    ][frame];
  }

  function paintPalette(t) {
    const index = palette.findLastIndex(([at]) => t >= at);
    const [at, mode] = palette[index];
    const before = swatches[palette[(index + palette.length - 1) % palette.length][1]];
    const after = swatches[mode];
    const frame = Math.floor((t - at) / 48);
    const colors = frame >= 5 || sameSwatch(before, after) ? after : collapseColors(before, after, frame);
    page.dataset.mode = mode;
    ['--page', '--mass', '--button-bg'].forEach((key, i) => page.style.setProperty(key, rgb(colors[i])));
    page.style.setProperty('--ink', foreground(colors[1]));
    page.style.setProperty('--button-fg', foreground(colors[2]));
    page.style.setProperty('--signal', foreground(colors[0]));
  }

  function paintShape(t, still, strength) {
    const index = outlines.findLastIndex(([at]) => t >= at);
    const [at, shape] = outlines[index];
    const previous = outlines[(index + outlines.length - 1) % outlines.length][1];
    const blend = still ? 1 : smooth((t - at) / 920);
    const wave = t / duration * Math.PI * 2;
    const warpY = y => y + (still ? 0 : 6 * (Math.sin(wave * 3 + y * .009) - Math.sin(y * .009)));
    const topEdge = mix(bounds[previous][0], bounds[shape][0], blend);
    const bottomEdge = mix(bounds[previous][1], bounds[shape][1], blend);
    const jitterFrame = Math.floor(t / 32);
    page.dataset.shape = String(shape);
    const geometry = strips.map((strip, i) => {
      const from = profiles[previous][i], to = profiles[shape][i];
      let left = mix(from[0], to[0], blend), right = mix(from[1], to[1], blend);
      const bandPhase = mix(from[2], to[2], blend) * .043;
      const presence = Math.min(1, (right - left) / 140);
      if (!still) {
        left += presence * 32 * (Math.sin(wave * 5 + bandPhase) - Math.sin(bandPhase));
        right += presence * 38 * (Math.sin(wave * 4 + bandPhase * .7) - Math.sin(bandPhase * .7));
      }
      const top = warpY(mix(topEdge, bottomEdge, rows[i]));
      const bottom = warpY(mix(topEdge, bottomEdge, rows[i + 1]));
      const shift = strength * (noise(jitterFrame * 19 + Math.floor(top / 35)) - .5) * 78;
      strip.hidden = right - left < 1;
      strip.dataset.core = String(top < 520 && bottom > 250);
      strip.style.setProperty('--top', `${(top - 30) / 660 * 100}%`);
      strip.style.setProperty('--height', `${(bottom - top) / 660 * 100}%`);
      strip.style.setProperty('--left', `${left / 1280 * 100}%`);
      strip.style.setProperty('--right', `${right / 1280 * 100}%`);
      strip.style.setProperty('--width', `${Math.max(0, right - left) / 1280 * 100}%`);
      strip.style.setProperty('--shift', `${shift}px`);
      return { top, bottom, left, right, shift, hidden: right - left < 1 };
    });
    // Thin displaced scans roughen the silhouette, without filling it with fake ASCII/noise.
    tears.forEach((line, i) => {
      line.hidden = !strength;
      if (!strength) return;
      const y = 80 + i * 11 + noise(jitterFrame + i * 7) * 8;
      const band = geometry.find(({ top, bottom, left, right }) => y >= top && y < bottom && right - left > 20);
      if (!band) { line.hidden = true; return; }
      const offset = (noise(jitterFrame * 3 + i) - .5) * 104 * strength;
      const width = (band.right - band.left) * (i % 4 === 0 ? .25 + noise(i) * .3 : 1);
      const left = band.left + offset + (i % 4 === 0 ? (band.right - band.left - width) * noise(i + jitterFrame) : 0);
      line.style.cssText = `top:${(y - 30) / 660 * 100}%;left:${left / 1280 * 100}%;width:${width / 1280 * 100}%;height:${1 + i % 3}px;`;
    });
    document.querySelectorAll('.fragment').forEach((fragment, i) => {
      fragment.style.transform = still ? 'none' : `translate(${Math.sin(wave * 4 + i) * 26}px,${Math.sin(wave * 3 + i) * 9}px)`;
    });
    return geometry;
  }

  function syncAscii(bands, gifTime) {
    if (!asciiPlayer) return;
    const width = mass.clientWidth;
    const height = mass.clientHeight;
    if (width < 2 || height < 2) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const cssBands = [];
    for (const band of bands) {
      if (band.hidden) continue;
      const x = band.left / 1280 * width;
      const y = (band.top - 30) / 660 * height;
      const bandWidth = Math.max(0, band.right - band.left) / 1280 * width;
      const bandHeight = Math.max(0, band.bottom - band.top) / 660 * height;
      cssBands.push({ x, y, width: bandWidth, height: bandHeight, shift: band.shift });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + bandWidth);
      maxY = Math.max(maxY, y + bandHeight);
    }
    if (!cssBands.length) return;
    asciiPlayer.setViewport({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    asciiPlayer.setColumns(width < 700 ? 64 : 120);
    asciiPlayer.sync({
      time: gifTime,
      color: page.style.getPropertyValue('--ink') || '#000013',
      bands: cssBands,
    });
  }

  function paintGlitch(phase, time = 0, strength = 0) {
    page.dataset.glitch = String(phase);
    const frame = Math.floor(time / 32);
    digitSlices.forEach((slice, i) => {
      const shift = strength * ((noise(frame * 13 + i * 7) - .5) * 22 + Math.sin(i * 1.8 + frame) * 4);
      slice.style.transform = `translateX(${shift}px)`;
      slice.style.textShadow = `${3 * strength}px 0 var(--hot), ${-4 * strength}px 0 var(--cold)`;
    });
  }

  function render(time) {
    const still = reduceMotion.matches;
    const t = still ? 0 : time % duration;
    const burst = bursts.find(([at, length]) => t >= at && t < at + length);
    const strength = !still && burst ? .65 + .35 * Math.sin(t * .016) ** 2 : 0;
    paintPalette(t);
    const bands = paintShape(t, still, strength);
    syncAscii(bands, fixedTime !== null || still ? 0 : gifElapsed);
    paintGlitch(strength ? 1 + Math.floor(t / 32) % 3 : 0, t, strength);
    clusters.forEach((cluster, i) => {
      const local = (t + i * 370) % 1800;
      cluster.classList.toggle('is-active', Boolean(!still && (local < 260 || (burst && i % 2 === 0))));
      cluster.style.transform = still ? 'none' : `translateX(${Math.sin(t / duration * Math.PI * 8 + i) * 34}px)`;
    });
  }

  function tick(now) {
    if (!gifStamp) gifStamp = now;
    gifElapsed += now - gifStamp;
    gifStamp = now;
    if (now - lastPaint >= 16) {
      render(elapsed + now - startedAt);
      lastPaint = now;
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function stop() {
    if (!animationFrame) return;
    elapsed += performance.now() - startedAt;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function start() {
    if (animationFrame || document.hidden || reduceMotion.matches || reconnect.disabled || fixedTime !== null) return;
    startedAt = performance.now();
    gifStamp = 0;
    lastPaint = -Infinity;
    animationFrame = requestAnimationFrame(tick);
  }

  reduceMotion.addEventListener('change', () => {
    stop();
    elapsed = 0;
    render(fixedTime ?? 0);
    start();
  });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  window.addEventListener('pagehide', () => {
    stop();
    window.clearTimeout(reloadTimer);
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    reconnect.disabled = false;
    status.textContent = '';
    render(fixedTime ?? elapsed);
    start();
  });
  reconnect.addEventListener('click', () => {
    if (reconnect.disabled) return;
    reconnect.disabled = true;
    stop();
    paintGlitch(0);
    status.textContent = 'RECONNECTING…';
    reloadTimer = window.setTimeout(() => window.location.reload(), 420);
  });

  render(fixedTime ?? 0);
  start();

  import('./tools/ascii-gif/src/index.mjs').then(async ({ loadAsciiClip, AsciiPlayer }) => {
    const clip = await loadAsciiClip('assets/squidward.gif');
    asciiPlayer = new AsciiPlayer(asciiCanvas, clip, {
      font: 'Consolas, ui-monospace, monospace',
      columns: mass.clientWidth < 700 ? 64 : 120,
      gain: 1.7,
      color: page.style.getPropertyValue('--ink') || '#000013',
    });
    render(fixedTime ?? elapsed);
  }).catch(() => {});
})();
