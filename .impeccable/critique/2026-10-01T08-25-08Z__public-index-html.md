---
target: SCND UI
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/scnd/public/index.html"
target_fingerprint: "sha256:d432c640665b26c006fb8b49d018773c78e98359225e113e585a2083dbd6c697"
target_path: /home/user/scnd/public/index.html
timestamp: 2026-10-01T08-25-08Z
slug: public-index-html
---
# SCND critique, public/index.html (1 Oct 2026, run 4)
Method: dual-agent (A: design review, B: detector + browser)
Score 26/40 (Acceptable). H1 3, H2 3, H3 3, H4 2, H5 2, H6 3, H7 2, H8 2, H9 3, H10 3.
Run-3 P1s verified fixed: PR definition, savings cap, battery nudge, weather focus, gap flag. Zero page errors; focus never drops on weather clicks.

## Priority issues
- [P1] Findings sheet with zero bills says "No questions are raised: the latest bill is within the usual range" (allClear = items.length === 0, findings.js:90; sheet getter has no rows guard, app.js:206).
- [P1] Focus drops to body after Continue to my bill, Try an example, Start with mine, Keep it, Edit, Save changes.
- [P2] Answer ~1000px below its input on phones; every bill keeps a full dial (page 5,600 to 7,800px).
- [P2] PR 0.99 reads "Looks healthy" (no implausibly-high check; new threshold, needs Fred). Savings show no caveat when the decoder says the total does not match.
- [P2] After ticking battery, payback card vanishes and sheet shows bare "n/a" savings.
## Also: no h1 after setup; focusable chart has no name; retry button has three labels; sheet band words differ from screen ("Below range" vs "a bit low"); weather failure reported in three places; decoder Tagalog-only.
