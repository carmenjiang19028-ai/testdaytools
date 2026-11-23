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
if __package__:
    from . import road_sign_classroom_content as classroom
    from .road_sign_print_links import PRACTICE_DISPLAY, PRACTICE_URL, practice_qr
else:
    import road_sign_classroom_content as classroom
    from road_sign_print_links import PRACTICE_DISPLAY, PRACTICE_URL, practice_qr


ROOT = FSPath(__file__).resolve().parents[1]
OUTPUT = ROOT / "dmv-road-signs-classroom-worksheet.pdf"
BLUE = colors.HexColor("#155E9F")
INK = colors.HexColor("#17212F")
MUTED = colors.HexColor("#586678")
LINE = colors.HexColor("#D7E0EA")
SOFT = colors.HexColor("#F3F6F9")
GREEN = colors.HexColor("#176B51")
RED = colors.HexColor("#C7312F")
YELLOW = colors.HexColor("#F4C842")
ORANGE = colors.HexColor("#F59E2E")
CLASSROOM_SIGNS = classroom.CLASSROOM_SIGNS
DECISION_CASES = classroom.DECISION_CASES
DECISION_REVIEWED = classroom.DECISION_REVIEWED
TRANSFER_PROMPT = classroom.TRANSFER_PROMPT
TRANSFER_KEY = classroom.TRANSFER_KEY
PENNDOT_SIGNS_URL = classroom.PENNDOT_SIGNS_URL
FHWA_FLAGGER_URL = classroom.FHWA_FLAGGER_URL


