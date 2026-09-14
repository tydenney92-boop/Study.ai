# Assignment schedule import

The supported student workflow is **Import Assignment Schedule** from Planner or a
course's Assignments & Exams section. It accepts PDF, PNG, JPG/JPEG, TXT, DOCX, and
PPTX files, or an existing extracted course material. Direct uploads are stored as
syllabus-role materials through the normal protected material/OCR pipeline; the
dedicated upload route is the durable schedule-import intent boundary.

The deterministic parser runs first. It recognizes explicit coursework language,
adjacent screenshot rows, common calendar tables, dates, 12-hour times, and 24-hour
times while suppressing policy, contact, textbook, and office-hour prose. Relative
or unresolved dates remain unchecked for review.

When deterministic output is sparse or predominantly ambiguous, the existing AI
provider may receive at most 12,000 characters of date-heavy source blocks. It is
asked for at most 40 structured events. Every returned event is schema-checked and
must contain verbatim source evidence found in the bounded input. Invalid output or
provider unavailability is contained; deterministic candidates remain available.
Only the explicit confirm endpoint writes tasks.

Schedule task identity is stable per course and normalized event title/type. Repeat
imports show exact source dates as already imported. A matching imported event with
a changed source date is marked potentially changed and requires Update or Keep
Existing. Manual tasks never participate in this reconciliation path.
