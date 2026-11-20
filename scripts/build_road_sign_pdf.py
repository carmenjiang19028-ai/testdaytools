#!/usr/bin/env python3
import os
import subprocess
import tempfile
from pathlib import Path
from reportlab.graphics import renderSVG
if __package__:
    from .road_sign_print_links import practice_qr
else:
    from road_sign_print_links import practice_qr

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dmv-road-signs-cheat-sheet.pdf"


def main():
    renderSVG.drawToFile(
        practice_qr(72), str(ROOT / "assets/road-sign-practice-qr.svg"),
        title="TestDayTools road signs practice", desc="QR code for the road-sign study sheet and matching practice groups.",
    )
    with tempfile.TemporaryDirectory(prefix="testdaytools-reference-") as directory:
        rendered = Path(directory) / OUTPUT.name
        subprocess.run([
            os.environ.get("NODE_BIN", "node"), str(ROOT / "scripts/render_road_sign_materials.cjs"),
            "reference", str(rendered),
        ], check=True, timeout=90)
        if not rendered.is_file() or rendered.stat().st_size < 10_000:
            raise ValueError("Reference PDF output is incomplete")
        rendered.replace(OUTPUT)
    print(f"Built {OUTPUT.name} ({OUTPUT.stat().st_size:,} bytes).")


if __name__ == "__main__":
    main()
