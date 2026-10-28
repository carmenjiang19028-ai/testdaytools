#!/usr/bin/env python3

from pathlib import Path as FSPath
import os
import json
import subprocess
import tempfile

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    KeepTogether,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = FSPath(__file__).resolve().parents[1]
OUTPUT = ROOT / "dmv-road-signs-classroom-worksheet.pdf"
PAGE_URL = "testdaytools.com/dmv-road-signs-cheat-sheet.html"
BLUE = colors.HexColor("#155E9F")
INK = colors.HexColor("#17212F")
MUTED = colors.HexColor("#586678")
LINE = colors.HexColor("#D7E0EA")
SOFT = colors.HexColor("#F3F6F9")
GREEN = colors.HexColor("#176B51")
RED = colors.HexColor("#C7312F")
YELLOW = colors.HexColor("#F4C842")
ORANGE = colors.HexColor("#F59E2E")
CLASSROOM_SIGNS = {
    "stop": "stop", "yield": "yield", "do-not-enter": "do-not-enter",
    "speed-limit": "speed-limit", "merge": "merge", "school": "school-crossing",
    "railroad": "railroad", "slippery": "slippery",
}


def register_fonts():
    regular = FSPath("/System/Library/Fonts/Supplemental/Arial.ttf")
    bold = FSPath("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("TDT-Regular", regular))
        pdfmetrics.registerFont(TTFont("TDT-Bold", bold))
        return "TDT-Regular", "TDT-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, BOLD = register_fonts()


def sign_drawing(kind, size=72, image_dir=None):
    if image_dir is None:
        raise ValueError("Render the shared SVG assets before building the classroom pack")
    image = FSPath(image_dir) / f"{CLASSROOM_SIGNS[kind]}.png"
    return Image(str(image), width=size, height=size * 160 / 220, mask="auto")


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(0.55 * inch, 0.48 * inch, 7.95 * inch, 0.48 * inch)
    canvas.setFont(FONT, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.55 * inch, 0.30 * inch, f"TestDayTools | {PAGE_URL} | Free noncommercial educational use; share unmodified with credit.")
    canvas.drawRightString(7.95 * inch, 0.30 * inch, f"Page {doc.page}")
    canvas.restoreState()


def title_block(title, subtitle, label):
    return [
        Paragraph(label.upper(), styles["Eyebrow"]),
        Paragraph(title, styles["TDTTitle"]),
        Paragraph(subtitle, styles["Deck"]),
        Spacer(1, 8),
    ]


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TDTTitle", parent=styles["Heading1"], fontName=BOLD, fontSize=22, leading=25, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="Deck", parent=styles["BodyText"], fontName=FONT, fontSize=9.4, leading=13, textColor=MUTED))
styles.add(ParagraphStyle(name="Eyebrow", parent=styles["BodyText"], fontName=BOLD, fontSize=7.5, leading=9, textColor=GREEN, spaceAfter=4))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName=BOLD, fontSize=13, leading=16, textColor=INK, spaceBefore=5, spaceAfter=6))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontName=FONT, fontSize=8.7, leading=11.5, textColor=INK))
styles.add(ParagraphStyle(name="Smallx", parent=styles["BodyText"], fontName=FONT, fontSize=7.5, leading=9.3, textColor=MUTED))
styles.add(ParagraphStyle(name="Answer", parent=styles["BodyText"], fontName=FONT, fontSize=8.2, leading=10.6, textColor=INK, spaceAfter=4))


def recognition_card(number, kind, image_dir):
    response = Paragraph(
        f"<b>{number}.</b> Sign name: ____________________<br/>Driver action: ________________________________",
        styles["Bodyx"],
    )
    box = Table([[sign_drawing(kind, 65, image_dir), response]], colWidths=[0.85 * inch, 2.45 * inch], rowHeights=[0.86 * inch])
    box.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return box


