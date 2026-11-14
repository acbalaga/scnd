# Weather-source health

Ticket #48, decided by Fred 14 Nov 2026. The app's weather check compares each bill with two sources: the Himawari satellite (through Open-Meteo) and NASA POWER. When the satellite has data for under 80% of a period's days, the check uses NASA POWER alone and says so (`Inferred`), and since ticket #40 a one-source index cannot mark a month lower. In 2026 the satellite went missing for months at a time at some points, and nothing tracked it.

## How it runs

- `scripts/source-health.mjs` fetches both daily series for the 17 public city points in `public/js/cities.js` (no user data) and writes `public/data/source-status.json`: for each of the last 13 full months, the share of days with data and the weather index, per source and city.
- `.github/workflows/source-health.yml` runs it at 03:17 UTC on the 2nd of each month and opens a pull request with the new file. It fails, and writes nothing, if a source answers for no city.
- Before a weather check, the app reads the file and names the months where the satellite falls short at the nearest city (`sources.js` `satelliteGaps`).
- **Fred, once:** GitHub > Settings > Actions > General > Workflow permissions: allow GitHub Actions to create and approve pull requests. Without it the run works but cannot open the pull request. The schedule only runs once the workflow is on `main`. To run it by hand: Actions > source-health > Run workflow, or `node scripts/source-health.mjs` locally.

## First run, 2026-11-14: satellite days with data

NASA POWER had data for every day of every month at every point. The satellite:

| City | Oct 25 | Nov 25 | Dec 25 | Jan 26 | Feb 26 | Mar 26 | Apr 26 | May 26 | Jun 26 | Jul 26 | Aug 26 | Sep 26 | Oct 26 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Laoag | 100% | 100% | 100% | 16% | 46% | 77% | 100% | 100% | 70% | 0% | 0% | 60% | 32% |
| Tuguegarao | 100% | 100% | 100% | 100% | 46% | 77% | 97% | 100% | 87% | 84% | 94% | 90% | 94% |
| Baguio | 100% | 100% | 100% | 45% | 86% | 81% | 97% | 87% | 90% | 84% | 90% | 90% | 90% |
| Angeles | 100% | 100% | 100% | 26% | 32% | 13% | 13% | 100% | 70% | 3% | 94% | 77% | 94% |
| Quezon City | 100% | 100% | 100% | 16% | 18% | 10% | 0% | 0% | 0% | 65% | 90% | 87% | 42% |
| Manila | 100% | 100% | 100% | 16% | 18% | 10% | 0% | 0% | 0% | 0% | 0% | 60% | 6% |
| Batangas | 100% | 100% | 100% | 97% | 89% | 81% | 100% | 97% | 90% | 58% | 94% | 87% | 90% |
| Legazpi | 100% | 100% | 100% | 90% | 75% | 81% | 93% | 100% | 73% | 68% | 90% | 90% | 90% |
| Puerto Princesa | 100% | 100% | 100% | 97% | 89% | 77% | 100% | 100% | 73% | 68% | 90% | 87% | 87% |
| Iloilo | 100% | 100% | 100% | 100% | 71% | 74% | 100% | 94% | 90% | 84% | 90% | 90% | 94% |
| Bacolod | 100% | 100% | 100% | 16% | 25% | 13% | 0% | 0% | 60% | 84% | 94% | 90% | 90% |
| Cebu | 100% | 100% | 100% | 74% | 18% | 6% | 0% | 3% | 90% | 81% | 94% | 90% | 90% |
| Tacloban | 100% | 100% | 100% | 97% | 89% | 77% | 100% | 87% | 90% | 84% | 42% | 63% | 90% |
| Cagayan de Oro | 100% | 100% | 100% | 100% | 39% | 61% | 97% | 100% | 83% | 84% | 94% | 77% | 90% |
| Davao | 100% | 100% | 100% | 100% | 89% | 61% | 100% | 71% | 80% | 77% | 94% | 90% | 94% |
| General Santos | 100% | 100% | 100% | 100% | 89% | 61% | 0% | 3% | 27% | 10% | 10% | 43% | 94% |
| Zamboanga | 100% | 100% | 100% | 16% | 68% | 19% | 0% | 71% | 83% | 68% | 90% | 90% | 94% |

Months at 80% or more, of 13: Laoag 5, Tuguegarao 11, Baguio 12, Angeles 6, Quezon City 5, Manila 3, Batangas 12, Legazpi 10, Puerto Princesa 10, Iloilo 11, Bacolod 7, Cebu 8, Tacloban 10, Cagayan de Oro 10, Davao 10, General Santos 6, Zamboanga 7.
