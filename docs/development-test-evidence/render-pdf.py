# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf>=1.26,<2"]
# ///

# ─── How to run ───
# uv run render-pdf.py <input.pdf> <output-directory>

from pathlib import Path
from sys import argv

import fitz

pdf_path = Path(argv[1])
output_dir = Path(argv[2])
output_dir.mkdir(exist_ok=True)
output_names = (
    "01-d4-building-overview.png",
    "02-d4-room-301-detail.png",
    "03-solar-pv-tests.png",
    "04-vworld-tests.png",
    "05-conference-strategy.png",
    "06-conference-primary.png",
    "07-conference-followup.png",
    "08-conference-audit.png",
)

with fitz.open(pdf_path) as document:
    assert len(document) == len(output_names)
    for page_number, output_name in enumerate(output_names):
        page = document[page_number]
        pixmap = page.get_pixmap(
            matrix=fitz.Matrix(2, 2),
            alpha=False,
            colorspace=fitz.csRGB,
        )
        pixmap.save(output_dir / output_name)
