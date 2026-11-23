#!/usr/bin/env python3
import argparse
import html
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlencode
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

if __package__:
    from . import road_sign_classroom_content as classroom
else:
    import road_sign_classroom_content as classroom

ROOT = Path(__file__).resolve().parents[1]


def reject_duplicate_json_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


DATA = json.loads(
    (ROOT / "content" / "site_data.json").read_text(),
    object_pairs_hook=reject_duplicate_json_keys,
)
SITE = DATA["site"]
TOOL_BY_SLUG = {tool["slug"]: tool for tool in DATA["tools"]}
HUBS = DATA.get("hubs", [])
DMV_REQUIREMENTS_SLUG = "dmv-permit-test-requirements-by-state"
DMV_REQUIREMENTS_PAGE = {
    "slug": DMV_REQUIREMENTS_SLUG,
    "category": "DMV",
    "title": "DMV Permit Test Requirements by State",
    "description": "Compare DMV permit test format, passing score, official source, documents, road signs, and practice links by state.",
    "lastUpdated": "November 20, 2026",
}
TOOL_BY_SLUG[DMV_REQUIREMENTS_SLUG] = DMV_REQUIREMENTS_PAGE
DMV_SCORE_SLUG = "dmv-permit-test-passing-score-calculator"
DMV_SCORE_PAGE = {
    "slug": DMV_SCORE_SLUG,
    "category": "DMV",
    "title": "Permit Test Passing Score Calculator: How Many Can You Miss?",
    "description": "Choose a state to see how many permit test questions you can miss, compare passing scores, and check a practice result against the official target.",
    "lastUpdated": "November 21, 2026",
}
TOOL_BY_SLUG[DMV_SCORE_SLUG] = DMV_SCORE_PAGE
ROAD_SIGN_SHAPES_SLUG = "road-sign-shapes-and-colors-finder"
ROAD_SIGN_SHAPES_PAGE = {
    "slug": ROAD_SIGN_SHAPES_SLUG,
    "category": "DMV",
    "title": "Road Sign Shapes and Colors: DMV Meaning Finder",
    "description": "Search road sign shapes and colors by meaning, action, and category, including yellow warning signs, red regulatory signs, brown guide signs, and DMV examples.",
    "lastUpdated": "November 21, 2026",
}
TOOL_BY_SLUG[ROAD_SIGN_SHAPES_SLUG] = ROAD_SIGN_SHAPES_PAGE
ROAD_SIGN_FLASHCARDS_SLUG = "dmv-road-sign-flashcards"
ROAD_SIGN_FLASHCARDS_PAGE = {
    "slug": ROAD_SIGN_FLASHCARDS_SLUG,
    "category": "DMV",
    "title": "Road Sign Flashcards: DMV Pictures for Fast Review",
    "description": "Flip DMV road sign flashcards for regulatory, warning, school, work-zone, and service signs. Save review cards in your browser. No signup.",
    "lastUpdated": "November 21, 2026",
}
TOOL_BY_SLUG[ROAD_SIGN_FLASHCARDS_SLUG] = ROAD_SIGN_FLASHCARDS_PAGE
ROAD_SIGN_CHEAT_SHEET_SLUG = "dmv-road-signs-cheat-sheet"
ROAD_SIGN_PICTURE_SLUG = "road-signs-practice-test"
ROAD_SIGN_PICTURE_PREVIEW = "assets/road-signs-practice-test-preview.png"
ROAD_SIGN_CHEAT_SHEET_PAGE = {
    "slug": ROAD_SIGN_CHEAT_SHEET_SLUG,
    "category": "DMV",
    "title": "Free DMV Road Signs Cheat Sheet: Printable Signs and Meanings",
    "description": "Print a free DMV road signs cheat sheet with 31 original sign pictures, plain-English meanings, shape and color cues, and links to a no-signup practice test.",
    "lastUpdated": "November 21, 2026",
}
TOOL_BY_SLUG[ROAD_SIGN_CHEAT_SHEET_SLUG] = ROAD_SIGN_CHEAT_SHEET_PAGE
DMV_STUDY_PLAN_SLUG = "dmv-permit-test-study-plan"
DMV_STUDY_PLAN_PAGE = {
    "slug": DMV_STUDY_PLAN_SLUG,
    "category": "DMV",
    "title": "DMV Permit Test Study Plan",
    "description": "Build a DMV permit test study plan by state, timeline, and weak area with practice, road-sign, checklist, and official-source links.",
    "lastUpdated": "November 20, 2026",
}
TOOL_BY_SLUG[DMV_STUDY_PLAN_SLUG] = DMV_STUDY_PLAN_PAGE
DMV_DAILY_SLUG = "dmv-permit-test-question-of-the-day"
DMV_DAILY_PAGE = {
    "slug": DMV_DAILY_SLUG,
    "category": "DMV",
    "title": "DMV Permit Test Question of the Day",
    "description": "Answer a free daily DMV permit test question with state filters, instant explanation, road-sign images, and links to full practice tools.",
}
TOOL_BY_SLUG[DMV_DAILY_SLUG] = DMV_DAILY_PAGE
DMV_MISTAKE_LOG_SLUG = "dmv-permit-test-mistake-log"
DMV_MISTAKE_LOG_PAGE = {
    "slug": DMV_MISTAKE_LOG_SLUG,
    "category": "DMV",
    "title": "DMV Permit Test Mistake Log",
    "description": "Save missed DMV permit-test questions by state and weak area, then turn them into a focused road-sign, rules, score, or checklist review path.",
}
TOOL_BY_SLUG[DMV_MISTAKE_LOG_SLUG] = DMV_MISTAKE_LOG_PAGE

SCHOOL_WARNING_GREEN = "#c7e644"
SIGN_SEARCH_ALIASES = {"four-way-stop": "all way stop four-way stop 4-way stop"}
ROUNDABOUT_ARROW = '<path d="M126 107 A31 31 0 0 0 136 65" fill="none" stroke="#111" stroke-width="8"/><polygon points="130,55 145,65 127,74" fill="#111"/>'
ROUNDABOUT_SYMBOL = "".join(f'<g transform="rotate({angle} 110 80)">{ROUNDABOUT_ARROW}</g>' for angle in (0, 120, 240))
SIGN_SVGS = {
    "curb-white": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect width="220" height="92" fill="#48515b"/><rect y="92" width="220" height="22" fill="#fff" stroke="#aeb7c2" stroke-width="4"/><rect y="114" width="220" height="46" fill="#d9dde2"/><path d="M20 58 H82 M138 58 H200" stroke="#f3c64d" stroke-width="6" stroke-linecap="round"/></svg>',
    "curb-green": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect width="220" height="92" fill="#48515b"/><rect y="92" width="220" height="22" fill="#2f8f5b"/><rect y="114" width="220" height="46" fill="#d9dde2"/><path d="M20 58 H82 M138 58 H200" stroke="#f3c64d" stroke-width="6" stroke-linecap="round"/></svg>',
    "curb-yellow": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect width="220" height="92" fill="#48515b"/><rect y="92" width="220" height="22" fill="#f3c64d"/><rect y="114" width="220" height="46" fill="#d9dde2"/><path d="M20 58 H82 M138 58 H200" stroke="#f3c64d" stroke-width="6" stroke-linecap="round"/></svg>',
    "curb-red": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect width="220" height="92" fill="#48515b"/><rect y="92" width="220" height="22" fill="#c7312f"/><rect y="114" width="220" height="46" fill="#d9dde2"/><path d="M20 58 H82 M138 58 H200" stroke="#f3c64d" stroke-width="6" stroke-linecap="round"/></svg>',
    "curb-blue": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect width="220" height="92" fill="#48515b"/><rect y="92" width="220" height="22" fill="#1469aa"/><rect y="114" width="220" height="46" fill="#d9dde2"/><path d="M20 58 H82 M138 58 H200" stroke="#f3c64d" stroke-width="6" stroke-linecap="round"/></svg>',
    "stop": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="82,12 138,12 184,46 202,100 174,145 46,145 18,100 36,46" fill="#c7312f" stroke="#981f1d" stroke-width="6"/><text x="110" y="94" text-anchor="middle" fill="#fff" font-size="38" font-weight="900" font-family="Arial, sans-serif">STOP</text></svg>',
    "yield": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,148 202,18 18,18" fill="#fff" stroke="#c7312f" stroke-width="12"/><text x="110" y="76" text-anchor="middle" fill="#c7312f" font-size="28" font-weight="900" font-family="Arial, sans-serif">YIELD</text></svg>',
    "do-not-enter": '<svg viewBox="0 0 220 160" aria-hidden="true"><circle cx="110" cy="80" r="62" fill="#c7312f"/><rect x="54" y="69" width="112" height="22" rx="3" fill="#fff"/><text x="110" y="57" text-anchor="middle" fill="#fff" font-size="18" font-weight="900" font-family="Arial, sans-serif">DO NOT</text><text x="110" y="119" text-anchor="middle" fill="#fff" font-size="18" font-weight="900" font-family="Arial, sans-serif">ENTER</text></svg>',
    "wrong-way": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="40" y="42" width="140" height="76" rx="5" fill="#c7312f" stroke="#981f1d" stroke-width="5"/><text x="110" y="74" text-anchor="middle" fill="#fff" font-size="26" font-weight="900" font-family="Arial, sans-serif">WRONG</text><text x="110" y="104" text-anchor="middle" fill="#fff" font-size="26" font-weight="900" font-family="Arial, sans-serif">WAY</text></svg>',
    "no-u-turn": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="38" y="20" width="144" height="120" rx="8" fill="#fff" stroke="#222" stroke-width="4"/><path d="M140 112 V76 C140 38 90 38 90 76 V89" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round"/><path d="M74 82 L90 108 L106 82 Z" fill="#111"/><circle cx="110" cy="80" r="58" fill="none" stroke="#c7312f" stroke-width="11"/><line x1="69" y1="39" x2="151" y2="121" stroke="#c7312f" stroke-width="11"/></svg>',
    "four-way-stop": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="88,8 132,8 165,41 165,85 132,118 88,118 55,85 55,41" fill="#c7312f" stroke="#c7312f" stroke-width="5"/><polygon points="89,11 131,11 162,42 162,84 131,115 89,115 58,84 58,42" fill="none" stroke="#fff" stroke-width="2"/><text x="110" y="73" text-anchor="middle" fill="#fff" font-size="31" font-weight="900" font-family="Arial, sans-serif">STOP</text><rect x="67" y="126" width="86" height="28" rx="3" fill="#c7312f"/><rect x="69" y="128" width="82" height="24" rx="2" fill="none" stroke="#fff" stroke-width="1.5"/><text x="110" y="145" text-anchor="middle" fill="#fff" font-size="14" font-weight="900" font-family="Arial, sans-serif">ALL WAY</text></svg>',
    "no-right-turn": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="38" y="20" width="144" height="120" rx="8" fill="#fff" stroke="#222" stroke-width="4"/><path d="M88 112 V80 Q88 62 106 62 H140" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round"/><path d="M134 46 L160 62 L134 78 Z" fill="#111"/><circle cx="110" cy="80" r="58" fill="none" stroke="#c7312f" stroke-width="11"/><line x1="69" y1="39" x2="151" y2="121" stroke="#c7312f" stroke-width="11"/></svg>',
    "no-left-turn": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="38" y="20" width="144" height="120" rx="8" fill="#fff" stroke="#222" stroke-width="4"/><path d="M132 112 V80 Q132 62 114 62 H80" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round"/><path d="M86 46 L60 62 L86 78 Z" fill="#111"/><circle cx="110" cy="80" r="58" fill="none" stroke="#c7312f" stroke-width="11"/><line x1="69" y1="39" x2="151" y2="121" stroke="#c7312f" stroke-width="11"/></svg>',
    "no-turn-on-red": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="63" y="15" width="94" height="130" rx="4" fill="#fff" stroke="#222" stroke-width="4"/><g text-anchor="middle" fill="#111" font-weight="900" font-family="Arial, sans-serif"><text x="110" y="44" font-size="24">NO</text><text x="110" y="68" font-size="20">TURN</text><text x="110" y="91" font-size="17">ON RED</text></g><circle cx="110" cy="118" r="13" fill="#c7312f"/></svg>',
    "keep-right": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="42" y="20" width="136" height="120" rx="6" fill="#fff" stroke="#222" stroke-width="4"/><text x="110" y="43" text-anchor="middle" fill="#111" font-size="17" font-weight="900" font-family="Arial, sans-serif">KEEP RIGHT</text><path d="M113 125 C144 113 150 95 146 76" fill="none" stroke="#111" stroke-width="9" stroke-linecap="round"/><path d="M132 80 h28 l-14-22z" fill="#111"/><path d="M78 124 l14-55 14 55z" fill="#111"/></svg>',
    "one-way": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="28" y="46" width="164" height="68" rx="6" fill="#111827"/><path d="M58 80 h78" stroke="#fff" stroke-width="12" stroke-linecap="round"/><path d="M126 50 170 80 126 110z" fill="#fff"/><text x="78" y="105" text-anchor="middle" fill="#fff" font-size="18" font-weight="900" font-family="Arial, sans-serif">ONE WAY</text></svg>',
    "right-turn-only": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="44" y="18" width="132" height="124" rx="6" fill="#fff" stroke="#222" stroke-width="4"/><path d="M89 104 V72 Q89 49 112 49 H143" fill="none" stroke="#111" stroke-width="13" stroke-linecap="round"/><path d="M136 32 L160 49 L136 66 Z" fill="#111"/><text x="110" y="130" text-anchor="middle" fill="#111" font-size="23" font-weight="900" font-family="Arial, sans-serif">ONLY</text></svg>',
    "speed-limit": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="66" y="16" width="88" height="128" rx="4" fill="#fff" stroke="#222" stroke-width="4"/><text x="110" y="48" text-anchor="middle" fill="#111" font-size="17" font-weight="900" font-family="Arial, sans-serif">SPEED</text><text x="110" y="68" text-anchor="middle" fill="#111" font-size="17" font-weight="900" font-family="Arial, sans-serif">LIMIT</text><text x="110" y="118" text-anchor="middle" fill="#111" font-size="48" font-weight="900" font-family="Arial, sans-serif">35</text></svg>',
    "school-crossing": f'<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,12 190,54 172,142 48,142 30,54" fill="{SCHOOL_WARNING_GREEN}" stroke="#222" stroke-width="5"/><circle cx="84" cy="55" r="9" fill="#111"/><circle cx="130" cy="53" r="9" fill="#111"/><path d="M82 68 l-18 38 M82 68 l24 18 M130 66 l-18 42 M130 66 l26 18" stroke="#111" stroke-width="8" stroke-linecap="round"/><path d="M92 108 h56" stroke="#111" stroke-width="8" stroke-linecap="round"/></svg>',
    "pedestrian-crossing": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><circle cx="112" cy="50" r="10" fill="#111"/><path d="M108 65 l-20 32 M109 66 l28 22 M92 98 l-8 16 M100 96 l27 20" stroke="#111" stroke-width="9" stroke-linecap="round"/></svg>',
    "merge": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M84 126 V38" stroke="#111" stroke-width="11" stroke-linecap="round"/><path d="M136 126 C136 94 118 88 96 78" fill="none" stroke="#111" stroke-width="11" stroke-linecap="round"/><path d="M70 48 84 28 98 48z" fill="#111"/></svg>',
    "lane-ends": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M87 117 V43 M132 117 V88 L118 67 V43" stroke="#111" stroke-width="10" fill="none"/><path d="M110 116 V83" fill="none" stroke="#111" stroke-width="4" stroke-dasharray="6 4"/></svg>',
    "slippery": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M84 65 L92 43 H128 L136 65 L141 72 V88 H79 V72 Z" fill="#111"/><path d="M96 49 H124 L128 62 H92 Z" fill="#f6d54a"/><path d="M84 85 V94 M136 85 V94" stroke="#111" stroke-width="8"/><path d="M89 96 C71 104 108 106 88 116 L97 124 M123 96 C105 104 142 106 122 116 L131 124" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/></svg>',
    "railroad": '<svg viewBox="0 0 220 160" aria-hidden="true"><circle cx="110" cy="80" r="64" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M88 48 L132 112 M132 48 L88 112" stroke="#111" stroke-width="9" stroke-linecap="round"/><text x="63" y="91" text-anchor="middle" fill="#111" font-size="31" font-weight="900" font-family="Arial, sans-serif">R</text><text x="157" y="91" text-anchor="middle" fill="#111" font-size="31" font-weight="900" font-family="Arial, sans-serif">R</text></svg>',
    "work-zone": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f59e2e" stroke="#222" stroke-width="5"/><circle cx="103" cy="48" r="9" fill="#111"/><path d="M96 60 L87 83 L79 105 M87 83 L100 91 L100 105 M97 61 L113 69 L124 70 M94 70 L107 80 L131 82" fill="none" stroke="#111" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M116 56 L143 105" stroke="#111" stroke-width="4" stroke-linecap="round"/><path d="M136 99 L147 96 L150 108 Q142 113 137 108 Z M111 108 Q120 96 128 100 Q134 101 139 108 Z" fill="#111"/></svg>',
    "signal-ahead": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><rect x="88" y="36" width="44" height="88" rx="8" fill="#222"/><circle cx="110" cy="58" r="11" fill="#e53935"/><circle cx="110" cy="82" r="11" fill="#f4c430"/><circle cx="110" cy="106" r="11" fill="#22a35a"/></svg>',
    "divided-highway": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M99 43 H121 C121 63 117 76 110 76 C103 76 99 63 99 43 Z" fill="#111"/><g><path d="M81 57 V65 C81 80 96 88 96 105 V114" stroke="#111" stroke-width="10" fill="none"/><polygon points="96,127 82,109 110,109" fill="#111"/></g><g><path d="M124 115 V105 C124 88 139 80 139 65 V57" stroke="#111" stroke-width="10" fill="none"/><polygon points="139,45 125,63 153,63" fill="#111"/></g></svg>',
    "divided-highway-ends": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M99 117 H121 C121 97 117 84 110 84 C103 84 99 97 99 117 Z" fill="#111"/><g><path d="M96 45 V55 C96 72 81 80 81 95 V103" stroke="#111" stroke-width="10" fill="none"/><polygon points="81,115 67,97 95,97" fill="#111"/></g><g><path d="M139 103 V95 C139 80 124 72 124 55 V46" stroke="#111" stroke-width="10" fill="none"/><polygon points="124,33 110,51 138,51" fill="#111"/></g></svg>',
    "hill-ahead": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M58 52 L162 116" stroke="#111" stroke-width="10" stroke-linecap="round"/><rect x="82" y="63" width="54" height="31" rx="4" fill="#111" transform="rotate(31 109 79)"/><circle cx="89" cy="93" r="9" fill="#f6d54a" stroke="#111" stroke-width="5"/><circle cx="129" cy="117" r="9" fill="#f6d54a" stroke="#111" stroke-width="5"/></svg>',
    "no-passing": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="69" y="13" width="82" height="134" rx="3" fill="#fff" stroke="#222" stroke-width="4"/><text x="110" y="51" text-anchor="middle" fill="#111" font-size="24" font-weight="900" font-family="Arial, sans-serif">DO</text><text x="110" y="91" text-anchor="middle" fill="#111" font-size="24" font-weight="900" font-family="Arial, sans-serif">NOT</text><text x="110" y="131" text-anchor="middle" fill="#111" font-size="24" font-weight="900" font-family="Arial, sans-serif">PASS</text></svg>',
    "roundabout": f'<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/>{ROUNDABOUT_SYMBOL}</svg>',
    "hospital": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="48" y="26" width="124" height="108" rx="8" fill="#0f5fa8"/><text x="110" y="108" text-anchor="middle" fill="#fff" font-size="76" font-weight="900" font-family="Arial, sans-serif">H</text></svg>',
    "hospital-right": '<svg viewBox="0 0 220 160" aria-hidden="true"><rect x="38" y="24" width="144" height="112" rx="8" fill="#0f5fa8"/><text x="82" y="105" text-anchor="middle" fill="#fff" font-size="68" font-weight="900" font-family="Arial, sans-serif">H</text><path d="M116 80 h38" stroke="#fff" stroke-width="11" stroke-linecap="round"/><path d="M146 58 174 80 146 102z" fill="#fff"/></svg>',
    "deer-crossing": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M78 106 l22-42 25 14 22-18 M100 64 l-12-20 M107 66 l8-24 M125 78 l20 30 M112 82 l-4 34" stroke="#111" stroke-width="8" stroke-linecap="round" fill="none"/><circle cx="143" cy="58" r="7" fill="#111"/></svg>',
    "curve": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M82 126 C84 102 139 97 136 62 C135 48 126 42 114 35" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round"/><path d="M99 43 l14-19 16 18z" fill="#111"/></svg>',
    "winding-road": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M110 128 C68 109 151 92 105 74 C67 59 132 48 112 34" fill="none" stroke="#111" stroke-width="11" stroke-linecap="round"/><path d="M97 43 l14-20 16 18z" fill="#111"/></svg>',
    "crossroad": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M110 125 V36 M68 80 H152" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round"/></svg>',
    "side-road": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M96 126 V36 M96 78 H150" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round"/></svg>',
    "t-intersection": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M110 126 V67 M66 58 H154" fill="none" stroke="#111" stroke-width="12" stroke-linecap="round"/></svg>',
    "two-way-traffic": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M92 53 V105 M128 107 V55" fill="none" stroke="#111" stroke-width="10"/><path d="M92 122 L77 100 H107 Z M128 38 L143 60 H113 Z" fill="#111"/></svg>',
    "stop-ahead": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><path d="M110 25 L137 52 H118 V64 H102 V52 H83 Z" fill="#111"/><polygon points="98,74 122,74 137,89 137,111 122,126 98,126 83,111 83,89" fill="#c7312f" stroke="#fff" stroke-width="2"/></svg>',
    "bicycle-crossing": '<svg viewBox="0 0 220 160" aria-hidden="true"><polygon points="110,14 190,80 110,146 30,80" fill="#f6d54a" stroke="#222" stroke-width="5"/><circle cx="82" cy="87" r="15" fill="none" stroke="#111" stroke-width="5"/><circle cx="138" cy="87" r="15" fill="none" stroke="#111" stroke-width="5"/><path d="M82 87 L97 63 L111 87 H138 L126 69 L111 87 M94 69 H126 L123 57 M119 57 H134 M97 63 L91 52 H101" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}


def esc(value):
    return html.escape(str(value), quote=True)


def url_for(path):
    return SITE["url"].rstrip("/") + path


def href_for(path):
    if path == "/":
        return "index.html"
    return path.lstrip("/")


def is_external_url(path):
    return str(path).startswith(("http://", "https://"))


def road_sign_image_records():
    records = {}
    for group in TOOL_BY_SLUG[ROAD_SIGN_PICTURE_SLUG]["signLibrary"]["groups"]:
        for sign in group["signs"]:
            if sign["image"] not in SIGN_SVGS:
                raise ValueError(f"Missing road sign artwork: {sign['image']}")
            records.setdefault(sign["image"], sign)
    return list(records.values())


def road_sign_image_path(key):
    if key not in SIGN_SVGS:
        raise ValueError(f"Missing road sign artwork: {key}")
    return f"assets/road-signs/{key}-road-sign.svg"


def render_road_sign_image(key, label, lazy=True):
    loading = ' loading="lazy"' if lazy else ""
    return (
        f'<img src="{esc(road_sign_image_path(key))}" alt="{esc(label)} road sign" '
        f'width="220" height="160" decoding="async"{loading}>'
    )


def write_road_sign_images(output=None):
    output = output or write
    for sign in road_sign_image_records():
        root = ElementTree.fromstring(SIGN_SVGS[sign["image"]])
        root.attrib.pop("aria-hidden", None)
        root.set("xmlns", "http://www.w3.org/2000/svg")
        root.set("width", "220")
        root.set("height", "160")
        title = ElementTree.Element("title")
        title.text = f"{sign['title']} road sign"
        root.insert(0, title)
        output(road_sign_image_path(sign["image"]), ElementTree.tostring(root, encoding="unicode") + "\n")


def road_sign_materials():
    return json.loads((ROOT / "content/road_sign_lessons.json").read_text(), object_pairs_hook=reject_duplicate_json_keys)


def render_material_review():
    material = road_sign_materials()
    sources = "".join(f'<li><a href="{esc(s["url"])}">{esc(s["label"])}</a></li>' for s in material["sources"])
    followup = material["artFollowup"]
    figures = " and ".join(f'<a href="{esc(figure["url"])}">{esc(figure["label"])}</a>' for figure in followup["figures"])
    return f'''<section class="material-review" id="material-review">
  <h2>Material check: {esc(material["checkedOn"])}</h2>
  <p>{esc(material["scope"])}</p><p>{esc(material["corrections"])}</p>
  <p>{esc(material["responsibility"])}</p><ul>{sources}</ul>
  <p><strong>{esc(followup["date"])}:</strong> {esc(followup["change"])} {figures}.</p>
</section>'''


def render_material_links():
    links = "".join(f'<li><a href="road-sign-learning-loop.html#lesson-{esc(x["id"])}">{esc(x["title"])}</a></li>' for x in road_sign_materials()["lessons"])
    return f'<section class="content-section"><h2>Understand the distinctions behind a missed sign</h2><ul class="material-links">{links}</ul></section>'


def speed_sign_comparison_link():
    return '<a href="road-sign-learning-loop.html#speed-sign-comparison">Compare posted and advisory speeds with pictures</a>'


def render_contrast_practice_links(return_page):
    links = []
    for lesson in road_sign_materials()["lessons"]:
        query = urlencode({"concept": lesson["id"], "return": return_page})
        label = lesson["title"].split(":", 1)[0]
        links.append(f'<li><a href="road-sign-learning-loop.html?{esc(query)}">{esc(label)}</a></li>')
    return f'''<section class="content-section" aria-labelledby="contrast-practice-heading">
  <h2 id="contrast-practice-heading">Practice a confusing sign pair</h2>
  <p>Choose the pair you mix up. Explain how the signs change the driver's decision, then try two short situations before returning to your study material.</p>
  <ul class="material-links">{"".join(links)}</ul>
  <p>{speed_sign_comparison_link()}</p>
  <p><a href="road-sign-shapes-and-colors-finder.html#school-crossing-location">Compare school crossing plaques with pictures</a></p>
</section>'''


def render_speed_sign_comparison():
    posted = road_sign_image_path("speed-limit")
    return f'''<section class="contrast-lessons speed-sign-lesson" id="speed-sign-comparison" aria-labelledby="speed-sign-comparison-heading">
  <h2 id="speed-sign-comparison-heading">Speed limit vs. advisory speed: the number alone is not enough</h2>
  <div class="contrast-lesson-grid">
    <figure class="contrast-scene">
      <div class="contrast-sign-pair">
        <img src="{esc(posted)}" width="220" height="160" alt="White rectangular sign reading SPEED LIMIT 35">
        <span aria-hidden="true">vs.</span>
        <img src="assets/road-sign-materials/curve-with-advisory-speed.svg" width="220" height="160" alt="Yellow right-curve diamond with a separate yellow 35 MPH plaque underneath">
      </div>
      <figcaption>Both signs show 35. On the left, read the words SPEED LIMIT. On the right, read the curve warning and the separate MPH plaque together.</figcaption>
    </figure>
    <div>
      <h3>Which 35 sets the posted limit?</h3>
      <p>On an unfamiliar road you see these signs at different locations. Which sign establishes the posted maximum, and which gives advice for a specific condition ahead?</p>
      <details class="contrast-transfer">
        <summary>Check which sign sets the limit</summary>
        <p>The white sign sets the posted limit for its road segment. The yellow plaque advises a speed for the curve; it does not replace the posted limit. Neither sign means you must drive exactly 35.</p>
      </details>
      <h3>What if it is raining?</h3>
      <p>Now a white sign posts 50 on the approach, and the same yellow 35 MPH plaque appears below the curve warning. The road is wet and visibility is poor. Does either number tell you a safe speed for every condition?</p>
      <details class="contrast-transfer">
        <summary>Check what changes in rain</summary>
        <p>No. Slow before the curve and go below 35 when traction or visibility requires it. The 50 sign is not a target, and the advisory speed does not guarantee the curve is safe at 35 in rain.</p>
      </details>
    </div>
  </div>
  <p class="contrast-source">Teaching illustrations checked November 23, 2026 against <a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2br1.pdf#page=22">FHWA Figure 2B-3 (R2-1)</a> and <a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2cr1.pdf#page=12">Figure 2C-2 (W1-2 and W13-1P)</a>. This comparison is separate from the scored practice above.</p>
</section>'''


def render_contrast_lessons():
    material = road_sign_materials()
    sources = {s["id"]: s for s in material["sources"]}
    records = {s["image"]: s for s in road_sign_image_records()}
    lessons = []
    for lesson in material["lessons"]:
        pictures = '<span>vs.</span>'.join(render_road_sign_image(key, records[key]["title"], lazy=False) for key in lesson["signs"])
        source = sources[lesson["source"]]
        transfer = lesson.get("transferSign")
        if transfer:
            transfer_block = f'''<section aria-label="{esc(transfer["heading"])}">
    <h4>{esc(transfer["heading"])}</h4>
    <img src="{esc(transfer["image"])}" width="220" height="160" alt="{esc(transfer["alt"])}">
    <p>{esc(lesson["transfer"])}</p>
    <details class="contrast-transfer"><summary>{esc(transfer["answerLabel"])}</summary><p>{esc(lesson["explanation"])}</p></details>
    <p class="contrast-source"><a href="{esc(transfer["sourceUrl"])}">{esc(transfer["sourceLabel"])}</a></p>
  </section>'''
        else:
            transfer_block = f'''<details class="contrast-transfer"><summary>Explain a changed situation</summary><p>{esc(lesson["transfer"])}</p><p>{esc(lesson["explanation"])}</p></details>'''
        lessons.append(f'''<article class="contrast-lesson" id="lesson-{esc(lesson["id"])}">
  <h3>{esc(lesson["title"])}</h3><div class="contrast-lesson-grid">
    <figure class="contrast-scene"><div class="contrast-sign-pair">{pictures}</div><figcaption>{esc(lesson["scene"])}</figcaption></figure>
    <dl class="contrast-reasoning"><dt>The distinction</dt><dd>{esc(lesson["cue"])}</dd><dt>The decision</dt><dd>{esc(lesson["decision"])}</dd></dl>
  </div>
  <div class="contrast-trap"><h4>A tempting mistake</h4><p>{esc(lesson["mistake"])}</p><h4>Why that reasoning fails</h4><p>{esc(lesson["reason"])}</p></div>
  {transfer_block}
  <p class="contrast-source">Source comparison: <a href="{esc(source["url"])}">{esc(source["label"])}</a> - {esc(lesson["sourceSections"])}. Checked {esc(material["checkedOn"])}.</p>
</article>''')
    return (
        '<section class="contrast-lessons" aria-labelledby="contrast-lessons-title"><h2 id="contrast-lessons-title">Three distinctions, with the reason behind the action</h2>'
        + "".join(lessons) + "</section>" + render_speed_sign_comparison() + render_material_review()
    )


def write_contrast_lessons(output=None):
    output = output or write
    filename = "road-sign-learning-loop.html"
    text = (ROOT / filename).read_text()
    start, end = "<!-- CORE MATERIAL LESSONS START -->", "<!-- CORE MATERIAL LESSONS END -->"
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError("Expected one bounded lesson region in the existing contrast lab")
    before, remainder = text.split(start)
    _, after = remainder.split(end)
    text = before + start + "\n" + render_contrast_lessons() + "\n" + end + after
    start, end = '<!-- CASE DATA START -->', '<!-- CASE DATA END -->'
    if start in text:
        before, rest = text.split(start, 1)
        _, after = rest.split(end, 1)
        text = before + start + '\n' + render_case_data() + '\n' + end + after
    output(filename, text)


def render_case_data():
    data = json.loads((ROOT / 'content/road_sign_cases.json').read_text(), object_pairs_hook=reject_duplicate_json_keys)
    material = road_sign_materials()
    sources = {x['id']: x for x in material['sources']}
    lessons = {x['id']: x for x in material['lessons']}
    records = {x['image']: x for x in road_sign_image_records()}
    used_signs = {key for lesson in data['lessons'] for question in [lesson['diagnosis'], *lesson['applications']] for key in question['images']}
    data['signs'] = {key: {'label': records[key]['title'], 'image': f'assets/road-signs/{key}-road-sign.svg'} for key in sorted(used_signs)}
    for case in data['lessons']:
        lesson = lessons[case['id']]
        case.update({key: lesson[key] for key in ['title', 'scene', 'cue', 'decision', 'reason']})
        case['sourceUrl'] = sources[lesson['source']]['url']
        case['sourceLabel'] = sources[lesson['source']]['label']
    payload = json.dumps(data).replace('<', '\\u003c')
    return f'<script type="application/json" data-loop-curriculum>{payload}</script>'


def road_sign_images_for_page(path):
    if path not in {f"/{ROAD_SIGN_PICTURE_SLUG}.html", f"/{ROAD_SIGN_CHEAT_SHEET_SLUG}.html"}:
        return []
    return [road_sign_image_path(sign["image"]) for sign in road_sign_image_records()]


def sitemap_lastmod():
    return format_lastmod(SITE["lastUpdated"])


def format_lastmod(value):
    try:
        return datetime.strptime(value, "%B %d, %Y").date().isoformat()
    except ValueError:
        return ""


def lastmod_for_path(path):
    if path == "/":
        return format_lastmod(DATA.get("home", {}).get("lastUpdated", SITE["lastUpdated"]))
    slug = path.strip("/").removesuffix(".html")
    if slug in TOOL_BY_SLUG:
        return format_lastmod(TOOL_BY_SLUG[slug].get("lastUpdated", SITE["lastUpdated"]))
    for hub in HUBS:
        if hub.get("slug") == slug:
            return format_lastmod(hub.get("lastUpdated", SITE["lastUpdated"]))
    for page in DATA["trustPages"]:
        if page.get("slug") == slug:
            return format_lastmod(page.get("lastUpdated", SITE["lastUpdated"]))
    return sitemap_lastmod()


def sitemap_priority(path):
    if path == "/":
        return "1.0", "daily"
    high_value = {
        "/dmv-practice.html",
        "/florida-dmv-permit-practice-test.html",
        "/florida-dmv-road-signs-practice.html",
        "/florida-class-e-knowledge-exam-tlsae.html",
        "/florida-dmv-permit-documents-checklist.html",
        "/dmv-test-day-checklist.html",
        "/dmv-permit-test-mistake-log.html",
        "/dmv-permit-test-requirements-by-state.html",
        "/dmv-permit-test-question-of-the-day.html",
        "/regulatory-traffic-signs-practice-test.html",
        "/road-signs-practice-test.html",
        "/dmv-road-signs-cheat-sheet.html",
    }
    if path in high_value:
        return "0.9", "daily"
    if path.startswith("/dmv") or "dmv-" in path or "road-sign" in path:
        return "0.8", "weekly"
    if path in {"/about.html", "/editorial-policy.html", "/privacy.html", "/accessibility.html", "/contact.html", "/disclaimer.html"}:
        return "0.4", "monthly"
    return "0.6", "weekly"


def sitemap_entry(path, lastmod, *, priority=None):
    default_priority, changefreq = sitemap_priority(path)
    priority = priority or default_priority
    lastmod_line = f"\n    <lastmod>{esc(lastmod)}</lastmod>" if lastmod else ""
    image_lines = "".join(
        f"\n    <image:image><image:loc>{esc(url_for('/' + image))}</image:loc></image:image>"
        for image in road_sign_images_for_page(path)
    )
    return (
        "  <url>\n"
        f"    <loc>{esc(url_for(path))}</loc>"
        f"{lastmod_line}\n"
        f"    <changefreq>{esc(changefreq)}</changefreq>\n"
        f"    <priority>{esc(priority)}</priority>{image_lines}\n"
        "  </url>"
    )


def render_analytics_tag():
    measurement_id = SITE.get("analytics", {}).get("ga4MeasurementId", "").strip()
    if not measurement_id.startswith("G-"):
        return ""
    escaped_id = esc(measurement_id)
    json_id = json.dumps(measurement_id)
    return f"""  <script async src="https://www.googletagmanager.com/gtag/js?id={escaped_id}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){{dataLayer.push(arguments);}}
    gtag('js', new Date());
    gtag('config', {json_id});
  </script>"""


def render_adsense_verification_tag():
    publisher_id = SITE.get("adsenseVerification", {}).get("publisherId", "").strip()
    if not publisher_id:
        return ""
    number = publisher_id.removeprefix("ca-pub-")
    if not publisher_id.startswith("ca-pub-") or len(number) != 16 or not number.isascii() or not number.isdigit():
        raise ValueError("Invalid AdSense verification publisher ID")
    return f'  <meta name="google-adsense-account" content="{esc(publisher_id)}">\n'


def page_shell(title, description, path, body, extra_class="", structured_data=None, social_image=None, indexable=True, extra_head=""):
    nav = "".join(
        f'<a href="{esc(href_for(item["href"]))}">{esc(item["label"])}</a>'
        for item in DATA["navigation"]
    )
    canonical = url_for(path)
    schemas = structured_data or page_schema(title, description, canonical)
    schema_scripts = "\n  ".join(
        f'<script type="application/ld+json">{json.dumps(item, separators=(",", ":"))}</script>'
        for item in schemas
    )
    analytics_tag = render_analytics_tag()
    analytics_block = f"{analytics_tag}\n" if analytics_tag else ""
    robots_meta = "" if indexable else '  <meta name="robots" content="noindex,follow">\n'
    adsense_verification_meta = render_adsense_verification_tag()
    social_image_url = url_for(f"/{social_image.lstrip('/')}") if social_image else ""
    social_meta = ""
    if social_image_url:
        social_meta = f"""  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{esc(SITE['name'])}">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta property="og:image" content="{esc(social_image_url)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="{esc(title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(description)}">
  <meta name="twitter:image" content="{esc(social_image_url)}">
  <meta name="twitter:image:alt" content="{esc(title)}">
"""
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}">
{adsense_verification_meta}\
{robots_meta}\
{social_meta}\
  <link rel="canonical" href="{esc(canonical)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/styles.css">
{analytics_block}\
{extra_head}\
  <script src="assets/app.js" defer></script>
  {schema_scripts}