def build_document(image_dir, output):
    material = json.loads((ROOT / "content/road_sign_lessons.json").read_text())
    doc = SimpleDocTemplate(
        str(output), pagesize=letter, rightMargin=0.55 * inch, leftMargin=0.55 * inch,
        topMargin=0.46 * inch, bottomMargin=0.62 * inch,
        title="DMV Road Signs Classroom Worksheet and Answer Key",
        author="TestDayTools",
        subject="Original road-sign recognition and driver-action classroom activity",
    )
    story = []
    story += title_block(
        "Road Signs Recognition Check",
        "Student name: ______________________________   Date: ______________   Class/group: ____________________",
        "Student worksheet - page 1",
    )
    story.append(Paragraph("Directions: Identify each sign, then write the safest driver action. Use the shape and color even when the words are small.", styles["Bodyx"]))
    story.append(Spacer(1, 8))
    kinds = ["stop", "yield", "do-not-enter", "speed-limit", "merge", "school", "railroad", "slippery"]
    rows = []
    for i in range(0, len(kinds), 2):
        rows.append([recognition_card(i + 1, kinds[i], image_dir), recognition_card(i + 2, kinds[i + 1], image_dir)])
    grid = Table(rows, colWidths=[3.58 * inch, 3.58 * inch], rowHeights=[0.94 * inch] * 4, hAlign="LEFT")
    grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(grid)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Quick reflection", styles["H2x"]))
    reflection = Table([
        [Paragraph("Which sign was slowest?", styles["Bodyx"]), ""],
        [Paragraph("Which clue helped most: shape, color, words, or symbol?", styles["Bodyx"]), ""],
        [Paragraph("What will you do before the next quiz?", styles["Bodyx"]), ""],
    ], colWidths=[2.75 * inch, 4.35 * inch], rowHeights=[0.34 * inch] * 3)
    reflection.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (0, -1), SOFT), ("LEFTPADDING", (0, 0), (-1, -1), 7)]))
    story.append(reflection)

    story.append(PageBreak())
    story += title_block(
        "Driver-Action Decision Round",
        "Circle one answer. The goal is not only to name a sign; it is to choose the safest action.",
        "Student worksheet - page 2",
    )
    questions = [
        ("1", "A red octagon is ahead. What should you do?", "A. Slow only if traffic is present", "B. Stop completely, then yield", "C. Continue if the road looks clear"),
        ("2", "A triangular red-and-white sign is ahead. What is the best response?", "A. Give right of way when needed", "B. Stop for exactly five seconds", "C. Speed up to merge first"),
        ("3", "A lane ends warning sign appears on your side. What should you do?", "A. Merge early when safe", "B. Stop in the lane", "C. Pass on the shoulder"),
        ("4", "A pedestrian crossing sign is ahead. What should you do?", "A. Watch the crosswalk and prepare to yield", "B. Honk and keep speed", "C. Use the opposing lane"),
        ("5", "A Slippery When Wet sign appears during rain. What is safest?", "A. Brake hard to test traction", "B. Lower speed and make smooth inputs", "C. Use cruise control"),
        ("6", "A round railroad warning sign appears. What should you expect?", "A. Tracks and crossing controls", "B. A bus-only lane", "C. A tunnel"),
        ("7", "An orange diamond sign appears. What does the color usually signal?", "A. Permanent service information", "B. Work zone or temporary traffic control", "C. A speed increase"),
        ("8", "A red circle and slash covers a turn arrow. What does it mean?", "A. The movement is recommended", "B. The movement is prohibited", "C. The route is scenic"),
    ]
    q_rows = []
    for number, prompt, a, b, c in questions:
        q_rows.append([
            Paragraph(f"<b>{number}</b>", styles["Bodyx"]),
            Paragraph(f"<b>{prompt}</b><br/>{a}<br/>{b}<br/>{c}", styles["Bodyx"]),
        ])
    q_table = Table(q_rows, colWidths=[0.35 * inch, 6.8 * inch], rowHeights=[0.72 * inch] * 8)
    q_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINE),
        ("BACKGROUND", (0, 0), (0, -1), SOFT),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(q_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Transfer check", styles["H2x"]))
    story.append(Paragraph("Write one sentence: A sign is useful only when I can connect the picture to ________________________________________________.", styles["Bodyx"]))
    story.append(Spacer(1, 10))
    score_box = Table([[Paragraph("Recognition check", styles["Bodyx"]), "____ / 8", Paragraph("Decision round", styles["Bodyx"]), "____ / 8", Paragraph("Next review date", styles["Bodyx"]), "____________"]], colWidths=[1.2 * inch, 0.65 * inch, 1.1 * inch, 0.65 * inch, 1.1 * inch, 1.25 * inch], rowHeights=[0.34 * inch])
    score_box.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (-1, -1), SOFT), ("LEFTPADDING", (0, 0), (-1, -1), 5)]))
    story.append(score_box)

    story.append(PageBreak())
    story += title_block(
        "Answer Key and 10-Minute Teaching Plan",
        "Use the explanations to reteach the action, not only the sign name. Verify state-specific wording in the official driver handbook.",
        "Teacher / facilitator key - page 3",
    )
    recognition = [
        ("1. Stop", "Come to a complete stop, yield, then proceed when safe."),
        ("2. Yield", "Slow and give right of way when another road user has priority."),
        ("3. Do Not Enter", "Do not enter the roadway, ramp, or restricted direction."),
        ("4. Speed Limit", "Do not exceed the posted legal maximum under normal conditions."),
        ("5. Merge", "Check mirrors, adjust speed and space, and merge smoothly when safe."),
        ("6. School Crossing", "Slow, scan for children, and obey posted school-zone controls."),
        ("7. Railroad Crossing Ahead", "Prepare for tracks and obey lights, gates, or a crossbuck."),
        ("8. Slippery When Wet", "Reduce speed and avoid sudden steering or braking."),
    ]
    answer_cells = [[Paragraph(f"<b>{label}</b><br/>{text}", styles["Answer"]) for label, text in recognition[i:i + 2]] for i in range(0, 8, 2)]
    answer_table = Table(answer_cells, colWidths=[3.55 * inch, 3.55 * inch])
    answer_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(Paragraph("Recognition check", styles["H2x"]))
    story.append(answer_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Decision round", styles["H2x"]))
    decisions = [
        "1. B - Stop completely, then yield.", "2. A - Give right of way when needed.",
        "3. A - Merge early when safe.", "4. A - Watch the crosswalk and prepare to yield.",
        "5. B - Lower speed and make smooth inputs.", "6. A - Expect tracks and crossing controls.",
        "7. B - Orange signals a work zone or temporary traffic control.", "8. B - The movement is prohibited.",
    ]
    decision_table = Table([[Paragraph(x, styles["Answer"]) for x in decisions[i:i + 2]] for i in range(0, 8, 2)], colWidths=[3.55 * inch, 3.55 * inch])
    decision_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(decision_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph("10-minute teaching plan", styles["H2x"]))
    plan = [
        ("2 min", "Silent scan", "Students name each sign without reading the answer choices."),
        ("3 min", "Action language", "Ask for verbs: stop, yield, merge, slow, watch, or do not enter."),
        ("3 min", "Decision round", "Students circle answers, then explain one choice to a partner."),
        ("2 min", "Targeted next step", "Circle no more than three weak signs and open the matching picture quiz."),
    ]
    plan_table = Table([[Paragraph(f"<b>{a}</b>", styles["Bodyx"]), Paragraph(f"<b>{b}</b>", styles["Bodyx"]), Paragraph(c, styles["Bodyx"])] for a, b, c in plan], colWidths=[0.65 * inch, 1.25 * inch, 5.2 * inch])
    plan_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (1, -1), SOFT), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(plan_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Source and use note", styles["H2x"]))
    story.append(Paragraph("The prompts and simplified illustrations are original TestDayTools study material. Use the FHWA Manual on Uniform Traffic Control Devices and the learner's official state driver handbook for final wording and state-specific rules. Teachers, libraries, driving schools, families, and other noncommercial educators may print and share this unmodified PDF when the TestDayTools credit and page URL remain visible. No resale, rebranding, or adaptation.", styles["Smallx"]))

    story.append(Paragraph(f"Material check {material['checkedOn']}: the eight pictures reuse the web reference's SVG artwork, including the five-sided school sign. Picture/label consistency and the printed answer mapping were checked by TestDayTools with AI-assisted source comparison, not a driving-instructor assessment. Detailed scope and official-source links: testdaytools.com/dmv-road-signs-cheat-sheet.html#material-review", styles["Smallx"]))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def build():
    with tempfile.TemporaryDirectory(prefix="testdaytools-classroom-") as directory:
        subprocess.run([
            os.environ.get("NODE_BIN", "node"), str(ROOT / "scripts/render_road_sign_materials.cjs"),
            "art", directory, *CLASSROOM_SIGNS.values(),
        ], check=True, timeout=90)
        output = FSPath(directory) / OUTPUT.name
        build_document(directory, output)
        if output.stat().st_size < 10_000:
            raise ValueError("Classroom PDF output is incomplete")
        output.replace(OUTPUT)
    print(f"Built {OUTPUT.name} ({OUTPUT.stat().st_size:,} bytes).")


if __name__ == "__main__":
    build()
