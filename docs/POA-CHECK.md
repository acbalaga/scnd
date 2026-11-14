# Sun on the panels: independent check

Ticket #54, 14 Nov 2026. `calc.poaMonth` turns monthly sun on flat ground into sun on the tilted panels. Its pvlib fixture (`test/fixtures-poa.json`, task 2) uses the same method, so it checks the geometry and nothing else. This check uses a reference that shares none of the method: `scripts/gen-poa-perez.py` (pvlib 0.16.1) takes every day of the month in 15-minute steps, spreads the month's sun over the hours by a clear-sky shape, splits beam from diffuse with the Erbs model, and puts diffuse light on the tilted panel with the Perez model (which counts the brighter sky around the sun). The same script also runs the isotropic sky model calc.js uses. 144 cases: Manila, Laoag and Davao; January, April, July and October; tilt 5, 10, 20 and 30°; south, east and west. Fixture: `test/fixtures-poa-perez.json`; test: `test/poa-perez.test.mjs`.

## Result

- **The method is sound.** Against the independent isotropic run, poaMonth is within 0.4% at 10° tilt and within 1.6% in every case, so the mean-day apportioning is not a source of error worth fixing.
- **The sky model matters on south-facing panels in clear months.** Against Perez, poaMonth reads low by 2 to 3.4% at 10° tilt facing south from October to January, and by up to 7.9% at 30°. East and west faces are within 1.5%. Mean over all cases: −0.5% at 5°, −0.9% at 10°, −1.2% at 20° and 30°.
- **What it does to PR.** Sun on the panels reading 3.4% low makes PR read about 3.5% high, so a south-facing roof at 10° in January would show a PR of about 0.78 where Perez gives 0.75. The error runs the opposite way to NASA POWER's dry-season low bias (up to 8% low, README "Sources decision"), so the two partly cancel in the dry months; the wider dry-season amber band was set for the NASA bias alone.

## poaMonth against Perez, by case

| Site | Month | Facing | 5° | 10° | 20° | 30° |
| --- | --- | --- | --- | --- | --- | --- |
| Manila | Jan | south | -1.9% | -3.4% | -5.9% | -7.9% |
| Manila | Jan | east | -0.5% | -0.8% | -1.2% | -1.4% |
| Manila | Jan | west | -0.5% | -0.7% | -1.2% | -1.4% |
| Manila | Apr | south | -0.5% | -0.9% | -1.4% | -1.6% |
| Manila | Apr | east | -0.4% | -0.6% | -0.5% | -0.0% |
| Manila | Apr | west | -0.4% | -0.6% | -0.5% | -0.1% |
| Manila | Jul | south | +0.1% | +0.3% | +1.0% | +2.5% |
| Manila | Jul | east | -0.4% | -0.6% | -0.8% | -0.6% |
| Manila | Jul | west | -0.4% | -0.6% | -0.7% | -0.6% |
| Manila | Oct | south | -1.3% | -2.4% | -4.1% | -5.5% |
| Manila | Oct | east | -0.4% | -0.7% | -0.9% | -1.0% |
| Manila | Oct | west | -0.4% | -0.7% | -0.9% | -1.0% |
| Laoag | Jan | south | -1.6% | -2.9% | -5.0% | -6.6% |
| Laoag | Jan | east | -0.4% | -0.7% | -0.7% | -0.6% |
| Laoag | Jan | west | -0.5% | -0.7% | -0.8% | -0.7% |
| Laoag | Apr | south | -0.6% | -1.1% | -1.8% | -2.2% |
| Laoag | Apr | east | -0.4% | -0.5% | -0.2% | +0.5% |
| Laoag | Apr | west | -0.4% | -0.5% | -0.3% | +0.4% |
| Laoag | Jul | south | -0.2% | -0.3% | -0.1% | +0.7% |
| Laoag | Jul | east | -0.4% | -0.6% | -0.7% | -0.4% |
| Laoag | Jul | west | -0.4% | -0.6% | -0.7% | -0.4% |
| Laoag | Oct | south | -1.2% | -2.2% | -3.8% | -5.1% |
| Laoag | Oct | east | -0.4% | -0.6% | -0.7% | -0.5% |
| Laoag | Oct | west | -0.4% | -0.6% | -0.7% | -0.5% |
| Davao | Jan | south | -1.5% | -2.9% | -5.0% | -6.7% |
| Davao | Jan | east | -0.4% | -0.6% | -0.8% | -0.8% |
| Davao | Jan | west | -0.4% | -0.7% | -0.9% | -0.9% |
| Davao | Apr | south | -0.2% | -0.3% | -0.2% | +0.3% |
| Davao | Apr | east | -0.4% | -0.5% | -0.4% | +0.1% |
| Davao | Apr | west | -0.4% | -0.5% | -0.4% | +0.1% |
| Davao | Jul | south | +0.3% | +0.7% | +2.0% | +4.1% |
| Davao | Jul | east | -0.4% | -0.5% | -0.5% | -0.1% |
| Davao | Jul | west | -0.4% | -0.6% | -0.6% | -0.2% |
| Davao | Oct | south | -0.9% | -1.6% | -2.8% | -3.5% |
| Davao | Oct | east | -0.4% | -0.6% | -0.5% | -0.1% |
| Davao | Oct | west | -0.4% | -0.6% | -0.6% | -0.2% |
## Decisions for Fred

1. **Sky model.** At the common tilt (10° or less) one case passes 3% (Manila, January, 10°, south: −3.4%), so the ticket says to ask. Options: keep isotropic and say so in the method guide; or move `calc.poaMonth` to a sky model that counts the bright sky round the sun (Hay-Davies is a small change; Perez needs more inputs). Changing it moves every PR by up to about 3% at common tilts, more on steep south roofs, and would need the dry-season band looked at again, since the two biases partly cancel today.
2. **Air temperature in the grid (`t2m`).** About a third of `ph-grid.json` and unused. Options: drop it (smaller file, simpler lookup), or use it for a plain note on hot sites ("panels run hotter here, so PR sits a few points lower"). Using it to move a band would be a threshold change.
