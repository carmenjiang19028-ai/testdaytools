#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = "https://testdaytools.com/"
KEY = "1b3ade7ad4d1ae63948782fb106d5668"
KEY_FILE = ROOT / f"{KEY}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"


def normalized_url(value):
    url = urljoin(SITE_URL, value)
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != "testdaytools.com":
        raise ValueError(f"URL must belong to testdaytools.com: {value}")
    return url


def build_payload(values):
    if not KEY_FILE.exists() or KEY_FILE.read_text().strip() != KEY:
        raise RuntimeError(f"IndexNow key file is missing or invalid: {KEY_FILE.name}")
    urls = list(dict.fromkeys(normalized_url(value) for value in values))
    return {
        "host": "testdaytools.com",
        "key": KEY,
        "keyLocation": f"{SITE_URL}{KEY_FILE.name}",
        "urlList": urls,
    }


def main():
    parser = argparse.ArgumentParser(description="Notify IndexNow about newly published or updated TestDayTools URLs.")
    parser.add_argument("urls", nargs="+", help="Absolute URLs or root-relative paths changed in the current release.")
    parser.add_argument("--dry-run", action="store_true", help="Print the request without submitting it.")
    args = parser.parse_args()
    payload = build_payload(args.urls)

    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return

    request = Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "TestDayTools-IndexNow/1.0"},
        method="POST",
    )
    with urlopen(request, timeout=20) as response:
        print(f"IndexNow accepted {len(payload['urlList'])} URL(s): HTTP {response.status}")


if __name__ == "__main__":
    main()