</head>
<body class="{esc(extra_class)}">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="index.html" aria-label="TestDayTools home">
      <span class="brand-mark">T</span>
      <span>{esc(SITE["name"])}</span>
    </a>
    <nav aria-label="Main navigation">{nav}</nav>
  </header>
  <main id="main">
    {body}
  </main>
  <footer class="site-footer">
    <p>{esc(SITE["disclaimer"])}</p>
    <p><a href="about.html">About</a> <a href="editorial-policy.html">Editorial Policy</a> <a href="privacy.html">Privacy</a> <a href="accessibility.html">Accessibility</a> <a href="contact.html">Contact</a> <a href="disclaimer.html">Disclaimer</a></p>
  </footer>
</body>
</html>
"""


def schema(title, description, canonical, page_type="WebPage"):
    base = {
        "@context": "https://schema.org",
        "@type": page_type,
        "name": title,
        "description": description,
        "url": canonical,
        "publisher": {"@type": "Organization", "name": SITE["name"]},
        "isAccessibleForFree": True
    }
    if page_type == "LearningResource":
        base["learningResourceType"] = "Practice test"
        base["educationalUse"] = "Practice"
        base["audience"] = {"@type": "EducationalAudience", "educationalRole": "student"}
    if page_type == "WebApplication":
        base["applicationCategory"] = "EducationalApplication"
        base["operatingSystem"] = "Any"
        base["offers"] = {"@type": "Offer", "price": "0", "priceCurrency": "USD"}
    return base


def breadcrumb_schema(title, canonical):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": SITE["name"], "item": url_for("/")},
            {"@type": "ListItem", "position": 2, "name": title, "item": canonical},
        ],
    }


def page_schema(title, description, canonical, page_type="WebPage"):
    return [schema(title, description, canonical, page_type), breadcrumb_schema(title, canonical)]


def render_last_updated(value=None):
    updated = value or SITE["lastUpdated"]
    return f'<p class="last-updated">Last updated: <time>{esc(updated)}</time></p>'


def render_ad(label="future ad"):
    return f"<!-- Reserved {esc(label).lower()} slot. Real ads are intentionally disabled for the static launch. -->"


def render_sign_preview_strip(external_images=False):
    signs = []
    for key, label in [("stop", "Stop"), ("yield", "Yield"), ("merge", "Merge")]:
        svg = SIGN_SVGS.get(key, "")
        if svg:
            if external_images:
                signs.append(f'<div class="preview-sign">{render_road_sign_image(key, label, lazy=False)}</div>')
            else:
                signs.append(f'<div class="preview-sign" role="img" aria-label="{esc(label)} road sign">{svg}</div>')
    return f'<div class="hero-sign-strip" aria-label="Road sign practice preview">{"".join(signs)}</div>'


def render_mini_sign_drill():
    items = [
        {
            "image": "stop",
            "alt": "Stop sign",
            "prompt": "What is the required action?",
            "choices": ["Slow and continue", "Stop completely, then yield", "Only stop for trucks"],
            "answer": 1,
            "focus": "Regulatory signs",
            "explanation": "Stop signs require a complete stop before you yield and move when safe.",
        },
        {
            "image": "yield",
            "alt": "Yield sign",
            "prompt": "What does this sign ask you to do?",
            "choices": ["Give right of way when needed", "Stop every time", "Speed up to merge"],
            "answer": 0,
            "focus": "Regulatory signs",
            "explanation": "Yield means slow down and let traffic or pedestrians go first when they have priority.",
        },
        {
            "image": "do-not-enter",
            "alt": "Do not enter sign",
            "prompt": "What should you avoid?",
            "choices": ["Changing lanes", "Entering this road or ramp", "Parking near a curb"],
            "answer": 1,
            "focus": "Regulatory signs",
            "explanation": "Do Not Enter tells you not to drive into that roadway, ramp, or direction.",
        },
        {
            "image": "speed-limit",
            "alt": "Speed limit sign",
            "prompt": "What does this sign set?",
            "choices": ["Suggested speed", "Legal maximum speed", "Minimum passing speed"],
            "answer": 1,
            "focus": "Speed signs",
            "explanation": "A speed limit sign states the legal maximum speed under normal conditions.",
        },
    ]
    cards = []
    for index, item in enumerate(items):
        svg = SIGN_SVGS.get(item["image"], "")
        choices = "".join(
            f'<button type="button" data-mini-choice="{choice_index}">{esc(choice)}</button>'
            for choice_index, choice in enumerate(item["choices"])
        )
        cards.append(f"""<article class="mini-question" data-mini-question data-mini-answer="{item["answer"]}" data-mini-focus="{esc(item["focus"])}" data-mini-explanation="{esc(item["explanation"])}">
  <div class="mini-sign" role="img" aria-label="{esc(item["alt"])}">{svg}</div>
  <div>
    <span>Question {index + 1} of {len(items)}</span>
    <strong tabindex="-1" data-mini-prompt>{esc(item["prompt"])}</strong>
    <div class="mini-choices">{choices}</div>
  </div>
</article>""")
    return f"""<div class="mini-sign-drill" data-mini-sign-drill>
  <div class="mini-drill-head">
    <span>Quick diagnostic</span>
    <strong data-mini-drill-score>0/{len(items)}</strong>
  </div>
  <div class="mini-question-stage">{"".join(cards)}</div>
  <p class="mini-drill-feedback" data-mini-drill-feedback role="status">Choose the driver's action.</p>
  <div class="mini-drill-actions">
    <button type="button" data-mini-drill-next disabled>Next sign</button>
    <a href="road-signs-practice-test.html?mode=road-signs-core#practice" data-mini-drill-focus-link>Full road signs test</a>
  </div>
</div>"""


def find_state_sign_href(state_label):
    state_key = state_label.lower()
    for tool in DATA["tools"]:
        title = tool.get("title", "").lower()
        slug = tool.get("slug", "")
        if state_key in title and "road-signs-practice" in slug:
            return f"{slug}.html"
    return "road-signs-practice-test.html"


def resolve_internal_href(value):
    href = str(value or "")
    path = href
    suffix = ""
    for separator in ("?", "#"):
        if separator in path:
            path, remainder = path.split(separator, 1)
            suffix = f"{separator}{remainder}"
            break
    if not path.endswith(".html"):
        return href
    slug = path.removesuffix(".html")
    tool = TOOL_BY_SLUG.get(slug)
    if not tool or tool.get("indexable") is not False:
        return href
    replacement = tool.get("replacementSlug")
    return f"{replacement}.html{suffix}" if replacement else href


def get_dmv_checklist_states():
    checklist = TOOL_BY_SLUG.get("dmv-test-day-checklist", {})
    states = checklist.get("toolWidget", {}).get("states", [])
    return [
        {**state, "permitUrl": resolve_internal_href(state.get("permitUrl", "dmv-practice.html"))}
        for state in states
    ]


def find_dmv_state_by_label(state_label):
    state_key = state_label.lower()
    for state in get_dmv_checklist_states():
        if state.get("label", "").lower() == state_key:
            return state
    return None


def find_dmv_state_for_tool(tool):
    if tool.get("category") != "DMV" or tool.get("slug") == "dmv-test-day-checklist":
        return None
    slug = tool.get("slug", "").lower()
    title = tool.get("title", "").lower()
    for state in get_dmv_checklist_states():
        label = state.get("label", "").lower()
        value = state.get("value", "").lower()
        label_slug = label.replace(" ", "-")
        if value in slug or label_slug in slug or label in title:
            return state
    return None


def find_dmv_permit_tool_for_state(state):
    state_label = state.get("label", "").lower()
    state_value = state.get("value", "").lower()
    for tool in DATA["tools"]:
        slug = tool.get("slug", "").lower()
        title = tool.get("title", "").lower()
        if tool.get("category") != "DMV":
            continue
        if "permit-practice-test" not in slug and "mvc-permit-practice-test" not in slug:
            continue
        if state_value in slug or state_label in title:
            return tool
    return None


def dmv_mixed_practice(state, permit=None):
    permit = permit or find_dmv_permit_tool_for_state(state) or {}
    if not permit.get("indexable", True):
        return {}
    mode = next((item for item in permit.get("quizModes", []) if item["id"] == "mock"), None)
    if not mode:
        return {}
    page = f'{permit["slug"]}.html'
    total = len(quiz_questions(mode["quiz"], mode))
    if not total:
        return {}
    pass_score = mode.get("passScore") or mode.get("pass_score") or max(total - 2, 1)
    return {
        "page": page,
        "href": f"{page}?mode=mock#practice",
        "target": f"{pass_score} of {total} in the full mixed set",
        "total": total,
        "correct": pass_score,
    }


def detail_by_label(tool, labels):
    wanted = {label.lower() for label in labels}
    for item in tool.get("examDetails", {}).get("items", []):
        if item.get("label", "").lower() in wanted:
            return item
    for item in tool.get("quickFacts", []):
        if item.get("label", "").lower() in wanted:
            return item
    return {}


def dmv_requirement_records():
    records = []
    for state in get_dmv_checklist_states():
        tool = find_dmv_permit_tool_for_state(state) or {}
        format_item = detail_by_label(tool, ["Official format", "Common format", "Class D format"])
        pass_item = detail_by_label(tool, ["Official pass rule", "Pass rule"])
        source_item = detail_by_label(tool, ["Official source", "Official agency"])
        mixed = dmv_mixed_practice(state, tool)
        format_value = format_item.get("value") or state.get("format", "Confirm with official source")
        pass_value = pass_item.get("value") or ("See official source" if not format_value else format_value)
        records.append({
            "label": state.get("label", ""),
            "value": state.get("value", ""),
            "agency": state.get("agency", "State agency"),
            "manualLabel": state.get("manualLabel", "Official source"),
            "manualUrl": state.get("manualUrl", "#"),
            "permitUrl": state.get("permitUrl", "dmv-practice.html"),
            "signUrl": state.get("signUrl", find_state_sign_href(state.get("label", ""))),
            "checklistUrl": checklist_href_for_state(state),
            "scoreUrl": f"{DMV_SCORE_SLUG}.html?state={state.get('value', '')}#score-calculator",
            "format": format_value,
            "formatText": format_item.get("text") or state.get("format", ""),
            "passRule": pass_value,
            "passText": pass_item.get("text") or "Confirm the current passing rule with the official agency before test day.",
            "source": source_item.get("value") or state.get("manualLabel", "Official source"),
            "documents": state.get("documents", ""),
            "focus": state.get("focus", ""),
            "mixedPracticeUrl": mixed.get("href", ""),
            "practiceTarget": mixed.get("target", "No full mixed practice set here"),
            "mixedQuestions": mixed.get("total", ""),
            "mixedCorrect": mixed.get("correct", ""),
        })
    return records


def dmv_score_records(include_supplemental=False):
    score_facts = {
        "california": {
            "questions": "",
            "correct": "",
            "percent": 80,
            "rule": "80% or better",
            "miss": "Depends on current test length",
            "note": "California DMV currently publishes an 80% passing score. Enter the question count shown for your test path to calculate the miss limit.",
        },
        "new-york": {
            "questions": 20,
            "correct": 14,
            "percent": 70,
            "rule": "14 correct out of 20, including at least 2 road-sign questions",
            "miss": "6 overall",
            "note": "New York has a separate road-sign condition: at least 2 of the 4 sign questions must be correct.",
            "sectionQuestions": 4,
            "sectionCorrect": 2,
            "sectionIncluded": True,
        },
        "texas": {
            "questions": "",
            "correct": "",
            "percent": 70,
            "rule": "70% or better",
            "miss": "Depends on test length",
            "note": "Texas DPS publishes the passing percentage. Enter your test length to calculate the needed correct answers.",
        },
        "florida": {
            "questions": 50,
            "correct": 40,
            "percent": 80,
            "rule": "40 correct out of 50 questions",
            "miss": "10",
            "note": "Florida lists 50 multiple-choice questions and 40 correct answers as the passing score.",
        },
        "illinois": {
            "questions": 35,
            "minimumLength": True,
            "correct": 28,
            "percent": 80,
            "rule": "80% correct; at least 35 questions",
            "miss": "7 if the test has 35 questions",
            "note": "Enter the actual question count to calculate the 80% target. Round the number needed up to the next whole answer when necessary.",
            "answer": "Illinois Class D requires at least 35 questions and at least 80% correct. If your test has 35 questions, you need 28 correct and can miss 7. For a longer test, use the actual question count.",
            "ruleUrl": "https://www.ilga.gov/commission/jcar/admincode/092/092010300000800R.html",
            "ruleLabel": "Illinois Administrative Code, Section 1030.80",
            "officialPracticeUrl": "https://www.ilsos.gov/content/dam/publications/pdf_publications/dsd_a112.pdf#page=39",
        },
        "pennsylvania": {
            "questions": 18,
            "correct": 15,
            "percent": 83.4,
            "rule": "15 correct out of 18 questions",
            "miss": "3",
            "note": "PennDOT states that 15 correct answers are required on the 18-question knowledge test.",
        },
        "new-jersey": {
            "questions": 50,
            "correct": 40,
            "percent": 80,
            "rule": "40 correct out of 50 questions",
            "miss": "10",
            "note": "New Jersey MVC describes a 50-question knowledge test with an 80% passing standard.",
        },
        "georgia": {
            "questions": 20,
            "correct": 15,
            "percent": 75,
            "rule": "15 correct out of 20 on each part",
            "miss": "5 on each part",
            "note": "Georgia uses separate 20-question Road Rules and Road Signs tests. You need at least 15 correct on each part.",
            "answer": "Georgia's knowledge exam has two 20-question parts. You need 15 correct on Road Rules and 15 correct on Road Signs, so you can miss up to 5 in each part.",
            "sectionQuestions": 20,
            "sectionCorrect": 15,
            "primaryScoreLabel": "Road rules correct",
            "primaryTotalLabel": "Road rules questions",
            "primaryTopic": "road rules",
            "officialPracticeUrl": "https://dds.georgia.gov/testing-and-training/practice-test",
        },
        "ohio": {
            "questions": 40,
            "correct": 30,
            "percent": 75,
            "rule": "30 correct out of 40 questions",
            "miss": "10",
            "note": "Ohio BMV lists 40 multiple-choice questions and requires 75% correct, which means 30 correct answers.",
        },
        "virginia": {
            "questions": 30,
            "correct": 24,
            "percent": 80,
            "rule": "10 of 10 signs, then 24 of 30 general questions",
            "miss": "0 signs; 6 general",
            "note": "Virginia requires all 10 road-sign questions correct before the 30-question general section, where 24 correct are required.",
            "answer": "Virginia has two parts. You cannot miss any of the 10 road-sign questions, then you can miss up to 6 of the 30 general-knowledge questions.",
            "sectionQuestions": 10,
            "sectionCorrect": 10,
            "primaryScoreLabel": "General knowledge correct",
            "primaryTotalLabel": "General knowledge questions",
            "primaryTopic": "general knowledge",
            "officialPracticeUrl": "https://www.dmv.virginia.gov/licenses-ids/exams/practice-exam",
        },
        "arizona": {
            "questions": 30,
            "correct": 24,
            "percent": 80,
            "rule": "24 correct out of 30 questions",
            "miss": "6",
            "note": "Arizona MVD lists a 30-question written permit test and requires a score of 80% or higher.",
        },
    }
    supplemental_requirements = [
        {
            "label": "Georgia",
            "value": "georgia",
            "agency": "Georgia DDS",
            "manualLabel": "Georgia DDS Test and Exams Information",
            "manualUrl": "https://dds.georgia.gov/testing-and-training/test-and-exams-information",
            "permitUrl": "georgia-dds-road-signs-practice.html",
            "signUrl": "georgia-dds-road-signs-practice.html",
            "permitStepsUrl": "https://dds.georgia.gov/georgia-licenses-ids-and-permits/new-license-id-or-permit/how-do-i-learners-permit",
            "passRule": "15 correct out of 20 on each part",
            "passText": "Confirm the current two-part knowledge exam rule with Georgia DDS.",
        },
        {
            "label": "Ohio",
            "value": "ohio",
            "agency": "Ohio BMV",
            "manualLabel": "Ohio BMV Knowledge Test",
            "manualUrl": "https://www.bmv.ohio.gov/dl-gdl.aspx",
            "permitUrl": "ohio-bmv-road-signs-practice.html",
            "signUrl": "ohio-bmv-road-signs-practice.html",
            "permitStepsUrl": "ohio-bmv-road-signs-practice.html#ohio-knowledge-cases",
            "passRule": "75% or better",
            "passText": "Confirm the current knowledge-test rule with Ohio BMV.",
        },
        {
            "label": "Virginia",
            "value": "virginia",
            "agency": "Virginia DMV",
            "manualLabel": "Virginia DMV Knowledge Exam",
            "manualUrl": "https://www.dmv.virginia.gov/licenses-ids/exams/know-exam",
            "permitUrl": "virginia-dmv-road-signs-practice.html",
            "signUrl": "virginia-dmv-road-signs-practice.html",
            "permitStepsUrl": "https://www.dmv.virginia.gov/licenses-ids/learners/apply",
            "passRule": "10 of 10 signs, then 24 of 30 general questions",
            "passText": "Confirm the current two-part knowledge exam rule with Virginia DMV.",
        },
        {
            "label": "Arizona",
            "value": "arizona",
            "agency": "Arizona MVD",
            "manualLabel": "Arizona MVD Permit Test",
            "manualUrl": "https://azdot.gov/mvd/services/driver-license-ID/permit-test",
            "permitUrl": "arizona-mvd-road-signs-practice.html",
            "signUrl": "arizona-mvd-road-signs-practice.html",
            "permitStepsUrl": "arizona-mvd-road-signs-practice.html#arizona-permit-path",
            "passRule": "80% or better",
            "passText": "Confirm the current permit-test rule with Arizona MVD.",
        },
    ]
    requirements = dmv_requirement_records()
    if include_supplemental:
        requirements.extend(supplemental_requirements)
    records = []
    for requirement in requirements:
        fact = score_facts.get(requirement["value"], {})
        questions = fact.get("questions", "")
        correct = fact.get("correct", "")
        percent = fact.get("percent", "")
        can_miss = questions - correct if isinstance(questions, int) and isinstance(correct, int) else ""
        permit_steps = requirement.get("permitStepsUrl")
        records.append({
            **requirement,
            "testDayUrl": permit_steps or requirement["checklistUrl"],
            "testDayLabel": f'{requirement["label"]} permit steps' if permit_steps else "Test-day checklist",
            "testDayIsPermitGuide": bool(permit_steps),
            "questions": questions,
            "minimumQuestions": questions if fact.get("minimumLength") else "",
            "correct": correct,
            "percent": percent,
            "rule": fact.get("rule", requirement["passRule"]),
            "miss": fact.get("miss", str(can_miss) if can_miss != "" else "Confirm with official source"),
            "canMiss": can_miss,
            "scoreNote": fact.get("note", requirement["passText"]),
            "scoreRuleUrl": fact.get("ruleUrl", requirement["manualUrl"]),
            "scoreRuleLabel": fact.get("ruleLabel", requirement["manualLabel"]),
            "answer": fact.get("answer", ""),
            "sectionQuestions": fact.get("sectionQuestions", ""),
            "sectionCorrect": fact.get("sectionCorrect", ""),
            "sectionIncluded": fact.get("sectionIncluded", False),
            "primaryScoreLabel": fact.get("primaryScoreLabel", "Practice correct"),
            "primaryTotalLabel": fact.get("primaryTotalLabel", "Practice total"),
            "primaryTopic": fact.get("primaryTopic", ""),
            "officialPracticeUrl": fact.get("officialPracticeUrl", ""),
        })
    return records


def road_sign_shape_records():
    return [
        {
            "key": "octagon",
            "label": "Octagon",
            "color": "Red",
            "category": "Regulatory",
            "filter": "regulatory",
            "meaning": "A red octagon means stop. Come to a complete stop, yield, then move only when safe.",
            "action": "Stop completely",
            "examples": "Stop sign",
            "visual": "shape-octagon",
            "text": "STOP",
            "practice": "regulatory-traffic-signs-practice-test.html?focus=Stop%20and%20yield%20rules#practice",
        },
        {
            "key": "triangle",
            "label": "Inverted triangle",
            "color": "Red and white",
            "category": "Regulatory",
            "filter": "regulatory",
            "meaning": "A downward triangle means yield. Slow down and give right of way when needed.",
            "action": "Yield right of way",
            "examples": "Yield sign",
            "visual": "shape-triangle",
            "text": "YIELD",
            "practice": "regulatory-traffic-signs-practice-test.html?focus=Stop%20and%20yield%20rules#practice",
        },
        {
            "key": "red-circle",
            "label": "Circle or slash",
            "color": "Red symbol",
            "category": "Regulatory",
            "filter": "regulatory",
            "meaning": "A red circle, slash, or red panel usually marks a prohibited action or direction.",
            "action": "Do not enter, turn, or pass",
            "examples": "Do Not Enter, Wrong Way, No U-turn, No Right Turn",
            "visual": "shape-red-circle",
            "text": "NO",
            "practice": "regulatory-traffic-signs-practice-test.html#practice",
        },
        {
            "key": "rectangle-white",
            "label": "White rectangle",
            "color": "White and black",
            "category": "Regulatory",
            "filter": "regulatory",
            "meaning": "A white rectangle usually states a traffic law, lane rule, speed rule, or direction rule.",
            "action": "Follow the posted rule",
            "examples": "Speed Limit, One Way, Keep Right, No Turn on Red",
            "visual": "shape-white-rectangle",
            "text": "RULE",
            "practice": "regulatory-traffic-signs-practice-test.html#practice",
        },
        {
            "key": "diamond",
            "label": "Diamond",
            "color": "Yellow",
            "category": "Warning",
            "filter": "warning",
            "meaning": "A yellow diamond warns about a condition ahead that may require slower speed or extra space.",
            "action": "Slow and scan ahead",
            "examples": "Merge, Lane Ends, Slippery Road",
            "visual": "shape-diamond",
            "text": "!",
            "practice": "road-signs-practice-test.html?focus=Warning%20signs#practice",
        },
        {
            "key": "pentagon",
            "label": "Pentagon",
            "color": "Yellow-green",
            "category": "School",
            "filter": "warning",
            "meaning": "A yellow-green pentagon with two walking figures identifies a school area. Color alone is not enough: a regular pedestrian warning diamond can also be yellow-green.",
            "action": "Watch for children",
            "examples": "School Crossing",
            "visual": "shape-pentagon",
            "text": "SCH",
            "practice": "road-signs-practice-test.html?focus=School%20and%20pedestrian%20signs#practice",
        },
        {
            "key": "round",
            "label": "Round sign",
            "color": "Yellow",
            "category": "Warning",
            "filter": "warning",
            "meaning": "The round yellow sign with two Rs warns of railroad tracks ahead. Slow down and be ready to stop at the crossing.",
            "action": "Slow down and prepare to stop",
            "examples": "Railroad Crossing Ahead",
            "visual": "shape-circle",
            "text": "RR",
            "practice": "#railroad-crossing-check",
            "practiceLabel": "Compare railroad signs",
        },
        {
            "key": "crossbuck",
            "label": "Crossbuck (white X)",
            "color": "White and black",
            "category": "Regulatory",
            "filter": "regulatory",
            "meaning": "The white X reading RAILROAD CROSSING marks the crossing itself. Follow the posted controls and yield to trains.",
            "action": "Yield to trains and keep the tracks clear",
            "examples": "Railroad Crossing (R15-1)",
            "practice": "#railroad-crossing-check",
            "practiceLabel": "Compare railroad signs",
        },
        {
            "key": "pennant",
            "label": "Pennant",
            "color": "Yellow",
            "category": "Warning",
            "filter": "warning",
            "meaning": "A yellow NO PASSING ZONE pennant can mark the start of the zone on the left. It is not the white DO NOT PASS rectangle.",
            "action": "Do not pass",
            "examples": "No Passing Zone",
            "visual": "shape-pennant",
            "text": "NO PASS",
            "practice": "#passing-sign-check",
            "practiceLabel": "Compare the two signs",
        },
        {
            "key": "orange",
            "label": "Orange diamond",
            "color": "Orange",
            "category": "Work zone",
            "filter": "work",
            "meaning": "Orange signs warn about road work, temporary traffic control, workers, or lane shifts.",
            "action": "Slow for the work zone",
            "examples": "Work Zone, Lane Shift, Flagging",
            "visual": "shape-orange-diamond",
            "text": "WORK",
            "practice": "road-signs-practice-test.html?focus=Work%20zone%20signs#practice",
        },
        {
            "key": "blue",
            "label": "Blue rectangle",
            "color": "Blue",
            "category": "Service",
            "filter": "guide",
            "meaning": "Blue signs usually point to driver services such as hospitals, fuel, lodging, or food.",
            "action": "Use for services",
            "examples": "Hospital, Gas, Food, Lodging",
            "visual": "shape-blue-rectangle",
            "text": "H",
            "practice": "road-signs-practice-test.html?focus=Guide%20and%20service%20signs#practice",
        },
        {
            "key": "green",
            "label": "Green rectangle",
            "color": "Green",
            "category": "Guide",
            "filter": "guide",
            "meaning": "Green guide signs help drivers choose routes, exits, destinations, and street directions.",
            "action": "Follow route guidance",
            "examples": "Exit, Street, Destination",
            "visual": "shape-green-rectangle",
            "text": "EXIT",
            "practice": "road-signs-practice-test.html?focus=Guide%20and%20service%20signs#practice",
        },
        {
            "key": "brown",
            "label": "Brown rectangle",
            "color": "Brown",
            "category": "Guide",
            "filter": "guide",
            "meaning": "Brown signs usually identify parks, recreation areas, cultural sites, or scenic points.",
            "action": "Use for recreation guidance",
            "examples": "Park, Recreation, Historic Site",
            "visual": "shape-brown-rectangle",
            "text": "PARK",
            "practice": "road-signs-practice-test.html#practice",
        },
    ]


def road_sign_group_practice_href(group):
    path = group["practice"]
    params = {"mode": path["mode"]}
    if path.get("focus"):
        params["focus"] = path["focus"]
    return f'{path["tool"]}.html?{urlencode(params)}#practice'


def road_sign_flashcard_records():
    source = TOOL_BY_SLUG.get("road-signs-practice-test", {})
    cues = json.loads((ROOT / "content/road_sign_recall_cues.json").read_text(), object_pairs_hook=reject_duplicate_json_keys)
    records = []
    for group in source.get("signLibrary", {}).get("groups", []):
        category = group.get("label", "Road signs")
        filter_key = category.lower().split()[0].replace(",", "")
        for item in group.get("signs", []):
            if item.get("image") not in SIGN_SVGS:
                continue
            title = item.get("title", "")
            meaning = item.get("meaning", "")
            records.append({
                "id": item.get("image", title.lower().replace(" ", "-")),
                "title": title,
                "meaning": meaning,
                "category": category,
                "filter": filter_key,
                "image": item.get("image", ""),
                "cue": cues[item["image"]],
                "practice": road_sign_group_practice_href(group),
                "query": " ".join([title, meaning, category, item["image"], SIGN_SEARCH_ALIASES.get(item["image"], "")]).strip().lower(),
            })
    return records


def dmv_daily_question_records():
    plan = [
        ("all", "National mix", "roadSignsCore", 0, "road-signs-practice-test.html#practice"),
        ("all", "National mix", "regulatorySignsCore", 1, "regulatory-traffic-signs-practice-test.html#practice"),
        ("california", "California", "california", 0, "california-dmv-permit-practice-test.html#practice"),
        ("california", "California", "californiaSigns", 2, "california-dmv-road-signs-practice.html#practice"),
        ("new-york", "New York", "newyork", 0, "new-york-dmv-permit-practice-test.html#practice"),
        ("new-york", "New York", "newyorkSigns", 3, "new-york-dmv-road-signs-practice.html#practice"),
        ("texas", "Texas", "texas", 1, "https://www.dps.texas.gov/section/driver-license/texas-learners-license-teen"),
        ("texas", "Texas", "texasSigns", 4, "texas-dmv-road-signs-practice.html#practice"),
        ("florida", "Florida", "florida", 1, "florida-class-e-knowledge-exam-tlsae.html"),
        ("florida", "Florida", "floridaSigns", 5, "florida-dmv-road-signs-practice.html#practice"),
        ("illinois", "Illinois", "illinois", 1, "dmv-permit-test-passing-score-calculator.html?state=illinois#score-calculator"),
        ("illinois", "Illinois", "illinoisSigns", 6, "illinois-dmv-road-signs-practice.html#practice"),
        ("pennsylvania", "Pennsylvania", "pennsylvania", 1, "dmv-permit-test-passing-score-calculator.html?state=pennsylvania#score-calculator"),
        ("pennsylvania", "Pennsylvania", "pennsylvaniaSigns", 7, "pennsylvania-dmv-road-signs-practice.html#practice"),
        ("new-jersey", "New Jersey", "newjersey", 1, "https://www.nj.gov/mvc/license/knowledgetest.htm"),
        ("new-jersey", "New Jersey", "newjerseySigns", 8, "new-jersey-mvc-road-signs-practice.html#practice"),
        ("all", "National mix", "roadSignsCore", 9, "road-signs-practice-test.html#practice"),
        ("all", "National mix", "regulatorySignsCore", 4, "regulatory-traffic-signs-practice-test.html#practice"),
    ]
    sourced_sets = [
        ("florida", "Florida", "floridaMock", "florida-dmv"),
        ("pennsylvania", "Pennsylvania", "pennsylvaniaMock", "pennsylvania-dmv"),
        ("new-jersey", "New Jersey", "newjerseyMock", "new-jersey-mvc"),
    ]
    for state, label, bank, prefix in sourced_sets:
        plan.extend(
            (state, label, bank, index, f"{prefix}-permit-practice-test.html#practice")
            for index, question in enumerate(DATA["quizzes"][bank]) if question.get("source")
        )
    other_labels = {
        "texas": "Check Texas learner-license rules",
        "illinois": "Check the Illinois passing score",
        "florida": "Review the Florida Class E steps",
        "pennsylvania": "Check the Pennsylvania passing score",
        "newjersey": "Review the MVC testing steps",
    }
    records = []
    for index, (state_value, state_label, quiz_key, question_index, practice) in enumerate(plan):
        questions = DATA["quizzes"].get(quiz_key, [])
        if not questions:
            continue
        question = questions[question_index]
        category = question.get("category", "Permit basics")
        if practice.endswith("#practice"):
            params = {"focus": category}
            if quiz_key.endswith("Mock"):
                params["mode"] = "mock"
            elif quiz_key in ("california", "newyork"):
                params["mode"] = "quick"
            practice = f'{practice.removesuffix("#practice")}?{urlencode(params)}#practice'
        records.append({
            "id": f"daily-{index + 1}",
            "state": state_value,
            "stateLabel": state_label,
            "quiz": quiz_key,
            "practice": resolve_internal_href(practice),
            "practiceLabel": other_labels.get(quiz_key, "Practice this topic"),
            "category": category,
            "q": question.get("q", "Practice question"),
            "choices": question.get("choices", []),
            "answer": question.get("answer", 0),
            "explanation": question.get("explanation", ""),
            "image": question.get("image", ""),
            "imageAlt": question.get("imageAlt", "Road sign illustration"),
            "source": question.get("source"),
        })
    return records


def checklist_href_for_state(state):
    if not state:
        return "dmv-test-day-checklist.html#dmv-checklist"
    return f'dmv-test-day-checklist.html?state={esc(state["value"])}#dmv-checklist'


def quiz_key_for_tool(tool):
    modes = tool.get("quizModes") or []
    if modes:
        return modes[0].get("quiz")
    return tool.get("quiz")


def resolve_sign_focus_shortcuts(tool):
    if tool.get("focusShortcuts"):
        return tool["focusShortcuts"]
    slug = tool.get("slug", "")
    if "road-signs" not in slug and "regulatory-traffic-signs" not in slug:
        return None
    quiz_key = quiz_key_for_tool(tool)
    categories = {item.get("category", "Permit basics") for item in DATA["quizzes"].get(quiz_key, [])}
    if not categories:
        return None
    priority = [
        ("Regulatory signs", "Regulatory first", "Rules and restrictions", "Practice stop, yield, no entry, speed, direction, and turn restrictions first."),
        ("Warning signs", "Warning signs", "Hazards and road changes", "Use this when yellow warning signs, crossings, curves, or road-condition signs feel slow."),
        ("Speed signs", "Speed signs", "Speed limits and safe speed", "Practice posted limits and the decision to slow down when conditions change."),
        ("Turn signs", "Turns and direction", "Turns, lanes, and direction", "Review signs that control turns, lanes, movement, and one-way traffic."),
        ("Turn and lane control signs", "Turns and direction", "Turns, lanes, and direction", "Review signs that control turns, lanes, movement, and one-way traffic."),
        ("Work zone signs", "Work zones", "Construction and temporary control", "Review orange signs, temporary control, lane shifts, workers, and slower traffic."),
    ]
    items = []
    used = set()
    for focus, label, title, text in priority:
        if focus in categories and focus not in used:
            items.append({"label": label, "title": title, "text": text, "focus": focus})
            used.add(focus)
        if len(items) >= 4:
            break
    for focus in sorted(categories):
        if len(items) >= 4:
            break
        if focus in used:
            continue
        items.append({
            "label": "Focus",
            "title": focus,
            "text": "Open the quiz with this sign category selected.",
            "focus": focus,
        })
        used.add(focus)
    if not items:
        return None
    state = find_dmv_state_for_tool(tool)
    if "regulatory-traffic-signs" in slug:
        label = "regulatory traffic signs"
    else:
        label = f'{state["label"]} road signs' if state else "road signs"
    return {
        "kicker": "Weak-area shortcuts",
        "heading": f"Practice {label} by weak area",
        "intro": "Choose the sign category that feels slow, then the quiz opens with that focus selected.",
        "items": items,
    }


def render_tool_actions(tool):
    if tool.get("heroActions"):
        links = []
        for action in tool.get("heroActions", []):
            attrs = ' target="_blank" rel="noopener"' if is_external_url(action["href"]) else ""
            download = f' download data-resource-download="{esc(action["resource"])}"' if action.get("resource") else ""
            links.append(f'<a href="{esc(action["href"])}"{attrs}{download}>{esc(action["label"])}</a>')
        links = "".join(links)
        return f'\n    <div class="hero-actions">{links}</div>'
    if tool.get("category") != "DMV":
        return ""
    slug = tool.get("slug", "")
    is_checklist_page = tool.get("toolWidget", {}).get("type") == "dmvTestDayChecklist"
    is_sign_page = "road-signs" in slug or "regulatory-traffic-signs" in slug
    state = find_dmv_state_for_tool(tool)
    if is_checklist_page:
        actions = [
            ("Open checklist", "#dmv-checklist"),
            ("Documents", "#documents-map"),
            ("State source finder", "#manual-finder"),
            ("Passing score", "dmv-permit-test-passing-score-calculator.html?source=checklist_hero#score-calculator"),
            ("Practice hub", "dmv-practice.html#state-paths"),
        ]
    elif is_sign_page and (tool.get("quiz") or tool.get("quizModes")):
        actions = [
            ("Start image quiz", "#practice"),
            (tool["stateRulePractice"]["linkLabel"], f'#{tool["stateRulePractice"]["id"]}') if tool.get("stateRulePractice") else None,
            ("Focus paths", "#sign-focus") if resolve_sign_focus_shortcuts(tool) else None,
            ("Sign finder", "#sign-meaning-finder") if tool.get("signLibrary") else None,
            ("Shape and color guide", "#sign-study"),
            ("Sign library", "#sign-library"),
        ]
        actions = [action for action in actions if action]
        if state:
            actions.append(("Passing score", f'{DMV_SCORE_SLUG}.html?state={state["value"]}#score-calculator'))
            actions.append(("Test-day checklist", checklist_href_for_state(state)))
        elif slug == "road-signs-practice-test":
            actions.append(("Passing score", "dmv-permit-test-passing-score-calculator.html#score-calculator"))
    elif is_sign_page:
        actions = [
            ("Nationwide picture quiz", "road-signs-practice-test.html?mode=road-signs-core#practice"),
            ("State test details", "#official-details"),
            ("Official sources", "#sources"),
        ]
    else:
        actions = [
            ("Start practice", "#practice"),
            ("Official test facts", "#official-details"),
            ("Study by topic", "#practice-topics"),
        ]
        if lesson := tool.get("stateRulePractice"):
            actions.append((lesson["linkLabel"], f'#{lesson["id"]}'))
        if state:
            actions.append(("Test-day checklist", checklist_href_for_state(state)))
    links = "".join(
        f'<a href="{esc(href)}"{" data-checklist-score-link" if is_checklist_page and label == "Passing score" else ""}>{esc(label)}</a>'
        for label, href in actions
    )
    return f'\n    <div class="hero-actions">{links}</div>'


def render_home_practice_panel():
    launch = DATA["home"].get("dmvLaunch", {})
    states = launch.get("states", [])
    default_state = next((state for state in states if state["label"] == "Florida"), states[0] if states else {"label": "Florida", "href": "florida-dmv-permit-practice-test.html"})
    state_options = []
    for state in states:
        checklist_state = find_dmv_state_by_label(state["label"]) or {}
        checklist_url = checklist_href_for_state(checklist_state) if checklist_state else "dmv-test-day-checklist.html#dmv-checklist"
        state_options.append(
            f'<option value="{esc(state["label"])}" '
            f'data-practice-url="{esc(state["href"])}" '
            f'data-sign-url="{esc(find_state_sign_href(state["label"]))}" '
            f'data-checklist-url="{esc(checklist_url)}" '
            f'data-source-url="{esc(checklist_state.get("manualUrl", ""))}" '
            f'data-source-label="{esc(checklist_state.get("manualLabel", "Official state source"))}" '
            f'data-agency="{esc(checklist_state.get("agency", "State agency"))}" '
            f'{"selected" if state["label"] == default_state["label"] else ""}>{esc(state["label"])}</option>'
        )
    state_options = "".join(state_options)
    default_checklist_state = find_dmv_state_by_label(default_state["label"]) or {}
    default_checklist_url = checklist_href_for_state(default_checklist_state) if default_checklist_state else "dmv-test-day-checklist.html#dmv-checklist"
    default_source_url = default_checklist_state.get("manualUrl", "#")
    default_agency = default_checklist_state.get("agency", "State agency")
    stats = "".join(
        f'<div><strong>{esc(item["value"])}</strong><span>{esc(item["label"])}</span></div>'
        for item in launch.get("stats", [])[:3]
    )
    return f"""<aside class="practice-workbench" data-practice-workbench aria-label="DMV practice workspace">
  <div class="workbench-head">
    <div>
      <span>Practice workspace</span>
      <strong>Start in 30 seconds</strong>
    </div>
    <a href="dmv-practice.html">All tools</a>
  </div>
  {render_mini_sign_drill()}
  <div class="workbench-router">
    <label for="workbench-state">Choose state</label>
    <select id="workbench-state" data-workbench-state>{state_options}</select>
    <div class="workbench-route-note">
      <span data-workbench-agency>{esc(default_agency)}</span>
      <strong data-workbench-plan-title>{esc(default_state["label"])} permit-test path</strong>
      <p data-workbench-plan-copy>Open the official source, run a practice round, drill signs, then finish the checklist.</p>
    </div>
    <div class="workbench-route-actions">
      <a href="{esc(default_source_url)}" target="_blank" rel="noopener" data-workbench-source>Official source</a>
      <a href="{esc(default_state["href"])}" data-workbench-primary>Permit practice</a>
      <a href="{esc(find_state_sign_href(default_state["label"]))}" data-workbench-secondary>State signs</a>
      <a href="{esc(default_checklist_url)}" data-workbench-checklist>Checklist</a>
    </div>
  </div>
  <div class="workbench-mode-links">
    <a href="dmv-permit-test-question-of-the-day.html"><span>Daily</span><strong>One question</strong></a>
    <a href="dmv-permit-test-mistake-log.html"><span>Mistakes</span><strong>Save weak areas</strong></a>
    <a href="road-signs-practice-test.html?mode=road-signs-core#practice"><span>Road signs</span><strong>40 image questions</strong></a>
    <a href="dmv-road-sign-flashcards.html"><span>Flashcards</span><strong>Visual sign deck</strong></a>
    <a href="dmv-permit-test-study-plan.html"><span>Study plan</span><strong>3 to 21 days</strong></a>
    <a href="regulatory-traffic-signs-practice-test.html"><span>Regulatory</span><strong>16 rule signs</strong></a>
    <a href="road-sign-shapes-and-colors-finder.html"><span>Shapes</span><strong>Colors and meanings</strong></a>
    <a href="dmv-permit-test-requirements-by-state.html"><span>Requirements</span><strong>Format and pass rule</strong></a>
    <a href="florida-dmv-road-signs-practice.html"><span>Florida</span><strong>Regulatory signs</strong></a>
    <a href="florida-class-e-knowledge-exam-tlsae.html"><span>Florida</span><strong>Class E map</strong></a>
    <a href="florida-dmv-permit-documents-checklist.html"><span>Florida</span><strong>Permit docs</strong></a>
    <a href="dmv-test-day-checklist.html"><span>Checklist</span><strong>Final ready path</strong></a>
  </div>
  <div class="workbench-return" data-recent-practice>
    <div>
      <span>Recent practice</span>
      <strong data-recent-practice-title>No saved progress on this device yet</strong>
      <p data-recent-practice-meta>Your most recent unfinished DMV round is saved only in this browser.</p>
    </div>
    <a href="road-signs-practice-test.html#practice" data-recent-practice-link>Start road signs</a>
  </div>
  <div class="hero-stat-strip">{stats}</div>
