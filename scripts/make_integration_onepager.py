#!/usr/bin/env python3
"""One page for the pastor: what a Planning Center / Group Vitals
integration with the Home Church app could actually do."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
)

OUT = "/home/user/home-church/Planning Center integration, one page.pdf"

INK    = colors.HexColor("#1A1A1A")
MUTED  = colors.HexColor("#5A5A5A")
ACCENT = colors.HexColor("#1F4A5F")   # deep teal, the "yes" column
CAUTION= colors.HexColor("#8A5320")   # warm brown, the "not yet" column
RULE   = colors.HexColor("#C9C9C9")
WASH   = colors.HexColor("#F4F1EC")   # warm paper wash for the boxes
WASH2  = colors.HexColor("#F7F4EF")

def style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=8.7, leading=11.1,
                textColor=INK, alignment=TA_LEFT, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(name, **base)

S = {
    "title":   style("title", fontName="Helvetica-Bold", fontSize=17, leading=19.5,
                     textColor=ACCENT, spaceAfter=3),
    "sub":     style("sub", fontSize=9.7, leading=12, textColor=MUTED, spaceAfter=9),
    "h":       style("h", fontName="Helvetica-Bold", fontSize=10, leading=12,
                     textColor=ACCENT, spaceAfter=4),
    "body":    style("body", spaceAfter=5),
    "lead":    style("lead", fontSize=9.4, leading=12.4, spaceAfter=6),
    "boxh":    style("boxh", fontName="Helvetica-Bold", fontSize=9.6, leading=11.5,
                     textColor=ACCENT, spaceAfter=1),
    "boxh2":   style("boxh2", fontName="Helvetica-Bold", fontSize=9.6, leading=11.5,
                     textColor=CAUTION, spaceAfter=1),
    "boxtag":  style("boxtag", fontName="Helvetica-Bold", fontSize=7.2, leading=9,
                     textColor=MUTED, spaceAfter=4),
    "boxli":   style("boxli", fontSize=8.4, leading=10.6, spaceAfter=3.5,
                     leftIndent=8, firstLineIndent=-8),
    "li":      style("li", spaceAfter=4.2, leftIndent=10, firstLineIndent=-10),
    "foot":    style("foot", fontSize=7.4, leading=9.4, textColor=MUTED),
}

def bullet(text, st="li"):
    return Paragraph("• " + text, S[st])

def b(t):   return f'<font name="Helvetica-Bold">{t}</font>'

story = []

# ---------------------------------------------------------------- masthead
story.append(Paragraph("Connecting Planning Center and Group Vitals to the app", S["title"]))
story.append(Paragraph(
    "What is actually possible, what is not, and what it would take &nbsp;·&nbsp; "
    "Home Church, September 2026", S["sub"]))
story.append(HRFlowable(width="100%", thickness=1.1, color=ACCENT, spaceAfter=9))

# ---------------------------------------------------------------- the answer
story.append(Paragraph("The short answer", S["h"]))
story.append(Paragraph(
    "This is one integration and one link, not two integrations. "
    + b("Planning Center can be connected properly") +
    " — it offers free, documented access built for exactly this, covering the calendar, "
    "registrations, groups, people and Sunday service plans. "
    + b("Group Vitals almost certainly cannot, yet") +
    " — they publish no way for other software to read their data, and their own list of "
    "supported church systems does not include Planning Center. So the app would sync with "
    "Planning Center and keep sending people to Group Vitals the way it does today.",
    S["lead"]))

# ---------------------------------------------------------------- two boxes
pc = [
    Paragraph("Planning Center", S["boxh"]),
    Paragraph("A REAL CONNECTION", S["boxtag"]),
    bullet("Included free in what the church already pays. There is no add-on to buy.", "boxli"),
    bullet("Reaches the calendar, event registrations, groups, people, service plans "
           "and check-ins.", "boxli"),
    bullet("We control what the app may see using a switch the staff already use: whether "
           "an event is published to Church Center. Internal bookings stay internal.", "boxli"),
    bullet("Ordinary, well-trodden ground. Thousands of churches connect things to it.", "boxli"),
]
gv = [
    Paragraph("Group Vitals", S["boxh2"]),
    Paragraph("A LINK, UNTIL THEY SAY OTHERWISE", S["boxtag"]),
    bullet("No published way for outside software to read the data — no documentation, "
           "no settings page, nothing.", "boxli"),
    bullet("The systems they do connect to are FellowshipOne and Church Community Builder. "
           "Planning Center is listed as a maybe, not a feature.", "boxli"),
    bullet("What we can do: keep linking out, as the app does now, or import a spreadsheet "
           "when a season turns.", "boxli"),
    bullet("Worth one email to their support asking. It costs nothing and could change "
           "this whole column.", "boxli"),
]

box = Table([[pc, gv]], colWidths=[3.28*inch, 3.28*inch])
box.setStyle(TableStyle([
    ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ("BACKGROUND",    (0,0), (0,0), WASH),
    ("BACKGROUND",    (1,0), (1,0), WASH2),
    ("LEFTPADDING",   (0,0), (-1,-1), 10),
    ("RIGHTPADDING",  (0,0), (-1,-1), 10),
    ("TOPPADDING",    (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("LINEBEFORE",    (0,0), (0,0), 2.2, ACCENT),
    ("LINEBEFORE",    (1,0), (1,0), 2.2, CAUTION),
]))
story.append(box)
story.append(Spacer(1, 11))

# ---------------------------------------------------------------- upside
story.append(Paragraph("What would change for someone holding the app", S["h"]))
for t in [
    b("The calendar keeps itself current.") + " An event the staff put on the church "
    "calendar shows up in the app within about twenty minutes, with the right time and "
    "the right room. Nobody retypes it, and it cannot be typed wrong.",

    b("Cancellations actually disappear.") + " Today an event that comes off Church Center "
    "can sit on people's phones until someone notices.",

    b("Sign-up links stop going stale.") + " Alpha and baptism links are typed into the app "
    "by hand right now, and they quietly point at last year's event when a new one is made.",

    b("Sunday's songs stop being typed twice.") + " The worship leader already enters the "
    "setlist in Planning Center on Thursday; the app's worship screen could just read it.",

    b("Later, if we want it:") + " the app could know which group is yours and which team "
    "you serve on, and stop offering you next steps you have already taken.",
]:
    story.append(bullet(t))
story.append(Spacer(1, 6))

# ---------------------------------------------------------------- restraint
story.append(Paragraph("What we would deliberately not do", S["h"]))
for t in [
    b("The app only reads. It never writes back.") + " Nothing a person does in the app can "
    "change a record in Planning Center. A bug in the app stays in the app.",

    b("No giving records and no member directory in the app.") + " Giving keeps sending "
    "people to Church Center, where it already works and is already secure.",

    b("No guessing who someone is from their email address.") + " Households share addresses. "
    "A wrong match would show a person someone else's group and someone else's information. "
    "If accounts are ever linked to church records, a person does it on purpose.",
]:
    story.append(bullet(t))
story.append(Spacer(1, 7))

# ---------------------------------------------------------------- cost + next
cost = [
    Paragraph("Cost", S["h"]),
    Paragraph(
        "No new software and no new subscription — Planning Center's access is included in "
        "what the church already pays. The real costs are development time and "
        + b("one ongoing responsibility") + ": the connection is tied to a single staff "
        "person's Planning Center account and stops working if that person leaves. It needs "
        "a named owner from day one.", S["body"]),
]
nxt = [
    Paragraph("The next step, about a day", S["h"]),
    Paragraph(
        "A read-only look at our own Planning Center account, answering what nobody can "
        "answer from outside: " + b("is our church calendar genuinely kept current in there") +
        ", are the home groups in Planning Center or only in Group Vitals, and do the sign-up "
        "links in the app still point at real events? Nothing gets built and nothing gets "
        "changed until that comes back.", S["body"]),
]
grid = Table([[cost, nxt]], colWidths=[3.28*inch, 3.28*inch])
grid.setStyle(TableStyle([
    ("VALIGN",       (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING",  (0,0), (0,0), 0),
    ("RIGHTPADDING", (0,0), (0,0), 14),
    ("LEFTPADDING",  (1,0), (1,0), 14),
    ("RIGHTPADDING", (1,0), (-1,-1), 0),
    ("TOPPADDING",   (0,0), (-1,-1), 0),
    ("BOTTOMPADDING",(0,0), (-1,-1), 0),
    ("LINEBEFORE",   (1,0), (1,0), 0.6, RULE),
]))
story.append(KeepTogether(grid))
story.append(Spacer(1, 9))

story.append(HRFlowable(width="100%", thickness=0.6, color=RULE, spaceAfter=5))
story.append(Paragraph(
    "One caveat, stated plainly: the Group Vitals conclusion is drawn from their public "
    "materials rather than from an answer they gave us, and a few Planning Center specifics "
    "still need confirming against their documentation. Neither changes the shape of what is "
    "described here. The full technical write-up is PLANNING_CENTER_INTEGRATION.md in the app "
    "repository.", S["foot"]))

doc = SimpleDocTemplate(
    OUT, pagesize=letter,
    leftMargin=0.72*inch, rightMargin=0.72*inch,
    topMargin=0.6*inch, bottomMargin=0.5*inch,
    title="Connecting Planning Center and Group Vitals to the app",
    author="Home Church", subject="Integration options for the Home Church app",
)
doc.build(story)
print("wrote", OUT)
