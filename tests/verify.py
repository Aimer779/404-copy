"""Browser regressions. Start the static server first; see NOTES.md for usage."""
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'RECON'
SHOTS = OUT / 'screenshots'
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:4173/')
SHOTS.mkdir(parents=True, exist_ok=True)
errors, failures, external, results = [], [], [], []

def watch(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.on('response', lambda response: failures.append(response.url) if response.status >= 400 else None)
    page.on('request', lambda request: external.append(request.url) if not request.url.startswith(URL) else None)

def state(page):
    return page.locator('main').evaluate('(e) => ({...e.dataset})')

def snapshot(page):
    return page.evaluate('''() => {
      const selectors = ['.error-code','.button-label','.reconnect','.mass-strip','.error-page'];
      const properties = ['boxSizing','backgroundColor','backgroundImage','border','appearance',
        'borderRadius','cornerShape','overflow','filter','font','color','transform','opacity','zIndex'];
      return Object.fromEntries(selectors.map(selector => {
        const el=document.querySelector(selector), css=getComputedStyle(el);
        return [selector,{rect:el.getBoundingClientRect().toJSON(),
          ...Object.fromEntries(properties.map(key => [key, css[key] || '']))}];
      }));
    }''')

with sync_playwright() as p:
    executable = os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
    context = browser.new_context()
    page = context.new_page()
    watch(page)
    states = [('dark', 0), ('inverse', 3400), ('electric', 10600), ('surge', 5000)]
    for width, height in [(1280,720),(1440,900),(390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        anchor = None
        for name, time in states:
            page.goto(f'{URL}?at={time}')
            page.evaluate('document.fonts.ready')
            assert state(page)['mode'] == name
            assert page.evaluate('document.fonts.check(\'180px "404 Display"\', "404")')
            assert page.locator('h1').count() == 1
            assert page.get_by_role('heading', name='404', exact=True).count() == 1
            assert page.locator('.eyebrow,.message,.coordinate,.mass-noise,canvas').count() == 0
            assert page.evaluate('document.documentElement.scrollWidth === innerWidth')
            assert page.evaluate('document.documentElement.scrollHeight === innerHeight')
            if width == 390:
                assert page.evaluate('''() => {
                  const r=document.querySelector('h1').getBoundingClientRect();
                  return [...document.querySelectorAll('.mass-strip:not([hidden])')].every(el => {
                    const b=el.getBoundingClientRect();
                    if (b.bottom <= r.y+r.height*.24 || b.top >= r.y+r.height*.8) return true;
                    return b.left <= r.left+8 && b.right >= r.right-8;
                  });
                }'''), 'The mobile silhouette cuts through the pixel digits'
            data = snapshot(page)
            button = data['.reconnect']['rect']
            assert button['height'] >= 44
            assert 0 <= button['x'] < button['right'] <= width
            assert 0 <= button['y'] < button['bottom'] <= height
            assert data['.button-label']['color'] != data['.button-label']['backgroundColor']
            point = {'x':button['x']+button['width']/2,'y':button['y']+button['height']/2}
            assert page.evaluate('(p) => !!document.elementFromPoint(p.x,p.y).closest("button")',point)
            if anchor is None: anchor = button
            assert button == anchor, 'Palette changes moved the button'
            page.screenshot(path=str(SHOTS/f'after-{name}-{width}.png'))
            results.append({'viewport':[width,height],'state':name,'computed':data})
    page.set_viewport_size({'width':1280,'height':720})
    for name, time in [('glitch',4800),('recovered',6720)]:
        page.goto(f'{URL}?at={time}')
        page.evaluate('document.fonts.ready')
        assert (state(page)['glitch'] != '0') == (name == 'glitch')
        page.screenshot(path=str(SHOTS/f'after-{name}.png'))
    page.goto(f'{URL}?at=0')
    page.keyboard.press('Tab')
    assert page.locator('button').evaluate('e => e === document.activeElement')
    assert page.locator('button').evaluate('e => getComputedStyle(e).outlineStyle') != 'none'
    page.screenshot(path=str(SHOTS/'after-keyboard-focus.png'))
    # Real keyboard navigation and reload; callback waits for the navigation event, not a sleep.
    for key in ['Enter','Space']:
        page.locator('button').focus()
        with page.expect_navigation(wait_until='load'):
            page.keyboard.press(key)
        assert not page.locator('button').is_disabled()
    with page.expect_navigation(wait_until='load'):
        page.locator('button').click()
        assert page.get_by_role('status').inner_text() == 'RECONNECTING…'
        assert page.locator('button').is_disabled()

    # Controlled browser clock: run two cycles and compare rendered observable states.
    animated = context.new_page()
    watch(animated)
    animated.clock.install()
    animated.clock.pause_at(datetime.now(timezone.utc)+timedelta(seconds=1))
    animated.goto(URL)
    initial = state(animated)
    seen = set()
    for cycle in range(2):
        for step in range(16):
            animated.clock.run_for(1000)
            seen.add(state(animated)['mode'])
        assert state(animated) == initial, 'Animation failed to return to its initial state'
    assert seen == {name for name,_ in states}
    animated.clock.run_for(4400)
    animated.emulate_media(reduced_motion='reduce')
    animated.screenshot()  # Flush the browser's media-change rendering with its clock paused.
    animated.wait_for_function('document.querySelector("main").dataset.mode === "dark"')
    assert state(animated) == {'mode':'dark','shape':'0','glitch':'0'}
    frozen = animated.locator('main').inner_html()
    animated.clock.run_for(20000)
    assert animated.locator('main').inner_html() == frozen
    for _ in range(3):
        animated.emulate_media(reduced_motion='no-preference')
        animated.screenshot()
        animated.clock.run_for(3000)
        assert state(animated)['mode'] == 'inverse'
        animated.emulate_media(reduced_motion='reduce')
        animated.screenshot()
        animated.wait_for_function('document.querySelector("main").dataset.mode === "dark"')
    animated.emulate_media(reduced_motion='no-preference')
    animated.screenshot()
    animated.clock.run_for(4800)
    assert state(animated)['mode'] == 'surge'
    assert state(animated)['glitch'] != '0'

    # Observable motion inside each palette, plus continuity at a silhouette boundary.
    def geometry_at(time):
        page.goto(f'{URL}?at={time}')
        return page.locator('.mass-strip').evaluate_all('''els => els.map(el => {
          const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];
        })''')
    for first, second in [(200,600),(3500,3750),(5400,5600),(11100,11400)]:
        a,b=geometry_at(first),geometry_at(second)
        assert max(abs(x-y) for r,s in zip(a,b) for x,y in zip(r,s)) > 3, 'Silhouette is static inside a palette'
    a,b=geometry_at(1399),geometry_at(1401)
    assert max(abs(x-y) for r,s in zip(a,b) for x,y in zip(r,s)) < 4, 'Silhouette jumps at preset boundary'
    colors=[]
    for time in [2790,3000,3300]:
        page.goto(f'{URL}?at={time}')
        colors.append(page.locator('main').evaluate('e => getComputedStyle(e).backgroundColor'))
        if time == 3000:
            page.screenshot(path=str(SHOTS/'after-palette-transition.png'))
    assert len(set(colors)) == 3, 'Palette lacks intermediate colors'
    tearing_spans=[]
    for time in [4600,4800,5400,6000,6480]:
        page.goto(f'{URL}?at={time}')
        assert state(page)['glitch'] != '0', 'The blue passage lost its sustained glitch'
        offsets=page.locator('.digit-slice').evaluate_all('els => els.map(e => new DOMMatrix(getComputedStyle(e).transform).m41)')
        tearing_spans.append(max(offsets)-min(offsets))
        assert tearing_spans[-1] > 14, 'Digital tearing lost its minimum intensity'
        assert page.locator('.tear-line:not([hidden])').count() >= 20
        assert page.evaluate('document.documentElement.scrollWidth === innerWidth')
    assert max(tearing_spans) > 20, 'The blue passage has no strong tearing peaks'

    reduced = browser.new_context(reduced_motion='reduce',viewport={'width':390,'height':844})
    quiet = reduced.new_page()
    watch(quiet)
    quiet.goto(f'{URL}?at=4440')
    assert state(quiet) == {'mode':'dark','shape':'0','glitch':'0'}
    quiet.screenshot(path=str(SHOTS/'after-reduced-motion.png'))
    with quiet.expect_navigation(wait_until='load'):
        quiet.locator('button').click()
    touch = browser.new_context(has_touch=True,is_mobile=True,viewport={'width':390,'height':844})
    mobile = touch.new_page()
    mobile.goto(f'{URL}?at=0')
    with mobile.expect_navigation(wait_until='load'):
        mobile.locator('button').tap()

    nojs = browser.new_context(java_script_enabled=False,viewport={'width':1280,'height':720})
    static = nojs.new_page()
    static.goto(URL)
    assert static.get_by_role('heading',name='404',exact=True).is_visible()
    assert static.locator('.mass-fallback').is_visible()
    assert static.locator('button').is_visible()
    static.screenshot(path=str(SHOTS/'after-no-script.png'))
    assert not errors, errors
    assert not failures, failures
    assert not external, external
    OUT.joinpath('verification.json').write_text(json.dumps({
        'checks':['12 viewport/palette combinations','stable button bounds','no overflow',
                  'local fonts','keyboard Enter/Space and focus','click and reload',
                  'touch tap','two deterministic cycles','live reduced-motion toggles',
                  'initial reduced-motion','no-JavaScript fallback','no external requests',
                  'continuous movement in all palettes','morph boundary continuity',
                  'palette intermediate colors','sustained strong blue-state tearing'],
        'errors':errors,'failedRequests':failures,'snapshots':results,
    },indent=2),encoding='utf-8')
    browser.close()
print('PASS: visual snapshots and browser behavior checks. See RECON/verification.json.')
