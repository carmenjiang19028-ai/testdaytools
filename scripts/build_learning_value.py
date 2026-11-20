from scripts.build import DATA, ROOT, TOOL_BY_SLUG, render_hub, render_tool, write_contrast_lessons


def main():
    write_contrast_lessons()
    for slug in ["sat-math-score-guide", "sat-reading-writing-score-guide", "regulatory-traffic-signs-practice-test"]:
        (ROOT / f"{slug}.html").write_text(render_tool(TOOL_BY_SLUG[slug]))
    hub = next(item for item in DATA["hubs"] if item["slug"] == "dmv-practice")
    (ROOT / "dmv-practice.html").write_text(render_hub(hub))


if __name__ == "__main__":
    main()