</aside>"""


def render_home_road_sign_panel():
    links = [
        (
            "Pic",
            "40-picture road signs test",
            "Start with the broad permit-test image round",
            "road-signs-practice-test.html?mode=road-signs-core#practice",
            "40",
        ),
        (
            "FL",
            "Florida regulatory signs",
            "Practice Florida rule signs and official source checks",
            "florida-dmv-road-signs-practice.html",
            "24",
        ),
        (
            "Cards",
            "Road sign flashcards",
            "Memorize signs before a full quiz",
            "dmv-road-sign-flashcards.html",
            "",
        ),
        (
            "Shapes",
            "Shapes and colors finder",
            "Find signs by shape, color, and symbols",
            "road-sign-shapes-and-colors-finder.html",
            "",
        ),
        (
            "Rules",
            "Regulatory traffic signs",
            "Drill stop, yield, wrong way, one way, and speed signs",
            "regulatory-traffic-signs-practice-test.html",
            "",
        ),
        (
            "Score",
            "40 of 50 pass score",
            "Track the Florida Class E readiness target",
            "florida-dmv-permit-practice-test.html",
            "40/50",
        ),
    ]
    def render_pocket_tool_row(label, title, text, href, badge):
        badge_html = f'\n  <b>{esc(badge)}</b>' if badge else ""
        return f"""<a class="pocket-tool-row" href="{esc(href)}">
  <span class="pocket-tool-token">{esc(label)}</span>
  <span><strong>{esc(title)}</strong><em>{esc(text)}</em></span>{badge_html}
</a>"""
    link_cards = "".join(
        render_pocket_tool_row(label, title, text, href, badge)
        for label, title, text, href, badge in links
    )
    stats = "".join(
        f'<div><strong>{esc(value)}</strong><span>{esc(label)}</span></div>'
        for value, label in [
            ("40", "picture questions"),
            ("10", "question starter"),
            ("40/50", "Class E pass rule"),
        ]
    )
    return f"""<aside class="practice-workbench road-sign-hub-panel pocket-diagnostic" aria-label="DMV road signs hub">
  <div class="workbench-head">
    <div>
      <span>Quick diagnostic</span>
      <strong>0 / 4</strong>
    </div>
    <span>Pictures first</span>
  </div>
  {render_mini_sign_drill()}
  <div class="pocket-tool-list" aria-label="Fast road sign tools">{link_cards}</div>
  <div class="workbench-return">
    <div>
      <span>Best first click</span>
      <strong>40-picture road signs test</strong>
      <p>Start with the broad picture round, then use missed categories to choose regulatory, flashcard, or state-specific review.</p>
    </div>
    <a href="road-signs-practice-test.html?mode=road-signs-core#practice">Start picture test</a>
  </div>
  <div class="hero-stat-strip">{stats}</div>
</aside>"""


def render_home_pocket_tabs():
    tabs = [
        ("Signs", "road-signs-practice-test.html?mode=road-signs-core#practice", False),
        ("State", "#state-paths", False),
        ("Score", "dmv-permit-test-passing-score-calculator.html?source=home_pocket_tab#score-calculator", True),
        ("Docs", "dmv-test-day-checklist.html#dmv-checklist", True),
    ]
    items = []
    for index, (label, href, follows_state) in enumerate(tabs):
        current = ' aria-current="page"' if index == 0 else ""
        shortcut = " data-home-state-shortcut" if follows_state else ""
        items.append(f'<a href="{esc(href)}"{current}{shortcut}>{esc(label)}</a>')
    return f'<nav class="pocket-tabs" aria-label="Fast DMV tool shortcuts">{"".join(items)}</nav>'


def render_home_state_preview():
    return """<section class="home-state-preview" id="state-paths-preview">
  <div>
    <span>Choose your state DMV path</span>
    <h2>Pictures first. State next.</h2>
    <p>Start with the broad picture round, then choose a state path for official rules, score context, and test-day details.</p>
  </div>
  <div class="home-state-preview-actions">
    <a href="road-signs-practice-test.html?mode=road-signs-core#practice">Road signs pictures</a>
    <a href="dmv-practice.html#state-paths">Choose your state</a>
    <a href="dmv-test-day-checklist.html#dmv-checklist" data-home-state-shortcut>Checklist</a>
    <a href="dmv-permit-test-requirements-by-state.html">Official rules</a>
  </div>
</section>"""


def render_home_bottom_nav():
    links = [
        ("Home", "index.html", False),
        ("Road Signs", "road-signs-practice-test.html", False),
        ("Practice", "dmv-practice.html", False),
        ("Checklist", "dmv-test-day-checklist.html#dmv-checklist", True),
        ("More", "#state-paths", False),
    ]
    items = []
    for index, (label, href, follows_state) in enumerate(links):
        current = ' aria-current="page"' if index == 0 else ""
        shortcut = " data-home-state-shortcut" if follows_state else ""
        items.append(f'<a href="{esc(href)}"{current}{shortcut}>{esc(label)}</a>')
    return f'<nav class="home-bottom-nav" aria-label="Mobile DMV shortcuts">{"".join(items)}</nav>'


def quiz_question_count(mode):
    count = len(DATA["quizzes"].get(mode["quiz"], []))
    append_quiz = mode.get("appendQuiz")
    if append_quiz:
        count += len(DATA["quizzes"].get(append_quiz, []))
    max_questions = int(mode.get("maxQuestions") or 0)
    if max_questions > 0:
        return min(count, max_questions)
    return count


def render_tool_hero_panel(tool):
    if tool.get("category") != "DMV":
        return ""
    is_checklist_page = tool.get("toolWidget", {}).get("type") == "dmvTestDayChecklist"
    facts = tool.get("quickFacts", [])
    primary = facts[:3]
    fact_rows = "".join(
        f'<div><span>{esc(item["label"])}</span><strong>{esc(item["value"])}</strong></div>'
        for item in primary
    )
    if is_checklist_page:
        mode_rows = "".join(
            f'<li><span>{esc(label)}</span><strong>{esc(text)}</strong></li>'
            for label, text in [
                ("1", "Pick state"),
                ("2", "Open official source"),
                ("3", "Save readiness"),
            ]
        )
        source = "Official state sources"
        return f"""<aside class="tool-hero-panel" aria-label="Checklist summary">
  <div class="panel-status"><span>Free tool</span><strong>Browser-saved</strong></div>
  <div class="panel-facts">{fact_rows}</div>
  <ol class="panel-mode-list">{mode_rows}</ol>
  <p class="panel-source">Use with: {esc(source)}</p>
</aside>"""
    if not (tool.get("quiz") or tool.get("quizModes")):
        if "road-signs" in tool.get("slug", ""):
            return f"""<aside class="tool-hero-panel" aria-label="State guide summary">
  <div class="panel-status"><span>State study guide</span><strong>Official sources</strong></div>
  <div class="panel-facts">{fact_rows}</div>
  <ol class="panel-mode-list"><li><span>Interactive practice</span><strong>Shared nationwide quiz</strong></li></ol>
  <p class="panel-source">Use the official state links for current rules and test details.</p>
</aside>"""
        return f"""<aside class="tool-hero-panel" aria-label="Permit guide summary">
  <div class="panel-status"><span>Permit guide</span><strong>Official sources</strong></div>
  <div class="panel-facts">{fact_rows}</div>
</aside>"""
    modes = tool.get("quizModes", [])
    mode_rows = "".join(
        f'<li><span>{esc(mode["label"])}</span><strong>{quiz_question_count(mode)} questions</strong></li>'
        for mode in modes[:3]
    )
    if not mode_rows and tool.get("quiz"):
        mode_rows = f'<li><span>Practice</span><strong>{len(DATA["quizzes"].get(tool["quiz"], []))} questions</strong></li>'
    source = next((item["value"] for item in facts if item["label"].lower() == "official source"), "Official driver handbook")
    return f"""<aside class="tool-hero-panel" aria-label="Practice summary">
  <div class="panel-status"><span>Free practice</span><strong>Instant feedback</strong></div>
  {render_sign_preview_strip(external_images=tool.get("slug") == ROAD_SIGN_PICTURE_SLUG)}
  <div class="panel-facts">{fact_rows}</div>
  <ol class="panel-mode-list">{mode_rows}</ol>
  <p class="panel-source">Use with: {esc(source)}</p>
</aside>"""


def render_practice_console(tool):
    if tool.get("category") != "DMV":
        return ""
    slug = tool.get("slug", "")
    is_sign_page = "road-signs" in slug or "regulatory-traffic-signs" in slug
    if is_sign_page and (tool.get("quiz") or tool.get("quizModes")):
        if slug != ROAD_SIGN_PICTURE_SLUG and not tool.get("stateRulePractice"):
            return ""
        items = [
            ("Step 1", "Identify the sign", "Use the image first, then read the choices."),
            ("Step 2", "Check shape and color", "Connect the sign to the study guide below."),
            ("Step 3", "Save missed signs", "Wrong answers stay in your browser for quick review."),
            ("Step 4", "Review the sign library", "Retake the round after the meaning feels obvious."),
        ]
        if slug == ROAD_SIGN_PICTURE_SLUG:
            heading = "Review the reason behind a missed sign"
            intro = "Name the driver action before reading the choices. If two signs lead you to different answers, practice that pair before retaking a mixed round."
        else:
            heading = "Separate sign recognition from the state rule"
            intro = "Recognize the sign in the picture drill, then use the local examples to decide which conditions make the rule apply."
    elif is_sign_page:
        items = [
            ("1", "Confirm the state rule", "Use the linked agency page for the current format, pass threshold, and retake instructions."),
            ("2", "Study from the state source", "Open the official handbook or sign reference linked on this guide."),
            ("3", "Practice the shared picture set", "Use the nationwide quiz for interactive sign questions and explanations."),
            ("4", "Return to the manual", "Check exact state wording before test day."),
        ]
        heading = "Study path for this state"
        intro = "This guide combines state-specific exam details with official references and points to the shared picture quiz for interactive practice."
    else:
        return ""
    cards = "".join(
        f'<article><span>{esc(label)}</span><strong>{esc(title)}</strong><p>{esc(text)}</p></article>'
        for label, title, text in items
    )
    return f"""<section class="task-console" aria-label="Practice console">
  <div class="tool-section-head">
    <span class="eyebrow">Start here</span>
    <h2>{esc(heading)}</h2>
    <p class="section-intro">{esc(intro)}</p>
  </div>
  <div class="task-console-grid">{cards}</div>
</section>"""


def render_trust_strip(tool):
    if tool.get("category") != "DMV":
        return ""
    official = "Official handbook"
    for fact in tool.get("quickFacts", []):
        if fact.get("label", "").lower() == "official source":
            official = fact.get("value", official)
            break
    updated = tool.get("lastUpdated", SITE["lastUpdated"])
    if not (tool.get("quiz") or tool.get("quizModes")):
        if "road-signs" not in tool.get("slug", ""):
            return ""
        quality_note = "State-specific exam details"
        privacy_note = "No answers collected on this guide"
    else:
        quality_note = "Original practice questions"
        privacy_note = "Answers stay in this browser"
    return f"""<section class="trust-strip" aria-label="Practice trust notes">
  <div><span>Source context</span><strong>{esc(official)}</strong></div>
  <div><span>Privacy</span><strong>{esc(privacy_note)}</strong></div>
  <div><span>Quality check</span><strong>{esc(quality_note)}</strong></div>
  <div><span>Updated</span><strong>{esc(updated)}</strong></div>
</section>"""


def render_quick_facts(facts):
    if not facts:
        return ""
    items = "".join(
        f'<div><dt>{esc(item["label"])}</dt><dd>{esc(item["value"])}</dd></div>'
        for item in facts
    )
    return f'<section class="fact-section"><h2>Quick facts</h2><dl class="fact-grid">{items}</dl></section>'


def sat_calendar_deadlines(event):
    label = event.get("label", event["title"].removeprefix("SAT - "))
    day = event["date"].replace("-", "")
    deadlines = (
        ("regular", event["registrationDate"], "SAT regular registration deadline", "Regular registration closes"),
        ("late", event["lateDate"], "SAT late registration and changes deadline", "Late registration, changes, and regular cancellation close"),
    )
    return [
        {
            "uid": f"sat-{day}-{kind}-deadline@testdaytools.com",
            "utc": datetime.fromisoformat(f"{date}T23:59:00").replace(tzinfo=ZoneInfo("America/New_York"))
            .astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
            "title": f"{title} - {label}",
            "description": f"{action} at 11:59 p.m. U.S. Eastern time for the {label} SAT. Confirm seat availability with College Board.",
            "url": "https://satsuite.collegeboard.org/sat/dates-deadlines",
        }
        for kind, date, title, action in deadlines
    ]


def render_sat_date_planner(tool, widget):
    schedule = TOOL_BY_SLUG[widget["scheduleSource"]] if widget.get("scheduleSource") else tool
    events = []
    for event in schedule.get("calendarDownload", {}).get("events", []):
        if not event.get("registrationDate") or not event.get("lateDate"):
            continue
        events.append({
            "date": event["date"],
            "label": event.get("label", event.get("title", "SAT date").replace("SAT - ", "")),
            "registrationDate": event["registrationDate"],
            "lateDate": event["lateDate"],
            "description": event.get("description", ""),
            "calendarDeadlines": sat_calendar_deadlines(event),
        })
    if not events:
        return ""
    event_data = json.dumps(events, separators=(",", ":")).replace("</", "<\\/")
    return f"""<section class="tool-block sat-widget sat-date-planner" id="sat-date-planner" data-sat-date-planner>
  <div class="tool-section-head">
    <span class="eyebrow">{esc(widget.get("kicker", "Interactive SAT date tool"))}</span>
    <h2>{esc(widget.get("heading", "Choose your primary SAT date and backup"))}</h2>
    <p class="section-intro">{esc(widget.get("intro", "Compare a primary SAT Weekend date and an optional backup for your timeline."))}</p>
  </div>
  <div class="sat-widget-grid">
    <div class="sat-input-panel sat-date-inputs">
      <label>Where are you in school?
        <span>This changes whether fall or spring dates get priority.</span>
        <select data-sat-stage>
          <option value="rising_senior">Rising senior</option>
          <option value="senior">Senior</option>
          <option value="junior_first">Junior planning a first SAT</option>
          <option value="junior_retake">Junior planning a retake</option>
          <option value="other">Another timeline</option>
        </select>
      </label>
      <label>What deadline matters most?
        <span>Always confirm each college's final score policy.</span>
        <select data-sat-deadline>
          <option value="early">Early action or early decision</option>
          <option value="regular">Regular decision</option>
          <option value="flexible">No application deadline yet</option>
          <option value="unsure">Not sure yet</option>
        </select>
      </label>
      <label>How much preparation runway do you need?
        <span>The planner will skip dates that are too close.</span>
        <select data-sat-readiness>
          <option value="ready">Ready now; about 2+ weeks</option>
          <option value="focused" selected>Focused plan; about 6+ weeks</option>
          <option value="starting">Starting now; about 10+ weeks</option>
        </select>
      </label>
      <label class="sat-date-checkbox"><input type="checkbox" checked data-sat-retake> <span><strong>Leave room for a retake</strong><em>Recommend the next workable backup administration.</em></span></label>
      <label class="sat-date-checkbox"><input type="checkbox" aria-describedby="sat-date-device-note" data-sat-device-loan> <span><strong>I still need to request a College Board device</strong></span></label>
      <p class="sat-widget-note" id="sat-date-device-note">For SAT Weekend, register and finish the device request at least 30 days before test day. <a href="https://satsuite.collegeboard.org/sat/device-lending">Check the official lending steps</a>.</p>
      <button type="button" data-sat-plan-button>Build my SAT date plan</button>
    </div>
    <aside class="sat-result-panel sat-date-result" aria-live="polite">
      <span>Your date plan</span>
      <strong data-sat-plan-headline>Answer the questions to compare dates</strong>
      <p data-sat-plan-reason>The result uses today's date, registration deadlines, preparation runway, and retake room.</p>
      <div class="sat-date-picks" hidden data-sat-plan-picks>
        <div><span>Primary date</span><strong data-sat-primary-date>--</strong><p data-sat-primary-deadline>--</p><p hidden data-sat-primary-device></p></div>
        <div><span>Backup date</span><strong data-sat-backup-date>--</strong><p data-sat-backup-deadline>--</p><p hidden data-sat-backup-device></p></div>
      </div>
      <div class="sat-plan-actions">
        <button type="button" disabled data-sat-plan-save>Save this plan</button>
        <button type="button" disabled data-sat-date-calendar>Download primary date &amp; deadlines</button>
        <a href="{esc(widget.get('sourceUrl', 'https://satsuite.collegeboard.org/sat/dates-deadlines'))}" target="_blank" rel="noopener" data-sat-register-link>Check official registration</a>
      </div>
      <p class="sat-saved-status" hidden data-sat-saved-status></p>
      <p class="sat-widget-note">This planner does not check your test center, country, accommodations, or a college's score deadline. Confirm those details before registering.</p>
    </aside>
  </div>
  <script type="application/json" data-sat-date-data>{event_data}</script>
</section>"""


def render_sat_anticipated_fall(schedule):
    if not schedule:
        return ""
    rows = []
    for date in schedule["dates"]:
        day = datetime.fromisoformat(date)
        label = f"{day:%B} {day.day}, {day.year}"
        rows.append(f'<tr><th scope="row"><time datetime="{esc(date)}">{esc(label)}</time></th><td data-sat-fall-gap>--</td></tr>')
    return f"""<section class="tool-block" id="sat-fall-2027" aria-labelledby="sat-fall-title" data-sat-fall-dates>
  <h2 id="sat-fall-title">Fall 2027 SAT Weekend dates (anticipated)</h2>
  <p>College Board lists these dates for planning. They may change; registration deadlines and score-release dates for these tests are not published on the schedule. These dates are not included in the confirmed date planner or downloadable calendar.</p>
  <p class="sat-fall-control" data-sat-fall-controls hidden>
    <label for="sat-fall-deadline">College score deadline</label>
    <input id="sat-fall-deadline" type="date" data-sat-fall-deadline aria-describedby="sat-fall-limit">
    <span data-sat-fall-status role="status"></span>
  </p>
  <div class="table-wrap">
    <table aria-labelledby="sat-fall-title" aria-describedby="sat-fall-limit">
      <thead><tr><th scope="col">Anticipated test date</th><th scope="col">Time before score deadline</th></tr></thead>
      <tbody>{''.join(rows)}</tbody>
    </table>
  </div>
  <p id="sat-fall-limit">The gap counts calendar days from test day, not the time needed for scores to be released or received. Check whether your college has a separate score deadline or accepts self-reported scores.</p>
  <p><strong>Example:</strong> If a college needs scores by October 15, October 9 leaves six calendar days. That does not tell you when your score will arrive. Compare August or September as earlier options, then verify the test dates and score rules before committing.</p>
  <p><a href="{esc(schedule["source"])}">Check College Board's current schedule</a> (checked {esc(schedule["checked"])}).</p>
</section>"""


def render_sat_august_readiness(tool, widget):
    calendar = tool.get("calendarDownload", {})
    milestones = widget.get("milestones", [])
    milestone_cards = "".join(
        f'''<li><time datetime="{esc(item["date"])}">{esc(item["label"])}</time><strong>{esc(item["title"])}</strong><span>{esc(item["text"])}</span></li>'''
        for item in milestones
    )
    return f"""<section class="tool-block sat-widget sat-august-widget" id="august-sat-readiness" data-sat-august-readiness
  data-regular-deadline="{esc(widget.get('regularDeadline', '2026-08-07T23:59:00-04:00'))}"
  data-late-deadline="{esc(widget.get('lateDeadline', '2026-08-11T23:59:00-04:00'))}"
  data-setup-start="{esc(widget.get('setupStart', '2026-08-17T00:00:00'))}"
  data-test-start="{esc(widget.get('testStart', '2026-08-22T00:00:00'))}"
  data-test-end="{esc(widget.get('testEnd', '2026-08-23T00:00:00'))}"
  data-score-date="{esc(widget.get('scoreDate', '2026-09-04T00:00:00'))}">
  <div class="tool-section-head">
    <span class="eyebrow">{esc(widget.get("kicker", "Live August SAT tool"))}</span>
    <h2>{esc(widget.get("heading", "Build your August SAT readiness plan"))}</h2>
    <p class="section-intro">{esc(widget.get("intro", "Check the current registration window, then turn your device, ID, and route status into a short test-day action plan."))}</p>
  </div>
  <div class="sat-august-status" aria-live="polite">
    <span data-august-status-label>Current window</span>
    <strong data-august-status-headline>Checking the official timeline...</strong>
    <p data-august-status-detail>The live status uses College Board's published August 2026 dates.</p>
  </div>
  <ol class="sat-milestone-grid" aria-label="August 2026 SAT milestones">{milestone_cards}</ol>
  <div class="sat-widget-grid">
    <div class="sat-input-panel sat-date-inputs">
      <label>Are you registered for August 22?
        <span>Choose the closest answer. The tool does not access your College Board account.</span>
        <select data-august-registration>
          <option value="registered">Yes, I am registered</option>
          <option value="not_registered">No, not yet</option>
          <option value="unsure">I need to confirm</option>
        </select>
      </label>
      <label>What is your Bluebook status?
        <span>Exam setup and the admission ticket become available 1-5 days before test day.</span>
        <select data-august-device>
          <option value="ready">Installed, signed in, and device tested</option>
          <option value="installed">Installed, but not fully checked</option>
          <option value="not_ready">Not installed or login unresolved</option>
          <option value="borrowed">Using a College Board loaned device</option>
        </select>
      </label>
      <label>Is your physical photo ID ready?
        <span>The name must match the admission ticket; digital IDs are not accepted.</span>
        <select data-august-id>
          <option value="ready">Yes, physical ID is ready</option>
          <option value="check">I need to verify the ID rules</option>
          <option value="missing">No acceptable physical ID yet</option>
        </select>
      </label>
      <label>Is your test-center route confirmed?
        <span>Use the admission ticket for the center address and arrival time.</span>
        <select data-august-route>
          <option value="ready">Yes, route and ride are confirmed</option>
          <option value="check">Not yet</option>
        </select>
      </label>
      <button type="button" data-august-plan-button>Build my final readiness plan</button>
    </div>
    <aside class="sat-result-panel sat-date-result" aria-live="polite">
      <span>Your next steps</span>
      <strong data-august-plan-headline>Answer four questions to get a plan</strong>
      <p data-august-plan-reason>The result separates deadline risk from test-day readiness.</p>
      <ol class="sat-august-plan" hidden data-august-plan-steps></ol>
      <div class="sat-plan-actions">
        <button type="button" disabled data-august-plan-save>Save this plan</button>
        <a href="{esc(calendar.get('filename', 'sat-august-22-2026-timeline.ics'))}" download data-resource-download="{esc(calendar.get('resource', 'sat_august_2026_timeline'))}" data-august-calendar>Download key dates</a>
        <a href="{esc(widget.get('registrationUrl', 'https://satsuite.collegeboard.org/dates/august-22-2026-sat-test-date'))}" target="_blank" rel="noopener" data-august-register>Check official time</a>
      </div>
      <p class="sat-saved-status" hidden data-august-saved-status></p>
      <p class="sat-widget-note">No account, score, ID number, or personal information is requested. Confirm accommodations, center details, and the exact arrival instruction on your admission ticket.</p>
    </aside>
  </div>
</section>"""


def render_sat_superscore_comparison():
    sittings = []
    for number in range(1, 4):
        required = " required" if number == 1 else ""
        optional = " (optional)" if number > 1 else ""
        sittings.append(f"""<fieldset class="sat-superscore-sitting" data-superscore-sitting>
        <legend>Sitting {number}{optional}</legend>
        <label>Reading and Writing<input type="number" inputmode="numeric" min="200" max="800" step="10"{required}></label>
        <label>Math<input type="number" inputmode="numeric" min="200" max="800" step="10"{required}></label>
      </fieldset>""")
    return f"""<section class="tool-block sat-widget" id="sat-superscore-compare" data-sat-superscore>
  <div class="tool-section-head">
    <h2>Compare up to three official SAT sittings</h2>
    <p class="section-intro">Use the two reported section scores for each date (200 to 800, in tens). Do not enter PSAT or practice scores.</p>
  </div>
  <div class="sat-widget-grid">
    <form class="sat-input-panel sat-superscore-form" autocomplete="off" novalidate>
      {"".join(sittings)}
      <label class="sat-superscore-policy">College evaluation policy
        <select data-superscore-policy>
          <option value="unknown">Not verified</option>
          <option value="combined">Combines highest sections</option>
          <option value="single">Uses a single test date</option>
        </select>
      </label>
      <div class="sat-plan-actions sat-superscore-actions">
        <button type="submit">Compare scores</button>
        <button type="reset">Clear scores</button>
      </div>
    </form>
    <aside class="sat-result-panel sat-superscore-result" aria-label="SAT score comparison" aria-live="polite" tabindex="-1">
      <p data-superscore-status>Enter the two scores from sitting 1 to begin.</p>
      <dl>
        <div><dt>Best single-date total</dt><dd><strong data-superscore-single>--</strong><span data-superscore-single-source></span></dd></div>
        <div><dt>Highest sections combined</dt><dd><strong data-superscore-combined>--</strong><span data-superscore-combined-source></span></dd></div>
      </dl>
      <p data-superscore-guidance></p>
      <p class="sat-widget-note">This comparison does not send scores or save the numbers you enter. College Board sends complete test dates, and each college sets its reporting requirements.</p>
    </aside>
  </div>
  <noscript><p>Use the worked score comparison below if the interactive form is unavailable.</p></noscript>
</section>"""


def render_sat_arrival_timing():
    return """<section class="tool-block sat-widget" id="sat-arrival-plan" aria-labelledby="sat-arrival-heading" data-sat-arrival>
  <div class="tool-section-head">
    <h2 id="sat-arrival-heading">Work backward from your confirmed arrival time</h2>
    <p class="section-intro">Use the arrival time from your admission ticket, loaner instructions, or school. Do not enter the doors-close time or the test start time instead.</p>
  </div>
  <div data-arrival-controls hidden>
    <div class="sat-widget-grid">
      <form class="sat-input-panel sat-arrival-form" autocomplete="off" novalidate>
        <label>Confirmed arrival time <span>Test site's local time</span><input type="time" step="60" required data-arrival-time></label>
        <label>Travel to the site <span>Minutes</span><input type="number" inputmode="numeric" min="0" max="720" step="1" required data-arrival-travel></label>
        <label>Parking and walking <span>Minutes</span><input type="number" inputmode="numeric" min="0" max="180" step="1" required data-arrival-walk></label>
        <label>Extra buffer <span>Minutes</span><input type="number" inputmode="numeric" min="0" max="180" step="1" required data-arrival-buffer></label>
        <button type="submit">Calculate departure</button>
      </form>
      <aside class="sat-result-panel" aria-label="Arrival plan">
        <p role="status" data-arrival-status>Enter your confirmed arrival time and the three durations.</p>
        <ol class="sat-goal-plan" data-arrival-result hidden>
          <li><strong>Leave by</strong><span data-arrival-depart></span></li>
          <li><strong>Reach the site</strong><span data-arrival-site></span></li>
          <li><strong>Reach check-in area</strong><span data-arrival-target></span></li>
        </ol>
        <p class="sat-widget-note">An early target may mean waiting outside until staff open the doors. These are route estimates, not check-in or dismissal times.</p>
      </aside>
    </div>
  </div>
  <noscript><p>Subtract your travel, walking time, and buffer from the confirmed arrival time. See the worked examples below.</p></noscript>
</section>"""


def render_tool_widget(tool):
    widget = tool.get("toolWidget")
    if not widget:
        return ""
    kind = widget.get("type")
    if kind == "dmvTestDayChecklist":
        return render_dmv_checklist_widget(widget)
    if kind == "virginiaKnowledgeRetest":
        return render_virginia_knowledge_retest()
    if kind == "satDatePlanner":
        return render_sat_date_planner(tool, widget)
    if kind == "satAugustReadiness":
        return render_sat_august_readiness(tool, widget)
    if kind == "satSuperscoreComparison":
        return render_sat_superscore_comparison()
    if kind == "satArrivalTiming":
        return render_sat_arrival_timing()
    if kind == "satReviewRecord":
        note = "\n".join(widget["lines"])
        records = "".join(
            f'<article><h3>{esc(record["heading"])}</h3><p>{esc(record["question"])}</p>'
            f'<dl class="contrast-reasoning">'
            + "".join(f'<dt>{esc(label)}</dt><dd>{esc(value)}</dd>' for label, value in record["entries"])
            + '</dl></article>'
            for record in widget["examples"]
        )
        return f"""<section class="tool-block" id="sat-review-record" aria-labelledby="sat-review-record-heading" data-sat-review-record>
  <h2 id="sat-review-record-heading">Blank review record</h2>
  <p class="section-intro" id="sat-review-record-intro">Use one record per missed, guessed, or slow question. Fill it out in your own notes, not on this page.</p>
  <textarea id="sat-review-record-template" aria-labelledby="sat-review-record-heading" aria-describedby="sat-review-record-intro" rows="{len(widget["lines"])}" readonly>{esc(note)}</textarea>
  <button type="button" data-sat-review-copy hidden>Copy blank record</button>
  <p role="status" data-sat-review-copy-status></p>
</section>
<section class="worked-examples" aria-labelledby="sat-review-examples-heading">
  <h2 id="sat-review-examples-heading">Two filled review records</h2>
  <p>These original examples show what to write after a Math miss and a correct Reading and Writing guess.</p>
  {records}
</section>
<section class="content-section">
  <h2>Find the next official drill</h2>
  <ol>
    <li>In <a href="https://mypractice.collegeboard.org/">My Practice</a>, open the Score Details for your completed Bluebook practice test. Under Review, check why your choice failed and why the right one worked.</li>
    <li>For a set based on the whole test, choose Get Tailored Practice in My Practice. To practice one skill from your record, use the <a href="https://satsuite.collegeboard.org/practice/student-question-bank">Student Question Bank</a> and filter by SAT, section, domain, and skill.</li>
    <li>Save a few unseen questions for a later check. If the same mistake returns, practice that skill again. If you can explain the reasoning on new questions, try a mixed set under time.</li>
  </ol>
