#!/usr/bin/env python3

import os
import signal
import subprocess
import tempfile
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dmv-road-signs-cheat-sheet.pdf"
PAGE = "dmv-road-signs-cheat-sheet.html"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


def find_chrome():
    candidates = [
        os.environ.get("CHROME_BIN"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise SystemExit("Chrome or Chromium was not found. Set CHROME_BIN and retry.")


def main():
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        with tempfile.TemporaryDirectory(prefix="testdaytools-pdf-") as profile:
            OUTPUT.unlink(missing_ok=True)
            url = f"http://127.0.0.1:{server.server_port}/{PAGE}"
            command = [
                find_chrome(),
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",
                "--run-all-compositor-stages-before-draw",
                "--virtual-time-budget=3000",
                f"--user-data-dir={profile}",
                f"--print-to-pdf={OUTPUT}",
                url,
            ]
            process = subprocess.Popen(
                command,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            deadline = time.monotonic() + 30
            last_size = 0
            stable_since = None
            try:
                while time.monotonic() < deadline:
                    if OUTPUT.is_file() and OUTPUT.stat().st_size >= 10_000:
                        current_size = OUTPUT.stat().st_size
                        if current_size == last_size:
                            stable_since = stable_since or time.monotonic()
                            if time.monotonic() - stable_since >= 0.75:
                                break
                        else:
                            last_size = current_size
                            stable_since = None
                    if process.poll() is not None and not OUTPUT.is_file():
                        raise SystemExit("Chrome exited before writing the PDF.")
                    time.sleep(0.1)
                else:
                    raise SystemExit("Chrome did not finish the PDF within 30 seconds.")
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=5)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

    if not OUTPUT.is_file() or OUTPUT.stat().st_size < 10_000:
        raise SystemExit("PDF generation did not produce a valid output file.")
    print(f"Built {OUTPUT.name} ({OUTPUT.stat().st_size:,} bytes).")


if __name__ == "__main__":
    main()
