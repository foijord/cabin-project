#!/usr/bin/env python3
"""Check a rendered north-up view, not the coordinate comments.

Loads the viewer with ?topdown=1. Geographic north is requested at the top
of the screen. The coloured spheres are 50 m east (red), west (yellow),
north (blue) and south (green) of the address. East must land to the right
of west, and north above south. That fails if world Z = +north, which is
left-handed in Three.js and draws east on the left.
"""

from __future__ import annotations

import os
import subprocess
import sys
import textwrap
from pathlib import Path

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / "web" / "dist" / "topdown-orientation.png"
URL = os.environ.get("TOPDOWN_URL", "http://127.0.0.1:5175/cabin-project/?topdown=1")


def centroid(mask: np.ndarray) -> tuple[float, float] | None:
    ys, xs = np.where(mask)
    if len(xs) < 30:
        return None
    return float(xs.mean()), float(ys.mean())


def main() -> None:
    SHOT.parent.mkdir(parents=True, exist_ok=True)
    script = textwrap.dedent(
        f"""
        import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
        const browser = await puppeteer.launch({{
          executablePath: "/usr/bin/google-chrome",
          headless: true,
          args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--hide-scrollbars"],
        }});
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setViewport({{ width: 1000, height: 1000, deviceScaleFactor: 1 }});
        await page.goto({URL!r}, {{ waitUntil: "networkidle0", timeout: 30000 }});
        await page.waitForFunction(() => document.querySelector("#loader")?.classList.contains("hidden"), {{ timeout: 20000 }});
        await new Promise((resolve) => setTimeout(resolve, 700));
        await page.screenshot({{ path: {str(SHOT)!r} }});
        if (errors.length) {{ console.error(errors.join("\\n")); process.exit(2); }}
        await browser.close();
        """
    )
    subprocess.run(["node", "--input-type=module", "-e", script], check=True)
    image = np.array(Image.open(SHOT).convert("RGB"))
    east = centroid((image[:, :, 0] > 200) & (image[:, :, 1] < 90) & (image[:, :, 2] < 120))
    west = centroid((image[:, :, 0] > 200) & (image[:, :, 1] > 180) & (image[:, :, 2] < 90))
    north = centroid((image[:, :, 2] > 180) & (image[:, :, 0] < 90) & (image[:, :, 1] < 140))
    south = centroid((image[:, :, 0] < 40) & (image[:, :, 1] > 120) & (image[:, :, 2] < 60))
    found = {"east": east, "west": west, "north": north, "south": south}
    missing = [name for name, point in found.items() if point is None]
    if missing:
        raise SystemExit(f"control spheres not visible: {missing}")
    assert east and west and north and south
    if east[0] <= west[0]:
        raise SystemExit(f"east is left of west ({east[0]:.0f} vs {west[0]:.0f}); the view is mirrored")
    if north[1] >= south[1]:
        raise SystemExit(f"north is below south ({north[1]:.0f} vs {south[1]:.0f})")
    print(
        {
            "ok": True,
            "east_x": round(east[0]),
            "west_x": round(west[0]),
            "north_y": round(north[1]),
            "south_y": round(south[1]),
            "screenshot": str(SHOT),
        }
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
