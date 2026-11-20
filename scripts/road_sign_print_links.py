from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing, Rect
from reportlab.lib import colors


PRACTICE_DISPLAY = "testdaytools.com/dmv-road-signs-cheat-sheet.html"
PRACTICE_URL = f"https://{PRACTICE_DISPLAY}#printable-sheet"


def practice_qr(size):
    drawing = Drawing(size, size)
    drawing.add(Rect(0, 0, size, size, strokeColor=None, fillColor=colors.white))
    drawing.add(QrCodeWidget(PRACTICE_URL, barWidth=size, barHeight=size, barBorder=4, barLevel="M"))
    return drawing
