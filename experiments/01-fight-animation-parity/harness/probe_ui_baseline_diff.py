#!/usr/bin/env python3
"""Shoot the calculator on two servers and diff the pixels.

W-A's claim is that the main calculator screen is the original one again, with
one button added. This puts the original (`master`, served separately) and the
branch side by side through the same flow, at the same viewport, on the same
fixture, and writes the per-pixel difference so the claim can be looked at
rather than taken on trust.

Both sides are shot with the inline fight animation parked on its first step,
which is where it loads, so the comparison is not racing a running animation.

Usage:
  probe_ui_baseline_diff.py --baseline http://127.0.0.1:4203 \
      --branch http://127.0.0.1:4201 [--out DIR] [fixture]
"""
import argparse
import asyncio
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from record_calc import calculator_state  # noqa: E402

FIXTURES = os.path.join(HERE, "fixtures")
OUT_ROOT = os.environ.get("ANIM01_CALC_OUT", "/root/autodl-tmp/sap-data/anim01/calc")


async def shoot_side(page, base_url, payload, outdir, label):
    shots = {}
    await page.goto(f"{base_url}/?c={payload}", wait_until="load", timeout=120000)
    await page.wait_for_selector("text=Simulate", timeout=60000)
    await page.click("text=Simulate")
    # The original has no battle-animation button, so the inline fight stage is
    # the signal both sides share.
    await page.wait_for_selector(".fight-stage", timeout=60000)
    await page.wait_for_timeout(1200)
    top = os.path.join(outdir, f"{label}-01-top.jpg")
    await page.screenshot(path=top, type="jpeg", quality=90)
    shots["top"] = top
    pane = os.path.join(outdir, f"{label}-02-animation-pane.png")
    await page.locator(".logs-pane").screenshot(path=pane)
    shots["pane"] = pane
    full = os.path.join(outdir, f"{label}-03-full-page.png")
    await page.screenshot(path=full, full_page=True)
    shots["full"] = full
    return shots


def diff_pngs(a_path, b_path, out_path):
    from PIL import Image, ImageChops

    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    if a.size != b.size:
        return {"same_size": False, "a": a.size, "b": b.size}
    delta = ImageChops.difference(a, b)
    box = delta.getbbox()
    # A small threshold, so antialiasing noise is not counted as a difference.
    changed = sum(1 for px in list(delta.getdata()) if max(px) > 12)
    # A heatmap that is readable rather than nearly black.
    heat = delta.point(lambda v: min(255, v * 6))
    heat.save(out_path)
    return {
        "same_size": True,
        "size": a.size,
        "changed_pixels": changed,
        "changed_fraction": round(changed / (a.size[0] * a.size[1]), 6),
        "changed_bbox": box,
        "heatmap": out_path,
    }


async def run(fid, baseline_url, branch_url, outdir):
    from urllib.parse import quote
    from playwright.async_api import async_playwright

    with open(os.path.join(FIXTURES, f"{fid}.json")) as handle:
        fixture = json.load(handle)
    os.makedirs(outdir, exist_ok=True)
    payload = quote(json.dumps(calculator_state(fixture), separators=(",", ":")))
    report = {"fixture": fid, "baseline": baseline_url, "branch": branch_url}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=["--no-sandbox", "--force-device-scale-factor=1"]
        )
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        report["baseline_shots"] = await shoot_side(
            page, baseline_url, payload, outdir, "original"
        )
        report["branch_shots"] = await shoot_side(
            page, branch_url, payload, outdir, "branch"
        )
        await browser.close()

    report["pane_diff"] = diff_pngs(
        report["baseline_shots"]["pane"],
        report["branch_shots"]["pane"],
        os.path.join(outdir, "diff-animation-pane.png"),
    )
    report["full_page_diff"] = diff_pngs(
        report["baseline_shots"]["full"],
        report["branch_shots"]["full"],
        os.path.join(outdir, "diff-full-page.png"),
    )
    with open(os.path.join(outdir, "baseline-diff.json"), "w") as handle:
        json.dump(report, handle, indent=1)
    print(json.dumps({k: report[k] for k in ("pane_diff", "full_page_diff")}, indent=1))
    print(f"{fid}: -> {outdir}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", nargs="?", default="f01-plain-trades")
    parser.add_argument("--baseline", default="http://127.0.0.1:4203")
    parser.add_argument("--branch", default="http://127.0.0.1:4201")
    parser.add_argument("--out", default=os.path.join(OUT_ROOT, "w3a-baseline-diff"))
    args = parser.parse_args()
    asyncio.run(run(args.fixture, args.baseline, args.branch, args.out))


if __name__ == "__main__":
    sys.exit(main())