</section>"""
    if kind == "apCreditNote":
        note = "\n".join(widget["lines"])
        return f"""<section class="tool-block" id="ap-credit-note" aria-labelledby="ap-credit-note-heading">
  <h2 id="ap-credit-note-heading">AP credit advising note</h2>
  <p class="section-intro" id="ap-credit-note-intro">Copy one blank note per college and exam. Fill it out in your own notes before changing your class schedule.</p>
  <label for="ap-credit-note-template">Blank advising note</label>
  <textarea id="ap-credit-note-template" aria-describedby="ap-credit-note-intro" rows="{len(widget["lines"])}" readonly>{esc(note)}</textarea>
</section>"""
    if kind == "satScoreCalculator":
        return f"""<section class="tool-block sat-widget" data-sat-score-calculator>
  <div class="tool-section-head">
    <span class="eyebrow">{esc(widget.get("kicker", "SAT score tool"))}</span>
    <h2>{esc(widget["heading"])}</h2>
    <p class="section-intro">{esc(widget["intro"])} <a href="https://mypractice.collegeboard.org/">Find your scores in My Practice</a>.</p>
  </div>
  <div class="sat-widget-grid">
    <form class="sat-input-panel" novalidate>
      <label>Reading and Writing score <span>200 to 800</span><input type="number" inputmode="numeric" min="200" max="800" step="10" required data-sat-rw></label>
      <label>Math score <span>200 to 800</span><input type="number" inputmode="numeric" min="200" max="800" step="10" required data-sat-math></label>
      <label>Target total score <span>400 to 1600</span><input type="number" inputmode="numeric" min="400" max="1600" step="10" required data-sat-target></label>
      <button type="submit">Calculate score gap</button>
    </form>
    <aside class="sat-result-panel" aria-live="polite">
      <span>Practice total</span>
      <strong data-sat-total>--</strong>
      <p data-sat-score-status>Enter both practice section scores and your target.</p>
      <div class="sat-band-grid">
        <div><span>Target gap</span><strong data-sat-gap>--</strong></div>
        <div><span>R&amp;W if Math holds</span><strong data-sat-rw-needed>--</strong></div>
        <div><span>Math if R&amp;W holds</span><strong data-sat-math-needed>--</strong></div>
      </div>
      <p class="sat-widget-note">A section score above 800 is not possible. These are planning calculations, not test-day predictions.</p>
    </aside>
  </div>
</section>"""
    if kind == "satGoalPlanner":
        return f"""<section class="tool-block sat-widget" id="sat-goal-planner" data-sat-goal-planner>
  <div class="tool-section-head">
    <span class="eyebrow">{esc(widget.get("kicker", "SAT planning tool"))}</span>
    <h2>{esc(widget.get("heading", "SAT score goal planner"))}</h2>
    <p class="section-intro">{esc(widget.get("intro", "Compare your current score, target score, and timeline to decide whether the goal needs a maintenance plan, focused sprint, or a longer runway."))}</p>
  </div>
  <div class="sat-widget-grid">
    <div class="sat-input-panel">
      <label>Current total score <span>400 to 1600</span><input type="number" min="400" max="1600" step="10" value="1180" required data-goal-current></label>
      <label>Target total score <span>400 to 1600</span><input type="number" min="400" max="1600" step="10" value="1350" required data-goal-target></label>
      <label>Weeks until test day <span>1 to 24</span><input type="number" min="1" max="24" value="8" required data-goal-weeks></label>
      <label>Study hours per week <span>1 to 30</span><input type="number" min="1" max="30" value="6" required data-goal-hours></label>
      <button type="button" data-goal-button>Build my weekly plan</button>
    </div>
    <aside class="sat-result-panel" aria-live="polite">
      <span>Planning readout</span>
      <strong data-goal-headline>Loading...</strong>
      <p data-goal-next-step>Use the weekly gap as a planning reference, not a score prediction.</p>
      <div class="sat-band-grid">
        <div><span>Score gap</span><strong data-goal-gap>--</strong></div>
        <div><span>Weekly gap reference</span><strong data-goal-weekly>--</strong></div>
        <div><span>Total hours</span><strong data-goal-total-hours>--</strong></div>
      </div>
      <ol class="sat-goal-plan" data-goal-plan>
        <li><strong>Diagnose</strong><span>Use a recent timed practice score.</span></li>
        <li><strong>Repair</strong><span>Choose one repeated weak area.</span></li>
        <li><strong>Measure</strong><span>Retest after a focused study block.</span></li>
      </ol>
      <div class="sat-plan-actions">
        <button type="button" data-goal-save>Save this plan</button>
        <a href="sat-practice-test-review-template.html">Open review template</a>
      </div>
      <p class="sat-saved-status" hidden data-goal-saved-status></p>
      <p class="sat-widget-note">This planner is a study workload tool, not a prediction or guarantee.</p>
    </aside>
  </div>
</section>"""
    return ""


def render_virginia_knowledge_retest():
    return """<section class="tool-block" id="virginia-knowledge-retest" aria-labelledby="virginia-retest-heading">
  <div class="tool-section-head">
    <h2 id="virginia-retest-heading">Find your earliest Virginia knowledge-test retake date</h2>
    <p class="section-intro">For a failed official Virginia knowledge exam, not a practice quiz or a driving skills test.</p>
  </div>
  <div class="requirements-grid">
    <div data-va-retest-controls hidden>
      <form class="requirements-control" novalidate>
        <label>Age group
          <select data-va-retest-age>
            <option value="">Choose your situation</option>
            <option value="minor">Still under 18 when retaking</option>
            <option value="adult">Already 18 or older when you failed</option>
            <option value="turning">Turning 18 before the next attempt</option>
          </select>
        </label>
        <label>Official knowledge exams failed
          <select data-va-retest-failures>
            <option value="">Choose the number of failures</option>
            <option value="one-two">One or two</option>
            <option value="three-plus">Three or more</option>
          </select>
        </label>
        <label>Date of most recent failure <input type="date" data-va-retest-date aria-describedby="virginia-retest-date-hint"></label>
        <small id="virginia-retest-date-hint">Use the date on your official exam record.</small>
        <button type="submit" class="quiz-nav-button primary">Check retake timing</button>
        <p role="status" data-va-retest-result>Choose your situation to check your next step.</p>
      </form>
    </div>
    <aside class="requirements-control">
      <h3>Retake rules before you book</h3>
      <p><strong>Under 18:</strong> Leave 15 full days after the failure. The DMV's example is January 1 failure, January 17 earliest retake.</p>
      <p><strong>18 or older:</strong> Virginia allows one attempt per day.</p>
      <p><strong>After three failures, any age:</strong> Complete the classroom portion of a Virginia-approved driver training program after your third failure and present the certificate to DMV before retesting.</p>
      <p>Reapply with the required documents and confirm office hours. An earliest date is not a booking or approval.</p>
      <a class="info-card-link" href="https://www.dmv.virginia.gov/licenses-ids/exams/know-exam">Virginia DMV knowledge exam and retake rules</a>
      <a class="info-card-link" href="https://www.dmv.virginia.gov/licenses-ids/training/driver-training-schools">Virginia-approved driver training schools</a>
    </aside>
  </div>
</section>"""


def render_dmv_checklist_widget(widget):
    states = widget.get("states", [])
    items = widget.get("items", [])
    options = "".join(
        f'<option value="{esc(state["value"])}" data-manual-label="{esc(state["manualLabel"])}" data-manual-url="{esc(state["manualUrl"])}" data-mixed-practice-url="{esc(dmv_mixed_practice(state).get("href", ""))}" data-sign-url="{esc(state["signUrl"])}" data-format="{esc(state["format"])}" data-focus="{esc(state["focus"])}" data-agency="{esc(state.get("agency", "State agency"))}" data-documents="{esc(state.get("documents", ""))}" data-appointment="{esc(state.get("appointment", ""))}" data-retake="{esc(state.get("retake", ""))}">{esc(state["label"])}</option>'
        for state in states
    )
    checklist_items = "".join(
        f"""<li><label><input type="checkbox" value="{esc(item["id"])}" data-dmv-check> <span><strong>{esc(item["label"])}</strong><em>{esc(item["text"])}</em></span></label></li>"""
        for item in items
    )
    document_cards = "".join(
        f"""<article><span>{esc(item.get("label", ""))}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p></article>"""
        for item in widget.get("documentGroups", [])
    )
    document_map = f"""<div class="dmv-document-map" id="documents-map">
      <h3>What to bring checklist map</h3>
      <div class="dmv-document-grid">{document_cards}</div>
    </div>""" if document_cards else ""
    document_pack = render_dmv_document_pack(widget.get("documentPlanner"), states)
    return f"""<section class="tool-block dmv-checklist-widget" id="dmv-checklist" data-dmv-checklist>
  <div class="tool-section-head">
    <span class="eyebrow">{esc(widget.get("kicker", "Interactive checklist"))}</span>
    <h2>{esc(widget.get("heading", "DMV test-day readiness checklist"))}</h2>
    <p class="section-intro">{esc(widget.get("intro", "Choose your state, check the official source, and save your readiness progress in this browser."))}</p>
  </div>
  <div class="dmv-checklist-grid">
    <aside class="dmv-source-panel" id="manual-finder">
      <label>Choose state <select data-dmv-checklist-state>{options}</select></label>
      <div class="dmv-source-card">
        <span>Official source</span>
        <strong data-dmv-manual-label>Choose a state</strong>
        <p data-dmv-exam-format>Use the official state source for final testing details.</p>
        <p data-dmv-focus-area></p>
      </div>
      <div class="dmv-state-prep">
        <article><span data-dmv-agency-name>State agency</span><strong>Documents</strong><p data-dmv-document-hint>Confirm ID, residency, forms, and fees with the official source.</p></article>
        <article><span>Visit plan</span><strong>Appointment and fees</strong><p data-dmv-appointment-hint>Check appointment, payment, and arrival instructions before you leave.</p></article>
        <article><span>Backup plan</span><strong>Retake rule</strong><p data-dmv-retake-hint>Know what happens if you need another attempt.</p></article>
      </div>
      <div class="dmv-state-actions">
        <a href="#" data-dmv-manual-link target="_blank" rel="noopener">Open official source</a>
        <a href="dmv-practice.html#state-paths" data-dmv-permit-link hidden>Mixed practice</a>
        <a href="road-signs-practice-test.html#practice" data-dmv-sign-link>Road signs</a>
      </div>
      <div class="dmv-readiness-score">
        <span>Readiness</span>
        <strong data-dmv-ready-score>0%</strong>
        <p data-dmv-ready-message>Start by opening the official state source.</p>
      </div>
    </aside>
    <div class="dmv-checklist-panel">
      <ul class="dmv-checklist-items">{checklist_items}</ul>
      <div class="dmv-checklist-footer">
        <p data-dmv-next-step>First unchecked item will appear here.</p>
        <div class="dmv-checklist-buttons">
          <button type="button" data-dmv-copy-checklist>Copy plan</button>
          <button type="button" data-dmv-print-checklist>Print</button>
          <button type="button" data-dmv-checklist-reset>Reset</button>
        </div>
      </div>
    </div>
  </div>
  {document_pack}
  {document_map}
</section>"""


def render_dmv_document_pack(planner, states):
    if not planner:
        return ""
    applicant_options = "".join(
        f'<option value="{esc(item["id"])}" data-pack-detail="{esc(item["detail"])}">{esc(item["label"])}</option>'
        for item in planner.get("applicantTypes", [])
    )
    document_items = []
    for item in planner.get("items", []):
        scopes = " ".join(item.get("scopes", ["all"]))
        document_items.append(f"""<li data-dmv-pack-row data-scopes="{esc(scopes)}">
  <label><input type="checkbox" value="{esc(item["id"])}" data-dmv-pack-item>
    <span><strong>{esc(item["label"])}</strong><em>{esc(item["text"])}</em></span>
  </label>
</li>""")
    default_state = states[0] if states else {}
    default_source = default_state.get("manualUrl", "#")
    default_agency = default_state.get("agency", "State agency")
    return f"""<div class="dmv-document-pack" id="document-pack-builder">
  <div class="tool-section-head compact">
    <span class="eyebrow">{esc(planner.get("kicker", "Document pack"))}</span>
    <h3>{esc(planner.get("heading", "Build a DMV document pack"))}</h3>
    <p class="section-intro">{esc(planner.get("intro", "Choose an applicant path, then turn the common document categories into a printable plan. Confirm exact accepted documents with the official source."))}</p>
  </div>
  <div class="dmv-pack-grid">
    <aside class="dmv-pack-controls">
      <label>Applicant path <select data-dmv-pack-type>{applicant_options}</select></label>
      <div class="dmv-source-card">
        <span data-dmv-pack-agency>{esc(default_agency)}</span>
        <strong data-dmv-pack-title>Document pack builder</strong>
        <p data-dmv-pack-summary>Choose a state and applicant path, then check the document categories you have confirmed.</p>
      </div>
      <a href="{esc(default_source)}" target="_blank" rel="noopener" data-dmv-pack-official>Open official document source</a>
    </aside>
    <div class="dmv-pack-panel">
      <ul class="dmv-pack-list">{"".join(document_items)}</ul>
      <div class="dmv-checklist-footer">
        <p data-dmv-pack-next>Start with the official source, then mark the documents you have ready.</p>
        <div class="dmv-checklist-buttons">
          <button type="button" data-dmv-copy-pack>Copy document pack</button>
          <button type="button" data-dmv-reset-pack>Reset pack</button>
        </div>
      </div>
    </div>
  </div>
</div>"""


def render_exam_brief(tool):
    brief = tool.get("examBrief")
    if not brief:
        return ""
    facts = "".join(
        f'<article><span>{esc(item["label"])}</span><strong>{esc(item["value"])}</strong><p>{esc(item.get("note", ""))}</p></article>'
        for item in brief.get("facts", [])
    )
    path = "".join(
        f'<li><span>{esc(item["step"])}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p></li>'
        for item in brief.get("path", [])
    )
    return f"""<section class="exam-brief">
  <div class="exam-brief-head">
    <p class="eyebrow">{esc(brief.get("kicker", "Exam snapshot"))}</p>
    <h2>{esc(brief["heading"])}</h2>
    <p class="section-intro">{esc(brief.get("intro", ""))}</p>
  </div>
  <div class="exam-stat-grid">{facts}</div>
  <ol class="study-path-grid">{path}</ol>
</section>"""


def render_sign_library(tool):
    library = tool.get("signLibrary")
    if not library:
        return ""
    groups = []
    for group in library.get("groups", []):
        signs = []
        for item in group.get("signs", []):
            svg = SIGN_SVGS.get(item["image"], "")
            if not svg:
                continue
            visual = (
                f'<div class="sign-thumb">{render_road_sign_image(item["image"], item["title"])}</div>'
                if tool.get("slug") == ROAD_SIGN_PICTURE_SLUG
                else f'<div class="sign-thumb" role="img" aria-label="{esc(item["title"])}">{svg}</div>'
            )
            signs.append(f"""<article class="sign-tile">
  {visual}
  <div><strong>{esc(item["title"])}</strong><p>{esc(item["meaning"])}</p></div>
</article>""")
        groups.append(f"""<article class="sign-group">
  <div class="sign-group-head">
    <span>{esc(group["label"])}</span>
    <p>{esc(group["text"])}</p>
  </div>
  <div class="sign-mini-grid">{"".join(signs)}</div>
</article>""")
    return f"""<section class="sign-library" id="sign-library">
  <div class="tool-section-head">
    <span class="eyebrow">{esc(library.get("kicker", "Road sign library"))}</span>
    <h2>{esc(library["heading"])}</h2>
    <p class="section-intro">{esc(library.get("intro", ""))}</p>
  </div>
  <div class="sign-library-grid">{"".join(groups)}</div>
</section>"""


def render_sign_lookup(tool):
    library = tool.get("signLibrary")
    if not library:
        return ""
    slug = tool.get("slug", "")
    sign_focus_by_slug = {
        "road-signs-practice-test": {
            "stop": "Regulatory signs",
            "yield": "Regulatory signs",
            "do-not-enter": "Regulatory signs",
            "wrong-way": "Regulatory signs",
            "one-way": "Turn and lane control signs",
            "no-u-turn": "Turn and lane control signs",
            "four-way-stop": "Regulatory signs",
            "no-right-turn": "Turn and lane control signs",
            "no-turn-on-red": "Turn and lane control signs",
            "keep-right": "Turn and lane control signs",
            "speed-limit": "Speed signs",
            "no-passing": "Regulatory signs",
        },
        "regulatory-traffic-signs-practice-test": {
            "stop": "Stop and yield rules",
            "yield": "Stop and yield rules",
            "four-way-stop": "Stop and yield rules",
            "do-not-enter": "Prohibited entry signs",
            "wrong-way": "Prohibited entry signs",
            "one-way": "Lane and direction signs",
            "keep-right": "Lane and direction signs",
            "no-u-turn": "Turn control signs",
            "no-right-turn": "Turn control signs",
            "no-turn-on-red": "Turn control signs",
            "speed-limit": "Speed signs",
            "no-passing": "Passing signs",
        },
    }
    state_road_sign_focus = {
        "school-crossing": "School signs",
        "pedestrian-crossing": "Pedestrian signs",
        "work-zone": "Work zone signs",
        "hospital": "Service signs",
        "railroad": "Railroad signs",
        "signal-ahead": "Signal signs",
        "divided-highway": "Roadway signs",
        "no-passing": "Passing signs",
        "one-way": "Directional signs",
        "roundabout": "Intersection signs",
        "deer-crossing": "Warning signs",
    }
    if (
        slug not in sign_focus_by_slug
        and ("road-signs-practice" in slug or "mvc-road-signs-practice" in slug)
    ):
        sign_focus_by_slug[slug] = state_road_sign_focus
    cards = []
    filters = [{"label": "All", "value": "all"}]
    seen_filters = {"all"}
    for group in library.get("groups", []):
        group_label = group.get("label", "Signs")
        filter_value = group_label.lower().split()[0].replace(",", "")
        if filter_value and filter_value not in seen_filters:
            filters.append({"label": group_label, "value": filter_value})
            seen_filters.add(filter_value)
        for item in group.get("signs", []):
            svg = SIGN_SVGS.get(item["image"], "")
            if not svg:
                continue
            image_key = item.get("image", "")
            practice_focus = sign_focus_by_slug.get(slug, {}).get(image_key, group_label)
            focus_label = f'{group_label} {item.get("title", "")}'.lower()
            if image_key in sign_focus_by_slug.get(slug, {}):
                pass
            elif "regulatory" in focus_label:
                practice_focus = "Regulatory signs"
            elif "warning" in focus_label:
                practice_focus = "Warning signs"
            elif "school" in focus_label or "pedestrian" in focus_label:
                practice_focus = "School and pedestrian signs"
            elif "rail" in focus_label:
                practice_focus = "Railroad signs"
            elif "work" in focus_label:
                practice_focus = "Work zone signs"
            query = " ".join([group_label, item["title"], item["meaning"], image_key, SIGN_SEARCH_ALIASES.get(image_key, "")]).strip()
            cards.append(f"""<article class="sign-lookup-card" data-sign-card data-sign-filter-key="{esc(filter_value)}" data-sign-query="{esc(query.lower())}">
  <div class="sign-thumb" role="img" aria-label="{esc(item["title"])}">{svg}</div>
  <div>
    <span>{esc(group_label)}</span>
    <strong>{esc(item["title"])}</strong>
    <p>{esc(item["meaning"])}</p>
    <a href="{esc(slug)}.html?focus={esc(quote(practice_focus))}#practice">Practice this group</a>
  </div>
</article>""")
    if not cards:
        return ""
    filter_buttons = "".join(
        f'<button type="button" class="{"is-active" if item["value"] == "all" else ""}" data-sign-filter="{esc(item["value"])}">{esc(item["label"])}</button>'
        for item in filters
    )
    return f"""<section class="sign-lookup" id="sign-meaning-finder" data-sign-lookup>
  <div class="tool-section-head">
    <span class="eyebrow">Sign meaning finder</span>
    <h2>Search road sign meanings before you quiz</h2>
    <p class="section-intro">Type a sign name, action, color, or hazard to find the meaning quickly, then jump into the matching practice group.</p>
  </div>
  <div class="sign-lookup-toolbar">
    <label>Find a sign <input type="search" placeholder="Try stop, yield, merge, school, speed..." data-sign-search></label>
    <div class="sign-lookup-filters" aria-label="Sign category filters">{filter_buttons}</div>
    <p data-sign-count>{len(cards)} signs shown</p>
  </div>
  <div class="sign-lookup-grid">{"".join(cards)}</div>
  <p class="sign-lookup-empty" data-sign-empty hidden>No matching sign yet. Try a simpler word such as stop, merge, speed, school, or work.</p>
</section>"""


def render_exam_details(tool):
    details = tool.get("examDetails")
    if not details:
        return ""
    cards = "".join(
        f'<article><span>{esc(item["label"])}</span><strong>{esc(item["value"])}</strong><p>{esc(item.get("text", ""))}</p></article>'
        for item in details.get("items", [])
    )
    return f"""<section class="exam-details" id="official-details">
  <div class="tool-section-head">
    <span class="eyebrow">{esc(details.get("kicker", "Real test details"))}</span>
    <h2>{esc(details["heading"])}</h2>
    <p class="section-intro">{esc(details.get("intro", ""))}</p>
  </div>
  <div class="exam-detail-grid">{cards}</div>
</section>"""


def render_topic_cards(tool):
    topics = tool.get("practiceTopics")
    if not topics:
        return ""
    cards = "".join(
        f'<article><span>{esc(item["label"])}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p><em>{esc(item.get("review", ""))}</em></article>'
        for item in topics.get("items", [])
    )
    return f"""<section class="practice-topics" id="practice-topics">
  <div class="tool-section-head">
    <span class="eyebrow">{esc(topics.get("kicker", "Practice by topic"))}</span>
    <h2>{esc(topics["heading"])}</h2>
    <p class="section-intro">{esc(topics.get("intro", ""))}</p>
  </div>
  <div class="topic-grid">{cards}</div>
</section>"""


def render_sign_study(tool):
    study = tool.get("signStudy")
    if not study:
        return ""
    review = study.get("reviewLink")
    review_link = (
        f'\n    <p><a class="info-card-link" href="{esc(review["href"])}">{esc(review["label"])}</a></p>' if review else ""
    )
    groups = []
    for group in study.get("groups", []):
        items = "".join(f'<li>{esc(item)}</li>' for item in group.get("items", []))
        groups.append(f"""<article>
  <span>{esc(group["label"])}</span>
  <strong>{esc(group["title"])}</strong>
  <p>{esc(group.get("text", ""))}</p>
  <ul>{items}</ul>
</article>""")
    return f"""<section class="sign-study" id="sign-study">
  <div class="tool-section-head">
    <span class="eyebrow">{esc(study.get("kicker", "Sign study guide"))}</span>
    <h2>{esc(study["heading"])}</h2>
    <p class="section-intro">{esc(study.get("intro", ""))}</p>{review_link}
  </div>
  <div class="sign-study-grid">{"".join(groups)}</div>
</section>"""


def render_sign_focus_shortcuts(tool):
    shortcuts = resolve_sign_focus_shortcuts(tool)
    if not shortcuts:
        return ""
    slug = tool.get("slug", "")
    cards = []
    for item in shortcuts.get("items", []):
        focus = item.get("focus", "")
        if item.get("href"):
            href = item["href"]
        elif focus:
            href = f'{slug}.html?focus={quote(focus)}#practice'
        else:
            href = f"{slug}.html#practice"
        cards.append(f"""<a href="{esc(href)}">
  <span>{esc(item.get("label", "Focus"))}</span>
  <strong>{esc(item["title"])}</strong>
  <p>{esc(item.get("text", ""))}</p>
</a>""")
    return f"""<section class="sign-focus" id="sign-focus">
  <div class="tool-section-head">
    <span class="eyebrow">{esc(shortcuts.get("kicker", "Focus practice"))}</span>
    <h2>{esc(shortcuts["heading"])}</h2>
    <p class="section-intro">{esc(shortcuts.get("intro", ""))}</p>
  </div>
  <div class="sign-focus-grid">{"".join(cards)}</div>
</section>"""


def render_timeline(timeline):
    if not timeline:
        return ""
    heading = timeline.get("heading", "Planning timeline")
    items = "".join(
        f'<li><span>{esc(item["label"])}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p></li>'
        for item in timeline.get("items", [])
    )
    return f'<section class="timeline-section"><h2>{esc(heading)}</h2><ol class="timeline">{items}</ol></section>'


def render_card_groups(groups):
    if not groups:
        return ""
    output = []
    for group in groups:
        anchor = f' id="{esc(group["id"])}"' if group.get("id") else ""
        intro = f'<p class="section-intro">{esc(group["intro"])}</p>' if group.get("intro") else ""
        cards = []
        for item in group.get("items", []):
            source_link = ""
            if item.get("href"):
                attrs = ' target="_blank" rel="noopener"' if is_external_url(item["href"]) else ""
                source_link = f'<a class="info-card-link" href="{esc(item["href"])}"{attrs}>{esc(item.get("cta", "Official source"))}</a>'
            cards.append(
                f'<article class="info-card"><span>{esc(item.get("label", ""))}</span><h3>{esc(item["title"])}</h3><p>{esc(item["text"])}</p>{source_link}</article>'
            )
        output.append(f'<section class="card-group"{anchor}><h2>{esc(group["heading"])}</h2>{intro}<div class="card-grid">{"".join(cards)}</div></section>')
    return "".join(output)


def render_tool_links(slugs):
    links = []
    for slug in slugs:
        tool = TOOL_BY_SLUG[slug]
        links.append(
            f'<a href="{esc(slug)}.html"><strong>{esc(tool["title"])}</strong><span>{esc(tool["description"])}</span></a>'
        )
    return "".join(links)


def render_sources(sources, state_guide=False):
    if not sources:
        return ""
    items = "".join(f'<li><a href="{esc(src["url"])}">{esc(src["label"])}</a></li>' for src in sources)
    section_id = ' id="sources"' if state_guide else ""
    heading = "Official sources" if state_guide else "Sources"
    return f'<section class="sources"{section_id}><h2>{heading}</h2><ul>{items}</ul></section>'


def render_faq(faq):
    if not faq:
        return ""
    items = "".join(
        f'<details><summary>{esc(item["q"])}</summary><p>{esc(item["a"])}</p></details>'
        for item in faq
    )
    faq_schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": item["q"], "acceptedAnswer": {"@type": "Answer", "text": item["a"]}}
            for item in faq
        ]
    }
    return f'<section class="faq"><h2>FAQ</h2>{items}<script type="application/ld+json">{json.dumps(faq_schema, separators=(",", ":"))}</script></section>'


def render_checklist(items):
    if not items:
        return ""
    lis = "".join(f'<li><label><input type="checkbox"> <span>{esc(item)}</span></label></li>' for item in items)
    return f'<section class="tool-block"><h2>Checklist</h2><ul class="checklist">{lis}</ul></section>'


def render_tables(tables):
    output = []
    for table in tables or []:
        headers = "".join(f"<th>{esc(h)}</th>" for h in table["headers"])
        rows = "".join("<tr>" + "".join(f"<td>{esc(cell)}</td>" for cell in row) + "</tr>" for row in table["rows"])
        output.append(f'<section class="tool-block"><h2>{esc(table["caption"])}</h2><div class="table-wrap"><table><thead><tr>{headers}</tr></thead><tbody>{rows}</tbody></table></div></section>')
    return "".join(output)


def render_countdown(countdown):
    if not countdown:
        return ""
    return f"""<section class="countdown" data-countdown="{esc(countdown["date"])}">
  <div>
    <p class="eyebrow">{esc(countdown["label"])}</p>
    <strong data-countdown-value>Loading...</strong>
  </div>
  <time datetime="{esc(countdown["date"])}">{esc(countdown["date"].split("T")[0])}</time>
</section>"""


def render_calendar_download(calendar):
    if not calendar or calendar.get("hideSection"):
        return ""
    filename = calendar["filename"]
    return f"""<section class="calendar-download" id="sat-calendar">
  <div>
    <p class="eyebrow">Free calendar file</p>
    <h2>{esc(calendar["heading"])}</h2>
    <p>{esc(calendar["text"])}</p>
  </div>
  <div class="calendar-download-actions">
    <a href="{esc(filename)}" download data-resource-download="{esc(calendar.get('resource', 'sat_dates_calendar'))}">{esc(calendar.get('buttonLabel', 'Download all 8 SAT dates (.ics)'))}</a>
    <span>Import into Google Calendar, Apple Calendar, or Outlook.</span>
  </div>
</section>"""


def ics_escape(value):
    return str(value).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def fold_ics_line(line, width=72):
    parts = []
    remaining = line
    while len(remaining) > width:
        chunk = remaining[:width]
        remaining = remaining[width:]
        if chunk.endswith(" "):
            chunk = chunk[:-1]
            remaining = f" {remaining}"
        parts.append(chunk)
    parts.append(remaining)
    return "\r\n ".join(parts)


def render_calendar_file(calendar):
    calendar_name = calendar.get("name", "SAT Test Dates 2026-2027")
    calendar_description = calendar.get("description", "Confirmed College Board weekend SAT dates and registration deadline entries.")
    source_url = calendar.get("sourceUrl", "https://satsuite.collegeboard.org/sat/dates-deadlines")
    dtstamp = calendar.get("dtstamp", "20260714T000000Z")
    uid_prefix = calendar.get("uidPrefix", "sat")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//TestDayTools//{ics_escape(calendar_name)}//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{ics_escape(calendar_name)}",
        f"X-WR-CALDESC:{ics_escape(calendar_description)}",
    ]
    for event in calendar.get("events", []):
        start = datetime.strptime(event["date"], "%Y-%m-%d")
        end = start + timedelta(days=1)
        lines.extend([
            "BEGIN:VEVENT",
            f'UID:{uid_prefix}-{start.strftime("%Y%m%d")}@testdaytools.com',
            f"DTSTAMP:{dtstamp}",
            f'DTSTART;VALUE=DATE:{start.strftime("%Y%m%d")}',
            f'DTEND;VALUE=DATE:{end.strftime("%Y%m%d")}',
            f'SUMMARY:{ics_escape(event["title"])}',
            f'DESCRIPTION:{ics_escape(event["description"])}',
            f'URL:{event.get("url", source_url)}',
            "END:VEVENT",
        ])
        if calendar.get("includeRegistrationDeadlines"):
            for deadline in sat_calendar_deadlines(event):
                lines.extend([
                    "BEGIN:VEVENT",
                    f'UID:{deadline["uid"]}',
                    f"DTSTAMP:{dtstamp}",
                    f'DTSTART:{deadline["utc"]}',
                    f'SUMMARY:{ics_escape(deadline["title"])}',
                    f'DESCRIPTION:{ics_escape(deadline["description"])}',
                    f'URL:{deadline["url"]}',
                    "TRANSP:TRANSPARENT",
                    "END:VEVENT",
                ])
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold_ics_line(line) for line in lines) + "\r\n"


def render_sign_visual(question, image_id):
    key = question.get("image")
    if not key:
        return ""
    svg = SIGN_SVGS.get(key)
    if not svg:
        return ""
    label = question.get("imageAlt", "Road sign illustration")
    return f"""<figure class="question-visual">
  <div class="sign-art" id="{esc(image_id)}" role="img" aria-label="{esc(label)}">{svg}</div>
  <figcaption>Look at the sign, then choose the safest meaning or driver action.</figcaption>
</figure>"""


def quiz_questions(quiz_key, options):
    questions = list(DATA["quizzes"][quiz_key])
    append_quiz = options.get("appendQuiz")
    if append_quiz:
        questions.extend(DATA["quizzes"].get(append_quiz, []))
    max_questions = int(options.get("maxQuestions") or 0)
    return questions[:max_questions] if max_questions > 0 else questions


def render_quiz(quiz_key, options=None):
    if not quiz_key:
        return ""
    options = options or {}
    questions = quiz_questions(quiz_key, options)
    mode_id = options.get("id", quiz_key)
    sheet_focus_by_image = {
        sign["image"]: (group["practice"]["focus"], group["label"])
        for group in options.get("sheetFocusGroups", [])
        for sign in group["signs"]
    }
    flashcard_keys = options.get("flashcardKeys", set())
    cards = []
    for index, q in enumerate(questions):
        category = q.get("category", "Permit basics")
        image_id = f"quiz-art-{mode_id}-{index + 1}"
        visual = render_sign_visual(q, image_id)
        visual_block = f"\n  {visual}" if visual else ""
        visual_description = f' aria-describedby="{esc(image_id)}"' if visual else ""
        choices = "".join(
            f'<button type="button" data-choice="{choice_index}">{esc(choice)}</button>'
            for choice_index, choice in enumerate(q["choices"])
        )
        concept_attr = f' data-concept-id="{esc(q["conceptId"])}"' if q.get("conceptId") else ""
        sheet = sheet_focus_by_image.get(q.get("image"))
        sheet_attr = f' data-sheet-focus="{esc(sheet[0])}" data-sheet-label="{esc(sheet[1])}"' if sheet else ""
        flashcard_attr = f' data-flashcard-key="{esc(q["image"])}"' if visual and q.get("image") in flashcard_keys else ""
        source = q.get("source")
        source_link = (
            f'\n  <p data-quiz-source hidden><a href="{esc(source["url"])}" target="_blank" rel="noopener noreferrer">{esc(source["label"])}</a></p>'
            if source else ""
        )
        cards.append(f"""<article class="question" data-question-index="{index}" data-answer="{q["answer"]}" data-category="{esc(category)}"{concept_attr}{sheet_attr}{flashcard_attr} data-prompt="{esc(q["q"])}" data-explanation="{esc(q["explanation"])}">
  <p class="question-meta">Category: {esc(category)}</p>{visual_block}
  <h3{visual_description}>{index + 1}. {esc(q["q"])}</h3>
  <div class="choices">{choices}</div>
  <p class="feedback" aria-live="polite"></p>{source_link}
</article>""")
    total = len(questions)
    pass_score = options.get("passScore") or options.get("pass_score") or max(total - 2, 1)
    title = options.get("title", "Practice questions")
    intro = options.get("description", "Answer one question at a time. Your result stays in this browser session and points you to weak areas.")
    kicker = options.get("kicker", "Interactive practice")
    quiz_label = options.get("label", title)
    state_value = options.get("state", "")
    domain = options.get("domain", "")
    is_dmv = domain == "dmv"
    section_id = f' id="{esc(options["sectionId"])}"' if options.get("sectionId") else ""
    mastery_panel = "" if not is_dmv else """<div class="quiz-mastery" data-quiz-mastery>
    <div><span>Due review</span><strong data-quiz-mastery-due>0</strong></div>
    <div><span>Learning</span><strong data-quiz-mastery-learning>0</strong></div>
    <div><span>Weekly review</span><strong data-quiz-mastery-reliable>0</strong></div>
    <p>Missed questions are due now. After the first correct answer, check again in 24 hours. A correct answer when due moves a question to weekly review. This is not an exam result.</p>
  </div>"""
    review_button_label = "Review due" if is_dmv else "Review mistakes"
    missed_cards_link = (
        '\n    <a href="dmv-road-sign-flashcards.html#missed-sign-cards" data-quiz-missed-cards hidden>Review missed sign cards</a>'
        if flashcard_keys else ""
    )
    summary = f"""<aside class="quiz-summary" aria-label="Practice status">
  <p class="quiz-kicker">Practice status</p>
  <div role="status">
    <strong data-quiz-result>Score: 0 of 0 answered</strong>
    <span data-quiz-next>Answer the questions first, then review the categories you missed.</span>
  </div>
  <div class="quiz-stat-grid">
    <div><span>Correct</span><strong data-quiz-correct>0</strong></div>
    <div><span>Missed</span><strong data-quiz-missed>0</strong></div>
    <div><span>Left</span><strong data-quiz-left>{total}</strong></div>
  </div>
  {mastery_panel}
  <div class="quiz-meter" aria-hidden="true"><span data-quiz-meter></span></div>
  <div class="quiz-breakdown" data-quiz-breakdown></div>
  <div class="quiz-toolbox">
    <label>
      <span>Focus area</span>
      <select data-quiz-filter></select>
    </label>
    <div class="quiz-toolbox-actions">
      <button type="button" data-quiz-shuffle>Shuffle</button>
      <button type="button" data-quiz-review-mistakes>{review_button_label}</button>
      <button type="button" data-quiz-timer>Start 10-min timer</button>
    </div>
    <div class="quiz-session-timer" role="timer" aria-live="off" data-quiz-timer-label>Untimed practice</div>
    <div class="quiz-timer-announcement" role="status" data-quiz-timer-announcement></div>
    <div class="question-jump-list" data-quiz-jump-list aria-label="Question navigator"></div>
  </div>
  <div class="mistake-bank">
    <div class="mistake-bank-head">
      <strong>Saved mistakes</strong>
      <button type="button" data-quiz-clear-mistakes>Clear</button>
    </div>
    <div class="mistake-list" data-quiz-mistakes><span>No saved mistakes yet.</span></div>
  </div>
  <div class="quiz-next-plan">
    <span>Next study block</span>
    <strong data-quiz-next-title>Finish this round first</strong>
    <p data-quiz-next-copy>Your score and missed categories will choose the next useful activity.</p>
    <a href="#practice" data-quiz-next-action>Continue this round</a>{missed_cards_link}
  </div>
  <button type="button" class="quiz-reset" data-quiz-reset>Restart this mode</button>
