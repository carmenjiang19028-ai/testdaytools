#!/usr/bin/env python3
from build import (
    TOOL_BY_SLUG, render_tool, render_road_sign_cheat_sheet_page,
    write, write_contrast_lessons, write_road_sign_images,
)


if __name__ == "__main__":
    write_road_sign_images()
    write("road-signs-practice-test.html", render_tool(TOOL_BY_SLUG["road-signs-practice-test"]))
    write("dmv-road-signs-cheat-sheet.html", render_road_sign_cheat_sheet_page())
    write_contrast_lessons()
    print("Built only the existing core road-sign pages and shared artwork.")
