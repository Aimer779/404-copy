"""Cold-cache time-to-usable for the ASCII GIF demo.

Usable = first ASCII ink on #ascii and Import GIF is clickable.
Lab profile = Fast 4G on every request (20ms RTT, 4Mbps down, 3Mbps up).
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from playwright.sync_api import sync_playwright

CHROME = r"C:\Users\Max\AppData\Local\ms-playwright\chromium-1223\chrome-win64\chrome.exe"
READY = """() => {
  const canvas = document.querySelector('#ascii');
  const btn = document.querySelector('#choose-gif');
  if (!canvas || !btn || canvas.width < 2 || canvas.height < 2) return false;
  if (!canvas.dataset.glyphs) return false;
  const hit = btn.getBoundingClientRect();
  if (hit.width < 8 || hit.height < 8) return false;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const size = 120;
  const x = Math.max(0, Math.floor(canvas.width / 2) - size / 2);
  const y = Math.max(0, Math.floor(canvas.height / 2) - size / 2);
  const data = ctx.getImageData(x, y, Math.min(size, canvas.width - x), Math.min(size, canvas.height - y)).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 20) return true;
  return false;
}"""
FAST4G = {
    "offline": False,
    "latency": 20,
    "downloadThroughput": int(4 * 1024 * 1024 / 8),
    "uploadThroughput": int(3 * 1024 * 1024 / 8),
    "connectionType": "cellular4g",
}


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * p / 100
    lo = int(rank)
    hi = min(lo + 1, len(ordered) - 1)
    frac = rank - lo
    return ordered[lo] * (1 - frac) + ordered[hi] * frac


def one_run(browser, url: str, throttle: bool) -> dict:
    context = browser.new_context()
    page = context.new_page()
    page.add_init_script(
        """
        window.__longTasks = [];
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.__longTasks.push({ duration: entry.duration, start: entry.startTime });
            }
          }).observe({ type: 'longtask', buffered: true });
        } catch (error) {}
        """
    )
    if throttle:
        session = context.new_cdp_session(page)
        session.send("Network.enable")
        session.send("Network.emulateNetworkConditions", FAST4G)
    page.goto(url, wait_until="commit", timeout=60000)
    page.wait_for_function(READY, timeout=60000)
    metrics = page.evaluate(
        """() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const resources = performance.getEntriesByType('resource').map((entry) => ({
            name: entry.name,
            type: entry.initiatorType,
            transferSize: entry.transferSize || 0,
            encoded: entry.encodedBodySize || 0,
            start: Math.round(entry.startTime),
            end: Math.round(entry.responseEnd),
            duration: Math.round(entry.duration),
          }));
          resources.sort((a, b) => a.end - b.end);
          const longTasks = window.__longTasks || [];
          return {
            usable: Math.round(performance.now()),
            ttfb: nav ? Math.round(nav.responseStart) : null,
            domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
            load: nav ? Math.round(nav.loadEventEnd) : null,
            transferBytes: resources.reduce((sum, item) => sum + item.transferSize, 0),
            encodedBytes: resources.reduce((sum, item) => sum + item.encoded, 0) + (nav ? nav.encodedBodySize || 0 : 0),
            requests: resources.length + 1,
            longTaskMs: Math.round(longTasks.reduce((sum, item) => sum + item.duration, 0)),
            longTasks: longTasks.length,
            resources,
          };
        }"""
    )
    context.close()
    return metrics


def summarize(runs: list[dict]) -> dict:
    usable = [row["usable"] for row in runs]
    return {
        "n": len(runs),
        "usable_p50": round(percentile(usable, 50)),
        "usable_p75": round(percentile(usable, 75)),
        "usable_p95": round(percentile(usable, 95)),
        "usable_min": min(usable),
        "usable_max": max(usable),
        "ttfb_p75": round(percentile([row["ttfb"] or 0 for row in runs], 75)),
        "requests": runs[0]["requests"] if runs else 0,
        "transferBytes": runs[0]["transferBytes"] if runs else 0,
        "encodedBytes": runs[0]["encodedBytes"] if runs else 0,
        "longTaskMs_p75": round(percentile([row["longTaskMs"] for row in runs], 75)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--throttle", action="store_true")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME)
        runs = [one_run(browser, args.url, args.throttle) for _ in range(args.runs)]
        browser.close()
    payload = {"url": args.url, "throttle": args.throttle, "summary": summarize(runs), "runs": runs}
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], indent=2))


if __name__ == "__main__":
    main()
