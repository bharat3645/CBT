"""Generates demo/flawed-paper.docx: a deliberately messy paper (too few options, a question with no options,
incomplete answer key) to demo the review flags and the approval gate. Run: python demo/make_flawed_paper.py"""
from docx import Document

d = Document()
d.add_heading("Chemistry Quick Test (messy upload)", level=1)
d.add_heading("Section A - Chemistry", level=2)
d.add_paragraph("1. The atomic number of carbon is")
for l, o in zip("ABCD", ["4", "6", "8", "12"]):
    d.add_paragraph(f"({l}) {o}")
d.add_paragraph("2. Water boils at (at 1 atm)")
d.add_paragraph("(A) 90 C")
d.add_paragraph("(B) 100 C")
d.add_paragraph("3. The molar mass of CO2 in g/mol is")
d.add_paragraph("4. The most abundant gas in air is")
for l, o in zip("ABCD", ["Oxygen", "Nitrogen", "Argon", "Carbon dioxide"]):
    d.add_paragraph(f"({l}) {o}")
d.add_heading("Answer Key", level=2)
d.add_paragraph("1-B, 4-B")
d.save("demo/flawed-paper.docx")
print("wrote demo/flawed-paper.docx")
