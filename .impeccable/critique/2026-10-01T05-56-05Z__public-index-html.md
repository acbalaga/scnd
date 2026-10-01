---
target: SCND UI
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/scnd/public/index.html"
target_fingerprint: "sha256:bc0a6da2779c75810e9a770c906ff2f9cfa4a1ede5ad7a0cd6d467435179d7f9"
target_path: /home/user/scnd/public/index.html
timestamp: 2026-10-01T05-56-05Z
slug: public-index-html
---
# SCND critique, public/index.html (1 Oct 2026, run 2, after critique fixes, bill card split and polish)
Method: dual-agent (A: design review, B: detector + browser)
Score 26/40 (Acceptable). H1 3, H2 3, H3 2, H4 3, H5 2, H6 3, H7 2, H8 3, H9 2, H10 3.
Run-1 P1s all verified fixed (pixel C, dial scale, weather "No data", focus/borders/live regions, stuck tooltip). Score flat because the fresh reviewer tested deeper paths.

## Priority issues
- [P1] "Add another bill" scrolls the new bill off screen (app.js:355 scrolls #bills-end block:start; new bill at y=-1200 on 390px; focus stays on button).
- [P1] Red result has no next step: flag says ask the installer but offers no button; the weather check that could clear it sits in a separate card below all bills.
- [P2] Weather failure is a three-line red wall for something not the owner's fault; setup errors not tied to fields (no aria-invalid/describedby); per-bill errors unannounced.
- [P2] Edge-case contradictions: decoder step 4 claims PHP 0.00 fixed charges while the total_below_charges flag fires; ticking hybrid after bills silently drops savings; sheet questions print ISO dates (findings.js span()).
- [P2] Payback tiles show "24% behind" / "6.5 yr" boldly after 92 rainy days; caveat buried.
- [P2] Dark-mode focus ring on the white findings paper is 1.55:1 (.paper does not redefine --focus).
## Also: no visible h1 after setup; bill h3s sit under h2 "Your system"; sheet th and .figures small at 10.5px; old bills keep full dials (collapse to one line still open).
