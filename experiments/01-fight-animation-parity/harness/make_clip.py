#!/usr/bin/env python3
"""Turn a recorded frame directory into a webm clip and a filmstrip contact sheet.

The screencast frames are named f_<index>_<ms since record start>.jpg, so the
real wall-clock timestamp of every frame is known. The filmstrip labels each
tile with that timestamp, which is what CHECKLIST.md cites.

Two filmstrip modes:
  --mode even    N tiles at even time intervals (overview of the whole battle)
  --mode motion  N tiles picked where the picture changed the most, i.e. the
                 actual animation beats (better for reading event shapes)

Usage:
  make_clip.py <clipdir> [--out-dir DIR] [--tiles 40] [--mode motion] [--fps 25]
"""
import argparse
import json
import os
import subprocess
import sys

FFMPEG = os.environ.get(
    "ANIM01_FFMPEG", "/root/autodl-tmp/ms-playwright/ffmpeg-1011/ffmpeg-linux"
)


def frames(clipdir, start_ms=None, end_ms=None):
    """Frames as (path, ms-since-record-start), optionally trimmed at both ends.

    run_fixture.py writes meta.json with battle_start_ms, the offset at which
    the /api/battle/get interception was seen. Everything before that is menu
    navigation and does not belong in the reference clip.

    end_ms trims the tail. The motion filmstrip picks the frames that changed
    most, and a long even ramp (the opening shutter, the end screen dimming)
    produces hundreds of middling changes that crowd out the battle's own
    beats, so a strip meant to read the beats is cut to the beats.
    """
    if start_ms is None:
        try:
            with open(os.path.join(clipdir, "meta.json")) as f:
                start_ms = max(0, int(json.load(f).get("battle_start_ms", 0)) - 1500)
        except Exception:
            start_ms = 0
    names = sorted(n for n in os.listdir(clipdir) if n.endswith(".jpg"))
    out = []
    for n in names:
        try:
            ms = int(n.rsplit("_", 1)[1].split(".")[0])
        except Exception:
            ms = 0
        if ms >= start_ms and (end_ms is None or ms <= end_ms):
            out.append((os.path.join(clipdir, n), ms))
    return out


def encode_webm(fs, out, fps):
    """Concatenate the jpegs through ffmpeg's image2pipe demuxer.

    The playwright-bundled ffmpeg is a minimal build: only the pipe and file
    protocols, mjpeg decode, image2pipe demux, libvpx VP8 encode and the webm
    muxer. That means frames must be streamed on stdin as `pipe:0` (plain `-`
    is rejected as an unknown protocol by this build), and the input codec has to
    be named explicitly with -vcodec mjpeg because this build cannot probe it.
    """
    if not fs:
        return None
    p = subprocess.Popen(
        [FFMPEG, "-y", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(fps), "-i", "pipe:0",
         "-c:v", "libvpx", "-b:v", "1100k", "-deadline", "realtime",
         "-cpu-used", "6", "-threads", "8", "-an", out],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for path, _ in fs:
        with open(path, "rb") as f:
            p.stdin.write(f.read())
    p.stdin.close()
    p.wait()
    return out if os.path.exists(out) else None


def pick_motion(fs, tiles):
    """Pick the frames where the picture changed most since the previous pick."""
    from PIL import Image

    def th(path):
        with Image.open(path) as im:
            return list(im.convert("L").resize((64, 40)).getdata())

    step = max(1, len(fs) // 400)
    sampled = fs[::step]
    prev = th(sampled[0][0])
    scored = []
    for path, ms in sampled[1:]:
        cur = th(path)
        d = sum(abs(a - b) for a, b in zip(prev, cur)) / len(cur)
        scored.append((d, path, ms))
        prev = cur
    scored.sort(reverse=True)
    chosen = sorted(scored[: tiles - 1], key=lambda x: x[2])
    return [(sampled[0][0], sampled[0][1])] + [(p, m) for _, p, m in chosen]


def filmstrip(fs, out, tiles, mode, cols=5):
    from PIL import Image, ImageDraw
    if not fs:
        return None
    if mode == "motion" and len(fs) > tiles * 3:
        picks = pick_motion(fs, tiles)
    else:
        step = max(1, len(fs) // tiles)
        picks = fs[::step][:tiles]

    tw, thh = 320, 200
    rows = (len(picks) + cols - 1) // cols
    label_h = 18
    sheet = Image.new("RGB", (cols * tw, rows * (thh + label_h)), (18, 18, 18))
    draw = ImageDraw.Draw(sheet)
    for i, (path, ms) in enumerate(picks):
        with Image.open(path) as im:
            im = im.convert("RGB").resize((tw, thh))
            x, y = (i % cols) * tw, (i // cols) * (thh + label_h)
            sheet.paste(im, (x, y + label_h))
            draw.text((x + 4, y + 4), f"{i:02d}  t={ms / 1000:6.2f}s", fill=(240, 220, 120))
    sheet.save(out, quality=85)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clipdir")
    ap.add_argument("--out-dir")
    ap.add_argument("--tiles", type=int, default=40)
    ap.add_argument("--mode", choices=["even", "motion"], default="motion")
    ap.add_argument("--fps", type=int, default=25)
    ap.add_argument("--start-ms", type=int, default=None)
    ap.add_argument("--end-ms", type=int, default=None)
    ap.add_argument(
        "--strip-start-ms",
        type=int,
        default=None,
        help="trim the filmstrip only, so the clip still carries the whole recording",
    )
    ap.add_argument("--strip-end-ms", type=int, default=None)
    a = ap.parse_args()

    name = os.path.basename(a.clipdir.rstrip("/"))
    outdir = a.out_dir or os.path.dirname(a.clipdir.rstrip("/"))
    os.makedirs(outdir, exist_ok=True)
    fs = frames(a.clipdir, a.start_ms, a.end_ms)
    n = len(fs)
    webm = encode_webm(fs, os.path.join(outdir, f"{name}.webm"), a.fps)
    strip_fs = (
        frames(a.clipdir, a.strip_start_ms or a.start_ms, a.strip_end_ms or a.end_ms)
        if (a.strip_start_ms or a.strip_end_ms)
        else fs
    )
    strip = filmstrip(
        strip_fs, os.path.join(outdir, f"{name}_filmstrip.jpg"), a.tiles, a.mode
    )
    print(f"{name}: frames={n} webm={webm} filmstrip={strip}")


main()