def register_fonts():
    regular = FSPath("/System/Library/Fonts/Supplemental/Arial.ttf")
    bold = FSPath("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("TDT-Regular", regular))
        pdfmetrics.registerFont(TTFont("TDT-Bold", bold))
        pdfmetrics.registerFontFamily("TDT-Regular", normal="TDT-Regular", bold="TDT-Bold")
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
    canvas.drawString(0.55 * inch, 0.30 * inch, f"TestDayTools | {PRACTICE_DISPLAY} | Free noncommercial educational use; share unmodified with credit.")
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
    kinds = list(CLASSROOM_SIGNS)
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
    story.append(Spacer(1, 10))
    practice = Table([[
        practice_qr(61),
        Paragraph(
            f'<b>Practice the signs you missed</b><br/>Scan to open the study sheet, then choose your sign group. '
            f'<link href="{PRACTICE_URL}" color="#155E9F"><u>{PRACTICE_DISPLAY}</u></link>',
            styles["Bodyx"],
        ),
    ]], colWidths=[0.99 * inch, 6.11 * inch], hAlign="LEFT")
    practice.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(practice)

    story.append(PageBreak())
    story += title_block(
        "Driver-Action Decision Round",
        "Circle one answer. The goal is not only to name a sign; it is to choose the safest action.",
        f"Student worksheet - page 2 - decision edition {DECISION_REVIEWED}",
    )
    q_rows = []
    letters = "ABC"
    for number, (prompt, options, _, _, _) in enumerate(DECISION_CASES, 1):
        choices = "<br/>".join(f"{letter}. {option}" for letter, option in zip(letters, options))
        q_rows.append([
            Paragraph(f"<b>{number}</b>", styles["Bodyx"]),
            Paragraph(f"<b>{prompt}</b><br/>{choices}", styles["Bodyx"]),
        ])
    q_table = Table(q_rows, colWidths=[0.35 * inch, 6.8 * inch])
    q_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINE),
        ("BACKGROUND", (0, 0), (0, -1), SOFT),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(q_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Transfer check", styles["H2x"]))
    story.append(Paragraph(TRANSFER_PROMPT, styles["Bodyx"]))
    story.append(Paragraph("_" * 104 + "<br/>" + "_" * 104, styles["Bodyx"]))
    story.append(Spacer(1, 10))
    score_box = Table([[Paragraph("Recognition check", styles["Bodyx"]), "____ / 8", Paragraph("Decision round", styles["Bodyx"]), "____ / 8", Paragraph("Next review date", styles["Bodyx"]), "____________"]], colWidths=[1.2 * inch, 0.65 * inch, 1.1 * inch, 0.65 * inch, 1.1 * inch, 1.25 * inch], rowHeights=[0.34 * inch])
    score_box.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (-1, -1), SOFT), ("LEFTPADDING", (0, 0), (-1, -1), 5)]))
    story.append(score_box)

    story.append(PageBreak())
    story += title_block(
        "Answer Key and 10-Minute Teaching Plan",
        "Use the explanations to reteach the action, not only the sign name. Verify state-specific wording in the official driver handbook.",
        f"Teacher / facilitator key - page 3 - decision edition {DECISION_REVIEWED}",
    )
    recognition = [
        (f"{number}. {name}", action)
        for number, (_, _, name, action) in enumerate(classroom.RECOGNITION_ITEMS, 1)
    ]
    answer_cells = [[Paragraph(f"<b>{label}</b><br/>{text}", styles["Answer"]) for label, text in recognition[i:i + 2]] for i in range(0, 8, 2)]
    answer_table = Table(answer_cells, colWidths=[3.55 * inch, 3.55 * inch])
    answer_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(Paragraph("Recognition check", styles["H2x"]))
    story.append(Paragraph("Score 1 point per picture when the meaning and action are both correct. Accept equivalent wording.", styles["Bodyx"]))
    story.append(answer_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Decision round", styles["H2x"]))
    story.append(Paragraph("Score 1 point for each correct choice. Use the reason to discuss a wrong answer.", styles["Bodyx"]))
    decisions = [
        f"<b>{number}. {letters[answer]}</b> - {reason}"
        for number, (_, _, answer, reason, _) in enumerate(DECISION_CASES, 1)
    ]
    decision_table = Table([[Paragraph(x, styles["Answer"]) for x in decisions[i:i + 2]] for i in range(0, 8, 2)], colWidths=[3.55 * inch, 3.55 * inch])
    decision_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(decision_table)
    story.append(Paragraph(f"<b>Transfer check (unscored):</b> {TRANSFER_KEY}", styles["Bodyx"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("10-minute teaching plan", styles["H2x"]))
    plan = [
        ("2 min", "Silent scan", "Students name each sign without reading the answer choices."),
        ("3 min", "Action language", "Ask for verbs: stop, yield, merge, slow, watch, or do not enter."),
        ("3 min", "Decision round", "Choose two cases. Students explain one decision to a partner; assign the others for follow-up."),
        ("2 min", "Targeted next step", "Circle up to three weak signs. Scan or open the link on page 1 and choose the matching quiz group."),
    ]
    plan_table = Table([[Paragraph(f"<b>{a}</b>", styles["Bodyx"]), Paragraph(f"<b>{b}</b>", styles["Bodyx"]), Paragraph(c, styles["Bodyx"])] for a, b, c in plan], colWidths=[0.65 * inch, 1.25 * inch, 5.2 * inch])
    plan_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (1, -1), SOFT), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(plan_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Source and use note", styles["H2x"]))
    story.append(Paragraph(f'Decisions checked {DECISION_REVIEWED}: <link href="{PENNDOT_SIGNS_URL}" color="#155E9F"><u>PennDOT: Signs</u></link>; '
                           f'<link href="{FHWA_FLAGGER_URL}" color="#155E9F"><u>FHWA MUTCD: Flagger Procedures, 6D.05</u></link>. '
                           "Use the learner's official handbook for local rules. Prompts and simplified illustrations are original. Teachers, libraries, driving schools, families, and other noncommercial educators may print and share this unmodified PDF when the TestDayTools credit and page URL remain visible. No resale, rebranding, or adaptation.", styles["Smallx"]))

    story.append(Paragraph(f"Material check {material['checkedOn']}: all eight pictures use the web reference's SVG art. TestDayTools checked the picture and label mapping with AI-assisted source comparison, not a driving-instructor assessment. Details: testdaytools.com/dmv-road-signs-cheat-sheet.html#material-review", styles["Smallx"]))
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
