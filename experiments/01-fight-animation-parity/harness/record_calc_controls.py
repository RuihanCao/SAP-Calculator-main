#!/usr/bin/env python3
"""Record the calculator's own control bar being driven, the way W0b recorded the game's.

`controls_probe.py` does this for the real client. This is its mirror: the same
fixture, the same screencast, but our stage, so a REWIND or a SKIP can be read
back frame by frame and put beside the reference clip.

The press script is `<seconds after PLAY>=<action>`, comma separated, and the
actions are the bar's own data attributes (`rewind`, `play`, `autoplay`,
`fast`, `skip`). Times are measured from the PLAY press rather than from page
load, because everything before that is the app booting.

The stage's clock is sampled inside the page every 80 ms and printed at the
end, so what the transport actually did is on the record next to the frames.

Usage:
  record_calc_controls.py f01-plain-trades rewind "13.5=rewind,15.5=rewind,17.5=play"
  record_calc_controls.py f01-plain-trades skip "13.0=skip"
"""
import argparse
import asyncio
import base64
import json
import os
import sys
import time

from record_calc import FIXTURES, OUT_ROOT, APP_URL, fixture_url

STAGE = "app-battle-animation-stage"


def parse_script(text):
    steps = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        at, _, action = part.partition("=")
        steps.append((float(at), action.strip()))
    return sorted(steps)


async def record_one(fid, name, script, base_url, seconds, quality):
    from playwright.async_api import async_playwright

    with open(os.path.join(FIXTURES, f"{fid}.json")) as handle:
        fixture = json.load(handle)

    outdir = os.path.join(OUT_ROOT, f"ctl-{name}")
    os.makedirs(outdir, exist_ok=True)
    for entry in os.listdir(outdir):
        if entry.endswith(".jpg"):
            os.remove(os.path.join(outdir, entry))

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=["--no-sandbox", "--force-device-scale-factor=1"]
        )
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        await page.goto(fixture_url(fixture, base_url), wait_until="load", timeout=120000)
        await page.wait_for_selector("text=Simulate", timeout=60000)
        await page.click("text=Simulate")
        await page.wait_for_selector(f"{STAGE} .anim-stage", timeout=60000)

        # Same full-viewport reparenting record_calc.py uses, so the frames
        # frame the animation the same way the reference clips do.
        await page.evaluate(
            """() => {
              const stage = document.querySelector('app-battle-animation-stage');
              const holder = document.createElement('div');
              holder.style.cssText =
                'position:fixed;inset:0;z-index:99999;background:#0d1117;display:flex';
              document.body.appendChild(holder);
              holder.appendChild(stage);
              stage.style.cssText = 'flex:1 1 auto;height:100vh';
              document.documentElement.style.overflow = 'hidden';
            }"""
        )
        await page.wait_for_timeout(400)

        cdp = await context.new_cdp_session(page)
        state = {"n": 0, "t0": time.time()}

        async def on_frame(params):
            index = state["n"]
            state["n"] += 1
            ts = time.time() - state["t0"]
            path = os.path.join(outdir, f"f_{index:05d}_{int(ts * 1000):07d}.jpg")
            with open(path, "wb") as handle:
                handle.write(base64.b64decode(params["data"]))
            try:
                await cdp.send(
                    "Page.screencastFrameAck", {"sessionId": params["sessionId"]}
                )
            except Exception:
                pass

        cdp.on(
            "Page.screencastFrame",
            lambda params: asyncio.ensure_future(on_frame(params)),
        )
        await cdp.send(
            "Page.startScreencast",
            {
                "format": "jpeg",
                "quality": quality,
                "maxWidth": 1280,
                "maxHeight": 800,
                "everyNthFrame": 1,
            },
        )

        # The clock is read inside the page so the samples carry no round trip.
        await page.evaluate(
            """() => {
              window.__samples = [];
              window.__t0 = performance.now();
              const clock = document.querySelector('app-battle-animation-stage .anim-clock');
              window.__mark = (what) =>
                window.__samples.push([Math.round(performance.now() - window.__t0), what]);
              setInterval(() => {
                window.__samples.push([
                  Math.round(performance.now() - window.__t0),
                  clock.innerText.trim(),
                ]);
              }, 80);
            }"""
        )

        await page.dispatch_event(f"{STAGE} [data-anim-control='play']", "click")
        pressed_at = time.time()
        for at, action in script:
            wait = at - (time.time() - pressed_at)
            if wait > 0:
                await page.wait_for_timeout(int(wait * 1000))
            await page.evaluate(f"() => window.__mark('>> {action.upper()} <<')")
            await page.dispatch_event(f"{STAGE} [data-anim-control='{action}']", "click")

        deadline = pressed_at + seconds
        while time.time() < deadline:
            await page.wait_for_timeout(250)
            label = await page.locator(f"{STAGE} .anim-clock").inner_text()
            try:
                now, total = [float(p.strip().rstrip("s")) for p in label.split("/")]
            except ValueError:
                continue
            if total > 0 and now >= total - 0.05:
                await page.wait_for_timeout(900)
                break

        await cdp.send("Page.stopScreencast")
        samples = await page.evaluate("() => window.__samples")
        with open(os.path.join(outdir, "meta.json"), "w") as handle:
            json.dump(
                {
                    "fixture": fid,
                    "probe": name,
                    "script": [f"{at}={action}" for at, action in script],
                    "battle_start_ms": 0,
                    "frames": state["n"],
                    "seconds": round(time.time() - state["t0"], 2),
                    "clock": samples,
                },
                handle,
                indent=1,
            )
        await browser.close()

    previous = None
    for ms, text in samples:
        if text != previous or ">>" in text:
            print(f"{ms:7d} {text}")
            previous = text
    print(f"ctl-{name}: {state['n']} frames -> {outdir}")
    return outdir


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture")
    parser.add_argument("name", help="probe name, becomes the clip directory")
    parser.add_argument("script", help="'13.5=rewind,17.5=play'")
    parser.add_argument("--seconds", type=float, default=45)
    parser.add_argument("--quality", type=int, default=70)
    parser.add_argument("--url", default=APP_URL)
    args = parser.parse_args()
    asyncio.run(
        record_one(
            args.fixture,
            args.name,
            parse_script(args.script),
            args.url,
            args.seconds,
            args.quality,
        )
    )


if __name__ == "__main__":
    sys.exit(main())
