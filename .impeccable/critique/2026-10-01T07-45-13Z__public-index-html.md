---
target: SCND UI
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/scnd/public/index.html"
target_fingerprint: "sha256:d88885e2e2e8f4a5dad162fc635ffde268d892af8034f275254a2070725555e1"
target_path: /home/user/scnd/public/index.html
timestamp: 2026-10-01T07-45-13Z
slug: public-index-html
---
# SCND critique, public/index.html (1 Oct 2026, run 3)
Method: dual-agent (A: design review, B: detector + browser)
Score 25/40 (Acceptable). H1 3, H2 2, H3 3, H4 2, H5 2, H6 3, H7 2, H8 3, H9 2, H10 3.
Run-2 P1s verified fixed: add-bill focus and scroll, red flag next step, decoder step 4, payback early tag, dark focus ring on paper, sheet dates. Zero page errors (B). Score fell one point because the reviewer found deeper issues, two of them content-correctness.

## Priority issues
- [P1] On-screen PR definition is wrong (index.html:271): "how much of the sun's energy on your panels became electricity" describes module efficiency (~20%), not PR. Sheet definition (app.js:224) is right.
- [P1] Ticking hybrid after bills exist silently drops savings, self-use and the payback card; needsPR only checks dates and solar; bill inputs are folded.
- [P1] Weather click disables the focused button so focus drops to body; failure detail and role=alert live in the page card far from the red flag.
- [P2] Focus lost after "Continue to my bill"; setup error not tied to fields.
- [P2] Gaps between bills: removing a middle month silently clears the red flag and inflates payback-behind (92 calendar days vs 2 bills of savings). Needs Fred.
- [Ask Fred] Decoder says excess credit is not counted, but savings() counts x * rExport in full (calc.js:260): PHP 4,850 shown as saved with PHP 1,200 variable charges.
## Also: amber band has four names; decoder is Tagalog-only; no carry-over of dates or generation rate to the next bill; early tag duplicated on two tiles; chart tooltip covers axis at 390; no h1 after setup.