</aside>"""
    controls = """<div class="quiz-controls">
  <button type="button" class="quiz-nav-button" data-quiz-prev>Previous</button>
  <button type="button" class="quiz-nav-button primary" data-quiz-forward>Next question</button>
</div>"""
    return f"""<section class="quiz tool-block"{section_id} data-quiz data-total="{total}" data-pass-score="{esc(pass_score)}" data-quiz-label="{esc(quiz_label)}" data-mode-id="{esc(mode_id)}" data-state="{esc(state_value)}" data-domain="{esc(domain)}">
  <div class="tool-section-head">
    <span class="eyebrow">{esc(kicker)}</span>
    <h2>{esc(title)}</h2>
    <p class="section-intro">{esc(intro)}</p>
  </div>
  <div class="quiz-shell">
    <div class="quiz-workspace">
      <div class="quiz-topbar">
        <span data-quiz-position>Question 1 of {total}</span>
        <span data-quiz-answered>0 answered</span>
        <span class="quiz-topbar-score"><strong data-quiz-correct>0</strong> correct</span>
      </div>
      <div class="quiz-stage">{"".join(cards)}</div>
      {controls}
    </div>
    {summary}
  </div>
</section>"""


def render_dmv_mode_tool(tool):
    state = find_dmv_state_for_tool(tool) or {}
    state_value = state.get("value", "")
    if not state_value:
        slug = tool.get("slug", "")
        for marker in ("-dmv-", "-bmv-", "-mvd-", "-mvc-", "-sos-", "-dds-"):
            if marker in slug:
                state_value = slug.split(marker, 1)[0]
                break
    modes = tool.get("quizModes")
    if not modes:
        return render_quiz(tool.get("quiz"), {"state": state_value, "domain": "dmv"})
    if len(modes) == 1:
        only = modes[0]
        quiz_options = dict(only)
        quiz_options.pop("sectionId", None)
        quiz_options["state"] = state_value
        quiz_options["domain"] = "dmv"
        quiz = render_quiz(only["quiz"], quiz_options)
        return f"""<section class="dmv-mode-tool single-mode-tool" id="practice">
  <div class="tool-section-head">
    <span class="eyebrow">Image practice engine</span>
    <h2>{esc(only["title"])}</h2>
    <p class="section-intro">{esc(only.get("description", "Answer one image question at a time, then use saved mistakes to review the signs that slowed you down."))}</p>
  </div>
  <div class="practice-flow">
    <span>1. Identify sign</span>
    <span>2. Read meaning</span>
    <span>3. Save misses</span>
    <span>4. Review library</span>
  </div>
  {quiz}
</section>"""
    tabs = []
    panels = []
    for index, mode in enumerate(modes):
        active = index == 0
        selected = "true" if active else "false"
        active_class = " is-active" if active else ""
        hidden = "" if active else " hidden"
        tab_id = f'practice-tab-{mode["id"]}'
        panel_id = f'practice-panel-{mode["id"]}'
        tabs.append(
            f'<button type="button" role="tab" id="{esc(tab_id)}" class="mode-tab{active_class}" data-mode-button="{esc(mode["id"])}" '
            f'aria-controls="{esc(panel_id)}" aria-selected="{selected}" tabindex="{0 if active else -1}">'
            f'<span>{esc(mode["label"])}</span><strong>{esc(mode.get("short", mode["title"]))}</strong></button>'
        )
        quiz_options = dict(mode)
        quiz_options["state"] = state_value
        quiz_options["domain"] = "dmv"
        if tool.get("slug") == ROAD_SIGN_PICTURE_SLUG:
            quiz_options["flashcardKeys"] = {record["id"] for record in road_sign_flashcard_records()}
            quiz_options["sheetFocusGroups"] = [
                group for group in tool["signLibrary"]["groups"]
                if group["practice"]["mode"] == mode["id"] and group["practice"].get("focus")
            ]
        quiz = render_quiz(mode["quiz"], quiz_options)
        panels.append(
            f'<div class="mode-panel{active_class}" id="{esc(panel_id)}" role="tabpanel" aria-labelledby="{esc(tab_id)}" '
            f'data-mode-panel="{esc(mode["id"])}" tabindex="0"{hidden}>{quiz}</div>'
        )
    overview_items = "".join(
        f'<li><strong>{esc(mode["label"])}</strong><span>{esc(mode.get("description", ""))}</span></li>'
        for mode in modes
    )
    mode_intro = (
        "Use a mixed round to practice signs and driving rules, or use the signs round to work on recognition alone."
        if any(mode["id"] == "mock" for mode in modes)
        else "Use a short picture round to find slow signs, or choose the full sign set to check more categories. Neither replaces a mixed permit test."
    )
    return f"""<section class="dmv-mode-tool" id="practice" data-mode-tool>
  <div class="tool-section-head">
    <span class="eyebrow">DMV practice engine</span>
    <h2>Choose a practice mode</h2>
    <p class="section-intro">{esc(mode_intro)}</p>
  </div>
  <div class="practice-flow">
    <span>1. Answer</span>
    <span>2. Read explanation</span>
    <span>3. Review saved mistakes</span>
    <span>4. Retake weak topics</span>
  </div>
  <div class="mode-tabs" role="tablist" aria-label="Practice modes">{"".join(tabs)}</div>
  <ul class="mode-overview">{overview_items}</ul>
  <div class="mode-panels">{"".join(panels)}</div>
</section>"""


def render_related(slugs, current_slug=""):
    cards = []
    seen = set()
    for slug in slugs or []:
        tool = TOOL_BY_SLUG.get(slug)
        if tool and tool.get("indexable") is False:
            slug = tool.get("replacementSlug", "")
            tool = TOOL_BY_SLUG.get(slug)
        if not slug or slug == current_slug or slug in seen:
            continue
        if tool:
            cards.append(f'<a class="related-card" href="{esc(slug)}.html"><span>{esc(tool["category"])}</span><strong>{esc(tool["title"])}</strong></a>')
            seen.add(slug)
    if not cards:
        return ""
    return f'<section class="related"><h2>Related tools</h2><div class="related-grid">{"".join(cards)}</div></section>'


def render_dmv_test_day_bridge(tool):
    state = find_dmv_state_for_tool(tool)
    if not state:
        return ""
    slug = tool.get("slug", "")
    is_sign_page = "road-signs" in slug
    pair_href = state.get("permitUrl") if is_sign_page else state.get("signUrl")
    pair_label = "Permit practice" if is_sign_page else "Road signs drill"
    pair_slug = str(pair_href or "").removesuffix(".html")
    pair_tool = TOOL_BY_SLUG.get(pair_slug)
    if is_sign_page and (pair_slug == slug or (pair_tool and pair_tool.get("indexable") is False)):
        pair_href = "dmv-practice.html"
        pair_label = "DMV practice hub"
    pair_title = "Continue practice loop"
    pair_text = "Move between rules questions and image signs before the final review."
    if mixed := tool.get("mixedPractice"):
        pair_href = mixed["href"]
        pair_label = "Separate mixed practice"
        pair_title = "Open the 40-question mixed practice"
        pair_text = f'Site practice target: {mixed["target"]}. This is separate from the {mixed.get("signQuestions", 20)}-question sign drill.'
    intro = (
        "Use this practice page, then finish with what to bring, official documents, road signs, mistakes, and visit logistics in one saved checklist."
        if tool.get("quiz") or tool.get("quizModes")
        else "Confirm the current state rules. Use the checklist for your visit and the separate practice link if you still need to study."
    )
    checklist_href = checklist_href_for_state(state)
    return f"""<section class="dmv-test-day-bridge" id="test-day-path">
  <div>
    <p class="eyebrow">Before test day</p>
    <h2>{esc(state["label"])} DMV test-day path</h2>
    <p class="section-intro">{esc(intro)}</p>
  </div>
  <div class="dmv-bridge-actions">
    <a href="{esc(checklist_href)}"><span>Checklist</span><strong>Open {esc(state["label"])} test-day checklist</strong><em>Plan ID, residency proof, forms, appointment, fees, signs, mistakes, and retake rules.</em></a>
    <a href="{esc(pair_href)}"><span>{esc(pair_label)}</span><strong>{esc(pair_title)}</strong><em>{esc(pair_text)}</em></a>
    <a href="{esc(state["manualUrl"])}" target="_blank" rel="noopener"><span>Official source</span><strong>{esc(state["manualLabel"])}</strong><em>Use the official source for exact wording and final requirements.</em></a>
  </div>
</section>"""


def render_examples(tool):
    examples = json.loads((ROOT / 'content/study_examples.json').read_text(), object_pairs_hook=reject_duplicate_json_keys)
    record = examples.get(tool['slug'])
    if not record:
        return ''
    items = []
    for example in record['examples']:
        steps = ''.join(f'<li>{esc(step)}</li>' for step in example['steps'])
        source = example.get("source")
        source_link = f'<p class="contrast-source"><a href="{esc(source["url"])}">{esc(source["label"])}</a></p>' if source else ""
        items.append(f'<article><h3>{esc(example["title"])}</h3><p>{esc(example["question"])}</p><details><summary>Show reasoning</summary><ol>{steps}</ol><p>{esc(example["mistake"])}</p></details><p>{esc(example["check"])}</p><details><summary>Check</summary><p>{esc(example["answer"])}</p></details>{source_link}</article>')
    anchor = f' id="{esc(record["id"])}"' if record.get("id") else ""
    return f'<section class="worked-examples"{anchor}><h2>{esc(record["heading"])}</h2><p>{esc(record["intro"])}</p>{"".join(items)}</section>'


def render_state_rule_practice(lesson):
    if not lesson:
        return ""
    anchor = esc(lesson["id"])
    scenarios = "".join(
        f'<details class="contrast-transfer"><summary>{esc(case["question"])}</summary><p>{esc(case["answer"])}</p></details>'
        for case in lesson["scenarios"]
    )
    sources = " &middot; ".join(
        f'<a href="{esc(source["url"])}">{esc(source["label"])}</a>' for source in lesson["sources"]
    )
    asset = lesson.get("imageAsset")
    image = (
        f'<img src="{esc(asset["src"])}" alt="{esc(lesson["imageLabel"])}" width="{int(asset["width"])}" height="{int(asset["height"])}">'
        if asset
        else render_road_sign_image(lesson["image"], lesson["imageLabel"], lazy=False)
    )
    return f"""<section class="content-section state-sign-lesson" id="{anchor}" aria-labelledby="{anchor}-heading">
  <h2 id="{anchor}-heading">{esc(lesson["heading"])}</h2>
  <div class="contrast-lesson-grid">
    <figure class="contrast-scene">
      {image}
      <figcaption>{esc(lesson["caption"])}</figcaption>
    </figure>
    <div>
      {scenarios}
      <p class="contrast-source">{sources}</p>
    </div>
  </div>
</section>"""


def render_sign_recall(lesson):
    anchor = esc(lesson["id"])
    cards = "".join(
        f'''<article class="contrast-scene">
  <h3>Picture {index}</h3>
  <figure>{render_road_sign_image(card["image"], card["imageLabel"], lazy=False)}</figure>
  <details class="contrast-transfer">
    <summary>Check your explanation</summary>
    <p><strong>Color and shape:</strong> {esc(card["cue"])}</p>
    <p><strong>Driver action:</strong> {esc(card["action"])}</p>
  </details>
</article>'''
        for index, card in enumerate(lesson["cards"], start=1)
    )
    sources = " &middot; ".join(
        f'<a href="{esc(source["url"])}">{esc(source["label"])}</a>' for source in lesson["sources"]
    )
    return f'''<section class="content-section state-sign-lesson" id="{anchor}" aria-labelledby="{anchor}-heading">
  <h2 id="{anchor}-heading">{esc(lesson["heading"])}</h2>
  <p>{esc(lesson["intro"])}</p>
  <div class="sign-recall-grid">{cards}</div>
  <p class="contrast-source">Official charts: {sources}</p>
</section>'''


def render_tool(tool):
    quiz = render_dmv_mode_tool(tool) if tool.get("category") == "DMV" else render_quiz(tool.get("quiz"))
    dmv_quiz_first = tool.get("category") == "DMV" and quiz
    dmv_single_mode = tool.get("category") == "DMV" and len(tool.get("quizModes", [])) == 1
    is_sign_page = tool.get("category") == "DMV" and ("road-signs" in tool.get("slug", "") or "regulatory-traffic-signs" in tool.get("slug", ""))
    exam_brief = render_exam_brief(tool)
    exam_details = render_exam_details(tool)
    practice_topics = render_topic_cards(tool)
    has_quiz = bool(tool.get("quiz") or tool.get("quizModes"))
    sign_study = render_sign_study(tool) if has_quiz else ""
    sign_focus = render_sign_focus_shortcuts(tool) if has_quiz else ""
    sign_lookup = render_sign_lookup(tool) if is_sign_page else ""
    sign_library = render_sign_library(tool)
    practice_console = render_practice_console(tool)
    examples = render_examples(tool)
    body_sections = examples + "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in tool.get("body", [])
    )
    dmv_sections = []
    if dmv_quiz_first:
        if dmv_single_mode:
            dmv_sections.extend([sign_focus, sign_lookup, quiz, sign_study, sign_library, exam_details, exam_brief])
        else:
            dmv_sections.extend([exam_brief, sign_focus, sign_lookup, quiz, exam_details, practice_topics, sign_study, sign_library])
    else:
        dmv_sections.extend([exam_brief, sign_focus, sign_lookup, exam_details, practice_topics, sign_study, sign_library])
    lower_sections = [
        render_quick_facts(tool.get("quickFacts")),
        render_tool_widget(tool),
        render_sat_anticipated_fall(tool.get("anticipatedFall2027")),
        render_countdown(tool.get("countdown")),
        render_calendar_download(tool.get("calendarDownload")),
        render_timeline(tool.get("timeline")),
        render_tables(tool.get("tables")),
        body_sections,
        render_card_groups(tool.get("cardGroups")),
        render_checklist(tool.get("checklist")),
        render_material_links() + render_material_review() if tool.get("slug") == ROAD_SIGN_PICTURE_SLUG else "",
        "" if dmv_quiz_first else quiz,
        render_ad(),
        render_faq(tool.get("faq")),
        render_sources(tool.get("sources"), state_guide=tool.get("slug") in {
            "georgia-dds-road-signs-practice",
            "north-carolina-dmv-road-signs-practice",
            "ohio-bmv-road-signs-practice",
            "virginia-dmv-road-signs-practice",
            "michigan-sos-road-signs-practice",
            "arizona-mvd-road-signs-practice",
        }),
        render_related(tool.get("related"), tool.get("slug", "")),
    ]
    page_sections = "".join(section for section in dmv_sections + lower_sections if section)
    hero_panel = render_tool_hero_panel(tool)
    hero_inner_class = ' class="tool-hero-grid"' if hero_panel else ""
    hero_panel_block = f"\n    {hero_panel}" if hero_panel else ""
    test_day_bridge = render_dmv_test_day_bridge(tool)
    state_rule_practice = render_state_rule_practice(tool.get("stateRulePractice"))
    widget = tool.get("toolWidget") or {}
    sign_recall = render_sign_recall(widget) if widget.get("type") == "signRecall" else ""
    replacement_notice = ""
    replacement_slug = tool.get("replacementSlug")
    replacement_tool = TOOL_BY_SLUG.get(replacement_slug)
    if replacement_tool:
        replacement_notice = f'''<section class="notice"><strong>{esc(tool.get("replacementLabel", "Use the stronger study path."))}</strong> {esc(tool.get("replacementText", "This page remains available, while the linked tool provides the clearest next step."))} <a href="{esc(replacement_slug)}.html">Open {esc(replacement_tool["title"])}</a>.</section>'''
    replacement_notice_block = f"{replacement_notice}\n" if replacement_notice else ""
    body = f"""<section class="hero tool-hero">
  <div{hero_inner_class}>
    <div>
    <p class="eyebrow">{esc(tool["heroKicker"])}</p>
    <h1>{esc(tool["title"])}</h1>
    <p class="lede">{esc(tool["summary"])}</p>
{render_last_updated(tool.get("lastUpdated"))}{render_tool_actions(tool)}
    </div>{hero_panel_block}
  </div>
</section>
<section class="notice"><strong>Unofficial tool.</strong> {esc(SITE["disclaimer"])}</section>
{replacement_notice_block}\
{render_trust_strip(tool)}
{practice_console}{render_contrast_practice_links(f'{ROAD_SIGN_PICTURE_SLUG}.html') if tool['slug'] == ROAD_SIGN_PICTURE_SLUG else ''}{test_day_bridge}{state_rule_practice}{sign_recall}
{page_sections}"""
    page_type = "LearningResource" if tool.get("category") in ("DMV", "SAT", "AP") else "WebPage"
    canonical = url_for(f'/{tool["slug"]}.html')
    resource_schema = schema(tool["title"], tool["description"], canonical, page_type)
    resource_schema.update(tool.get("schema", {}))
    social_image = None
    if tool["slug"] == ROAD_SIGN_PICTURE_SLUG:
        social_image = ROAD_SIGN_PICTURE_PREVIEW
        resource_schema["image"] = url_for(f"/{social_image}")
    styled_examples = tool.get("category") in ("SAT", "DMV") and examples
    extra_head = '<link rel="stylesheet" href="assets/road-sign-materials.css">' if tool.get("stateRulePractice") or sign_recall or styled_examples or tool["slug"] == ROAD_SIGN_PICTURE_SLUG else ""
    if widget.get("type") == "virginiaKnowledgeRetest":
        extra_head += '<script src="assets/virginia-retest.js" defer></script>'
    if widget.get("type") == "satArrivalTiming":
        extra_head += '<script src="assets/sat-arrival.js" defer></script>'
    return page_shell(
        tool["title"],
        tool["description"],
        f'/{tool["slug"]}.html',
        body,
        "tool-page",
        [resource_schema, breadcrumb_schema(tool["title"], canonical)],
        social_image=social_image,
        indexable=tool.get("indexable", True),
        extra_head=extra_head,
    )


def render_hub(hub):
    if hub.get("slug") == "dmv-practice":
        return render_dmv_hub(hub)
    primary = "".join(
        f'<a class="hub-action" href="{esc(action["href"])}"><span>{esc(action["label"])}</span><strong>{esc(action["title"])}</strong><p>{esc(action["text"])}</p></a>'
        for action in hub.get("primaryActions", [])
    )
    primary_section = f'<section class="hub-primary"><h2>Start with one clear next step</h2><div class="hub-action-grid">{primary}</div></section>' if primary else ""
    body_sections = "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in hub.get("body", [])
    )
    collections = []
    for section in hub.get("sections", []):
        intro = f'<p class="section-intro">{esc(section["intro"])}</p>' if section.get("intro") else ""
        links = render_tool_links(section.get("links", []))
        collections.append(f'<section class="hub-section"><h2>{esc(section["heading"])}</h2>{intro}<div class="tool-grid">{links}</div></section>')
    body = f"""<section class="hero hub-hero">
  <div>
    <p class="eyebrow">{esc(hub["heroKicker"])}</p>
    <h1>{esc(hub["title"])}</h1>
    <p class="lede">{esc(hub["summary"])}</p>
    {render_last_updated(hub.get("lastUpdated"))}
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
{primary_section}
{''.join(collections)}
{body_sections}
{render_ad("Future ad")}"""
    return page_shell(hub["title"], hub["description"], f'/{hub["slug"]}.html', body, "hub-page")


def render_dmv_launcher(heading="Choose a DMV practice path"):
    launch = DATA["home"].get("dmvLaunch", {})
    states = launch.get("states", [])
    stats = launch.get("stats", [])
    modes = launch.get("modes", [])
    state_cards = []
    for state in states:
        checklist_state = find_dmv_state_by_label(state["label"])
        permit_href = state.get("permitHref", state["href"])
        sign_href = state.get("signHref") or find_state_sign_href(state["label"])
        checklist_href = state.get("checklistHref") or (checklist_href_for_state(checklist_state) if checklist_state else "")
        action_items = []
        if permit_href:
            action_items.append(("Permit practice", permit_href))
        if sign_href:
            action_items.append(("Road signs", sign_href))
        if checklist_href:
            action_items.append(("Checklist", checklist_href))
        actions = "".join(
            f'<a href="{esc(href)}">{esc(label)}</a>'
            for label, href in action_items
        )
        state_cards.append(
            f'<article class="state-card" data-state-card data-state-name="{esc(state["label"] + " " + state["title"] + " " + state["text"])}">'
            f'<span>{esc(state["label"])}</span><strong>{esc(state["title"])}</strong><p>{esc(state["text"])}</p>'
            f'<div class="state-card-actions">{actions}</div></article>'
        )
    state_cards_html = "".join(state_cards)
    stat_cards = "".join(
        f'<div><strong>{esc(item["value"])}</strong><span>{esc(item["label"])}</span></div>'
        for item in stats
    )
    mode_cards = "".join(
        f'<article><span>{esc(item["label"])}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p></article>'
        for item in modes
    )
    return f"""<section class="dmv-launch" id="state-paths" data-state-filter-scope>
  <div class="section-head-row">
    <div>
      <p class="eyebrow">DMV practice engine</p>
      <h2>{esc(heading)}</h2>
      <p class="section-intro">{esc(launch.get("intro", "Pick a state, then practice road rules, image signs, and mock exam questions with instant feedback."))}</p>
    </div>
    <div class="launch-stats">{stat_cards}</div>
  </div>
  <div class="state-filter">
    <label for="state-filter-input">Find your state</label>
    <input id="state-filter-input" type="search" placeholder="Type California, Texas, Florida..." data-state-filter>
    <a href="dmv-practice.html">View all DMV tools</a>
  </div>
  <div class="state-grid">{state_cards_html}</div>
  <p class="state-filter-empty" data-state-empty hidden>No matching state yet. Try a listed state name or open the road-sign tools below.</p>
  <div class="mode-card-grid">{mode_cards}</div>
</section>"""


def render_dmv_journey_dashboard():
    states = get_dmv_checklist_states()
    if not states:
        return ""
    default_state = next((state for state in states if state.get("value") == "florida"), states[0])
    options = []
    for state in states:
        mixed_page = dmv_mixed_practice(state).get("page", "")
        options.append(
            f'<option value="{esc(state.get("value", ""))}" '
            f'data-label="{esc(state.get("label", ""))}" '
            f'data-agency="{esc(state.get("agency", "State agency"))}" '
            f'data-practice-url="{esc(state.get("permitUrl", "dmv-practice.html"))}" '
            f'data-mixed-practice-url="{esc(mixed_page)}" '
            f'data-sign-url="{esc(state.get("signUrl", find_state_sign_href(state.get("label", ""))))}" '
            f'data-checklist-url="{esc(checklist_href_for_state(state))}" '
            f'data-source-url="{esc(state.get("manualUrl", "#"))}" '
            f'{"selected" if state is default_state else ""}>{esc(state.get("label", ""))}</option>'
        )
    return f"""<section class="dmv-journey" data-dmv-journey aria-labelledby="dmv-journey-title">
  <div class="journey-header">
    <div>
      <p class="eyebrow">Saved on this device</p>
      <h2 id="dmv-journey-title">Your DMV study path</h2>
      <p class="section-intro">Build a baseline, revisit weak areas, meet your state's mixed-practice targets, and confirm test-day logistics.</p>
    </div>
    <label class="journey-state-control">Your state
      <select data-journey-state>{"".join(options)}</select>
      <small>No account. Your progress stays in this browser.</small>
    </label>
  </div>
  <div class="journey-overview">
    <div class="journey-priority">
      <span data-journey-kicker>Start here today</span>
      <strong data-journey-title>Take the 10-question road-sign diagnostic</strong>
      <p data-journey-copy>One short round creates a real baseline and reveals the first category to review.</p>
      <div class="journey-actions">
        <a href="road-signs-practice-test.html?mode=road-signs-starter#practice" data-journey-primary>Start 10 questions</a>
        <a href="{esc(default_state.get("manualUrl", "#"))}" target="_blank" rel="noopener" data-journey-source>Official state source</a>
      </div>
    </div>
    <dl class="journey-stats">
      <div><dt>Today</dt><dd data-journey-answered>0 questions</dd></div>
      <div><dt>Accuracy</dt><dd data-journey-accuracy>No baseline</dd></div>
      <div><dt>Completed</dt><dd data-journey-sessions>0 rounds</dd></div>
      <div><dt>Study streak</dt><dd data-journey-streak>0 days</dd></div>
      <div><dt>Review due</dt><dd data-journey-due>0 questions</dd></div>
      <div><dt>Weekly review</dt><dd data-journey-reliable>0 questions</dd></div>
    </dl>
  </div>
  <div class="journey-steps" aria-label="DMV readiness milestones">
    <article data-journey-step="warmup"><span>1</span><div><strong>Build a 10-question baseline</strong><p>Attempt 10 different questions.</p></div><b data-journey-step-status>Not started</b></article>
    <article data-journey-step="review"><span>2</span><div><strong>Repair the weak area</strong><p>Use misses to choose signs or state rules.</p></div><b data-journey-step-status>Waiting</b></article>
    <article data-journey-step="passes"><span>3</span><div><strong>Meet two mixed-practice targets</strong><p>Two full sets for this state in 14 days. Older scores without a recorded round type stay in history but do not count here.</p></div><b data-journey-step-status>0 of 2</b></article>
    <article data-journey-step="ready"><span>4</span><div><strong>Finish test-day readiness</strong><p>Confirm documents, source, and visit logistics.</p></div><b data-journey-step-status>0 items</b></article>
  </div>
  <div class="journey-recent" data-journey-recent hidden>
    <span>Latest completed round</span>
    <strong data-journey-recent-title></strong>
    <p data-journey-recent-meta></p>
    <a href="road-signs-practice-test.html#practice" data-journey-recent-link>Open round</a>
  </div>
  <div class="journey-recent journey-mastery-queue" data-journey-review hidden>
    <span>Review queue</span>
    <strong data-journey-review-title></strong>
    <p data-journey-review-copy></p>
    <a href="road-signs-practice-test.html?focus=due#practice" data-journey-review-link>Review due questions</a>
  </div>
</section>"""


def render_dmv_source_matrix():
    launch_states = {
        state.get("label", ""): state
        for state in DATA["home"].get("dmvLaunch", {}).get("states", [])
    }
    rows = []
    for state in get_dmv_checklist_states():
        launch_state = launch_states.get(state.get("label", ""), {})
        rows.append(f"""<tr>
  <th scope="row">{esc(state.get("label", ""))}</th>
  <td>{esc(state.get("agency", "State agency"))}</td>
  <td><a href="{esc(state.get("manualUrl", "#"))}" target="_blank" rel="noopener">{esc(state.get("manualLabel", "Official source"))}</a></td>
  <td><a href="{esc(launch_state.get("href", state.get("permitUrl", "dmv-practice.html")))}">Permit</a></td>
  <td><a href="{esc(state.get("signUrl", find_state_sign_href(state.get("label", ""))))}">Signs</a></td>
  <td><a href="{esc(checklist_href_for_state(state))}">Checklist</a></td>
</tr>""")
    if not rows:
        return ""
    return f"""<section class="source-matrix" id="official-sources">
  <div class="tool-section-head">
    <span class="eyebrow">Official sources</span>
    <h2>State DMV source finder and practice links</h2>
    <p class="section-intro">Use the official agency source for final rules, then jump into practice, road signs, or the state-preselected checklist.</p>
  </div>
  <div class="source-matrix-scroll">
    <table>
      <thead><tr><th>State</th><th>Agency</th><th>Official source</th><th>Permit</th><th>Signs</th><th>Checklist</th></tr></thead>
      <tbody>{"".join(rows)}</tbody>
    </table>
  </div>
</section>"""


def render_home_value_brief():
    cards = "".join(
        f'<article><span>{esc(label)}</span><strong>{esc(title)}</strong><p>{esc(text)}</p></article>'
        for label, title, text in [
            (
                "1",
                "Official source first",
                "Open the state source before trusting any practice score. TestDayTools points you there, then helps you decide what to drill.",
            ),
            (
                "2",
                "Visual signs second",
                "Road-sign mistakes are easier to diagnose when you separate regulatory signs, warnings, direction signs, speed signs, and crossings.",
            ),
            (
                "3",
                "Mistakes become a route",
                "A missed question should send you to a focused drill, a handbook section, or a document checklist instead of another random quiz.",
            ),
        ]
    )
    return f"""<section class="content-section home-value-brief">
  <h2>How to use TestDayTools without wasting practice time</h2>
  <p>Pick one state, confirm the official source, run a short practice round, then use the first miss to choose the next tool. The site is built to turn DMV confusion into a small sequence: official source, signs, state practice, mistake log, checklist.</p>
</section>
<section class="mode-card-grid home-value-cards" aria-label="DMV study loop">
  {cards}
</section>"""


def render_home_tool_roles():
    cards = [
        (
            "Florida signs",
            "Use for Florida regulatory and official sign checks",
            "Start here for Do Not Enter, Wrong Way, One Way, speed, right-turn, no-passing, and yellow warning signs in a Florida permit-test context.",
            "florida-dmv-road-signs-practice.html",
        ),
        (
            "Regulatory signs",
            "Use for rule signs across states",
            "Choose this when the weak area is the driver action: stop, yield, do not enter, follow one way, obey speed, or avoid a prohibited turn.",
            "regulatory-traffic-signs-practice-test.html",
        ),
        (
            "Road signs pictures",
            "Use for broad visual practice",
            "Take the 40-question image quiz when you need a mixed road-sign round before choosing a focused weak-area drill.",
            "road-signs-practice-test.html?mode=road-signs-core#practice",
        ),
        (
            "Flashcards",
            "Use before the quiz when recognition is slow",
            "Flip cards until the sign family is fast, then move into the picture practice test for answer-choice pressure.",
            "dmv-road-sign-flashcards.html",
        ),
        (
            "Shapes and colors",
            "Use when only the visual clue stuck",
            "Search yellow diamond, red regulatory, brown guide, octagon, pennant, rectangle, or lane-control clues.",
            "road-sign-shapes-and-colors-finder.html",
        ),
        (
            "Florida permit",
            "Use after signs for 40 of 50 Class E context",
            "Move here when you need Florida practice questions, FLHSMV links, TLSAE separation, and the 40 of 50 pass score.",
            "florida-dmv-permit-practice-test.html",
        ),
    ]
    items = "".join(
        f'<a class="hub-action" href="{esc(href)}"><span>{esc(label)}</span><strong>{esc(title)}</strong><p>{esc(text)}</p></a>'
        for label, title, text, href in cards
    )
    return f"""<section class="hub-primary home-tool-roles">
  <h2>Choose the right DMV road-sign tool</h2>
  <p class="section-intro">Use picture practice to see what you miss, then choose your state for exam rules and test-day requirements.</p>
  <div class="hub-action-grid">{items}</div>
</section>"""


def render_florida_dmv_cluster():
    cards = [
        (
            "Florida permit",
            "Florida Class E permit practice",
            "Start with the Class E confusion map, then run quick practice, signs, and mock review.",
            "florida-dmv-permit-practice-test.html",
        ),
        (
            "Class E vs TLSAE",
            "Separate course, exam, and permit steps",
            "Use the confusion map when TLSAE, DETS, the Class E Knowledge Exam, and learner permit issuance feel like one task.",
            "florida-class-e-knowledge-exam-tlsae.html",
        ),
        (
            "Florida signs",
            "Regulatory traffic signs first",
            "Drill Do Not Enter, Wrong Way, One Way, speed, no passing, school, and pedestrian signs.",
            "florida-dmv-road-signs-practice.html",
        ),
        (
            "Documents",
            "Florida permit visit checklist",
            "Check identity, Social Security number, residential address, appointment, fees, and first issuance steps.",
            "florida-dmv-permit-documents-checklist.html",
        ),
        (
            "Mistakes",
            "Log the exact weak area",
            "Track wrong-way entry, one-way direction, right-of-way, crossing, speed, and appointment confusion.",
            "dmv-permit-test-mistake-log.html",
        ),
        (
            "Requirements",
            "Confirm the official source",
            "Compare pass rule, official source, documents, practice, signs, and checklist links.",
            "dmv-permit-test-requirements-by-state.html#requirements-finder",
        ),
    ]
    items = "".join(
        f'<a class="hub-action" href="{esc(href)}"><span>{esc(label)}</span><strong>{esc(title)}</strong><p>{esc(text)}</p></a>'
        for label, title, text, href in cards
    )
    return f"""<section class="hub-primary florida-path-cluster" id="florida-dmv-path">
  <h2>Florida DMV quick path</h2>
  <p class="section-intro">Use this Florida DMV path to connect practice, road signs, documents, mistakes, and official requirements in one place.</p>
  <div class="hub-action-grid">{items}</div>
</section>"""


def render_railroad_crossbuck(width=220, height=160):
    return f"""<svg viewBox="0 0 220 160" width="{width}" height="{height}" aria-hidden="true">
      <g transform="translate(110 80) rotate(45)">
        <rect x="-86" y="-16" width="172" height="32" fill="#fff" stroke="#222" stroke-width="2"/>
        <text x="-51" y="1" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="900" font-size="19">RAIL</text>
        <text x="51" y="1" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="900" font-size="19">ROAD</text>
      </g>
      <g transform="translate(110 80) rotate(-45)">
        <rect x="-86" y="-16" width="172" height="32" fill="#fff" stroke="#222" stroke-width="2"/>
        <text x="0" y="1" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="900" font-size="19">CROSSING</text>
      </g>
    </svg>"""


def render_shape_swatch(record):
    if record["key"] == "crossbuck":
        return f'<div role="img" aria-label="White X reading Railroad Crossing">{render_railroad_crossbuck(84, 61)}</div>'
    return (
        f'<div class="shape-swatch {esc(record["visual"])}" role="img" '
        f'aria-label="{esc(record["color"])} {esc(record["label"])} road sign shape">'
        f'<span>{esc(record["text"])}</span></div>'
    )


def render_road_sign_shapes_finder():
    records = road_sign_shape_records()
    filters = [
        ("all", "All"),
        ("regulatory", "Regulatory"),
        ("warning", "Warning"),
        ("guide", "Guide and service"),
        ("work", "Work zone"),
    ]
    filter_buttons = "".join(
        f'<button type="button" class="{"is-active" if value == "all" else ""}" data-sign-filter="{esc(value)}">{esc(label)}</button>'
        for value, label in filters
    )
    cards = []
    for record in records:
        query = " ".join([
            record["label"],
            record["color"],
            record["category"],
            record["meaning"],
            record["action"],
            record["examples"],
        ]).lower()
        cards.append(f"""<article class="sign-lookup-card shape-lookup-card" data-sign-card data-sign-filter-key="{esc(record["filter"])}" data-sign-query="{esc(query)}">
  {render_shape_swatch(record)}
  <div>
    <span>{esc(record["category"])} - {esc(record["color"])}</span>
    <strong>{esc(record["label"])}</strong>
    <p>{esc(record["meaning"])}</p>
    <a href="{esc(record["practice"])}">{esc(record.get("practiceLabel", "Practice this pattern"))}</a>
  </div>
</article>""")
    return f"""<section class="sign-lookup shape-finder" id="shape-color-finder" data-sign-lookup data-sign-count-label="shape">
  <div class="tool-section-head">
    <span class="eyebrow">Shape and color finder</span>
    <h2>Search road sign shapes, colors, and driver actions</h2>
    <p class="section-intro">Type a shape, color, sign category, or action. Open the matching practice or illustrated example.</p>
  </div>
  <div class="sign-lookup-toolbar">
    <label>Find a shape or color <input type="search" placeholder="Try red, diamond, school, yield, work zone..." data-sign-search></label>
    <div class="sign-lookup-filters" aria-label="Shape category filters">{filter_buttons}</div>
    <p data-sign-count>{len(cards)} shapes shown</p>
  </div>
  <div class="sign-lookup-grid">{"".join(cards)}</div>
  <p class="sign-lookup-empty" data-sign-empty hidden>No matching shape yet. Try red, yellow, diamond, rectangle, school, or work.</p>
