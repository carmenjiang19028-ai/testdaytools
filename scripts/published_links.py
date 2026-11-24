from html import escape, unescape
from html.parser import HTMLParser
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


ATTRIBUTE = re.compile(r'(?<![\w:-])([\w:-]+)(\s*=\s*)(["\'])(.*?)\3', re.S)


def clean_links(page, source, *, origin, redirects, unavailable, canonical=False):
    """Rewrite only attribute values, leaving surrounding markup byte-stable."""
    host = urlsplit(origin).netloc
    line_offsets = [0]
    for match in re.finditer("\n", page):
        line_offsets.append(match.end())
    edits = []

    class Links(HTMLParser):
        def handle_starttag(self, tag, attrs):
            start_tag = self.get_starttag_text()
            line, column = self.getpos()
            offset = line_offsets[line - 1] + column
            route = {}

            def replace(match):
                name, equals, quote, value = match.groups()
                if not (tag == "a" and name == "href" or name.startswith("data-") and name.endswith(("-url", "-href"))):
                    return match[0]
                original = unescape(value)
                parts = urlsplit(original)
                if parts.scheme not in ("", "http", "https") or (parts.netloc and parts.netloc != host):
                    return match[0]
                slug = parts.path.lstrip("/").removesuffix(".html")
                if slug in unavailable:
                    return f'{name}={quote}{quote}' if name != "href" else ""
                if slug in redirects:
                    parts = urlsplit(redirects[slug] + ".html")
                if canonical and tag == "a" and name == "href" and (parts.path.endswith(".html") or (not parts.path and parts.query)):
                    path = parts.path.lstrip("/")
                    query = dict(parse_qsl(parts.query))
                    if entry := query.pop("source", ""):
                        route["data-entry-source"] = entry
                    if query:
                        route["data-route-query"] = urlencode(query)
                    if (not path or path == source) and parts.fragment:
                        dest = f"#{parts.fragment}"
                    else:
                        dest = f'{origin}/{"" if path == "index.html" else path}'
                        if parts.fragment:
                            route["data-route-fragment"] = parts.fragment
                else:
                    dest = urlunsplit(parts)
                if original == dest:
                    return match[0]
                return f'{name}{equals}{quote}{escape(dest, quote=True)}{quote}'

            new = ATTRIBUTE.sub(replace, start_tag)
            if route:
                attr_names = {name for name, _ in attrs}
                addition = "".join(
                    f' {name}="{escape(value, quote=True)}"'
                    for name, value in route.items() if name not in attr_names
                )
                new = new[:-1] + addition + ">"
            if new != start_tag:
                edits.append((offset, offset + len(start_tag), new))

    Links().feed(page)
    for start, end, replacement in reversed(edits):
        page = page[:start] + replacement + page[end:]
    return page
