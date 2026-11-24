"""Generates demo/sample-paper.docx: a 12-question mock paper with two sections, LaTeX maths ($..$) and an answer key.

Run: python demo/make_sample_paper.py   (needs python-docx)
"""
from docx import Document

d = Document()
d.add_heading("JEE Mock Test 1 - Physics & Mathematics", level=1)
d.add_heading("Section A - Physics", level=2)
Q = [
    (r"A body of mass 2 kg moves with velocity 3 m/s. Its kinetic energy is", ["3 J", "6 J", "9 J", "12 J"]),
    (r"The SI unit of electric field is", ["N/C", "J/C", "C/N", "V*m"]),
    (r"A ray of light passes from air into glass of refractive index $n = 1.5$. The speed of light in glass is (c = $3\times10^8$ m/s)",
     [r"$2\times10^8$ m/s", r"$1.5\times10^8$ m/s", r"$3\times10^8$ m/s", r"$4.5\times10^8$ m/s"]),
    (r"Which of the following is a vector quantity?", ["Displacement", "Speed", "Distance", "Mass"]),
    (r"The dimensional formula of work is", [r"$ML^2T^{-2}$", r"$MLT^{-2}$", r"$ML^2T^{-1}$", r"$MLT^{-1}$"]),
    (r"A projectile is launched at $45^\circ$. At the highest point its velocity is", ["zero", "horizontal", "vertical", r"at $45^\circ$"]),
]
for i, (q, opts) in enumerate(Q, 1):
    d.add_paragraph(f"{i}. {q}")
    for letter, o in zip("ABCD", opts):
        d.add_paragraph(f"({letter}) {o}")

d.add_heading("Section B - Mathematics", level=2)
Q2 = [
    (r"The value of $\int_0^1 x\,dx$ is", ["$1$", r"$1/2$", r"$1/3$", "$0$"]),
    (r"If $f(x)=x^2$, then $f'(3)$ equals", ["3", "6", "9", "2"]),
    (r"The roots of $x^2-5x+6=0$ are", ["2 and 3", "1 and 6", "-2 and -3", "2 and -3"]),
    (r"$\sin^2\theta+\cos^2\theta$ equals", ["0", "1", "2", r"$\theta$"]),
    (r"The sum of the first 10 natural numbers is", ["45", "50", "55", "60"]),
    (r"Which of the following is a prime number?", ["4", "6", "7", "9"]),
]
for i, (q, opts) in enumerate(Q2, 7):
    d.add_paragraph(f"{i}. {q}")
    for letter, o in zip("ABCD", opts):
        d.add_paragraph(f"({letter}) {o}")

d.add_heading("Answer Key", level=2)
d.add_paragraph("1-C, 2-A, 3-A, 4-A, 5-A, 6-B, 7-B, 8-B, 9-A, 10-B, 11-C, 12-C")
d.save("demo/sample-paper.docx")
print("wrote demo/sample-paper.docx")
