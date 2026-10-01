---
target: SCND UI
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 5
target_identity: "file:/home/user/scnd/public/index.html"
target_fingerprint: "sha256:354c3e5c34cf37231b75219648a7b1cd55002f1b8d48267b83f1c94e7db4c7aa"
target_path: /home/user/scnd/public/index.html
timestamp: 2026-10-01T03-54-01Z
slug: public-index-html
closed: true
---
# SCND critique, public/index.html (1 Oct 2026)
Method: dual-agent (A: design review, B: detector + browser)
Score 26/40 (Acceptable, top of band). H1 2, H2 3, H3 3, H4 2, H5 2, H6 3, H7 3, H8 3, H9 2, H10 3.

## Priority issues
- [P1] Pixelify Sans bold in buttons/summaries/step labels: C reads as O ("Oheck my system", "What is SOND?"). Restrict pixel face to h1/h2/LCD; buttons, summaries, step labels to system font 600.
- [P1] Dial scale 0..1 puts 65% of the arc in red; amber 0.70 reads as alarming. Rescale arc to ~0.40-0.95, clamp needle, LCD keeps true value.
- [P1] Weather fetch failure reported as "No data"; card errors terse, no next step. Add failed status, "Couldn't connect" teaser, retry copy.
- [P1] Focus ring sun on light bg 1.43:1; input borders 1.35:1; no aria-live on answer/errors; setup error no role=alert/focus.
- [P1] Stuck empty tooltip over payback chart (:style string overrides x-show display:none, index.html:394).
- [P2] Bill card is one 9-field block from two documents; answer renders ~900px below the solar field on mobile; page ~6,700px for 3 bills; PR definition repeats per bill.
- [P2] Tap targets: header/link buttons 28px tall, summaries 35px, "Show as a table" 21px.
## Detector: 40 findings; contrast hits false positives (print tokens / closed details); tap targets and 11px text real.
