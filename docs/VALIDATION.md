# TUG//LAB — Validation protocol (replay mode)

Replay mode lets you validate the app's automatic stopwatch and gait metrics
against a human-scored reference, using pre-recorded phone videos — no live
participant needed. This is the recommended way to tune the `[TUNE]` parameters
in `js/config.js` and to report accuracy before using the app for screening.

## What you are validating
1. **Total TUG time** (primary) — app vs manual video timing.
2. **Phase/event times** — seat-off, standing, cone turn, seat contact.
3. **Gait metrics** — stride length/time, gait velocity (where a reference exists).

## Materials
- 20+ phone video clips of TUG trials filmed in the **operator-following,
  portrait** style the app is designed for (see README §7). Include a range of
  speeds (fast and slow older-adult gait ≈ 18 s), both course directions, and at
  least a few with a walking aid.
- A manual reference time per clip: scrub the video frame-by-frame and record
  the time from the "Go" frame to the first frame where the buttocks contact the
  seat. Two raters are better (report inter-rater agreement).

## Procedure
1. Open the app over HTTPS (GitHub Pages). On the entry screen, open **Advanced —
   analyse a video file (replay)** (or add `?dev=1` to auto-expand it).
2. Enter participant data (ID, age, sex, height at minimum).
3. Pick the clip. The app runs it through the same pose + analysis pipeline and
   lands on the results screen. Sessions are marked `source = replay`.
4. **Download ZIP** for each clip. Record `total_time_taken_s` and the event
   times from `*_summary.csv` / `*_events.csv`.
5. Repeat for all clips. Collate app time vs manual time in a spreadsheet.

## Analysis
For each clip compute `error = app_time − manual_time` (seconds).

- **Mean absolute error (MAE):** `mean(|error|)`.
- **Bias (mean error):** `mean(error)` — systematic over/under-timing.
- **Limits of agreement (Bland–Altman):** `bias ± 1.96 × SD(error)`. Plot the
  difference (app − manual) against the mean of the two on the x-axis; most
  points should fall within the limits of agreement with no trend.
- Repeat for each event time and for stride length/time if a reference exists.

### Reporting template
| Metric | n | Bias | SD | MAE | 95% LoA |
|---|---|---|---|---|---|
| Total time (s) | | | | | |
| Seat-off (s) | | | | | |
| Standing (s) | | | | | |
| Cone turn start (s) | | | | | |
| Seat contact (s) | | | | | |
| Mean stride length (m) | | | | | |

## Tuning
If bias or MAE is unacceptable, adjust the `[TUNE]` parameters in `js/config.js`
(`signal.cutoffHz`, `events.turnSpeedFrac`, `events.seatContactMaxSpeedMs`,
`gait.minHsIntervalS`, `gait.minProminenceTrunk`) and re-run the same clips. Bump
`CONFIG.app.analysisVersion` when you change any parameter so results stay
traceable to the version that produced them.

## Caveats of the panning-camera design
Because the operator follows the participant, travelled distance is reconstructed
from pelvis-relative stance-foot motion (world landmarks) rather than a fixed
image reference. Validate distance-derived metrics (stride length, gait velocity)
especially carefully, and prefer a known course length (3 m) as a cross-check:
compare `gait_velocity_nominal_m_s` (from the fixed course) with
`gait_velocity_m_s` (from reconstructed strides). Large disagreement indicates the
walk was not parallel to the camera (see the `DEPTH_DRIFT` QC flag).