</section>"""


def render_crossing_shape_drill():
    pedestrian_variant = SIGN_SVGS["pedestrian-crossing"].replace('fill="#f6d54a"', f'fill="{SCHOOL_WARNING_GREEN}"')
    return f"""<section class="content-section shape-crossing-drill" id="crossing-shape-check" aria-labelledby="crossing-shape-heading">
  <h2 id="crossing-shape-heading">Same color, different crossing signs</h2>
  <div class="contrast-lesson-grid">
    <figure class="contrast-scene">
      <div class="contrast-sign-pair">
        <span role="img" aria-label="Sign A: yellow-green diamond with one walking figure">{pedestrian_variant}</span>
        <span aria-hidden="true">/</span>
        <span role="img" aria-label="Sign B: yellow-green pentagon with two walking figures">{SIGN_SVGS["school-crossing"]}</span>
      </div>
      <figcaption><strong>A:</strong> One figure in a diamond. <strong>B:</strong> Two figures in a pentagon.</figcaption>
    </figure>
    <div>
      <p>On the way past a library and a school, you see these two signs. Which one can mark a school area if both have the same background color?</p>
      <details class="contrast-transfer">
        <summary>Compare the shape and symbol</summary>
        <p><strong>B is the school sign.</strong> The pentagon and the two figures identify it. A is a general pedestrian warning sign: it can be standard yellow or fluorescent yellow-green. Slow down and look for people at either sign. The background color alone does not tell you the speed limit.</p>
      </details>
      <p><a class="info-card-link" href="#school-crossing-location">Compare the plaques below the school sign</a></p>
      <p><a class="info-card-link" href="road-signs-practice-test.html?focus=School%20and%20pedestrian%20signs#practice">Practice school and pedestrian signs</a></p>
      <p class="contrast-source"><a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2cr1.pdf">FHWA 2C.55: pedestrian warning</a> &middot; <a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/part7r1.pdf">FHWA 7B.01&ndash;7B.03: school signs and plaques</a></p>
    </div>
  </div>
</section>"""


def render_school_crossing_location_drill():
    school = SIGN_SVGS["school-crossing"]
    plaque = f'<rect x="34" y="5" width="152" height="52" rx="5" fill="{SCHOOL_WARNING_GREEN}" stroke="#222" stroke-width="5"/>'
    ahead = '<text x="110" y="42" text-anchor="middle" fill="#111" font-family="Arial, sans-serif" font-size="31" font-weight="900">AHEAD</text>'
    arrow = '<path d="M123 17 99 42 M99 24v18h18" fill="none" stroke="#111" stroke-width="8" stroke-linecap="square" stroke-linejoin="miter"/>'

    def assembly(label, mark):
        return f'<span role="img" aria-label="{esc(label)}">{school}<svg viewBox="0 0 220 63" aria-hidden="true">{plaque}{mark}</svg></span>'

    return f"""<section class="content-section state-sign-lesson" id="school-crossing-location" aria-labelledby="school-crossing-location-heading">
  <h2 id="school-crossing-location-heading">School crossing ahead or at this location?</h2>
  <div class="contrast-lesson-grid">
    <figure class="contrast-scene">
      <div class="contrast-sign-pair school-crossing-pair">
        {assembly("Sign A: school pentagon over an AHEAD plaque", ahead)}
        <span aria-hidden="true">/</span>
        {assembly("Sign B: school pentagon over a plaque with an arrow pointing diagonally down and left", arrow)}
      </div>
      <figcaption><strong>A:</strong> Read the word below the pentagon. <strong>B:</strong> Notice where the arrow points.</figcaption>
    </figure>
    <div>
      <p>On the same road, you pass A first and see B farther on. Both have the same school symbol. Which tells you where to look for the crossing itself?</p>
      <details class="contrast-transfer">
        <summary>Check where the crossing is</summary>
        <p><strong>A warns before the crossing. B marks the crossing location.</strong> At A, slow and scan ahead. At B, check both sides of the roadway and be ready to yield or stop as required. The diagonal arrow points to the crossing; it is not a direction to change lanes or turn.</p>
      </details>
      <details class="contrast-transfer">
        <summary>Does either plaque set a speed limit?</summary>
        <p><strong>No.</strong> These two plaques tell you where to expect people crossing. Look for a separate speed-limit sign and any posted times or flashing conditions. The yellow-green background does not give you a speed.</p>
      </details>
      <p class="contrast-source"><a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/part7r1.pdf">FHWA: Figure 7B-1 and Section 7B.03 (W16-9P and W16-7P)</a></p>
    </div>
  </div>
</section>"""


def render_passing_sign_drill():
    pennant = """<svg viewBox="0 0 220 160" aria-hidden="true">
      <polygon points="20,22 201,80 20,138" fill="#f6d54a" stroke="#222" stroke-width="4" stroke-linejoin="round"/>
      <g fill="#111" font-family="Arial, sans-serif" font-size="17" font-weight="900">
        <text x="35" y="58">NO</text><text x="35" y="83">PASSING</text><text x="35" y="108">ZONE</text>
      </g>
    </svg>"""
    return f"""<section class="content-section shape-crossing-drill" id="passing-sign-check" aria-labelledby="passing-sign-heading">
  <h2 id="passing-sign-heading">White rectangle or yellow pennant?</h2>
  <div class="contrast-lesson-grid">
    <figure class="contrast-scene">
      <div class="contrast-sign-pair">
        <span role="img" aria-label="Sign A: white rectangle reading Do Not Pass">{SIGN_SVGS["no-passing"]}</span>
        <span aria-hidden="true">/</span>
        <span role="img" aria-label="Sign B: yellow pennant reading No Passing Zone">{pennant}</span>
      </div>
      <figcaption><strong>A:</strong> Regulatory sign. <strong>B:</strong> Warning pennant.</figcaption>
    </figure>
    <div>
      <p>You are behind a slow car as a two-lane road approaches a hill. Which sign can mark the start of the no-passing zone on the left?</p>
      <details class="contrast-transfer">
        <summary>Check the shape, wording, and action</summary>
        <p><strong>B, the yellow NO PASSING ZONE pennant.</strong> Where used, it marks the start of the zone on the left; it is not an arrow telling you to move right. A, the white DO NOT PASS rectangle, states the restriction. Stay behind the car rather than beginning a pass.</p>
      </details>
      <details class="contrast-transfer">
        <summary>What if there is no pennant?</summary>
        <p><strong>A missing pennant is not permission to pass.</strong> On a two-way road, a solid yellow center line next to your lane tells you not to cross it to pass. Read the signs and pavement markings together, and check your state's handbook for its passing rules.</p>
      </details>
      <p><a class="info-card-link" href="regulatory-traffic-signs-practice-test.html?focus=Passing%20signs#practice">Practice the white Do Not Pass sign</a></p>
      <p class="contrast-source"><a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2br1.pdf#page=38">FHWA 2B.36: Do Not Pass</a> &middot; <a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2cr1.pdf#page=46">FHWA 2C.53: No Passing Zone</a> &middot; <a href="https://www.pa.gov/agencies/dmv/driver-services/pennsylvania-drivers-manual/online-drivers-manual/pavement-markings">PennDOT: center lines</a></p>
    </div>
  </div>
</section>"""


def render_divided_highway_drill():
    return f"""<section class="content-section shape-crossing-drill" id="divided-highway-check" aria-labelledby="divided-highway-heading">
  <h2 id="divided-highway-heading">Does the median begin or end?</h2>
  <div class="contrast-lesson-grid">
    <figure class="contrast-scene">
      <div class="contrast-sign-pair">
        <span role="img" aria-label="Sign A: arrows farther apart at the top, with the median at the top">{SIGN_SVGS["divided-highway"]}</span>
        <span aria-hidden="true">/</span>
        <span role="img" aria-label="Sign B: arrows closer together at the top, with the median at the bottom">{SIGN_SVGS["divided-highway-ends"]}</span>
      </div>
      <figcaption><strong>A:</strong> Divider at the top. <strong>B:</strong> Divider at the bottom.</figcaption>
    </figure>
    <div>
      <p>You are already driving beside a raised median. Which sign warns that the divider will disappear ahead?</p>
      <details class="contrast-transfer">
        <summary>Check where the arrows move</summary>
        <p><strong>B, Divided Highway Ends.</strong> Follow the upward arrow on the right: it moves inward as the divider drops out. Be ready for oncoming traffic across a center line instead of across a physical barrier.</p>
        <p><strong>A, Divided Highway.</strong> The upward arrow bends away from the center toward the top, where the divider begins. Stay in the lane marked for your direction. This is a warning, not a Keep Right sign at an island.</p>
      </details>
      <p><a class="info-card-link" href="california-dmv-road-signs-practice.html?mode=signs#practice">Practice both signs in the full California picture set</a></p>
      <p class="contrast-source"><a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2cr1.pdf#page=25">FHWA Figure 2C-6: W6-1 and W6-2</a> &middot; <a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2cr1.pdf#page=26">FHWA Sections 2C.20 and 2C.21</a></p>
    </div>
  </div>
</section>"""


def render_railroad_crossing_drill():
    return f"""<section class="content-section shape-crossing-drill" id="railroad-crossing-check" aria-labelledby="railroad-crossing-heading">
  <h2 id="railroad-crossing-heading">Railroad warning ahead or crossing here?</h2>
  <div class="contrast-lesson-grid">
    <figure class="contrast-scene">
      <div class="contrast-sign-pair">
        <span role="img" aria-label="Sign A: yellow circle with a black X and two Rs">{SIGN_SVGS["railroad"]}</span>
        <span aria-hidden="true">/</span>
        <span role="img" aria-label="Sign B: white X-shaped crossbuck reading Railroad Crossing">{render_railroad_crossbuck()}</span>
      </div>
      <figcaption><strong>A:</strong> Round advance warning (W10-1). <strong>B:</strong> Crossbuck at the tracks (R15-1).</figcaption>
    </figure>
    <div>
      <p>In a passenger car, you pass A and reach B. The lights are not flashing, but stopped traffic leaves room for only the front half of your car beyond the tracks. Where should you wait?</p>
      <details class="contrast-transfer">
        <summary>Check the decision at the tracks</summary>
        <p><strong>Wait before the tracks.</strong> Even when the lights are off, do not enter unless your entire vehicle can clear the last rail and you can cross safely. Follow any STOP or YIELD sign. Do not enter when lights are flashing or a gate is down or lowering.</p>
      </details>
      <details class="contrast-transfer">
        <summary>What if you have only reached the round warning sign?</summary>
        <p><strong>Prepare to stop.</strong> The yellow circle tells you tracks are ahead; the white crossbuck identifies the crossing itself. Slow down, look both ways, and listen for a train. Follow the actual signs and signals at the tracks.</p>
      </details>
      <p><a class="info-card-link" href="road-signs-practice-test.html?focus=Warning%20signs#practice">Practice the round advance warning sign</a></p>
      <p class="contrast-source"><a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/part8r1.pdf">FHWA: Sections 8B.03 and 8B.06</a> &middot; <a href="https://railroads.dot.gov/highway-rail-crossing-and-trespasser-programs/pedestrian-motorist">FRA: crossing safety</a> &middot; <a href="https://www.nhtsa.gov/campaign/railroad-crossing">NHTSA: lights and gates</a></p>
    </div>
  </div>
</section>"""


def render_road_sign_shapes_page():
    records = road_sign_shape_records()
    stats = "".join(
        f'<div><strong>{esc(value)}</strong><span>{esc(label)}</span></div>'
        for value, label in [(str(len(records)), "shape/color rules"), ("4", "main sign families"), ("0", "signup required")]
    )
    quick_cards = "".join(
        f"""<article>
  {render_shape_swatch(record)}
  <div><span>{esc(record["color"])}</span><strong>{esc(record["label"])}</strong><p>{esc(record["action"])}</p></div>
</article>"""
        for record in records[:6]
    )
    decision_cards = "".join(
        f'<article><span>{esc(label)}</span><strong>{esc(title)}</strong><p>{esc(text)}</p></article>'
        for label, title, text in [
            ("Step 1", "Notice the color", "Color is a clue, not the full answer. Both a school sign and a general pedestrian warning can be yellow-green."),
            ("Step 2", "Check the shape and symbol", "Use the outline and the symbol together. A pentagon with two figures is not the same as a diamond with one."),
            ("Step 3", "Translate to action", "Permit tests usually want the driver action: stop, yield, slow, do not enter, or prepare for a hazard."),
            ("Step 4", "Practice the weak family", "After you identify the pattern, open the linked road-sign or regulatory-sign quiz."),
        ]
    )
    table_rows = "".join(f"""<tr data-score-row data-state-name="{esc((record["label"] + " " + record["color"] + " " + record["category"] + " " + record["examples"]).lower())}">
  <th scope="row">{esc(record["label"])}</th>
  <td>{esc(record["color"])}</td>
  <td>{esc(record["category"])}</td>
  <td>{esc(record["action"])}</td>
  <td>{esc(record["examples"])}</td>
</tr>""" for record in records)
    faq = [
        {
            "q": "What road sign shape is always stop?",
            "a": "A red octagon is used for stop. On a permit test, translate it into the action: come to a complete stop, yield, then proceed only when safe.",
        },
        {
            "q": "What do yellow diamond signs mean?",
            "a": "Yellow diamond signs are warning signs. They usually tell you to slow down, scan ahead, and prepare for a road condition such as merging traffic, lane endings, crossings, or slippery pavement.",
        },
        {
            "q": "What do brown road signs mean?",
            "a": "Brown road signs usually point to recreation, parks, historic, cultural, or tourist destinations. They are guide signs, not warning or regulatory signs.",
        },
        {
            "q": "Are black and white road signs regulatory signs?",
            "a": "Many black-and-white rectangular signs are regulatory signs, such as speed limit, lane-use, parking, and turn-control signs. Read the words and arrows as driver actions.",
        },
        {
            "q": "Are road sign colors the same in every state?",
            "a": "Core U.S. sign colors and shapes are broadly standardized, but each state handbook can use its own wording and examples. Use this finder for recognition, then confirm with your state driver handbook.",
        },
        {
            "q": "Should I study sign shapes before taking practice tests?",
            "a": "Yes. Shape and color recognition makes image questions faster because you can identify the sign family before reading every answer choice.",
        },
    ]
    body = f"""<section class="hero tool-hero shape-hero">
  <div class="tool-hero-grid">
    <div>
      <p class="eyebrow">Road sign shapes and colors</p>
      <h1>{esc(ROAD_SIGN_SHAPES_PAGE["title"])}</h1>
      <p class="lede">Search the sign clue you remember, then turn color, shape, category, and driver action into a faster DMV road-sign answer.</p>
      {render_last_updated(ROAD_SIGN_SHAPES_PAGE["lastUpdated"])}
      <div class="hero-actions">
        <a href="#shape-color-finder">Open finder</a>
        <a href="#crossing-shape-check">Compare crossings</a>
        <a href="#shape-reference">Shape table</a>
        <a href="road-signs-practice-test.html#practice">Road signs quiz</a>
        <a href="regulatory-traffic-signs-practice-test.html#practice">Regulatory quiz</a>
      </div>
    </div>
    <aside class="tool-hero-panel shape-hero-panel" aria-label="Shape and color preview">
      <div class="panel-status"><span>Free guide</span><strong>Visual first</strong></div>
      <div class="shape-preview-grid">{quick_cards}</div>
      <div class="hero-stat-strip">{stats}</div>
    </aside>
  </div>
</section>
<section class="notice"><strong>Unofficial guide.</strong> {esc(SITE["disclaimer"])}</section>
<section class="task-console" aria-label="Road sign reading sequence">
  <div class="tool-section-head">
    <span class="eyebrow">Permit-test method</span>
    <h2>Read the sign before you read the answer choices</h2>
    <p class="section-intro">Read the color, shape and symbol, then name the driver action. If two signs share the same shape and color, compare what their symbols show. <a href="#divided-highway-check">Try the median signs</a> or <a href="#railroad-crossing-check">compare the railroad warning and crossbuck</a>.</p>
  </div>
  <div class="task-console-grid">{decision_cards}</div>
</section>
{render_road_sign_shapes_finder()}
{render_crossing_shape_drill()}
{render_school_crossing_location_drill()}
{render_railroad_crossing_drill()}
{render_passing_sign_drill()}
{render_divided_highway_drill()}
<section class="content-section">
  <h2>Shape and color traps that slow learners down</h2>
  <p>Color narrows the possibilities but cannot tell you the action by itself. Red panels can mark different entry controls, red slashes show prohibited movements, and a pennant is not an arrow telling you to move right.</p>
</section>
<section class="card-group">
  <h2>Practice by the clue you remember</h2>
  <p class="section-intro">Use this when you remember only the color, shape, or symbol from a road-sign question.</p>
  <div class="card-grid">
    <article class="info-card"><span>Yellow diamond</span><h3>Warning signs and hazards</h3><p>Yellow diamond signs usually warn about curves, merges, signals, crossings, slippery roads, lane endings, or other conditions that require slowing and scanning ahead.</p><a class="info-card-link" href="road-signs-practice-test.html?focus=Warning%20signs#practice">Practice warning signs</a></article>
    <article class="info-card"><span>Red and white</span><h3>Stop, yield, entry, and prohibited movement</h3><p>Red is the fastest clue for stop, yield, do not enter, wrong way, or a movement blocked by a slash such as no right turn or no U-turn.</p><a class="info-card-link" href="regulatory-traffic-signs-practice-test.html?focus=Prohibited%20entry%20signs#practice">Practice red regulatory signs</a></article>
    <article class="info-card"><span>Black and white</span><h3>Rules, lane use, and speed control</h3><p>Black-and-white rectangular signs often tell you a legal rule: speed limit, lane use, one way, keep right, turn control, or parking restriction.</p><a class="info-card-link" href="regulatory-traffic-signs-practice-test.html?focus=Lane%20and%20direction%20signs#practice">Practice rule signs</a></article>
    <article class="info-card"><span>Brown guide</span><h3>Parks, recreation, and cultural destinations</h3><p>Brown signs are usually guide signs. They help you recognize destinations, not immediate right-of-way or hazard decisions.</p><a class="info-card-link" href="road-signs-practice-test.html#practice">Practice mixed signs</a></article>
  </div>
</section>
<section class="requirements-table" id="shape-reference" data-state-filter-scope>
  <div class="tool-section-head">
    <span class="eyebrow">Reference table</span>
    <h2 id="shape-reference-heading">Road sign shape and color meanings</h2>
    <p class="section-intro">Filter the table when you only remember part of a sign, such as yellow diamond, red triangle, blue hospital, or orange work zone.</p>
  </div>
  <div class="state-filter">
    <label for="shape-reference-filter">Filter shapes</label>
    <input id="shape-reference-filter" type="search" placeholder="Filter by color, category, action, or example..." data-state-filter>
    <a href="road-signs-practice-test.html#sign-meaning-finder">Open sign meaning finder</a>
  </div>
  <div class="requirements-table-scroll" role="region" aria-labelledby="shape-reference-heading" tabindex="0">
    <table>
      <thead><tr><th>Shape</th><th>Color</th><th>Family</th><th>Driver action</th><th>Examples</th></tr></thead>
      <tbody>{table_rows}</tbody>
    </table>
  </div>
</section>
<section class="hub-primary">
  <h2>Practice after the shape guide</h2>
  <div class="hub-action-grid">
    <a class="hub-action" href="road-signs-practice-test.html#practice"><span>All signs</span><strong>Road Signs Practice Test</strong><p>Use the full image practice set after reviewing shape and color families.</p></a>
    <a class="hub-action" href="regulatory-traffic-signs-practice-test.html#practice"><span>Rules</span><strong>Regulatory Traffic Signs Practice</strong><p>Use this if red, white, stop, yield, speed, no-entry, or no-turn signs feel slow.</p></a>
    <a class="hub-action" href="dmv-practice.html#state-paths"><span>State path</span><strong>Choose your DMV state</strong><p>Move into state-specific permit questions, road signs, checklist, and official-source links.</p></a>
  </div>
</section>
{render_faq(faq)}
{render_sources([
  {"label": "FHWA: Manual on Uniform Traffic Control Devices", "url": "https://mutcd.fhwa.dot.gov/"},
  {"label": "FHWA: Sign principles and types", "url": "https://highways.dot.gov/safety/local-rural/maintenance-signs-and-sign-supports/ii-sign-principles-and-types"},
])}
{render_related(["dmv-road-signs-cheat-sheet", "dmv-road-sign-flashcards", "road-signs-practice-test", "regulatory-traffic-signs-practice-test", "florida-dmv-road-signs-practice", "dmv-permit-test-requirements-by-state"])}
{render_ad("Future ad")}"""
    return page_shell(
        ROAD_SIGN_SHAPES_PAGE["title"],
        ROAD_SIGN_SHAPES_PAGE["description"],
        f"/{ROAD_SIGN_SHAPES_SLUG}.html",
        body,
        "tool-page shape-page",
        page_schema(ROAD_SIGN_SHAPES_PAGE["title"], ROAD_SIGN_SHAPES_PAGE["description"], url_for(f"/{ROAD_SIGN_SHAPES_SLUG}.html"), "LearningResource"),
        extra_head='<link rel="stylesheet" href="assets/road-sign-materials.css">',
    )


def render_cheat_group_link(group):
    path = group["practice"]
    tool = TOOL_BY_SLUG[path["tool"]]
    mode = next(mode for mode in tool["quizModes"] if mode["id"] == path["mode"])
    questions = quiz_questions(mode["quiz"], mode)
    sign_keys = {sign["image"] for sign in group["signs"]}
    if path.get("focus"):
        questions = [question for question in questions if question.get("image") in sign_keys]
    if {question.get("image") for question in questions} != sign_keys:
        raise ValueError(f"Study sheet and practice pictures do not match: {group['label']}")
    href = road_sign_group_practice_href(group)
    label = f'Practice {len(questions)} questions'
    group_label = esc(label + ": " + group["label"])
    return (
        f'<a class="cheat-group-practice-link info-card-link" href="{esc(href)}" aria-label="{group_label}">{esc(label)}</a>'
        f'<a class="cheat-print-group-link" href="{esc(url_for("/" + href))}" aria-label="{group_label}">{esc(label)} online</a>'
    )


def render_online_classroom_worksheet():
    cards = {record["image"]: record for record in road_sign_flashcard_records()}
    pictures = []
    for number, (_, image, name, action) in enumerate(classroom.RECOGNITION_ITEMS, 1):
        card = cards[image]
        pictures.append(f"""<li>
  <img src="{esc(road_sign_image_path(image))}" alt="{esc(card["cue"])}" width="220" height="160" loading="lazy">
  <details><summary>Check sign {number}</summary><p><strong>{esc(name)}</strong>. {esc(action)}</p></details>
</li>""")

    decisions = []
    for number, (prompt, options, answer, reason) in enumerate(classroom.DECISION_CASES, 1):
        choices = "".join(f"<li>{esc(option)}</li>" for option in options)
        letter = "ABC"[answer]
        decisions.append(f"""<li>
  <p><strong>{esc(prompt)}</strong></p>
  <ol type="A">{choices}</ol>
  <details><summary>Check decision {number}</summary><p><strong>{letter}. {esc(options[answer])}</strong> {esc(reason)}</p></details>
</li>""")

    return f"""<section class="content-section online-classroom-worksheet" id="online-worksheet" aria-labelledby="online-worksheet-title" tabindex="-1">
  <h2 id="online-worksheet-title">Road signs worksheet: online self-check</h2>
  <p class="worksheet-intro">The same student activity as the classroom PDF. This is practice, not a permit-test score.</p>
  <details class="worksheet-part">
    <summary>1. Name eight road signs</summary>
    <p>For each picture, name the sign and say what you would do before checking the answer.</p>
    <ol class="worksheet-pictures" role="list">{"".join(pictures)}</ol>
  </details>
  <details class="worksheet-part">
    <summary>2. Make eight driving decisions</summary>
    <p>Pick an action in each situation, then compare your reasoning with the answer.</p>
    <ol class="worksheet-decisions">{"".join(decisions)}</ol>
  </details>
  <details class="worksheet-part">
    <summary>3. Apply the rule to a different situation</summary>
    <p>{esc(classroom.TRANSFER_PROMPT)}</p>
    <details><summary>Check your reasoning</summary><p>{esc(classroom.TRANSFER_KEY)}</p></details>
  </details>
  <p class="worksheet-next"><a href="road-signs-practice-test.html?mode=road-signs-starter#practice">Try the 10-question picture quiz</a></p>
  <p class="worksheet-sources">Study references: <a href="{esc(classroom.PENNDOT_SIGNS_URL)}">PennDOT driver manual: signs</a> and
  <a href="{esc(classroom.FHWA_FLAGGER_URL)}">FHWA flagger procedures (section 6D.05)</a>. See your state handbook for local rules.</p>
</section>"""


def render_road_sign_cheat_sheet_page():
    source_tool = TOOL_BY_SLUG["road-signs-practice-test"]
    groups = source_tool.get("signLibrary", {}).get("groups", [])
    rendered_groups = []
    sign_count = 0
    practice_page = url_for(f"/{ROAD_SIGN_CHEAT_SHEET_SLUG}.html")
    for group in groups:
        signs = []
        for sign in group.get("signs", []):
            sign_count += 1
            signs.append(f"""<article class="cheat-sign-card">
  <div class="cheat-sign-visual">{render_road_sign_image(sign["image"], sign["title"], lazy=False)}</div>
  <div><strong>{esc(sign["title"])}</strong><p>{esc(sign["meaning"])}</p></div>
</article>""")
        rendered_groups.append(f"""<section class="cheat-group">
  <div class="cheat-group-head"><h2>{esc(group.get("label", "Road signs"))}</h2><div><p>{esc(group.get("text", ""))}</p>{render_cheat_group_link(group)}</div></div>
  <div class="cheat-sign-grid">{"".join(signs)}</div>
</section>""")

    body = f"""<section class="hero tool-hero printable-resource-hero">
  <div class="tool-hero-grid">
    <div>
      <p class="eyebrow">Free printable DMV study sheet</p>
      <h1>{esc(ROAD_SIGN_CHEAT_SHEET_PAGE["title"])}</h1>
      <p class="lede">Use this no-email, no-signup reference to review {sign_count} common U.S. road signs by picture, meaning, shape, and color. Print it, mark the signs that feel slow, then practice only those groups.</p>
      {render_last_updated(ROAD_SIGN_CHEAT_SHEET_PAGE["lastUpdated"])}
      <div class="hero-actions print-sheet-toolbar">
        <a href="dmv-road-signs-cheat-sheet.pdf" download data-resource-download="dmv_road_signs_cheat_sheet_pdf">Download PDF</a>
        <a href="dmv-road-signs-classroom-worksheet.pdf" download data-resource-download="dmv_road_signs_classroom_worksheet_pdf">Classroom worksheet + answer key</a>
        <button type="button" data-print-page>Print cheat sheet</button>
        <a href="road-signs-practice-test.html?mode=road-signs-starter#practice">Start 10 picture questions</a>
        <a href="dmv-road-sign-flashcards.html">Open flashcards</a>
      </div>
      <a class="info-card-link" href="#online-worksheet">Use the online worksheet</a>
    </div>
    <aside class="tool-hero-panel" aria-label="Cheat sheet summary">
      <div class="panel-status"><span>Free resource</span><strong>No email required</strong></div>
      {render_sign_preview_strip(external_images=True)}
      <div class="panel-facts"><div><span>Included</span><strong>{sign_count} original sign pictures</strong></div><div><span>Print layout</span><strong>Compact two-column study sheet</strong></div><div><span>Best next step</span><strong>Quiz the signs you cannot name quickly</strong></div></div>
    </aside>
  </div>
</section>
<section class="notice"><strong>Unofficial study resource.</strong> {esc(SITE["disclaimer"])}</section>
{render_contrast_practice_links(f'{ROAD_SIGN_CHEAT_SHEET_SLUG}.html')}
<section class="printable-road-sign-sheet" id="printable-sheet">
  <header class="printable-sheet-head">
    <div><p class="eyebrow">TestDayTools printable reference</p><h2>DMV road signs and meanings</h2></div>
    <p>{sign_count} common signs. Read the picture first, then say the driver action before checking the meaning.</p>
  </header>
  <div class="print-practice-access">
    <img src="assets/road-sign-practice-qr.svg" alt="QR code for the online study sheet and practice groups" width="82" height="82">
    <p><strong>Practice only the signs you missed.</strong> Scan to find the same groups online, or go to <a href="{esc(practice_page)}#printable-sheet">{esc(practice_page.removeprefix("https://"))}</a>.</p>
  </div>
  <div class="cheat-legend" role="group" aria-label="Six colors used in this study sheet">
    <div><span class="legend-swatch legend-red"></span><strong>Red</strong><p>Stop, yield, or a restriction.</p></div>
    <div><span class="legend-swatch legend-yellow"></span><strong>Yellow</strong><p>General warning. Read the symbol.</p></div>
    <div><span class="legend-swatch legend-orange"></span><strong>Orange</strong><p>Temporary traffic control, such as work zones.</p></div>
    <div><span class="legend-swatch legend-yellow-green"></span><strong>Yellow-green</strong><p>School warnings and some pedestrian or bicycle warnings.</p></div>
    <div><span class="legend-swatch legend-white"></span><strong>White</strong><p>Often a regulation, such as speed or direction.</p></div>
    <div><span class="legend-swatch legend-blue"></span><strong>Blue</strong><p>Services such as fuel or a hospital.</p></div>
  </div>
  <p class="cheat-legend-note">Use color as a clue, then check the shape, symbol, or words. Yellow-green alone does not set a school speed limit.</p>
  {"".join(rendered_groups)}
  <section class="cheat-review-panel" aria-label="Road sign review notes">
    <div>
      <p class="eyebrow">Your next review</p>
      <h2>Turn slow signs into one focused quiz</h2>
      <ol>
        <li>Cover the meanings and name the driver action.</li>
        <li>Write down only the signs that still feel slow.</li>
        <li>Record the score below after the full 40-question round.</li>
      </ol>
    </div>
    <div class="cheat-review-fields">
      <p><strong>Signs to review</strong><span></span></p>
      <p><strong>Official manual section</strong><span></span></p>
      <p class="cheat-review-score"><strong>Next quiz score</strong><span>____ / 40</span><strong>Review date</strong><span>____________</span></p>
    </div>
  </section>
  <footer class="printable-sheet-foot">
    <p><strong>Study loop:</strong> Cover the meanings, name each sign and driver action, then revisit the group you missed at {esc(practice_page.removeprefix("https://"))}.</p>
    <p><strong>Educational-use permission:</strong> Teachers, libraries, driving schools, and families may print and share this unmodified PDF for noncommercial education when the TestDayTools credit and page URL remain visible. No resale, rebranding, or adaptation.</p>
    <p><strong>Material check {esc(road_sign_materials()["checkedOn"])}:</strong> Illustrations and labels checked for cross-material consistency; the web page records the scope and official sources. These simplified pictures are not an instructor assessment or a substitute for your state handbook.</p>
  </footer>
</section>
<section class="card-group">
  <h2>Turn the sheet into permit-test practice</h2>
  <div class="card-grid">
    <article class="info-card"><span>1. Scan</span><h3>Name the driver action</h3><p>Say stop, yield, merge, slow, watch, or prohibited movement before reading the definition.</p></article>
    <article class="info-card"><span>2. Mark</span><h3>Circle only slow signs</h3><p>A short weak-sign list is more useful than repeatedly studying signs you already recognize.</p></article>
    <article class="info-card"><span>3. Test</span><h3>Use pictures without the labels</h3><p>Use a group link to revisit weak signs. Use the full round for a score out of 40.</p><a class="info-card-link" href="road-signs-practice-test.html?mode=road-signs-core#practice">Start the full 40-question round</a></article>
  </div>
</section>
<section class="card-group">
  <h2>Use this resource with a class or library page</h2>
  <p class="section-intro">This page is designed to be shared as a live, free study link. Students can open it without an account, print their own copy, and move from the reference sheet into picture practice.</p>
  <div class="card-grid">
    <article class="info-card"><span>Share</span><h3>Link to the live page</h3><p>Use the page URL on a class, counseling, driver-education, or library resource list so learners receive the current sheet, source note, and practice links together.</p></article>
    <article class="info-card"><span>Teach</span><h3>Run a 10-minute recall check</h3><p>Have learners cover the meanings, name each sign and driver action, circle slow answers, then open the matching picture quiz instead of rereading every card.</p></article>
    <article class="info-card"><span>Verify</span><h3>Keep state rules authoritative</h3><p>The illustrations support recognition of common U.S. signs. Learners should confirm state-specific laws, wording, and permit-test requirements in their official driver handbook.</p></article>
  </div>
</section>
<section class="classroom-pack-band" id="classroom-worksheet">
  <div>
    <p class="eyebrow">Ready-to-use classroom activity</p>
    <h2>Road signs worksheet and answer key</h2>
    <p>Use the three-page Letter PDF for an independent review, teen program, homeschool lesson, or driver-education warm-up. Students identify eight original sign illustrations, answer eight driver-action questions, and record the next weak area. Page three includes the answer key and a 10-minute teaching plan.</p>
    <ul>
      <li>No student account or email required.</li>
      <li>Original prompts and simplified illustrations.</li>
      <li>Unmodified sharing allowed for noncommercial education with credit.</li>
    </ul>
    <a class="info-card-link" href="#online-worksheet">Use the online worksheet</a>
  </div>
  <div class="classroom-pack-action">
    <span>3-page US Letter PDF</span>
    <strong>Student worksheet + facilitator answer key</strong>
    <a href="dmv-road-signs-classroom-worksheet.pdf" download data-resource-download="dmv_road_signs_classroom_worksheet_pdf">Download classroom pack</a>
  </div>
</section>
{render_online_classroom_worksheet()}
<section class="content-section" id="educational-use-license">
  <h2>Permission for teachers, libraries, and families</h2>
  <p>Teachers, libraries, driving schools, families, and other noncommercial educators may print and share the unmodified PDF for noncommercial educational use when the TestDayTools credit and this page URL remain visible. Do not sell, rebrand, adapt, or include the resource in a paid product, and do not imply endorsement by a DMV or government agency.</p>
  <p>This permission applies only to sharing the unmodified cheat-sheet PDF and classroom worksheet PDF. TestDayTools branding, site code, separate reuse of quiz questions, and separate reuse of the original illustrations are not included. All other rights are reserved.</p>
</section>
{render_material_links()}
{render_material_review()}
{render_sources([
  {"label": "FHWA: Common Uses of Sign Colors, Table 2A-2", "url": "https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2ar1.pdf#page=6"},
  {"label": "FHWA: School warning sign colors, Part 7", "url": "https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/part7r1.pdf#page=4"},
  {"label": "FHWA: Workers sign (W21-1), Figure 6H-1 and section 6H.18", "url": "https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/part6r1.pdf#page=37"},
])}
{render_related(["road-signs-practice-test", "new-york-dmv-road-signs-practice", "dmv-road-sign-flashcards", "road-sign-shapes-and-colors-finder", "regulatory-traffic-signs-practice-test"])}
{render_ad("Future ad")}"""
    canonical = url_for(f"/{ROAD_SIGN_CHEAT_SHEET_SLUG}.html")
    resource_schema = schema(
        ROAD_SIGN_CHEAT_SHEET_PAGE["title"],
        ROAD_SIGN_CHEAT_SHEET_PAGE["description"],
        canonical,
        "LearningResource",
    )
    resource_schema["learningResourceType"] = ["Cheat sheet", "Worksheet", "Answer key"]
    resource_schema["educationalUse"] = ["Study", "Classroom review", "Instruction"]
    resource_schema["license"] = f"{canonical}#educational-use-license"
    resource_schema["usageInfo"] = f"{canonical}#educational-use-license"
    resource_schema["isAccessibleForFree"] = True
    resource_schema["copyrightHolder"] = {"@type": "Organization", "name": SITE["name"]}
    resource_schema["interactivityType"] = "mixed"
    resource_schema["typicalAgeRange"] = "14-18"
    resource_schema["teaches"] = [
        "Recognize common U.S. road signs",
        "Connect road sign shapes and colors to driver actions",
        "Identify signs that need more permit-test practice",
    ]
    resource_link = (
        '  <link rel="alternate" type="application/pdf" '
        'href="dmv-road-signs-classroom-worksheet.pdf" '
        'title="DMV Road Signs Classroom Worksheet and Answer Key">'
    )
    return page_shell(
        ROAD_SIGN_CHEAT_SHEET_PAGE["title"],
        ROAD_SIGN_CHEAT_SHEET_PAGE["description"],
        f"/{ROAD_SIGN_CHEAT_SHEET_SLUG}.html",
        body,
        "tool-page road-sign-cheat-sheet-page",
        [resource_schema, breadcrumb_schema(ROAD_SIGN_CHEAT_SHEET_PAGE["title"], canonical)],
        social_image="assets/dmv-road-signs-cheat-sheet-preview.png",
        extra_head=resource_link + '<link rel="stylesheet" href="assets/road-sign-materials.css">',
    )


def render_road_sign_flashcards_page():
    records = road_sign_flashcard_records()
    filters = []
    seen_filters = set()
    for record in records:
        if record["filter"] not in seen_filters:
            filters.append((record["filter"], record["category"]))
            seen_filters.add(record["filter"])
    filter_options = '<option value="all">All signs</option><option value="review">Saved for review</option>' + "".join(
        f'<option value="{esc(value)}">{esc(label)}</option>'
        for value, label in filters
    )
    cards = []
    for index, record in enumerate(records):
        cards.append(f"""<article class="flashcard{" is-active" if index == 0 else ""}" data-flashcard data-card-id="{esc(record["id"])}" data-card-filter="{esc(record["filter"])}" data-card-query="{esc(record["query"])}" aria-hidden="{"false" if index == 0 else "true"}">
  <div class="flashcard-inner">
    <div class="flashcard-face flashcard-front">
      <span class="flashcard-sign" role="img" aria-label="{esc(record["cue"])}">{SIGN_SVGS.get(record["image"], "")}</span>
    </div>
    <div class="flashcard-face flashcard-back" id="flashcard-answer-{esc(record["id"])}" hidden>
      <span class="flashcard-category">{esc(record["category"])}</span>
      <strong>{esc(record["title"])}</strong>
      <p>{esc(record["meaning"])}</p>
    </div>
  </div>
  <div class="flashcard-card-actions">
    <button type="button" data-flashcard-flip aria-expanded="false" aria-controls="flashcard-answer-{esc(record["id"])}">Reveal answer</button>
    <a href="{esc(record["practice"])}">Practice this group</a>
  </div>
