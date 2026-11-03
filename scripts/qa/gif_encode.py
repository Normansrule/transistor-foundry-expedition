"""Assemble PNG frames into a looping GIF that fits a byte budget (uses ffmpeg).

    python scripts/qa/gif_encode.py FRAMES_DIR OUT.gif --delay 80 --colors 256 --budget 1500000

ffmpeg builds one palette from the pixels that change between frames (stats_mode=diff), then
writes each frame as only the rectangle that changed, with unchanged pixels transparent, so
mostly static scenes stay small. If the file is over budget the palette shrinks, then every
other frame is dropped (delay doubled, so the timing is unchanged), then the frame is scaled
down, until it fits. When gifsicle is installed (sudo apt install gifsicle) each attempt is
also squeezed with gifsicle -O3 --lossy, which roughly halves the size of noisy scenes.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def encode(frames_dir: Path, out: Path, delay: int, colors: int, step: int, scale: float, lossy: int = 0) -> int:
    fps = 1000 / (delay * step)
    vf = []
    if step > 1:
        vf.append(f"select='not(mod(n\\,{step}))',setpts=N/({fps}*TB)")
    if scale != 1.0:
        vf.append(f"scale=iw*{scale}:-1:flags=lanczos")
    chain = (",".join(vf) + "," if vf else "") + (
        f"split[a][b];[a]palettegen=max_colors={colors}:stats_mode=diff[p];"
        f"[b][p]paletteuse=dither=none:diff_mode=rectangle")
    cmd = ["ffmpeg", "-v", "error", "-y", "-framerate", f"{1000 / delay:.4f}", "-i", str(frames_dir / "f%04d.png"),
           "-filter_complex", chain, "-r", f"{fps:.4f}", "-loop", "0", str(out)]
    subprocess.run(cmd, check=True)
    if lossy and shutil.which("gifsicle"):
        subprocess.run(["gifsicle", "-O3", f"--lossy={lossy}", "--no-comments", "-b", str(out)], check=True,
                       stderr=subprocess.DEVNULL)
    return out.stat().st_size


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("frames")
    ap.add_argument("out")
    ap.add_argument("--delay", type=int, default=80)
    ap.add_argument("--colors", type=int, default=256)
    ap.add_argument("--budget", type=int, default=1_500_000)
    a = ap.parse_args()
    if not shutil.which("ffmpeg"):
        print("ffmpeg not found (sudo apt install ffmpeg)", file=sys.stderr)
        return 1
    frames = Path(a.frames)
    if not any(frames.glob("f*.png")):
        print(f"no frames in {frames}", file=sys.stderr)
        return 1
    out = Path(a.out)
    attempts = [(a.colors, 30, 1, 1.0), (a.colors, 60, 1, 1.0), (min(a.colors, 128), 80, 1, 1.0),
                (min(a.colors, 96), 80, 1, 1.0), (64, 80, 2, 1.0), (64, 80, 2, 0.8)]
    for colors, lossy, step, scale in dict.fromkeys(attempts):
        size = encode(frames, out, a.delay, colors, step, scale, lossy)
        tag = f"{colors} colours, lossy {lossy if shutil.which('gifsicle') else 'off'}, every {step} frame(s), scale {scale}"
        if size <= a.budget:
            print(f"{out.name}: {size:,} bytes ({tag})")
            return 0
        print(f"{out.name}: {size:,} bytes over budget ({tag}), trying smaller")
    print(f"{out.name}: could not fit {a.budget:,} bytes", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
