#!/usr/bin/env python3
import argparse
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


def reference_pdf_differences(checked_in, fresh, directory):
    from PIL import Image, ImageChops
    from pypdf import PdfReader

    def page_links(page):
        links = []
        for ref in page.get("/Annots", []):
            annotation = ref.get_object()
            if annotation.get("/Subtype") != "/Link":
                continue
            action = annotation.get("/A", {})
            bounds = tuple(round(float(value), 3) for value in annotation.get("/Rect", []))
            links.append((str(action.get("/URI", "")), bounds))
        return sorted(links)

    def rasterize(pdf, name):
        prefix = directory / name
        subprocess.run(
            [os.environ.get("PDFTOPPM_BIN", "pdftoppm"), "-r", "120", "-png", str(pdf), str(prefix)],
            check=True, timeout=45,
        )
        return sorted(directory.glob(f"{name}-*.png"), key=lambda image: int(image.stem.rsplit("-", 1)[1]))

    if not checked_in.is_file():
        return ["Reference PDF is missing."]
    existing_pages = PdfReader(checked_in).pages
    fresh_pages = PdfReader(fresh).pages
    if len(existing_pages) != len(fresh_pages):
        return [f"Page count: stored {len(existing_pages)}, current print {len(fresh_pages)}."]

    # Render both files with the same tool to ignore metadata and internal PDF object IDs.
    existing_images = rasterize(checked_in, "checked-in")
    fresh_images = rasterize(fresh, "current-print")
    if len(existing_images) != len(existing_pages) or len(fresh_images) != len(fresh_pages):
        raise ValueError("Poppler did not render every page")
    differences = []
    for index, (old, new) in enumerate(zip(existing_images, fresh_images), 1):
        with Image.open(old) as before, Image.open(new) as after:
            if before.size != after.size or ImageChops.difference(before.convert("RGB"), after.convert("RGB")).getbbox():
                differences.append(f"Page {index}: printed artwork or layout differs.")
        if page_links(existing_pages[index - 1]) != page_links(fresh_pages[index - 1]):
            differences.append(f"Page {index}: link destinations or click areas differ.")
    return differences


def main():
    parser = argparse.ArgumentParser(description="Build the downloadable road-sign reference.")
    parser.add_argument("--check", action="store_true", help="Compare printed pages and links without writing site files.")
    args = parser.parse_args()
    if not args.check:
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
        if args.check:
            differences = reference_pdf_differences(OUTPUT, rendered, Path(directory))
            if differences:
                raise SystemExit("Download differs from current web print. Review before rebuilding:\n" + "\n".join(differences))
            print(f"Verified printed pages and links in {OUTPUT.name}; no site files changed.")
            return
        rendered.replace(OUTPUT)
    print(f"Built {OUTPUT.name} ({OUTPUT.stat().st_size:,} bytes).")


if __name__ == "__main__":
    main()