</article>""")
    study_cards = "".join(
        f'<article><span>{esc(label)}</span><strong>{esc(title)}</strong><p>{esc(text)}</p></article>'
        for label, title, text in [
            ("1", "Look at shape first", "Identify whether the card is regulatory, warning, school, service, or work-zone before reading words."),
            ("2", "Say the driver action", "Convert each card into an action such as stop, yield, slow, do not enter, or prepare for a hazard."),
            ("3", "Mark review honestly", "Use Review again for slow cards. The deck keeps counts on this browser."),
            ("4", "Quiz the weak group", "After one pass, open the regulatory quiz first if no-turn, one-way, keep-right, or no-passing cards still feel slow."),
        ]
    )
    body = f"""<section class="hero tool-hero flashcard-hero">
  <div class="tool-hero-grid">
    <div>
      <p class="eyebrow">Road sign flashcards</p>
      <h1>{esc(ROAD_SIGN_FLASHCARDS_PAGE["title"])}</h1>
      <p class="lede">Flip DMV road sign pictures, mark the slow ones, save review cards in this browser, then jump into the matching road-sign practice test.</p>
      {render_last_updated(ROAD_SIGN_FLASHCARDS_PAGE["lastUpdated"])}
      <div class="hero-actions">
        <a href="#flashcards">Start flashcards</a>
        <a href="road-sign-shapes-and-colors-finder.html">Shapes and colors</a>
        <a href="road-signs-practice-test.html#practice">Road signs quiz</a>
        <a href="regulatory-traffic-signs-practice-test.html#practice">Regulatory quiz</a>
      </div>
    </div>
    <aside class="tool-hero-panel flashcard-hero-panel" aria-label="Flashcard preview">
      <div class="panel-status"><span>Free deck</span><strong>{len(records)} visual cards</strong></div>
      <div class="flashcard-mini-stack">
        {''.join(f'<div class="mini-flash-sign" role="img" aria-label="{esc(record["title"])}">{SIGN_SVGS.get(record["image"], "")}</div>' for record in records[:4])}
      </div>
      <p class="panel-source">Best first pass: stop, yield, do not enter, wrong way, one-way, no-turn, keep-right, school, and work-zone signs. No signup needed.</p>
    </aside>
  </div>
</section>
<section class="notice"><strong>Unofficial study deck.</strong> {esc(SITE["disclaimer"])}</section>
<section class="task-console" aria-label="Flashcard study loop">
  <div class="tool-section-head">
    <span class="eyebrow">Study loop</span>
    <h2>Turn recognition into a driver action</h2>
    <p class="section-intro">Road-sign flashcards are useful only if they lead to decisions. Use each card to name the sign family and the safest legal action.</p>
  </div>
  <div class="task-console-grid">{study_cards}</div>
</section>
<section class="content-section">
  <h2>Regulatory cards learners should not skip</h2>
  <p>Compare STOP by itself with STOP over a red ALL WAY plaque. Both require you to stop; only the added plaque tells you that every approach stops. For signs such as No Right Turn or Do Not Enter, practice naming the restricted movement as well as the sign.</p>
</section>
<section class="content-section">
  <h2>Traffic signs flashcards vs a practice test</h2>
  <p>Use flashcards when the sign still feels slow. Use the practice test when you can name the sign but need to choose the safest driver action under answer-choice pressure. A good loop is flashcard first, image quiz second, then review only the cards you missed.</p>
</section>
<section class="flashcard-tool" id="flashcards" data-road-sign-flashcards>
  <div class="tool-section-head">
    <span class="eyebrow">Interactive deck</span>
    <h2>Study DMV road signs with saved review cards</h2>
    <p class="section-intro">Name the sign and say the driver action before checking the answer. Saved for review keeps the cards you want to revisit on this device.</p>
  </div>
  <div class="flashcard-controls">
    <label>Sign group <select data-flashcard-filter>{filter_options}</select></label>
    <label>Search cards <input type="search" placeholder="Try stop, yield, merge, school, hospital..." data-flashcard-search></label>
    <button type="button" data-flashcard-reset disabled>Clear saved marks</button>
  </div>
  <dialog class="flashcard-reset-dialog" data-flashcard-reset-dialog aria-labelledby="flashcard-reset-title" aria-describedby="flashcard-reset-copy">
    <h3 id="flashcard-reset-title">Clear all saved marks?</h3>
    <p id="flashcard-reset-copy">This removes Known and Review marks for every sign group in this browser. Quiz scores and the mistake log are not affected.</p>
    <form method="dialog">
      <button value="keep" autofocus>Keep my marks</button>
      <button value="clear">Clear all marks</button>
    </form>
  </dialog>
  <div class="flashcard-status" aria-live="polite">
    <div><span>Card</span><strong data-flashcard-position>1 of {len(records)}</strong></div>
    <div><span>Know</span><strong data-flashcard-known>0</strong></div>
    <div><span>Review</span><strong data-flashcard-review>0</strong></div>
    <div><span>Visible</span><strong data-flashcard-visible>{len(records)}</strong></div>
  </div>
  <div class="flashcard-stage" id="missed-sign-cards">
    <div class="flashcard-missed-summary" data-flashcard-missed-summary hidden>
      <p data-flashcard-missed-note role="status"></p>
      <div><a data-flashcard-missed-return hidden>Retry saved questions from this mode</a><a href="#flashcards">Change sign group</a></div>
    </div>
    {"".join(cards)}
  </div>
  <div class="flashcard-announcement" data-flashcard-announcement role="status"></div>
  <p class="flashcard-empty" data-flashcard-empty hidden>No cards match this filter yet.</p>
  <div class="flashcard-actions">
    <button type="button" data-flashcard-prev>Previous</button>
    <button type="button" data-flashcard-review-button disabled>Review again</button>
    <button type="button" data-flashcard-known-button disabled>I know this</button>
    <button type="button" data-flashcard-next>Next</button>
  </div>
  <p class="flashcard-next-step" data-flashcard-message></p>
  <noscript><p><a href="dmv-road-signs-cheat-sheet.html#printable-sheet">Open the printable reference with sign names and actions</a></p></noscript>
</section>
<section class="hub-primary">
  <h2>Move from flashcards into practice</h2>
  <div class="hub-action-grid">
    <a class="hub-action" href="road-signs-practice-test.html#practice"><span>Image quiz</span><strong>Road Signs Practice Test</strong><p>Use this after the flashcards feel familiar.</p></a>
    <a class="hub-action" href="regulatory-traffic-signs-practice-test.html#practice"><span>Rules</span><strong>Regulatory Traffic Signs Practice</strong><p>Use this if stop, yield, one way, speed, no entry, or no turn cards still feel slow.</p></a>
    <a class="hub-action" href="road-sign-shapes-and-colors-finder.html"><span>Lookup</span><strong>Shapes and Colors Finder</strong><p>Use this when you remember the color or shape but not the meaning.</p></a>
  </div>
</section>
{render_faq([
  {"q": "Are these official DMV flashcards?", "a": "No. These are original study flashcards from TestDayTools. Use them for practice, then confirm exact wording with your state driver handbook."},
  {"q": "Should I use flashcards before practice tests?", "a": "Flashcards are useful for recognition. After one pass, use the image quiz so you practice choosing the correct driver action under test-style pressure."},
  {"q": "Are traffic signs flashcards enough for a permit test?", "a": "No. Flashcards help with recognition, but permit tests often ask for the driver action. After flashcards, use an image-based road signs practice test and review missed categories."},
  {"q": "What does the flashcard deck save or share?", "a": "Which cards you mark as known or for review is saved in this browser, without an account or sync. Google Analytics may receive which button you pressed, the selected group, and the number of cards shown. That event does not include the particular card or what you typed in Search cards."},
  {"q": "Which signs should I review first?", "a": "Start with regulatory signs such as stop, yield, do not enter, wrong way, one way, speed limit, no U-turn, and no passing because they often map directly to legal driver actions."},
])}
{render_related(["dmv-road-signs-cheat-sheet", "road-signs-practice-test", "regulatory-traffic-signs-practice-test", "road-sign-shapes-and-colors-finder", "dmv-permit-test-requirements-by-state"])}
{render_ad("Future ad")}"""
    return page_shell(
        ROAD_SIGN_FLASHCARDS_PAGE["title"],
        ROAD_SIGN_FLASHCARDS_PAGE["description"],
        f"/{ROAD_SIGN_FLASHCARDS_SLUG}.html",
        body,
        "tool-page flashcard-page",
        page_schema(ROAD_SIGN_FLASHCARDS_PAGE["title"], ROAD_SIGN_FLASHCARDS_PAGE["description"], url_for(f"/{ROAD_SIGN_FLASHCARDS_SLUG}.html"), "LearningResource"),
    )


def render_dmv_daily_question_page():
    records = dmv_daily_question_records()
    cards = []
    for index, record in enumerate(records):
        visual = ""
        if record.get("image") in SIGN_SVGS:
            visual = f"""<figure class="daily-question-visual">
  <div class="sign-art" role="img" aria-label="{esc(record["imageAlt"])}">{SIGN_SVGS[record["image"]]}</div>
  <figcaption>Read the image first, then choose the safest meaning or driver action.</figcaption>
</figure>"""
        choices = "".join(
            f'<button type="button" data-daily-choice="{choice_index}">{esc(choice)}</button>'
            for choice_index, choice in enumerate(record.get("choices", []))
        )
        visual_html = f"  {visual}\n" if visual else ""
        source = record["source"]
        source_link = (
            f'\n  <p data-daily-source hidden><a href="{esc(source["url"])}" target="_blank" rel="noopener noreferrer">{esc(source["label"])}</a></p>'
            if source else ""
        )
        external = ' target="_blank" rel="noopener noreferrer"' if is_external_url(record["practice"]) else ""
        cards.append(f"""<article class="daily-question-card{" is-active" if index == 0 else ""}" data-daily-card data-state="{esc(record["state"])}" data-state-label="{esc(record["stateLabel"])}" data-category="{esc(record["category"])}" data-answer="{esc(record["answer"])}" data-practice-url="{esc(record["practice"])}" {"hidden" if index else ""}>
  <div class="daily-question-meta">
    <span>{esc(record["stateLabel"])}</span>
    <strong>{esc(record["category"])}</strong>
  </div>
{visual_html}  <h3>{esc(record["q"])}</h3>
  <div class="daily-choice-grid">{choices}</div>
  <p class="daily-question-feedback" data-daily-feedback aria-live="polite"></p>
  <p class="daily-question-explanation" data-daily-explanation hidden>{esc(record["explanation"])}</p>{source_link}
  <a href="{esc(record["practice"])}" data-daily-practice{external}>{esc(record["practiceLabel"])}</a>
</article>""")
    cards_html = "".join(cards)
    state_options = """<option value="all">National mix</option>
<option value="california">California</option>
<option value="new-york">New York</option>
<option value="texas">Texas</option>
<option value="florida">Florida</option>
<option value="illinois">Illinois</option>
<option value="pennsylvania">Pennsylvania</option>
<option value="new-jersey">New Jersey</option>"""
    faq = render_faq([
        {
            "q": "Is the DMV question of the day official?",
            "a": "No. The questions are original TestDayTools study prompts. Use the linked state source and driver handbook for final rules.",
        },
        {
            "q": "Does the daily DMV question repeat?",
            "a": "The page rotates through a small bank of original practice prompts. Use Show another if you want a second question immediately.",
        },
        {
            "q": "Should I use one daily question instead of a practice test?",
            "a": "No. A daily question is a warm-up. Use the full state practice page, road-sign drill, passing-score calculator, and checklist before test day.",
        },
    ])
    body = f"""<section class="hero tool-hero">
  <div>
    <p class="eyebrow">DMV question of the day</p>
    <h1>DMV permit test question of the day.</h1>
      <p class="lede">Answer one DMV practice question, then use the explanation to open a matching drill or check the rule that applies.</p>
    {render_last_updated()}
    <div class="hero-actions">
      <a href="#daily-question">Answer today</a>
      <a href="dmv-permit-test-study-plan.html">Study plan</a>
      <a href="road-signs-practice-test.html">Road signs</a>
      <a href="dmv-permit-test-passing-score-calculator.html">Passing score</a>
      <a href="dmv-test-day-checklist.html">Checklist</a>
    </div>
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
<section class="trust-strip">
  <div><span>Daily use</span><strong>One quick question</strong></div>
  <div><span>Question bank</span><strong>{len(records)} rotating prompts</strong></div>
  <div><span>Includes</span><strong>Rules and road signs</strong></div>
  <div><span>Updated</span><strong>{esc(SITE["lastUpdated"])}</strong></div>
</section>
<section class="daily-question-tool tool-block" id="daily-question" data-dmv-daily-question>
  <div class="tool-section-head">
    <span class="eyebrow">Daily warm-up</span>
    <h2>Answer today&apos;s DMV permit-test question</h2>
    <p class="section-intro">Use the national mix for common road signs, or choose your state for local rules and practice.</p>
  </div>
  <div class="daily-question-controls">
    <label>State focus <select data-daily-state>{state_options}</select></label>
    <div>
      <span data-daily-date>Today&apos;s question</span>
      <strong data-daily-title>National sign warm-up</strong>
      <p data-daily-note>One fast check before a full practice round.</p>
    </div>
    <button type="button" data-daily-next>Show another</button>
  </div>
  <div class="daily-question-stage">{cards_html}</div>
</section>
<section class="content-section">
  <h2>How to use a daily DMV question</h2>
  <p>Use the question as a quick readiness signal. If you miss it or need too long, open the matching full practice page instead of guessing through more random questions.</p>
</section>
<section class="content-section">
  <h2>What to do after the question</h2>
  <p>Move from the daily prompt into a real sequence: official source, state practice, road signs, score check, and final checklist. That path is more useful than a one-question streak.</p>
</section>
{faq}
{render_related(["dmv-permit-test-mistake-log", "dmv-permit-test-study-plan", "road-signs-practice-test", "regulatory-traffic-signs-practice-test", "dmv-permit-test-passing-score-calculator", "dmv-test-day-checklist"])}"""
    return page_shell(
        DMV_DAILY_PAGE["title"],
        DMV_DAILY_PAGE["description"],
        f"/{DMV_DAILY_SLUG}.html",
        body,
        "tool-page daily-question-page",
        page_schema(DMV_DAILY_PAGE["title"], DMV_DAILY_PAGE["description"], url_for(f"/{DMV_DAILY_SLUG}.html"), "LearningResource"),
    )


def render_dmv_mistake_log_page():
    records = dmv_score_records()
    default = next((item for item in records if item["value"] == "florida"), records[0] if records else {})
    options = []
    for item in records:
        mixed = item["mixedPracticeUrl"]
        permit = find_dmv_permit_tool_for_state(item) if mixed else None
        mode = next((mode for mode in (permit or {}).get("quizModes", []) if mode["id"] == "mock"), None)
        right_of_way = ""
        if mode and any(q.get("category") == "Right of way" for q in quiz_questions(mode["quiz"], mode)):
            right_of_way = f'{mixed.partition("#")[0]}&focus={quote("Right of way")}#practice'
        local_case = f'#right-of-way-{item["value"]}' if item["value"] in {"texas", "illinois"} else ""
        options.append(
            f'<option value="{esc(item["value"])}" data-state-label="{esc(item["label"])}" '
            f'data-source-url="{esc(item["manualUrl"])}" data-right-of-way-case="{esc(local_case)}" '
            f'data-practice-url="{esc(item["permitUrl"])}" data-mixed-url="{esc(mixed)}" '
            f'data-right-of-way-url="{esc(right_of_way)}" data-score-url="{esc(item["scoreUrl"])}" '
            f'data-signs-url="{esc(item["signUrl"])}" data-checklist-url="{esc(item["checklistUrl"])}" '
            f'data-rule="{esc(item["rule"])}" {"selected" if item["value"] == default.get("value") else ""}>{esc(item["label"])}</option>'
        )
    sign_drills = {
        "wrong-way-entry": ("Practice entry-control signs", "regulatory-traffic-signs-practice-test", "Prohibited entry signs"),
        "one-way-lane-direction": ("Practice direction signs", "regulatory-traffic-signs-practice-test", "Lane and direction signs"),
        "school-pedestrian-crossing": ("Practice crossing signs", ROAD_SIGN_PICTURE_SLUG, "School and pedestrian signs"),
    }
    topic_review = {
        key: (label, f"{slug}.html?focus={quote(focus)}#practice")
        for key, (label, slug, focus) in sign_drills.items()
    }
    topic_review["speed-advisory-speed"] = ("Compare posted and advisory speeds", "#speed-sign-decision")
    topic_options = [
        ("wrong-way-entry", "Wrong-way entry"),
        ("one-way-lane-direction", "One-way or lane direction"),
        ("right-of-way", "Right-of-way rules"),
        ("school-pedestrian-crossing", "School or pedestrian crossing"),
        ("speed-advisory-speed", "Speed limit or advisory speed"),
        ("course-exam-permit", "Course, exam, or permit step"),
        ("documents-appointment", "Documents or appointment confusion"),
        ("score", "Passing score or miss limit"),
        ("other", "Other missed topic"),
    ]
    topics = "".join(
        f'<option value="{esc(value)}" data-review-href="{esc(topic_review[value][1])}" data-review-label="{esc(topic_review[value][0])}">{esc(label)}</option>'
        if value in topic_review else f'<option value="{esc(value)}">{esc(label)}</option>'
        for value, label in topic_options
    )
    body = f"""<section class="hero tool-hero">
  <div>
    <p class="eyebrow">DMV mistake log</p>
    <h1>DMV permit test mistake log.</h1>
    <p class="lede">Save missed permit-test questions by state and weak area, then turn the list into a focused review path instead of repeating random questions.</p>
    {render_last_updated()}
    <div class="hero-actions">
      <a href="#mistake-log">Open log</a>
      <a href="dmv-permit-test-question-of-the-day.html">Daily question</a>
      <a href="dmv-permit-test-study-plan.html">Study plan</a>
      <a href="road-signs-practice-test.html">Road signs</a>
      <a href="dmv-permit-test-passing-score-calculator.html">Passing score</a>
      <a href="dmv-test-day-checklist.html">Checklist</a>
    </div>
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
<section class="trust-strip">
  <div><span>Storage</span><strong>Saved in this browser</strong></div>
  <div><span>Coverage</span><strong>{len(records)} state paths</strong></div>
  <div><span>Use after</span><strong>Practice or daily question</strong></div>
  <div><span>Updated</span><strong>{esc(SITE["lastUpdated"])}</strong></div>
</section>
<section class="mistake-log-tool tool-block" id="mistake-log" data-dmv-mistake-log>
  <div class="tool-section-head">
    <span class="eyebrow">Weak-area tracker</span>
    <h2>Save the question you missed</h2>
    <p class="section-intro">Log only mistakes that reveal a pattern. The useful output is the next review action, not a long list.</p>
  </div>
  <div class="mistake-log-grid">
    <form class="mistake-log-form" data-mistake-form>
      <label>State <select data-mistake-state>{''.join(options)}</select></label>
      <label>Weak area <select data-mistake-topic>{topics}</select></label>
      <label>Missed question or cue <input type="text" data-mistake-prompt placeholder="Example: Wrong Way sign, one-way arrow, advisory speed, permit appointment..."></label>
      <label>Correct rule or fix <textarea data-mistake-fix rows="4" placeholder="Write the rule, sign meaning, or habit to remember next time."></textarea></label>
      <div class="mistake-log-buttons">
        <button type="submit">Save mistake</button>
        <button type="button" data-mistake-copy>Copy review plan</button>
      </div>
    </form>
    <aside class="mistake-log-summary">
      <article><span>Total saved</span><strong data-mistake-total>0</strong><p>Keep the list short and current.</p></article>
      <article><span data-mistake-top-label>Top {esc(default.get("label", "Florida"))} weak area</span><strong data-mistake-top-topic>None yet</strong><p data-mistake-next>Save a mistake to get a next action.</p></article>
      <article><span>Selected state</span><strong data-mistake-state-label>{esc(default.get("label", "Florida"))}</strong><p data-mistake-rule>{esc(default.get("rule", "Confirm with official source"))}</p></article>
      <div class="mistake-log-actions">
        <a href="{esc(default.get("manualUrl", "#"))}" target="_blank" rel="noopener" data-mistake-source>Official source</a>
        <a href="{esc(default.get("mixedPracticeUrl") or "dmv-practice.html")}" data-mistake-practice>Open Florida mixed practice</a>
        <a href="{esc(default.get("signUrl", "road-signs-practice-test.html"))}" data-mistake-signs>Signs</a>
        <a href="dmv-permit-test-study-plan.html?state=florida#study-plan" data-mistake-plan>Study plan</a>
        <a href="{esc(default.get("checklistUrl", "dmv-test-day-checklist.html"))}" data-mistake-checklist>Checklist</a>
      </div>
    </aside>
  </div>
  <div class="mistake-log-list" data-mistake-list>
    <p>No saved mistakes yet. Add one missed question or weak topic above.</p>
  </div>
</section>
<section class="content-section">
  <h2>How to use a DMV mistake log</h2>
  <p>After each short practice round, save only the questions that show a repeatable weak area: wrong-way entry, one-way or lane direction, right-of-way, crossing signs, speed/advisory speed, documents, or score margin. Then practice the weakest area before taking another full round.</p>
</section>
<section class="content-section">
  <h2>What to review first</h2>
  <p>If the missed item is a sign-control problem, use the road-sign page and review the visual cue that caused the miss. If it is a rule, retake state practice. If it is a documents or appointment issue, open the checklist and official source before test day.</p>
</section>
<section class="card-group">
  <h2>Turn common misses into the next drill</h2>
  <p class="section-intro">Use the log as a routing tool. The point is to stop repeating full quizzes when one specific confusion is doing the damage.</p>
  <div class="card-grid">
    <article class="info-card"><span>Wrong-way entry</span><h3>Review red entry-control signs</h3><p>Do Not Enter tells you not to enter. Wrong Way tells you a movement has already put you against traffic. Practice choosing the correct action for each.</p><a class="info-card-link" href="{esc(topic_review['wrong-way-entry'][1])}">Entry-control drill</a></article>
    <article class="info-card"><span>One-way or lane direction</span><h3>Separate road direction from lane movement</h3><p>One Way controls the road. Lane arrows control what your lane can do. Save these misses together so the next drill focuses on arrows and permitted turns.</p><a class="info-card-link" href="{esc(topic_review['one-way-lane-direction'][1])}">Direction drill</a></article>
    <article class="info-card"><span>Right-of-way</span><h3>Move from sign cue to driver order</h3><p>If the miss is about who goes first, the next drill should be state practice, not another sign-only round.</p><a class="info-card-link" href="dmv-practice.html#state-paths">State practice</a></article>
    <article class="info-card"><span>Course, exam, permit</span><h3>Map the process before the visit</h3><p>If the miss is about TLSAE, the Class E exam, online testing, documents, or first issuance, switch from practice questions to the process map.</p><a class="info-card-link" href="florida-class-e-knowledge-exam-tlsae.html">Florida Class E map</a></article>
    <article class="info-card"><span>Documents or appointment</span><h3>Use official documents before scheduling</h3><p>A high practice score does not solve identity, Social Security number, address, parent forms, fees, appointment, or local service-center steps.</p><a class="info-card-link" href="dmv-test-day-checklist.html?state=florida#dmv-checklist">Checklist</a></article>
  </div>
</section>
<section class="content-section" id="speed-sign-decision" aria-labelledby="speed-sign-decision-heading">
  <h2 id="speed-sign-decision-heading">Same number, different speed decision</h2>
  <p>Two drivers see 35. One sees a white rectangle reading <strong>SPEED LIMIT 35</strong>. The other sees a yellow <strong>35 MPH</strong> plaque under a curve warning. Which sign sets the posted legal limit, and when should the second driver slow down?</p>
  <details>
    <summary>Check the decision</summary>
    <p>The white sign sets the posted maximum for that segment, not a speed you must reach. The yellow plaque advises a speed for the curve ahead; it does not replace the posted limit. Slow before entering the curve, and go slower than the advice if rain, traction, or visibility calls for it.</p>
    <p><strong>Check yourself:</strong> If the same curve has both a posted limit and a lower advisory speed, do not use the higher number as your target for the curve.</p>
  </details>
  <p>FHWA sign references: <a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2br1.pdf">R2-1 speed limit sign</a> and <a href="https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2cr1.pdf">W13-1P advisory speed plaque</a>.</p>
  <p>{speed_sign_comparison_link()}</p>
</section>
<section class="content-section" id="right-of-way-texas" aria-labelledby="right-of-way-texas-heading">
  <h2 id="right-of-way-texas-heading">Texas: a two-lane road meets a divided highway</h2>
  <p>You're on a two-lane road. There is no signal, stop sign, or yield sign where it meets a divided highway. A vehicle on the highway is close enough that entering would cut it off. Can you cross because there is no sign?</p>
  <details>
    <summary>Check the decision</summary>
    <p><strong>No. Stop and yield to the highway vehicle.</strong> The absence of a sign does not give the narrower road priority. Wait until you can enter or cross without interfering with traffic on the highway. If there is a traffic-control device, follow it instead of assuming this example applies.</p>
  </details>
  <p><a href="https://statutes.capitol.texas.gov/?artSec=545.151&amp;chapter=TN.545&amp;code=TN&amp;tab=1">Texas Transportation Code &sect;545.151</a> &middot; <a href="https://www.dps.texas.gov/Internetforms/Forms/DL-7.pdf">Texas Driver Handbook, Chapter 4</a></p>
</section>
<section class="content-section" id="right-of-way-illinois" aria-labelledby="right-of-way-illinois-heading">
  <h2 id="right-of-way-illinois-heading">Illinois: two vehicles arrive at about the same time</h2>
  <p>You and another driver approach from different roads at about the same time. Neither road has priority and there are no traffic controls. The other driver is to your right. Who yields?</p>
  <details>
    <summary>Check the decision</summary>
    <p><strong>You yield to the driver on your right.</strong> That is the tie rule in this example. Do not treat it as a universal rule for every intersection: a through highway or traffic-control device can change the answer. Even when it is your turn, enter only when the way is clear.</p>
  </details>
  <p><a href="https://www.ilga.gov/documents/legislation/ilcs/documents/062500050K11-901.htm">Illinois Vehicle Code &sect;11-901</a> &middot; <a href="https://www.ilsos.gov/content/dam/publications/pdf_publications/dsd_a112.pdf#page=29">Illinois Rules of the Road, Right of Way</a></p>
</section>
{render_related(["florida-class-e-knowledge-exam-tlsae", "florida-dmv-permit-documents-checklist", "florida-dmv-permit-practice-test", "florida-dmv-road-signs-practice", "dmv-permit-test-question-of-the-day", "dmv-permit-test-study-plan", "dmv-permit-test-passing-score-calculator", "dmv-test-day-checklist", "road-signs-practice-test", "dmv-road-sign-flashcards"])}"""
    return page_shell(
        DMV_MISTAKE_LOG_PAGE["title"],
        DMV_MISTAKE_LOG_PAGE["description"],
        f"/{DMV_MISTAKE_LOG_SLUG}.html",
        body,
        "tool-page mistake-log-page",
        page_schema(DMV_MISTAKE_LOG_PAGE["title"], DMV_MISTAKE_LOG_PAGE["description"], url_for(f"/{DMV_MISTAKE_LOG_SLUG}.html"), "LearningResource"),
    )


def render_dmv_study_plan_page():
    records = dmv_score_records()
    if not records:
        return page_shell(
            DMV_STUDY_PLAN_PAGE["title"],
            DMV_STUDY_PLAN_PAGE["description"],
            f"/{DMV_STUDY_PLAN_SLUG}.html",
            "<section class=\"content-section\"><h1>DMV permit test study plan</h1><p>State data is not available yet.</p></section>",
            "tool-page study-plan-page",
        )
    default = next((item for item in records if item["value"] == "florida"), records[0])
    baseline_href = "road-signs-practice-test.html?mode=road-signs-starter#practice"
    def score_href(item):
        return f'{DMV_SCORE_SLUG}.html?state={item["value"]}#score-calculator'

    options = "".join(
        f'<option value="{esc(item["value"])}" '
        f'data-state="{esc(item["label"])}" '
        f'data-agency="{esc(item["agency"])}" '
        f'data-rule="{esc(item["rule"])}" '
        f'data-sign-total="{esc(item["sectionQuestions"])}" '
        f'data-sign-correct="{esc(item["sectionCorrect"])}" '
        f'data-sign-included="{str(item["sectionIncluded"]).lower()}" '
        f'data-source-url="{esc(item["manualUrl"])}" '
        f'data-mixed-practice-url="{esc(item["mixedPracticeUrl"])}" '
        f'data-signs-url="{esc(item["signUrl"])}" '
        f'data-checklist-url="{esc(item["checklistUrl"])}" '
        f'data-score-url="{esc(score_href(item))}" '
        f'{"selected" if item["value"] == default["value"] else ""}>{esc(item["label"])}</option>'
        for item in records
    )
    source_links = "".join(
        f'<li><a href="{esc(item["manualUrl"])}" target="_blank" rel="noopener">{esc(item["label"])}: {esc(item["manualLabel"])}</a></li>'
        for item in records
    )
    state_rows = "".join(
        f"""<tr data-score-row data-state-name="{esc((item["label"] + " " + item["agency"] + " " + item["rule"]).lower())}">
  <th scope="row">{esc(item["label"])}</th>
  <td>{esc(item["rule"])}</td>
  <td>{f'<a href="{esc(item["mixedPracticeUrl"])}">Open mixed set</a>' if item["mixedPracticeUrl"] else 'Not offered here'}</td>
  <td><a href="{esc(item["signUrl"])}">Signs</a></td>
  <td><a href="{esc(item["checklistUrl"])}">Checklist</a></td>
</tr>"""
        for item in records
    )
    faq = render_faq([
        {
            "q": "How long should I study for the DMV permit test?",
            "a": "It depends on your current score and state rules. With three days, take a short baseline, repair one weak area, then retest and check documents. With 14 or 21 days, add a delayed review before retesting.",
        },
        {
            "q": "What should I study first for the DMV permit test?",
            "a": "Check the official appointment and document requirements on day one, then use a short baseline to find a weak area. Check the visit details again on the final study day.",
        },
        {
            "q": "Is this an official DMV study plan?",
            "a": "No. It is an independent planning tool from TestDayTools. Use the linked DMV, DPS, MVC, PennDOT, FLHSMV, or Secretary of State source for final rules.",
        },
    ])
    body = f"""<section class="hero tool-hero">
  <div>
    <p class="eyebrow">DMV study plan builder</p>
    <h1>DMV permit test study plan by state.</h1>
    <p class="lede">Choose your state, days left, and weakest area to build a practical DMV permit-test plan with official-source, practice, road-sign, score, and checklist links.</p>
    {render_last_updated(DMV_STUDY_PLAN_PAGE["lastUpdated"])}
    <div class="hero-actions">
      <a href="#study-plan">Build plan</a>
      <a href="dmv-permit-test-requirements-by-state.html">Requirements</a>
      <a href="dmv-permit-test-passing-score-calculator.html">Passing score</a>
      <a href="road-signs-practice-test.html">Road signs</a>
      <a href="dmv-test-day-checklist.html">Checklist</a>
    </div>
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
<section class="trust-strip">
  <div><span>Planner</span><strong>3 to 21 days</strong></div>
  <div><span>Coverage</span><strong>{len(records)} state paths</strong></div>
  <div><span>Best use</span><strong>What to do next</strong></div>
  <div><span>Updated</span><strong>{esc(DMV_STUDY_PLAN_PAGE["lastUpdated"])}</strong></div>
</section>
<section class="study-plan-tool tool-block" id="study-plan" data-dmv-study-plan data-study-baseline-href="{esc(baseline_href)}">
  <div class="tool-section-head">
    <span class="eyebrow">Plan builder</span>
    <h2>Build your DMV study plan</h2>
    <p class="section-intro">Use this as a study sequence, not an official guarantee. The official state source should control final requirements and wording.</p>
  </div>
  <div class="study-plan-controls">
    <label>State <select data-study-state>{options}</select></label>
    <label>Study days available <select data-study-days>
      <option value="3">3 days</option>
      <option value="7" selected>7 days</option>
      <option value="14">14 days</option>
      <option value="21">21 days</option>
    </select></label>
    <label>Weakest area <select data-study-weak>
      <option value="mixed">Not sure yet</option>
      <option value="road-signs">Road signs</option>
      <option value="rules">Rules and right-of-way</option>
      <option value="score">Passing score confidence</option>
      <option value="documents">Documents and test-day logistics</option>
    </select></label>
  </div>
  <div class="study-plan-summary">
    <article><span data-study-agency>{esc(default["agency"])}</span><strong data-study-rule>{esc(default["rule"])}</strong><p>Confirm exact wording with the official state source.</p></article>
    <article><span>Day-one baseline</span><strong>10 sign questions</strong><p>A short diagnostic, not a state exam score.</p></article>
    <article><span>Review focus</span><strong data-study-focus-label>Choose from your misses</strong><p>Work on one repeat mistake before adding more questions.</p></article>
    <article><span>Final checkpoint</span><strong data-study-checkpoint>Day 7: final checklist</strong><p>Recheck visit details on the last study day.</p></article>
  </div>
  <div class="study-plan-actions">
    <a href="{esc(default["manualUrl"])}" target="_blank" rel="noopener" data-study-source>Official source</a>
    <a href="{esc(default["mixedPracticeUrl"])}" data-study-practice{' hidden' if not default["mixedPracticeUrl"] else ''}>Mixed practice</a>
    <a href="{esc(default["signUrl"])}" data-study-signs>Road signs</a>
    <a href="{esc(default["checklistUrl"])}" data-study-checklist>Checklist</a>
    <a href="{esc(score_href(default))}" data-study-score>Passing score</a>
  </div>
  <ol class="study-plan-list" data-study-plan-list>
    <li><strong>Day 1: Check logistics and take a baseline.</strong><span>Confirm appointment and document requirements, then write down one mistake from a short sign round.</span><a href="{esc(baseline_href)}">Start 10 sign questions</a></li>
    <li><strong>Days 2-4: Repair one weak area.</strong><span>Explain what the sign or rule means, then re-answer the question without notes.</span></li>
    <li><strong>Days 5-6: Recheck the score.</strong><span>Repeat the same 10 signs to check recall. Keep that score separate from any full exam.</span><div class="study-plan-actions"><a href="{esc(baseline_href)}">Repeat the 10-sign baseline</a><a href="{esc(score_href(default))}">Compare with state rule</a></div></li>
    <li><strong>Day 7: Close the remaining gaps.</strong><span>Review remaining missed items and recheck documents, appointment and arrival details.</span></li>
  </ol>
</section>
<section class="content-section">
  <h2>Worked example: seven days with confusing signs</h2>
  <p>Suppose your first sign round is 6 of 10 and two misses are Merge and Lane Ends. Write down what changes in each picture and explain whether your lane disappears. Compare the signs, then come back the next day and answer again without labels. If you still hesitate, keep that pair on the review list.</p>
  <p>Later in the week, compare your new score on the same 10-question set with the original 6 of 10. Keep that comparison separate from your state's knowledge-test rule: a short sign round cannot tell you whether you meet the full test requirements.</p>
  <a href="road-sign-learning-loop.html?concept=merge-lane-ends#learning-loop">Practice Merge vs. Lane Ends</a>
</section>
<section class="source-matrix requirements-table" id="state-study-links" data-state-filter-scope>
  <div class="section-head-row">
    <div>
      <span class="eyebrow">State paths</span>
      <h3>Study-plan links by state</h3>
    </div>
    <div class="state-filter compact-filter">
      <label for="study-state-filter">Filter table</label>
      <input id="study-state-filter" type="search" placeholder="Type Florida, New York, 80%..." data-state-filter>
    </div>
  </div>
  <div class="source-matrix-scroll">
    <table>
      <thead><tr><th>State</th><th>Passing rule</th><th>Mixed practice</th><th>Signs</th><th>Checklist</th></tr></thead>
      <tbody>{state_rows}</tbody>
    </table>
  </div>
  <p class="state-filter-empty" data-state-empty hidden>No matching state plan yet.</p>
</section>
<section class="sources">
  <h2>Official state sources</h2>
  <ul>{source_links}</ul>
</section>
{faq}
{render_related(["florida-class-e-knowledge-exam-tlsae", "florida-dmv-permit-documents-checklist", "florida-dmv-permit-practice-test", "florida-dmv-road-signs-practice", "dmv-permit-test-mistake-log", "dmv-permit-test-question-of-the-day", "dmv-permit-test-passing-score-calculator", "dmv-permit-test-requirements-by-state", "dmv-road-sign-flashcards", "road-signs-practice-test", "dmv-test-day-checklist"])}"""
    return page_shell(
        DMV_STUDY_PLAN_PAGE["title"],
        DMV_STUDY_PLAN_PAGE["description"],
        f"/{DMV_STUDY_PLAN_SLUG}.html",
        body,
        "tool-page study-plan-page",
        page_schema(DMV_STUDY_PLAN_PAGE["title"], DMV_STUDY_PLAN_PAGE["description"], url_for(f"/{DMV_STUDY_PLAN_SLUG}.html"), "LearningResource"),
    )


def render_dmv_requirements_finder():
    records = dmv_requirement_records()
    if not records:
        return ""
    options = "".join(
        f'<option value="{esc(item["value"])}" '
        f'data-agency="{esc(item["agency"])}" '
        f'data-format="{esc(item["format"])}" '
        f'data-format-text="{esc(item["formatText"])}" '
        f'data-pass="{esc(item["passRule"])}" '
        f'data-pass-text="{esc(item["passText"])}" '
        f'data-source="{esc(item["source"])}" '
        f'data-source-url="{esc(item["manualUrl"])}" '
        f'data-source-label="{esc(item["manualLabel"])}" '
        f'data-documents="{esc(item["documents"])}" '
        f'data-focus="{esc(item["focus"])}" '
        f'data-practice-target="{esc(item["practiceTarget"])}" '
        f'data-mixed-practice-url="{esc(item["mixedPracticeUrl"])}" '
        f'data-sign-url="{esc(item["signUrl"])}" '
        f'data-checklist-url="{esc(item["checklistUrl"])}" '
        f'data-score-url="{esc(item["scoreUrl"])}">{esc(item["label"])}</option>'
        for item in records
    )
    rows = []
    for item in records:
        next_links = ""
        if item["mixedPracticeUrl"]:
            next_links = f'<a href="{esc(item["mixedPracticeUrl"])}" data-dmv-state-link data-dmv-state="{esc(item["label"])}" data-dmv-path="practice">Mixed practice</a> '
        next_links += f'<a href="{esc(item["signUrl"])}" data-dmv-state-link data-dmv-state="{esc(item["label"])}" data-dmv-path="road_signs">Road signs</a>'
        next_links += f' <a href="{esc(item["checklistUrl"])}" data-dmv-state-link data-dmv-state="{esc(item["label"])}" data-dmv-path="checklist">Checklist</a>'
        next_links += f' <a href="{esc(item["scoreUrl"])}" data-dmv-state-link data-dmv-state="{esc(item["label"])}" data-dmv-path="score">Score check</a>'
        rows.append(f"""<tr data-requirements-row data-state-name="{esc((item["label"] + " " + item["agency"] + " " + item["format"] + " " + item["passRule"]).lower())}">
  <th scope="row">{esc(item["label"])}</th>
  <td>{esc(item["agency"])}</td>
  <td><a href="{esc(item["manualUrl"])}" target="_blank" rel="noopener">{esc(item["manualLabel"])}</a></td>
  <td><strong>{esc(item["format"])}</strong><span>{esc(item["formatText"])}</span></td>
  <td><strong>{esc(item["passRule"])}</strong><span>{esc(item["passText"])}</span></td>
  <td>{next_links}</td>
</tr>""")
    default = records[0]
    return f"""<section class="requirements-finder tool-block" id="requirements-finder" data-dmv-requirements>
  <div class="tool-section-head">
    <span class="eyebrow">Requirements finder</span>
    <h2>Choose a state and see the permit-test path</h2>
    <p class="section-intro">Use this as a fast planning map: official source first, then test format, passing rule, documents, signs, and practice links. Final rules always come from the state agency.</p>
  </div>
  <div class="requirements-grid">
    <aside class="requirements-control">
      <label>Choose state <select data-requirements-state>{options}</select></label>
      <div class="dmv-source-card">
        <span data-requirements-agency>{esc(default["agency"])}</span>
        <strong data-requirements-state-title>{esc(default["label"])} permit-test requirements</strong>
        <p data-requirements-focus>{esc(default["focus"])}</p>
      </div>
      <div class="requirements-actions">
        <a href="{esc(default["manualUrl"])}" target="_blank" rel="noopener" data-requirements-source>Official source</a>
        <a href="{esc(default["mixedPracticeUrl"])}" data-requirements-practice{' hidden' if not default["mixedPracticeUrl"] else ''}>Mixed practice</a>
        <a href="{esc(default["signUrl"])}" data-requirements-signs>Road signs</a>
        <a href="{esc(default["checklistUrl"])}" data-requirements-checklist>Checklist</a>
        <a href="{esc(default["scoreUrl"])}" data-requirements-score>Score check</a>
      </div>
    </aside>
    <div class="requirements-snapshot">
      <article><span>Test format</span><strong data-requirements-format>{esc(default["format"])}</strong><p data-requirements-format-note>{esc(default["formatText"])}</p></article>
      <article><span>Passing rule</span><strong data-requirements-pass>{esc(default["passRule"])}</strong><p data-requirements-pass-note>{esc(default["passText"])}</p></article>
      <article><span>Site practice benchmark</span><strong data-requirements-target>{esc(default["practiceTarget"])}</strong><p>Road-sign scores are separate from a full mixed set and do not establish an official passing result.</p></article>
      <article><span>Documents</span><strong>Verify before visiting</strong><p data-requirements-documents>{esc(default["documents"])}</p></article>
    </div>
  </div>
  <div class="source-matrix requirements-table" id="compare-states" data-state-filter-scope>
    <div class="section-head-row">
      <div>
        <span class="eyebrow">Compare states</span>
        <h3>Permit test format, passing rule, and official source</h3>
      </div>
      <div class="state-filter compact-filter">
        <label for="requirements-filter">Filter table</label>
        <input id="requirements-filter" type="search" placeholder="Type Florida, 50 questions, 80%..." data-requirements-filter data-state-filter>
      </div>
    </div>
    <div class="source-matrix-scroll">
      <table>
        <thead><tr><th>State</th><th>Agency</th><th>Official source</th><th>Format</th><th>Passing rule</th><th>Next step</th></tr></thead>
        <tbody>{"".join(rows)}</tbody>
      </table>
    </div>
    <p class="state-filter-empty" data-state-empty hidden>No matching state or requirement yet.</p>
  </div>
</section>"""


def render_dmv_requirements_page():
    records = dmv_requirement_records()
    source_links = "".join(
        f'<li><a href="{esc(item["manualUrl"])}" target="_blank" rel="noopener">{esc(item["label"])}: {esc(item["manualLabel"])}</a></li>'
        for item in records
    )
    faq = render_faq([
        {
            "q": "Are these DMV permit-test requirements official?",
            "a": "No. This is an independent planning tool. Use the linked DMV, DPS, MVC, PennDOT, FLHSMV, or Secretary of State source for final requirements.",
        },
        {
            "q": "Why do some states show a practice target instead of an official score?",
            "a": "The site keeps the practice target separate from official rules. A practice target helps you decide whether to study more, while the agency source controls the real test requirement.",
        },
        {
            "q": "What should I do after checking my state requirements?",
            "a": "Open the official source for the full exam scope. Use the mixed practice if it is offered for your state, or use the sign drill just for sign recognition. Then confirm documents, appointment, fees, and retake rules.",
        },
    ])
    body = f"""<section class="hero tool-hero">
  <div>
    <p class="eyebrow">DMV requirements by state</p>
    <h1>DMV permit test requirements by state.</h1>
    <p class="lede">Compare official-source links, test format, passing rule, document reminders, road-sign practice, and state checklist paths before permit-test day.</p>
    {render_last_updated(DMV_REQUIREMENTS_PAGE["lastUpdated"])}
    <div class="hero-actions">
      <a href="#requirements-finder">Choose state</a>
      <a href="#compare-states">Compare table</a>
      <a href="dmv-permit-test-study-plan.html">Study plan</a>
      <a href="dmv-permit-test-passing-score-calculator.html">Passing score</a>
      <a href="dmv-test-day-checklist.html">Document checklist</a>
      <a href="road-signs-practice-test.html">Road signs</a>
    </div>
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
<section class="trust-strip">
  <div><span>Coverage</span><strong>{len(records)} state paths</strong></div>
  <div><span>Source priority</span><strong>Official agency links</strong></div>
  <div><span>Use case</span><strong>Format, pass rule, documents</strong></div>
  <div><span>Updated</span><strong>{esc(DMV_REQUIREMENTS_PAGE["lastUpdated"])}</strong></div>
</section>
{render_dmv_requirements_finder()}
<section class="content-section">
  <h2>How to use this before a DMV permit test</h2>
  <p>Start with the state selector, open the official source, then use the practice and checklist links as supporting tools. If the official source and this page ever differ, the official source wins.</p>
</section>
<section class="content-section">
  <h2>Why requirements belong next to practice questions</h2>
  <p>Many visitors are not only asking for questions. They need to know how long the test is, what score is enough, what documents to bring, and which official page controls the final answer.</p>
</section>
<section class="sources">
  <h2>Official state sources</h2>
  <ul>{source_links}</ul>
</section>
{faq}
{render_related(["florida-class-e-knowledge-exam-tlsae", "florida-dmv-permit-documents-checklist", "florida-dmv-permit-practice-test", "florida-dmv-road-signs-practice", "dmv-permit-test-mistake-log", "dmv-permit-test-question-of-the-day", "dmv-permit-test-study-plan", "dmv-permit-test-passing-score-calculator", "dmv-test-day-checklist", "road-signs-practice-test", "regulatory-traffic-signs-practice-test"])}"""
    return page_shell(
        DMV_REQUIREMENTS_PAGE["title"],
        DMV_REQUIREMENTS_PAGE["description"],
        f"/{DMV_REQUIREMENTS_SLUG}.html",
        body,
        "tool-page requirements-page",
    )


def render_dmv_score_calculator():
    records = dmv_score_records(include_supplemental=True)
    if not records:
        return ""
    options = "".join(
        f'<option value="{esc(item["value"])}" '
        f'data-state="{esc(item["label"])}" '
        f'data-agency="{esc(item["agency"])}" '
        f'data-questions="{esc(item["questions"])}" '
        f'data-minimum-questions="{esc(item["minimumQuestions"])}" '
        f'data-correct="{esc(item["correct"])}" '
        f'data-percent="{esc(item["percent"])}" '
        f'data-section-questions="{esc(item["sectionQuestions"])}" '
        f'data-section-correct="{esc(item["sectionCorrect"])}" '
        f'data-section-included="{str(item["sectionIncluded"]).lower()}" '
        f'data-primary-score-label="{esc(item["primaryScoreLabel"])}" '
        f'data-primary-total-label="{esc(item["primaryTotalLabel"])}" '
        f'data-rule="{esc(item["rule"])}" '
        f'data-miss="{esc(item["miss"])}" '
        f'data-note="{esc(item["scoreNote"])}" '
        f'data-source-url="{esc(item["scoreRuleUrl"])}" '
        f'data-source-label="{esc(item["scoreRuleLabel"])}" '
        f'data-sign-url="{esc(item["signUrl"])}" '
        f'data-primary-topic="{esc(item["primaryTopic"])}" '
        f'data-official-practice-url="{esc(item["officialPracticeUrl"])}" '
        f'data-mixed-practice-url="{esc(item.get("mixedPracticeUrl", ""))}" '
        f'data-mixed-questions="{esc(item.get("mixedQuestions", ""))}" '
        f'data-mixed-correct="{esc(item.get("mixedCorrect", ""))}" '
        f'data-practice-url="{esc(item.get("mixedPracticeUrl") or item["signUrl"])}" '
        f'data-checklist-url="{esc(item["testDayUrl"])}" '
        f'data-test-day-label="{esc(item["testDayLabel"])}" '
        f'data-test-day-is-permit-guide="{str(item["testDayIsPermitGuide"]).lower()}">{esc(item["label"])}</option>'
        for item in records
    )
    default = records[0]
    rows = []
    for item in records:
        official_format = f'{item["questions"]} questions' if item["questions"] else "Use current test length"
        if item["sectionQuestions"] and not item["sectionIncluded"]:
            primary_part = "rules" if item["value"] == "georgia" else "general"
            official_format = f'{item["questions"]} {primary_part} + {item["sectionQuestions"]} signs'
        required = f'{item["correct"]} correct' if item["correct"] else item["rule"]
        if item["minimumQuestions"]:
            official_format = f'At least {item["minimumQuestions"]} questions'
            required = f'{item["percent"]}% correct'
        next_links = ""
        if item.get("mixedPracticeUrl"):
            next_links = f'<a href="{esc(item["mixedPracticeUrl"])}" data-dmv-state-link data-dmv-state="{esc(item["label"])}" data-dmv-path="practice">Mixed practice</a> '
        next_links += f'<a href="{esc(item["signUrl"])}" data-dmv-state-link data-dmv-state="{esc(item["label"])}" data-dmv-path="road_signs">Road signs</a>'
        rows.append(f"""<tr data-score-row data-state-name="{esc((item["label"] + " " + item["agency"] + " " + item["rule"] + " " + item["miss"]).lower())}">
  <th scope="row">{esc(item["label"])}</th>
  <td>{esc(official_format)}</td>
  <td><strong>{esc(required)}</strong><span>{esc(item["rule"])}</span></td>
  <td>{esc(item["miss"])}</td>
  <td>{next_links}</td>
  <td><a href="{esc(item["scoreRuleUrl"])}" target="_blank" rel="noopener">{esc(item["scoreRuleLabel"])}</a></td>
</tr>""")
    return f"""<section class="score-calculator tool-block" id="score-calculator" data-dmv-score-calculator>
  <div class="tool-section-head">
    <span class="eyebrow">Score calculator</span>
    <h2>How many questions can you miss on the DMV permit test?</h2>
    <p class="section-intro">Choose a state and enter the number of questions to see how many you can miss. Add your correct answers to compare a practice result with the state rule.</p>
  </div>
  <div class="score-grid">
    <aside class="score-control">
      <label>Choose state <select data-score-state>{options}</select></label>
      <div class="score-official">
        <span data-score-agency>{esc(default["agency"])}</span>
        <strong data-score-rule>{esc(default["rule"])}</strong>
        <p data-score-note>{esc(default["scoreNote"])}</p>
      </div>
      <div class="score-actions">
        <a href="{esc(default["manualUrl"])}" target="_blank" rel="noopener" data-score-source>Official source</a>
        <a href="{esc(default.get("mixedPracticeUrl") or default["signUrl"])}" data-score-practice>{'Mixed practice' if default.get("mixedPracticeUrl") else 'Road-sign practice'}</a>
        <a href="{esc(default["testDayUrl"])}" data-score-checklist>{esc(default["testDayLabel"])}</a>
      </div>
    </aside>
    <div class="score-panel">
      <div class="score-stat-row">
        <article><span data-score-length-label>Official length</span><strong data-score-questions>{esc(default["questions"] or "Use source")}</strong><p data-score-length-note>Questions on the state knowledge test when the source gives a fixed number.</p></article>
        <article><span>Need correct</span><strong data-score-correct>{esc(default["correct"] or default["rule"])}</strong><p>Minimum correct answers or percentage rule.</p></article>
        <article><span>Can miss</span><strong data-score-miss>{esc(default["miss"])}</strong><p>Exact when the question count and pass mark are fixed.</p></article>
      </div>
      <div class="practice-score-check">
        <div>
          <label for="score-correct" data-score-correct-label>Practice correct</label>
          <input id="score-correct" type="number" min="0" max="100" step="1" data-score-input-correct>
        </div>
        <div>
          <label for="score-total" data-score-total-label>Practice total</label>
          <input id="score-total" type="number" min="1" max="100" step="1" data-score-input-total>
        </div>
        <button type="button" data-score-use-official disabled>Enter your own total</button>
      </div>
      <div role="status"><p data-score-count-answer hidden></p></div>
      <div class="practice-score-check" data-score-section hidden>
        <div>
          <label for="score-section-correct" data-score-section-label>Road signs correct</label>
          <input id="score-section-correct" type="number" min="0" step="1" data-score-section-correct aria-describedby="score-section-note">
        </div>
        <p id="score-section-note" data-score-section-note></p>
      </div>
      <button class="score-check-submit" type="button" data-score-check>Check practice score</button>
      <div class="score-result" aria-live="polite">
        <p><b>State-rule comparison</b></p>
        <span data-score-percent>--</span>
        <strong data-score-status>Enter your practice score.</strong>
        <p data-score-message></p>
        <p data-score-mixed-result hidden><b>TestDayTools mixed set:</b> <span data-score-mixed-message></span></p>
        <div class="score-next-step" data-score-next hidden>
          <strong data-score-next-title>Choose the next review step</strong>
          <p data-score-next-copy></p>
          <a href="{esc(default.get("mixedPracticeUrl") or default["signUrl"])}" data-score-next-link data-dmv-state-link data-dmv-state="{esc(default["label"])}" data-dmv-path="practice">{'Open mixed practice' if default.get("mixedPracticeUrl") else 'Open road-sign practice'}</a>
        </div>
      </div>
    </div>
  </div>
  <div class="source-matrix requirements-table" id="score-table" data-state-filter-scope>
    <div class="section-head-row">
      <div>
        <span class="eyebrow">Compare passing scores</span>
        <h3>DMV permit test passing score by state</h3>
      </div>
      <div class="state-filter compact-filter">
        <label for="score-filter">Filter table</label>
        <input id="score-filter" type="search" placeholder="Type Florida, 40 correct, 80%..." data-state-filter>
      </div>
    </div>
    <div class="source-matrix-scroll">
      <table>
        <thead><tr><th>State</th><th>Format</th><th>Passing score</th><th>Can miss</th><th>Next practice</th><th>Source</th></tr></thead>
        <tbody>{"".join(rows)}</tbody>
      </table>
    </div>
    <p class="state-filter-empty" data-state-empty hidden>No matching score rule yet.</p>
  </div>
</section>"""


def render_dmv_score_answers(records):
    cards = []
    for item in records:
        if item.get("answer"):
            answer = item["answer"]
        elif isinstance(item["questions"], int) and isinstance(item["correct"], int):
            answer = (
                f'{item["label"]} uses {item["questions"]} questions for this path. '
                f'You need {item["correct"]} correct, so the basic miss limit is {item["miss"]}.'
            )
        else:
            answer = (
                f'The published passing rule for {item["label"]} is {item["percent"]}% for this path. '
                "Enter the current test length in the calculator to see the matching correct-answer target and miss limit."
            )
        cards.append(f"""<article class="score-answer-card" id="{esc(item["value"])}-permit-test-passing-score">
  <span>State answer</span>
  <h3>How many questions can you miss on the {esc(item["label"])} permit test?</h3>
  <p><strong>{esc(answer)}</strong></p>
  <p>{esc(item["scoreNote"])}</p>
  <div class="score-answer-actions">
    <a href="{esc(item["scoreRuleUrl"])}" target="_blank" rel="noopener">Verify official rule</a>
    <a href="{esc(item["permitUrl"])}">Open practice</a>
    <a href="{esc(item["testDayUrl"])}">{esc(item["testDayLabel"])}</a>
  </div>
</article>""")
    return f"""<section class="content-section score-answer-section" id="state-score-answers">
  <span class="eyebrow">Direct answers by state</span>
  <h2>How many questions can you miss on each permit test?</h2>
  <p class="section-intro">These state paths use current official agency sources. Use the exact answer when a fixed test length is published; otherwise enter the question count shown for your test.</p>
  <div class="score-answer-grid">{"".join(cards)}</div>
</section>"""


def render_dmv_score_page():
    records = dmv_score_records(include_supplemental=True)
    source_links = "".join(
        f'<li><a href="{esc(item["scoreRuleUrl"])}" target="_blank" rel="noopener">{esc(item["label"])}: {esc(item["scoreRuleLabel"])}</a></li>'
        for item in records
    )
    faq = render_faq([
        {
            "q": "How many questions can I miss on the DMV permit test?",
            "a": "It depends on the state. For example, Florida and New Jersey use 40 correct out of 50, so the basic miss count is 10. Pennsylvania uses 15 correct out of 18, so the basic miss count is 3.",
        },
        {
            "q": "Why does New York mention road-sign questions separately?",
            "a": "New York's learner permit rule includes both an overall score and a road-sign condition. You need at least 14 correct overall and at least 2 of the 4 road-sign questions.",
        },
        {
            "q": "Do Georgia and Virginia use one combined passing score?",
            "a": "No. Georgia requires 15 correct on each of its two 20-question parts. Virginia requires all 10 sign questions correct before 24 correct answers on the 30-question general section.",
        },
        {
            "q": "Can a practice score guarantee I will pass?",
            "a": "No. A practice score is a readiness signal, not an official result. Use the state source for final rules and retake one weak-area round before test day.",
        },
    ])
    body = f"""<section class="hero tool-hero">
  <div>
    <p class="eyebrow">DMV passing score calculator</p>
    <h1>Permit test passing score calculator: how many can you miss?</h1>
    <p class="lede">Choose a state, get the published passing rule, calculate the questions you can miss, and check whether a practice result has enough margin.</p>
    {render_last_updated(DMV_SCORE_PAGE["lastUpdated"])}
    <div class="hero-actions">
      <a href="#score-calculator">Use calculator</a>
      <a href="#state-score-answers">State answers</a>
      <a href="#score-table">Compare scores</a>
      <a href="dmv-permit-test-study-plan.html">Study plan</a>
      <a href="dmv-permit-test-requirements-by-state.html">Requirements</a>
      <a href="road-signs-practice-test.html">Road signs</a>
    </div>
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
<section class="trust-strip">
  <div><span>States</span><strong>{len(records)} score paths</strong></div>
  <div><span>Primary use</span><strong>Can-miss math</strong></div>
  <div><span>Calculator</span><strong>Practice score check</strong></div>
  <div><span>Updated</span><strong>{esc(DMV_SCORE_PAGE["lastUpdated"])}</strong></div>
</section>
<section class="score-entry-paths" aria-label="Start with a common permit-test score question">
  <div>
    <span class="eyebrow">Fast score answers</span>
    <h2>Start with your state or enter the test length.</h2>
    <p>Open a known state rule below. If your current test uses a different question count, choose the state in the calculator and enter the length shown for your test.</p>
  </div>
  <div class="score-entry-grid">
    <a href="#florida-permit-test-passing-score"><span>Florida</span><strong>50 questions, 10 can be missed</strong><em>40 correct is the published passing mark.</em></a>
    <a href="#new-york-permit-test-passing-score"><span>New York</span><strong>20 questions, 6 can be missed</strong><em>You also need at least 2 of 4 road-sign questions.</em></a>
    <a href="#new-jersey-permit-test-passing-score"><span>New Jersey</span><strong>50 questions, 10 can be missed</strong><em>Use the current MVC source before test day.</em></a>
    <a href="#pennsylvania-permit-test-passing-score"><span>Pennsylvania</span><strong>18 questions, 3 can be missed</strong><em>15 correct is the published passing mark.</em></a>
    <a href="#score-calculator"><span>Other path</span><strong>Calculate from the current test length</strong><em>Use this when the state publishes a percentage rule.</em></a>
  </div>
</section>
{render_dmv_score_calculator()}
{render_dmv_score_answers(records)}
<section class="content-section score-query-guide">
  <h2>Three practice scores that need different next steps</h2>
  <div class="score-answer-grid">
    <article class="score-answer-card">
      <h3>New York: 14 of 20, but only 1 of 4 signs</h3>
      <p>The overall target is met, but the sign requirement is not. The one sign answer is already included in the 14; do not add it again. Review signs before repeating the whole test.</p>
    </article>
    <article class="score-answer-card">
      <h3>Georgia: 14 of 20 on rules and 18 of 20 on signs</h3>
      <p>The 32 correct answers combined do not replace Georgia's two 15-of-20 requirements. Keep the sign score and practice the road rules you missed.</p>
    </article>
    <article class="score-answer-card">
      <h3>Virginia: 9 of 10 signs, no general score</h3>
      <p>Virginia requires all 10 signs before the general section. Leave the general score blank if you only took signs. A section not taken is not a score of zero.</p>
    </article>
  </div>
</section>
<section class="content-section">
  <h2>Use the calculator before a full practice round</h2>
  <p>Start with the official pass rule, then compare your latest practice result. If the calculator says you are barely above the target, review missed signs and right-of-way rules before taking another full round.</p>
</section>
<section class="content-section">
  <h2>Why the miss count is not enough by itself</h2>
  <p>A state may have a separate sign rule, a minimum question count, or a different process by applicant type. Treat the miss count as planning math, then open the state source before making test-day decisions.</p>
  <p><strong>Example: New York, 16 out of 20 overall and 1 out of 4 on signs.</strong> The overall score clears 14, but the result still misses the sign requirement by one. Review the missed signs, then try another round that scores signs separately. The sign answers are already part of the 16, so do not add them again. <a href="https://dmv.ny.gov/new-york-state-drivers-manual-and-practice-tests/chapter-1-driver-licenses">New York DMV written-test rule</a>.</p>
</section>
<section class="sources">
  <h2>Official state sources</h2>
  <ul>{source_links}</ul>
</section>
{faq}
{render_related(["florida-class-e-knowledge-exam-tlsae", "florida-dmv-permit-documents-checklist", "florida-dmv-permit-practice-test", "florida-dmv-road-signs-practice", "dmv-permit-test-mistake-log", "dmv-permit-test-question-of-the-day", "dmv-permit-test-study-plan", "dmv-permit-test-requirements-by-state", "dmv-test-day-checklist", "road-signs-practice-test"])}"""
    return page_shell(
        DMV_SCORE_PAGE["title"],
        DMV_SCORE_PAGE["description"],
        f"/{DMV_SCORE_SLUG}.html",
        body,
        "tool-page score-page",
        page_schema(DMV_SCORE_PAGE["title"], DMV_SCORE_PAGE["description"], url_for(f"/{DMV_SCORE_SLUG}.html"), "WebApplication"),
    )


def render_dmv_hub(hub):
    collections = []
    for section in hub.get("sections", []):
        links = render_tool_links(section.get("links", []))
        heading = section["heading"].lower()
        anchor = "permit-tests" if "permit" in heading else "road-signs" if "sign" in heading else ""
        section_id = f' id="{anchor}"' if anchor else ""
        collections.append(f'<section class="hub-section"{section_id}><h2>{esc(section["heading"])}</h2><div class="tool-grid">{links}</div></section>')
    body_sections = "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in hub.get("body", [])
    )
    body = f"""<section class="hero hub-hero dmv-hub-hero">
  <div class="home-hero-grid">
    <div>
      <p class="eyebrow">{esc(hub["heroKicker"])}</p>
      <h1>{esc(hub["title"])}</h1>
      <p class="lede">{esc(hub["summary"])}</p>
      {render_last_updated(hub.get("lastUpdated"))}
      <div class="hero-actions">
        <a href="#state-paths">Choose state</a>
        <a href="dmv-permit-test-question-of-the-day.html">Daily question</a>
        <a href="dmv-permit-test-mistake-log.html">Mistake log</a>
        <a href="florida-dmv-permit-practice-test.html">Florida permit</a>
        <a href="dmv-test-day-checklist.html?state=florida">Florida checklist</a>
        <a href="florida-class-e-knowledge-exam-tlsae.html">Class E map</a>
        <a href="florida-dmv-permit-documents-checklist.html">Florida docs</a>
        <a href="dmv-permit-test-study-plan.html">Study plan</a>
        <a href="dmv-permit-test-passing-score-calculator.html">Passing score</a>
        <a href="dmv-permit-test-requirements-by-state.html">Requirements</a>
        <a href="florida-dmv-road-signs-practice.html">Florida signs</a>
        <a href="#permit-tests">Permit tests</a>
        <a href="#official-sources">Official sources</a>
        <a href="dmv-test-day-checklist.html">Checklist</a>
      </div>
    </div>
    {render_home_practice_panel()}
  </div>
</section>
<section class="notice"><strong>Independent site.</strong> {esc(SITE["disclaimer"])}</section>
{render_dmv_journey_dashboard()}
{render_florida_dmv_cluster()}
{render_dmv_launcher("Start with your state")}
{render_dmv_source_matrix()}
{''.join(collections)}
{body_sections}
{render_ad("Future ad")}"""
    return page_shell(hub["title"], hub["description"], f'/{hub["slug"]}.html', body, "hub-page dmv-hub-page")


def render_home():
    start_items = "".join(
        f'<a class="start-card" href="{esc(item["href"])}"><span>{esc(item["label"])}</span><strong>{esc(item["title"])}</strong><p>{esc(item["text"])}</p></a>'
        for item in DATA["home"].get("startHere", [])
    )
    start_section = f'<section class="home-start"><h2>Start with the DMV task</h2><p class="section-intro">Most visitors should choose a concrete task first: signs, regulatory signs, documents, or state permit practice.</p><div class="start-grid">{start_items}</div></section>' if start_items else ""
    popular_items = "".join(
        f'<a class="popular-row" href="{esc(item["href"])}"><span>{esc(item["label"])}</span><strong>{esc(item["title"])}</strong><em>{esc(item["text"])}</em></a>'
        for item in DATA["home"].get("popular", [])
    )
    popular_section = f'<section class="home-popular"><h2>High-value tools</h2><div class="popular-list">{popular_items}</div></section>' if popular_items else ""
    cards = []
    for section in DATA["home"]["sections"]:
        if section.get("hubSlug"):
            hub = next(hub for hub in HUBS if hub["slug"] == section["hubSlug"])
            links = (
                f'<a href="{esc(hub["slug"])}.html"><strong>{esc(hub["title"])}</strong>'
                f'<span>{esc(hub["description"])}</span></a>'
            )
        else:
            links = render_tool_links(section.get("links", []))
        cards.append(f'<section class="home-group"><h2>{esc(section["heading"])}</h2><div class="tool-grid">{links}</div></section>')
    body = f"""<section class="hero home-hero dmv-home-hero pocket-home-hero">
  <div class="home-hero-grid">
    <div>
      <p class="eyebrow">DMV-first road sign practice</p>
      <h1>DMV road signs practice by state, pictures, and permit tools.</h1>
      <p class="lede">Start with road signs by state, then drill regulatory signs, flashcards, shape/color lookup, Florida source checks, and permit-test planning tools.</p>
      {render_last_updated(DATA["home"].get("lastUpdated"))}
      {render_home_pocket_tabs()}
      <div class="hero-actions home-quick-links">
        <a href="skills-practice.html">Work skills practice preview</a>
        <a href="road-sign-learning-loop.html">Road sign contrast lab</a>
        <a href="road-signs-practice-test.html?mode=road-signs-core#practice">Road signs with pictures</a>
        <a href="dmv-road-signs-cheat-sheet.html">Printable road signs cheat sheet</a>
        <a href="new-york-dmv-road-signs-practice.html">New York road signs</a>
        <a href="florida-dmv-road-signs-practice.html">Florida regulatory signs</a>
        <a href="regulatory-traffic-signs-practice-test.html">Regulatory traffic signs</a>
        <a href="dmv-road-sign-flashcards.html">Road sign flashcards</a>
      </div>
    </div>
    {render_home_road_sign_panel()}
  </div>
</section>
<section class="notice pocket-notice"><strong>Independent resource.</strong> {esc(SITE["disclaimer"])} <a href="disclaimer.html">Read more</a></section>
{render_dmv_journey_dashboard()}
{render_home_state_preview()}
{render_home_tool_roles()}
{render_home_value_brief()}
{render_florida_dmv_cluster()}
{render_dmv_launcher("Choose your state DMV path")}
{start_section}
{popular_section}
{''.join(cards)}
{render_ad("Future ad")}
{render_home_bottom_nav()}"""
    return page_shell(DATA["home"]["title"], DATA["home"]["description"], "/", body, "home-page")


def render_trust(page):
    content = "".join(
        f'<section class="content-section"><h2>{esc(section["heading"])}</h2><p>{esc(section["text"])}</p></section>'
        for section in page["content"]
    )
    links = ""
    if page.get("links"):
        items = "".join(f'<li><a href="{esc(link["url"])}">{esc(link["label"])}</a></li>' for link in page["links"])
        links = f'<section class="sources"><h2>Useful links</h2><ul>{items}</ul></section>'
    body = f"""<section class="hero slim-hero">
  <div>
    <p class="eyebrow">TestDayTools</p>
    <h1>{esc(page["title"])}</h1>
    <p class="lede">{esc(page["description"])}</p>
    {render_last_updated(page.get("lastUpdated"))}
  </div>
</section>
{content}
{links}"""
    return page_shell(page["title"], page["description"], f'/{page["slug"]}.html', body, "trust-page")


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content.encode("utf-8"))


def build(output=None):
    if __package__:
        from . import build_skill_tools
    else:
        import build_skill_tools

    output = output or write
    write_road_sign_images(output)
    write_contrast_lessons(output)
    publisher_id = SITE.get("adsenseVerification", {}).get("publisherId", "").removeprefix("ca-")
    if publisher_id:
        output("ads.txt", f"google.com, {publisher_id}, DIRECT, f08c47fec0942fa0\n")
    output("index.html", render_home())
    urls = {"/": lastmod_for_path("/")}

    def emit_page(slug, page):
        output(f"{slug}.html", page)
        path = f"/{slug}.html"
        urls[path] = lastmod_for_path(path)

    for hub in HUBS:
        emit_page(hub["slug"], render_hub(hub))
    renderers = (
        (DMV_DAILY_SLUG, render_dmv_daily_question_page),
        (DMV_MISTAKE_LOG_SLUG, render_dmv_mistake_log_page),
        (DMV_STUDY_PLAN_SLUG, render_dmv_study_plan_page),
        (ROAD_SIGN_FLASHCARDS_SLUG, render_road_sign_flashcards_page),
        (ROAD_SIGN_CHEAT_SHEET_SLUG, render_road_sign_cheat_sheet_page),
        (ROAD_SIGN_SHAPES_SLUG, render_road_sign_shapes_page),
        (DMV_SCORE_SLUG, render_dmv_score_page),
        (DMV_REQUIREMENTS_SLUG, render_dmv_requirements_page),
    )
    for slug, render in renderers:
        emit_page(slug, render())
    for tool in DATA["tools"]:
        # Retired noindex pages are checked-in snapshots, not build outputs.
        if not tool.get("indexable", True):
            continue
        emit_page(tool["slug"], render_tool(tool))
        if tool.get("calendarDownload"):
            output(tool["calendarDownload"]["filename"], render_calendar_file(tool["calendarDownload"]))

    skill_pages = build_skill_tools.render_pages()
    skill_lastmod = format_lastmod(build_skill_tools.DATA["hub"]["updated"])
    for filename, page in skill_pages.items():
        output(filename, page)
        urls[f"/{filename}"] = skill_lastmod
    for page in DATA["trustPages"]:
        emit_page(page["slug"], render_trust(page))

    sitemap_urls = "\n".join(
        sitemap_entry(path, lastmod, priority="0.7" if path[1:] in skill_pages else None)
        for path, lastmod in urls.items()
    )
    output("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n{sitemap_urls}\n</urlset>\n')
    output("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE['url'].rstrip('/')}/sitemap.xml\n")


def check_build():
    drift = []
    count = 0

    def compare(path, content):
        nonlocal count
        count += 1
        target = ROOT / path
        if not target.is_file() or target.read_bytes() != content.encode("utf-8"):
            drift.append(path)

    build(compare)
    return count, drift


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the static site.")
    parser.add_argument("--check", action="store_true", help="Report stale or missing outputs without editing files.")
    if parser.parse_args().check:
        count, drift = check_build()
        if drift:
            raise SystemExit("Regenerate the changed outputs before publishing:\n  " + "\n  ".join(drift))
        print(f"Verified {count} generated outputs; no files changed.")
    else:
        build()
        print("Built static site pages.")
