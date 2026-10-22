# TUG//LAB — Data Dictionary

Auto-generated from `js/schema.js` + `js/config.js` by `tools/build-dictionary.html`.
Schema version **1.0** · generated 2026-10-22.

## 1. Conventions
- Time `t = 0` at **GO**; negative `t` = pre-roll (seated baseline).
- Image coordinates are MediaPipe-normalised (0–1). World landmarks are metric,
  pelvis-origin, y **down**-positive, camera-motion-invariant for body geometry.
- Path coordinate `s` (m): reconstructed travel toward the cone (panning-safe).
- Vertical quantities positive **up**. Angles in **degrees**.
- Booleans export `TRUE`/`FALSE`. `null` = empty cell. **No zero-filling.**
- Trunk / shank inclination positive = leaning forward in the current facing
  direction. Facing `f(t)` ∈ {+1, −1} from toe-ahead-of-heel.

## 2. Sessions table (one row per submitted attempt)

#### Session

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `session_id` | uuid | — | Unique id for this attempt. | crypto.randomUUID() at test start. |
| `timestamp_utc` | datetime | — | UTC timestamp when the test was run. | new Date().toISOString(). |
| `utc_offset_min` | integer | min | Local offset from UTC. | -new Date().getTimezoneOffset(). |
| `app_version` | string | — | App build version. | CONFIG.app.version. |
| `analysis_version` | string | — | Analysis engine version. | CONFIG.app.analysisVersion. |
| `schema_version` | string | — | Data schema version. | CONFIG.app.schemaVersion. |
| `participant_id` | string | — | Pseudonymous participant id (never a real name). | Operator input. |
| `age_years` | integer | years | Participant age. | Operator input. |
| `sex` | string | — | male / female / other. | Operator input. |
| `height_cm` | number | cm | Standing height. | Operator input; used for body-scale calibration. |
| `body_mass_kg` | number | kg | Body mass (optional). | Operator input. |
| `body_fat_pct` | number | % | Body fat percentage (optional). | Operator input. |
| `bmr_kcal_day` | number | kcal/day | Basal metabolic rate (male/female only). | Mifflin–St Jeor from height, mass, age, sex. |
| `chair_seat_height_cm` | number | cm | Seat height of the chair used. | Operator input (default 46). |
| `assistive_device` | string | — | none / cane / walker / other. | Operator input. |
| `site` | string | — | Site or session label. | Operator input. |
| `operator_notes` | string | — | Free-text operator notes. | Operator input. |
| `instruction_language` | string | — | Demo video language shown (en/zh/yue). | Operator selection. |
| `attempt_no` | integer | — | Attempt number this sitting (1 or 2). | Counter. |
| `attempts_total` | integer | — | Total attempts recorded this sitting. | Counter. |
| `selected_attempt` | boolean | bool | Whether this attempt was the one submitted. | Operator choice on 2nd attempt. |
| `test_outcome` | string | — | completed / unable / aborted. | Flow state. |
| `unable_reason` | string | — | Reason if unable (medical/safety/refused/other + text). | Operator input. |
| `source` | string | — | live or replay (analysed from a file). | Capture mode. |

#### Device

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `pose_model` | string | — | MediaPipe model used (lite/full/heavy). | Operator selection. |
| `pose_delegate` | string | — | GPU or CPU delegate actually used. | Resolved at load. |
| `camera_facing` | string | — | environment (rear) or user (front). | Operator selection. |
| `lens_label` | string | — | Label of the chosen camera/lens. | MediaDeviceInfo.label. |
| `video_width_px` | integer | px | Actual capture width. | video.videoWidth. |
| `video_height_px` | integer | px | Actual capture height. | video.videoHeight. |
| `orientation` | string | — | Screen orientation during capture. | screen.orientation.type. |
| `user_agent` | string | — | Browser user agent. | navigator.userAgent. |
| `effective_fs_hz` | number | Hz | Measured capture frame rate. | Frames counted over elapsed time. |
| `panning_mode` | boolean | bool | Operator-following (moving) camera used. | CONFIG.panning.enabled. |

#### Protocol

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `course_length_m` | number | m | Chair-to-cone distance. | CONFIG.protocol.courseLengthM. |
| `max_duration_s` | number | s | Hard-stop duration. | CONFIG.protocol.maxDurationS. |
| `test_duration_s` | number | s | Recording duration from GO to finish. | Live timer. |
| `manual_stop` | boolean | bool | Operator pressed STOP (aborted). | Flow state. |
| `auto_finished` | boolean | bool | Auto-complete fired (seated + still). | Live state machine. |
| `practice_done_confirmed` | boolean | bool | Practice-trial checkbox ticked. | Pre-test checks. |
| `safety_confirmed` | boolean | bool | Safety checkbox ticked. | Pre-test checks. |
| `armchair_confirmed` | boolean | bool | Armchair checkbox ticked. | Pre-test checks. |
| `footwear_assist_confirmed` | boolean | bool | Footwear/assist checkbox ticked. | Pre-test checks. |
| `calibration_method` | string | — | course / body / both / world. | Calibration performed. |
| `walk_dir_out` | string | — | Outbound direction (left_to_right / right_to_left). | From first walk segment / tap order. |
| `scale_m_per_px_walk` | number | m/px | Course-scale (metres per pixel along path). | course_length_m / course_px (if tapped). |
| `scale_m_per_px_body` | number | m/px | Body-scale (metres per pixel). | height×0.779 / chain pixel length (Winter 2009). |
| `scale_check_diff_pct` | number | % | Percent difference between the two scales. | \|course-body\|/mean×100. |
| `filter_cutoff_hz` | number | Hz | Body-marker low-pass cutoff. | CONFIG.signal.cutoffHz. |
| `filter_cutoff_foot_hz` | number | Hz | Foot-marker low-pass cutoff. | CONFIG.signal.cutoffFootHz. |
| `resample_hz` | number | Hz | Uniform analysis sample rate. | CONFIG.signal.resampleHz. |
| `live_time_s` | number | s | Live (causal) timer value. | Feedback timer, GO to finish. |
| `live_vs_offline_diff_s` | number | s | Live minus offline total time. | Audit of live vs authoritative time. |

#### Outcome

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `total_time_taken_s` | number | s | TUG time: GO to seat contact. | t_seat_contact − 0. |
| `total_time_from_seat_off_s` | number | s | Seat-off to seat-contact (excludes reaction). | t_seat_contact − t_seat_off. |
| `reaction_time_s` | number | s | GO to first movement. | t_seat_off − 0. |
| `fall_risk_cdc` | string | — | CDC label: At risk / Not at risk. | ≥12.0 s → At risk (CDC STEADI). |
| `fall_risk_tier` | string | — | low / moderate / high (UI convention). | <10 low; 10–<12 moderate; ≥12 high. [TUNE] |
| `fall_probability` | number | — | Server ML probability (not produced). | Always empty — model unavailable. |
| `alt_cutoff_flag_13_5` | boolean | bool | Time ≥ 13.5 s (Barry 2014 cut-point). | total_time ≥ 13.5. |
| `mobility_category` | string | — | Descriptive mobility band. | Podsiadlo & Richardson (1991) bands. [VERIFY] |
| `age_norm_band` | string | — | Age band used for norm comparison. | 60-69 / 70-79 / 80-99. |
| `age_norm_mean_s` | number | s | Reference mean for the band. | Bohannon (2006). [VERIFY] |
| `age_norm_ci_low_s` | number | s | Reference CI low. | Bohannon (2006). [VERIFY] |
| `age_norm_ci_high_s` | number | s | Reference CI high. | Bohannon (2006). [VERIFY] |
| `age_norm_comparison` | string | — | Faster / Within / Slower than CI. | total_time vs band CI. |
| `valid_for_norm` | boolean | bool | Eligible for norm comparison. | No blocking QC, checks ticked, completed, age≥60. |

#### Events

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `t_seat_off_s` | number | s | Movement onset. | First p ≥ seatOffPct after GO. |
| `t_standing_s` | number | s | Full extension reached. | First p ≥ standingPct and knee near standing. |
| `t_walk_start_s` | number | s | First toe-off after standing. | First TO; fallback path speed ≥ minWalkSpeed. |
| `t_turn1_start_s` | number | s | Start of turn at the cone. | Last out-speed ≥ turnSpeedFrac before furthest point. |
| `t_turn1_end_s` | number | s | End of turn at the cone. | First back-speed ≥ turnSpeedFrac after furthest point. |
| `t_turn2_start_s` | number | s | Start of turn at the chair. | Back-speed falls below turnSpeedFrac near chair. |
| `t_sit_descent_start_s` | number | s | Start of final sit descent. | Last p ≥ standingPct before seat contact. |
| `t_seat_contact_s` | number | s | Buttocks reach the seat (stops the clock). | First p ≤ sitContactPct with \|hip v\| < seatContactMaxSpeed. |

#### Phases

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `time_seated_to_full_extension_s` | number | s | ★ Sit-to-stand duration. | t_standing − t_seat_off. |
| `time_walk_out_s` | number | s | Walk-out duration. | t_turn1_start − t_standing. |
| `time_around_cone_s` | number | s | ★ Turn-at-cone duration. | t_turn1_end − t_turn1_start. |
| `time_walk_back_s` | number | s | Walk-back duration. | t_turn2_start − t_turn1_end. |
| `time_turn_to_sit_s` | number | s | ★ Turn-to-sit-approach duration. | t_sit_descent_start − t_turn2_start. |
| `time_to_sitting_down_s` | number | s | ★ Sit-down descent duration. | t_seat_contact − t_sit_descent_start. |
| `pct_sit_to_stand` | number | % | Sit-to-stand as % of total. | phase/total×100. |
| `pct_walk` | number | % | Walking (out+back) as % of total. | phase/total×100. |
| `pct_turns` | number | % | Turns as % of total. | phase/total×100. |
| `pct_stand_to_sit` | number | % | Stand-to-sit as % of total. | phase/total×100. |

#### Gait

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `gait_velocity_m_s` | number | m/s | ★ Primary gait velocity. | Path distance / time between first & last HS per segment, distance-weighted. |
| `gait_velocity_nominal_m_s` | number | m/s | Nominal velocity from course length. | 2×course / (time_walk_out + time_walk_back). |
| `walk_out_velocity_m_s` | number | m/s | Mean velocity, outbound. | Out path distance / out walk time. |
| `walk_back_velocity_m_s` | number | m/s | Mean velocity, return. | Back path distance / back walk time. |
| `velocity_change_pct` | number | % | Back vs out velocity change. | (back−out)/out×100. |
| `average_stride_length_m` | number | m | ★ Mean stride length (both feet). | Mean of included strides. |
| `average_stride_time_s` | number | s | ★ Mean stride time (both feet). | Mean of included strides. |
| `average_left_stride_length_m` | number | m | ★ Mean left stride length. | Mean left-foot strides. |
| `average_left_stride_time_s` | number | s | ★ Mean left stride time. | Mean left-foot strides. |
| `average_right_stride_length_m` | number | m | ★ Mean right stride length. | Mean right-foot strides. |
| `average_right_stride_time_s` | number | s | ★ Mean right stride time. | Mean right-foot strides. |
| `step_length_left_mean_m` | number | m | Mean left step length. | Mean of left steps. |
| `step_length_right_mean_m` | number | m | Mean right step length. | Mean of right steps. |
| `step_time_left_mean_s` | number | s | Mean left step time. | Mean of left steps. |
| `step_time_right_mean_s` | number | s | Mean right step time. | Mean of right steps. |
| `cadence_steps_min` | number | steps/min | Cadence over straight walking. | steps / walking time × 60. |
| `n_steps_total` | integer | — | Total detected steps. | HS count in straight segments. |
| `n_steps_out` | integer | — | Steps outbound. | HS count in WALK_OUT. |
| `n_steps_back` | integer | — | Steps return. | HS count in WALK_BACK. |
| `n_strides_left` | integer | — | Left strides included. | Consecutive same-foot HS pairs. |
| `n_strides_right` | integer | — | Right strides included. | Consecutive same-foot HS pairs. |
| `stride_time_cv_pct` | number | % | Stride-time variability. | SD/mean×100 (≥4 strides). |
| `stride_length_cv_pct` | number | % | Stride-length variability. | SD/mean×100 (≥4 strides). |
| `stride_length_asym_pct` | number | % | Stride-length L/R asymmetry. | \|L−R\|/(0.5(L+R))×100. |
| `stride_time_asym_pct` | number | % | Stride-time L/R asymmetry. | \|L−R\|/(0.5(L+R))×100. |
| `step_length_asym_pct` | number | % | Step-length L/R asymmetry. | \|L−R\|/(0.5(L+R))×100. |
| `step_time_asym_pct` | number | % | Step-time L/R asymmetry. | \|L−R\|/(0.5(L+R))×100. |

#### FootPattern

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `first_foot_walk` | string | — | ★ Foot of first toe-off after standing. | left / right. |
| `last_foot_walk` | string | — | ★ Foot of last HS before cone turn. | left / right. |
| `first_foot_around_cone` | string | — | ★ Foot of first toe-off in cone turn. | left / right. |
| `last_foot_turn_before_sitting` | string | — | ★ Foot of last toe-off before sit descent. | left / right. |

#### Turns

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `turn1_n_steps` | integer | — | Steps in cone turn. | HS count inside TURN_1. |
| `turn1_yaw_change_deg` | number | deg | Total yaw change, cone turn. | Unwrapped torso yaw (expect ≈180°). |
| `turn1_peak_yaw_rate_deg_s` | number | deg/s | Peak yaw rate, cone turn. | max \|d(yaw)/dt\|. |
| `turn1_mean_yaw_rate_deg_s` | number | deg/s | Mean yaw rate, cone turn. | yaw change / duration. |
| `turn1_yaw_rate_peaks` | integer | — | Yaw-rate peaks (smoothness proxy). | Count of yaw-rate velocity peaks. [exploratory] |
| `turn2_n_steps` | integer | — | Steps in chair turn. | HS count inside TURN_2. |
| `turn2_yaw_change_deg` | number | deg | Total yaw change, chair turn. | Unwrapped torso yaw. |
| `turn2_peak_yaw_rate_deg_s` | number | deg/s | Peak yaw rate, chair turn. | max \|d(yaw)/dt\|. |
| `turn2_mean_yaw_rate_deg_s` | number | deg/s | Mean yaw rate, chair turn. | yaw change / duration. |
| `turn2_yaw_rate_peaks` | integer | — | Yaw-rate peaks, chair turn. | Count of yaw-rate velocity peaks. [exploratory] |

#### SitToStand

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `sts_hip_rise_m` | number | m | Hip vertical rise. | hip_up_stand − hip_up_seated. |
| `sts_ascent_time_s` | number | s | Ascent duration. | t_standing − t_seat_off. |
| `sts_peak_ascent_velocity_m_s` | number | m/s | Peak upward hip velocity. | max d(hip_up)/dt in ascent. |
| `sts_mean_ascent_velocity_m_s` | number | m/s | Mean upward hip velocity. | hip_rise / ascent_time. |
| `sts_knee_flex_seatoff_deg` | number | deg | Knee flexion at seat-off. | 180−∠(hip,knee,ankle) at seat-off. |
| `sts_knee_flex_standing_deg` | number | deg | Knee flexion at standing. | At t_standing. |
| `sts_knee_rom_deg` | number | deg | Knee ROM during rise. | seatoff − standing flexion. |
| `sts_knee_ext_peak_vel_deg_s` | number | deg/s | Peak knee extension ang. velocity. | max \|d(knee)/dt\| in ascent. |
| `sts_hip_flex_seatoff_deg` | number | deg | Hip flexion at seat-off. | 180−∠(shoulder,hip,knee). |
| `sts_hip_flex_standing_deg` | number | deg | Hip flexion at standing. | At t_standing. |
| `sts_hip_ext_peak_vel_deg_s` | number | deg/s | Peak hip extension ang. velocity. | max \|d(hip)/dt\| in ascent. |
| `sts_trunk_lean_peak_deg` | number | deg | Peak forward trunk lean. | max trunk inclination in ascent. |
| `sts_trunk_incl_standing_deg` | number | deg | Trunk inclination when standing. | At t_standing. |
| `sts_work_rate_proxy_w` | number | W | Rise work-rate proxy (needs mass). | m·g·hip_rise / ascent_time; null if no mass. |
| `sts_arm_push_suspected` | boolean | bool | Arm push on chair suspected (informational). | Wrist near chest/seat during rise. |

#### StandToSit

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `sit_descent_time_s` | number | s | Descent duration. | t_seat_contact − t_sit_descent_start. |
| `sit_peak_descent_velocity_m_s` | number | m/s | Peak downward hip velocity. | max \|d(hip_up)/dt\| (down) in descent. |
| `sit_mean_descent_velocity_m_s` | number | m/s | Mean downward hip velocity. | hip drop / descent_time. |
| `sit_controlled_descent_index` | number | — | Descent control index (higher=less controlled). | peak / mean descent velocity. [exploratory] |
| `sit_trunk_lean_peak_deg` | number | deg | Peak forward trunk lean on sitting. | max trunk inclination in descent. |
| `sit_knee_flex_at_contact_deg` | number | deg | Knee flexion at seat contact. | At t_seat_contact. |

#### GaitKinematics

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `knee_flex_swing_peak_left_deg` | number | deg | Peak left knee flexion in swing. | Mean over left strides. |
| `knee_flex_swing_peak_right_deg` | number | deg | Peak right knee flexion in swing. | Mean over right strides. |
| `hip_flex_peak_left_deg` | number | deg | Peak left hip flexion. | Mean over left strides. |
| `hip_flex_peak_right_deg` | number | deg | Peak right hip flexion. | Mean over right strides. |
| `hip_ext_peak_left_deg` | number | deg | Peak left hip extension. | Mean over left strides. |
| `hip_ext_peak_right_deg` | number | deg | Peak right hip extension. | Mean over right strides. |
| `hip_rom_left_deg` | number | deg | Left hip ROM per cycle. | flex−ext peak, mean over strides. |
| `hip_rom_right_deg` | number | deg | Right hip ROM per cycle. | flex−ext peak, mean over strides. |
| `trunk_incl_walk_mean_deg` | number | deg | Mean trunk inclination, walking. | Mean over straight segments. |
| `trunk_incl_walk_sd_deg` | number | deg | SD trunk inclination, walking. | SD over straight segments. |
| `hip_vertical_osc_m` | number | m | Vertical hip oscillation. | Mean peak-to-peak per stride. |
| `arm_swing_amp_left_trunklen` | number | trunk-len | Left arm-swing amplitude. | Wrist x rel. shoulder, peak-to-peak. [exploratory] |
| `arm_swing_amp_right_trunklen` | number | trunk-len | Right arm-swing amplitude. | Wrist x rel. shoulder, peak-to-peak. [exploratory] |

#### Observations

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `obs_slow_tentative_pace` | boolean | bool | Slow / tentative pace observed. | Operator checkbox (CDC). |
| `obs_loss_of_balance` | boolean | bool | Loss of balance observed. | Operator checkbox (CDC). |
| `obs_short_strides` | boolean | bool | Short strides observed. | Operator checkbox (CDC). |
| `obs_little_arm_swing` | boolean | bool | Little or no arm swing observed. | Operator checkbox (CDC). |
| `obs_steadying_on_walls` | boolean | bool | Steadying on walls observed. | Operator checkbox (CDC). |
| `obs_shuffling` | boolean | bool | Shuffling observed. | Operator checkbox (CDC). |
| `obs_en_bloc_turning` | boolean | bool | En bloc turning observed. | Operator checkbox (CDC). |
| `obs_assistive_device_misuse` | boolean | bool | Assistive device misused. | Operator checkbox (CDC). |

#### Calibration

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `dominant_side` | string | — | Near-camera (dominant) side. | Higher mean chain visibility. |
| `calib_course_px` | number | px | Chair-to-cone pixel distance (if tapped). | \|cone_x − chair_x\|. |
| `calib_chair_x_px` | number | px | Chair tap x. | Operator tap (static-camera option). |
| `calib_cone_x_px` | number | px | Cone tap x. | Operator tap (static-camera option). |
| `calib_chain_px` | number | px | Body chain pixel length. | Shoulder-hip-knee-ankle length. |
| `calib_hip_up_seated_m` | number | m | Seated hip height (world). | Pre-roll median world hip height. |
| `calib_hip_up_stand_m` | number | m | Standing hip height (world). | Median during steady walk. |
| `calib_standing_knee_flex_deg` | number | deg | Standing knee flexion. | Median during steady walk. |
| `calib_seated_knee_flex_deg` | number | deg | Seated knee flexion. | Pre-roll median. |
| `calib_seated_arm_dev` | number | trunk-len | Seated arm deviation baseline. | Pre-roll wrist-shoulder offset. |
| `calib_shank_from_vertical_deg` | number | deg | Standing shank angle from vertical. | Camera-tilt proxy. |

#### QC

| Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|
| `valid_frame_pct` | number | % | Frames with all chain markers. | valid/total×100. |
| `imputed_sample_pct` | number | % | Samples imputed by gap bridging. | imputed/total×100. |
| `longest_gap_s` | number | s | Longest tracking gap. | Max contiguous invalid span. |
| `median_chain_visibility` | number | — | Median visibility of the chain. | Median over frames. |
| `view_obliquity_median` | number | — | Median hip-sep/trunk-len (side-on check). | Lower = more side-on. |
| `depth_drift_pct` | number | % | Chain-length drift along walk. | Walking not parallel to camera if high. |
| `knee_2d_3d_diff_deg` | number | deg | 2D vs 3D knee-angle disagreement. | Mean \|2D−3D\|. |
| `lr_swap_corrections` | integer | — | Left/right label corrections. | Count during continuity resolution. |
| `camera_yaw_rate_median_deg_s` | number | deg/s | Median camera pan rate (panning mode). | From world-vertical stability estimate. |
| `n_strides_included` | integer | — | Strides used in means. | Count. |
| `n_strides_excluded` | integer | — | Strides excluded. | Count (turn overlap, etc.). |
| `qc_flags` | string | — | Semicolon-separated QC flags. | See data dictionary §9. |
| `qc_pass` | boolean | bool | No blocking QC flag. | TRUE if no blocking flag raised. |


## 3. Steps table (one row per heel strike)
| # | Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|---|
| 1 | `session_id` | uuid | — | Owning session. | Join key. |
| 2 | `step_index` | integer | — | Ordinal within the test. | Sequence. |
| 3 | `foot` | string | — | left / right. | Foot identity (continuity-resolved). |
| 4 | `segment` | string | — | OUT / BACK / TURN_1 / TURN_2. | Phase the HS fell in. |
| 5 | `t_hs_s` | number | s | Heel-strike time. | Zeni maxima of foot-ahead signal. |
| 6 | `t_to_prev_same_foot_s` | number | s | Time since previous same-foot HS. | Stride time (backward). |
| 7 | `t_to_next_same_foot_s` | number | s | Time to next same-foot HS. | Stride time (forward). |
| 8 | `heel_x_m_path` | number | m | Heel position along path. | Path coordinate at HS. |
| 9 | `step_time_s` | number | s | Step time (opposite-foot HS to this HS). | HS_n − HS_{opposite}. |
| 10 | `step_length_m` | number | m | Step length. | Heel-to-heel distance at HS. |
| 11 | `stride_time_s` | number | s | Stride time (same-foot). | HS_{k} − HS_{k-1} same foot. |
| 12 | `stride_length_m` | number | m | Stride length (same-foot). | Heel displacement between same-foot HS. |
| 13 | `stride_velocity_m_s` | number | m/s | Stride velocity. | stride_length / stride_time. |
| 14 | `t_toe_off_s` | number | s | Following toe-off time. | Zeni minima after HS. |
| 15 | `stance_pct` | number | % | Stance phase percentage. | stance / stride × 100. |
| 16 | `swing_pct` | number | % | Swing phase percentage. | 100 − stance_pct. |
| 17 | `knee_flex_swing_peak_deg` | number | deg | Peak knee flexion in swing. | Max within the stride. |
| 18 | `hip_flex_at_hs_deg` | number | deg | Hip flexion at HS. | At t_hs. |
| 19 | `hip_ext_peak_deg` | number | deg | Peak hip extension. | Max within the stride. |
| 20 | `trunk_incl_at_hs_deg` | number | deg | Trunk inclination at HS. | At t_hs. |
| 21 | `included_in_means` | boolean | bool | Counted in summary means. | False if excluded. |
| 22 | `exclusion_reason` | string | — | Why excluded (if any). | turn_overlap / first_last / nonalternating. |


## 4. Events table (timeline)
| # | Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|---|
| 1 | `session_id` | uuid | — | Owning session. | Join key. |
| 2 | `event_index` | integer | — | Ordinal in the timeline. | Sequence. |
| 3 | `event_code` | string | — | Event code. | GO/SEAT_OFF/STANDING/WALK_START/HS_L/HS_R/TO_L/TO_R/TURN1_START/TURN1_FAR/TURN1_END/TURN2_START/SIT_DESCENT_START/SEAT_CONTACT/END. |
| 4 | `t_s` | number | s | Event time. | Relative to GO. |
| 5 | `path_s_m` | number | m | Path coordinate at event. | Reconstructed distance along course. |
| 6 | `hip_progress` | number | — | Hip-progress p at event. | 0 seated, 1 standing. |
| 7 | `facing` | integer | — | Facing direction (+1/−1). | Sign of toe-ahead-of-heel. |
| 8 | `note` | string | — | Optional note. | Free text (e.g. foot). |


## 5. Frames table (analysed 30 Hz series)
| # | Column | Type | Unit | Description | Calculation / source |
|---|---|---|---|---|---|
| 1 | `session_id` | uuid | — | Owning session. | Join key. |
| 2 | `t_s` | number | s | Sample time. | Uniform 30 Hz grid, relative to GO. |
| 3 | `phase` | string | — | Phase label. | From event segmentation. |
| 4 | `tracking_gap` | boolean | bool | Sample was imputed. | True if bridged gap. |
| 5 | `facing` | integer | — | Facing direction (+1/−1). | Debounced toe-ahead sign. |
| 6 | `progress` | number | — | Hip progress p. | (hip_up−seated)/(stand−seated). |
| 7 | `hip_up_m` | number | m | Hip height (world). | World vertical of hip mid. |
| 8 | `path_s_m` | number | m | Path coordinate. | Reconstructed travel distance. |
| 9 | `hip_vel_up_m_s` | number | m/s | Vertical hip velocity. | d(hip_up)/dt. |
| 10 | `hip_vel_path_m_s` | number | m/s | Along-path hip velocity. | d(path_s)/dt. |
| 11 | `knee_flex_l_deg` | number | deg | Left knee flexion. | 180−∠(hip,knee,ankle). |
| 12 | `knee_flex_r_deg` | number | deg | Right knee flexion. | 180−∠(hip,knee,ankle). |
| 13 | `hip_flex_l_deg` | number | deg | Left hip flexion. | 180−∠(shoulder,hip,knee). |
| 14 | `hip_flex_r_deg` | number | deg | Right hip flexion. | 180−∠(shoulder,hip,knee). |
| 15 | `knee_vel_l_deg_s` | number | deg/s | Left knee angular velocity. | d(knee_l)/dt. |
| 16 | `knee_vel_r_deg_s` | number | deg/s | Right knee angular velocity. | d(knee_r)/dt. |
| 17 | `trunk_incl_deg` | number | deg | Trunk inclination (forward+). | atan2 signed by facing. |
| 18 | `shank_incl_l_deg` | number | deg | Left shank inclination. | Knee-ankle vs vertical. |
| 19 | `shank_incl_r_deg` | number | deg | Right shank inclination. | Knee-ankle vs vertical. |
| 20 | `torso_yaw_deg` | number | deg | Torso yaw (world). | atan2 of shoulder vector, unwrapped. |
| 21 | `torso_yaw_rate_deg_s` | number | deg/s | Torso yaw rate. | d(yaw)/dt. |
| 22 | `g_left_m` | number | m | Left foot-ahead-of-pelvis signal. | Zeni g_L for HS/TO. |
| 23 | `g_right_m` | number | m | Right foot-ahead-of-pelvis signal. | Zeni g_R for HS/TO. |
| 24 | `arm_dev_l` | number | trunk-len | Left wrist deviation from shoulder. | Arm-swing proxy. |
| 25 | `arm_dev_r` | number | trunk-len | Right wrist deviation from shoulder. | Arm-swing proxy. |
| 26 | `obliquity` | number | — | Hip-sep/trunk-len. | Side-on view check. |
| 27 | `chain_px` | number | px | Body chain pixel length. | Depth-drift monitor. |
| 28 | `cam_yaw_rate_deg_s` | number | deg/s | Estimated camera pan rate. | World-vertical stability (panning mode). |
| 29 | `sh_l_x_px` | number | px | Filtered x pixel of l sh. | Low-pass filtered image coordinate. |
| 30 | `sh_l_y_px` | number | px | Filtered y pixel of l sh. | Low-pass filtered image coordinate. |
| 31 | `sh_r_x_px` | number | px | Filtered x pixel of r sh. | Low-pass filtered image coordinate. |
| 32 | `sh_r_y_px` | number | px | Filtered y pixel of r sh. | Low-pass filtered image coordinate. |
| 33 | `hip_l_x_px` | number | px | Filtered x pixel of l hip. | Low-pass filtered image coordinate. |
| 34 | `hip_l_y_px` | number | px | Filtered y pixel of l hip. | Low-pass filtered image coordinate. |
| 35 | `hip_r_x_px` | number | px | Filtered x pixel of r hip. | Low-pass filtered image coordinate. |
| 36 | `hip_r_y_px` | number | px | Filtered y pixel of r hip. | Low-pass filtered image coordinate. |
| 37 | `kn_l_x_px` | number | px | Filtered x pixel of l kn. | Low-pass filtered image coordinate. |
| 38 | `kn_l_y_px` | number | px | Filtered y pixel of l kn. | Low-pass filtered image coordinate. |
| 39 | `kn_r_x_px` | number | px | Filtered x pixel of r kn. | Low-pass filtered image coordinate. |
| 40 | `kn_r_y_px` | number | px | Filtered y pixel of r kn. | Low-pass filtered image coordinate. |
| 41 | `an_l_x_px` | number | px | Filtered x pixel of l an. | Low-pass filtered image coordinate. |
| 42 | `an_l_y_px` | number | px | Filtered y pixel of l an. | Low-pass filtered image coordinate. |
| 43 | `an_r_x_px` | number | px | Filtered x pixel of r an. | Low-pass filtered image coordinate. |
| 44 | `an_r_y_px` | number | px | Filtered y pixel of r an. | Low-pass filtered image coordinate. |
| 45 | `heel_l_x_px` | number | px | Filtered x pixel of l heel. | Low-pass filtered image coordinate. |
| 46 | `heel_l_y_px` | number | px | Filtered y pixel of l heel. | Low-pass filtered image coordinate. |
| 47 | `heel_r_x_px` | number | px | Filtered x pixel of r heel. | Low-pass filtered image coordinate. |
| 48 | `heel_r_y_px` | number | px | Filtered y pixel of r heel. | Low-pass filtered image coordinate. |
| 49 | `toe_l_x_px` | number | px | Filtered x pixel of l toe. | Low-pass filtered image coordinate. |
| 50 | `toe_l_y_px` | number | px | Filtered y pixel of l toe. | Low-pass filtered image coordinate. |
| 51 | `toe_r_x_px` | number | px | Filtered x pixel of r toe. | Low-pass filtered image coordinate. |
| 52 | `toe_r_y_px` | number | px | Filtered y pixel of r toe. | Low-pass filtered image coordinate. |


## 6. Raw frames (ZIP only)
`*_frames_raw.csv` has 120 columns: `t_ms` plus 7 values
(image x,y,z,visibility + world x,y,z) for each of the 17 tracked markers.

## 7. Tracked pose markers (17)
| Key | MediaPipe index | Name | Role | Used by |
|---|---|---|---|---|
| `nose` | 0 | Nose | Head reference | Full-body-in-frame check |
| `l_sh` | 11 | Left shoulder | Trunk / yaw | Trunk inclination, torso yaw, arm swing |
| `r_sh` | 12 | Right shoulder | Trunk / yaw | Trunk inclination, torso yaw, arm swing |
| `l_el` | 13 | Left elbow | Arm | Arm-swing proxy |
| `r_el` | 14 | Right elbow | Arm | Arm-swing proxy |
| `l_wr` | 15 | Left wrist | Arm | Arm swing, chair-push detection |
| `r_wr` | 16 | Right wrist | Arm | Arm swing, chair-push detection |
| `l_hip` | 23 | Left hip | Pelvis | Hip progress, path, hip flexion |
| `r_hip` | 24 | Right hip | Pelvis | Hip progress, path, hip flexion |
| `l_kn` | 25 | Left knee | Leg | Knee flexion |
| `r_kn` | 26 | Right knee | Leg | Knee flexion |
| `l_an` | 27 | Left ankle | Leg | Knee/ankle angle, gait fallback |
| `r_an` | 28 | Right ankle | Leg | Knee/ankle angle, gait fallback |
| `l_heel` | 29 | Left heel | Foot | Heel strike / toe off, stride length |
| `r_heel` | 30 | Right heel | Foot | Heel strike / toe off, stride length |
| `l_toe` | 31 | Left foot index | Foot | Facing direction, toe-off |
| `r_toe` | 32 | Right foot index | Foot | Facing direction, toe-off |


## 8. Definitions of derived quantities
- **Valid sample:** visibility ≥ 0.5 and inside frame.
- **Resampling / filtering:** uniform 30 Hz; zero-lag
  2nd-order Butterworth, −3 dB at 6 Hz (foot markers
  8 Hz), reflection padding 30.
- **Hip progress p:** (hip-above-feet − seated) / (standing − seated).
- **Path coordinate s:** integrated stance-foot relative motion (operator-
  following camera; see §12 and the steering notes).
- **Heel strike / toe off (Zeni 2008):** maxima / minima of the signed
  foot-ahead-of-pelvis signal within each straight segment.
- **Step vs stride:** step = opposite-foot HS to HS; stride = same-foot HS to HS.
- **Symmetry:** `|L−R| / (0.5(L+R)) × 100`. **CV:** SD/mean×100 (≥4 strides).
- **Gait velocity:** path distance between first and last HS per segment ÷ time,
  distance-weighted across out and back. Nominal = 2×course ÷ (walk out + back).
- **Risk tiers:** CDC cut-point 12 s (At risk ≥).
  Tiers low <10, moderate <12,
  high ≥12 (app convention for UI colouring only).

## 9. Quality-control flags
**Blocking** (withhold `valid_for_norm`; time still shown with a warning):
`LOW_FPS`, `LOW_VALID_FRAMES`, `TRACKING_GAPS`, `NOT_SEATED_AT_START`,
`MOVED_BEFORE_GO`, `MANUAL_STOP`, `EVENT_MISSING:*`, `COURSE_NOT_COMPLETED`,
`CAMERA_MOVED`, `FACING_PATTERN_UNEXPECTED`, `HIP_RISE_IMPLAUSIBLE`,
`PARTICIPANT_LEFT_FRAME`.
**Non-blocking (warnings):** `OBLIQUE_VIEW`, `SCALE_INCONSISTENT`,
`NO_COURSE_CALIB`, `CAMERA_TILT`, `FEW_STRIDES`, `GAIT_EVENT_NONALTERNATING`,
`LR_SWAP_CORRECTED`, `DEPTH_DRIFT`, `LOW_LIGHT`, `CAMERA_PAN_FAST`,
`SECOND_PERSON_SUSPECTED`.

## 10. Algorithm parameters (from config.js)
| Key path | Default |
|---|---|
| `app.version` | "1.0.0" |
| `app.analysisVersion` | "1.0.0" |
| `app.schemaVersion` | "1.0" |
| `app.name` | "TUG//LAB" |
| `protocol.courseLengthM` | 3 |
| `protocol.chairSeatHeightCm` | 46 |
| `protocol.countdownS` | 3 |
| `protocol.preRollS` | 1.5 |
| `protocol.tailS` | 1.5 |
| `protocol.maxDurationS` | 60 |
| `protocol.autoFinish` | true |
| `protocol.fallRiskCdcS` | 12 |
| `protocol.altCutoffS` | 13.5 |
| `risk.tierLowBelowS` | 10 |
| `risk.tierHighAtS` | 12 |
| `norms.bohannon2006.60-69.low` | 60 |
| `norms.bohannon2006.60-69.high` | 69 |
| `norms.bohannon2006.60-69.mean` | 8.1 |
| `norms.bohannon2006.60-69.ciLow` | 7.1 |
| `norms.bohannon2006.60-69.ciHigh` | 9 |
| `norms.bohannon2006.70-79.low` | 70 |
| `norms.bohannon2006.70-79.high` | 79 |
| `norms.bohannon2006.70-79.mean` | 9.2 |
| `norms.bohannon2006.70-79.ciLow` | 8.2 |
| `norms.bohannon2006.70-79.ciHigh` | 10.2 |
| `norms.bohannon2006.80-99.low` | 80 |
| `norms.bohannon2006.80-99.high` | 99 |
| `norms.bohannon2006.80-99.mean` | 11.3 |
| `norms.bohannon2006.80-99.ciLow` | 10 |
| `norms.bohannon2006.80-99.ciHigh` | 12.7 |
| `signal.resampleHz` | 30 |
| `signal.cutoffHz` | 6 |
| `signal.cutoffFootHz` | 8 |
| `signal.maxGapS` | 0.25 |
| `signal.minVisibility` | 0.5 |
| `signal.padSamples` | 30 |
| `signal.butterOrder` | 2 |
| `events.seatOffPct` | 0.1 |
| `events.standingPct` | 0.9 |
| `events.sitContactPct` | 0.1 |
| `events.standKneeToleranceDeg` | 20 |
| `events.turnSpeedFrac` | 0.5 |
| `events.seatContactMaxSpeedMs` | 0.05 |
| `gait.minHsIntervalS` | 0.4 |
| `gait.minProminenceTrunk` | 0.15 |
| `gait.steadyStateOnly` | false |
| `gait.minWalkSpeedMs` | 0.15 |
| `qc.minFps` | 15 |
| `qc.minValidFramePct` | 90 |
| `qc.maxImputedPct` | 10 |
| `qc.maxGapS` | 0.5 |
| `qc.maxObliquity` | 0.2 |
| `qc.maxScaleDiffPct` | 15 |
| `qc.maxDepthDriftPct` | 10 |
| `qc.maxKnee2D3D` | 10 |
| `qc.maxShankVerticalDeg` | 5 |
| `qc.hipRiseMinM` | 0.15 |
| `qc.hipRiseMaxM` | 0.65 |
| `qc.courseCompletedFrac` | 0.7 |
| `camera.width` | 720 |
| `camera.height` | 1280 |
| `camera.fps` | 30 |
| `panning.enabled` | true |
| `panning.worldLandmarksPrimary` | true |
| `panning.pathFromSteps` | true |
| `panning.maxCameraYawRateDegS` | 220 |
| `panning.panEmaAlpha` | 0.3 |
| `live.emaAlpha` | 0.4 |
| `live.autoFinishStillS` | 1.5 |
| `live.autoFinishJitter` | 0.04 |
| `sheets.webhookUrl` | "" |
| `sheets.uploadFrames` | false |
| `video.en` | "IHfv93f8wk8" |
| `video.zh` | "hgNUROqcMcc" |
| `video.yue` | "EqbAyOtn3RQ" |
| `video.embedTemplate` | "https://www.youtube-nocookie.com/embed/{ID}?rel=0&playsinline=1&modestbranding=1" |
| `video.linkTemplate` | "https://www.youtube.com/shorts/{ID}" |
| `pose.visionBundle` | "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs" |
| `pose.wasmBase` | "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm" |
| `pose.models.lite` | "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" |
| `pose.models.full` | "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task" |
| `pose.models.heavy` | "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task" |
| `pose.defaultModel` | "full" |
| `pose.minPoseDetectionConfidence` | 0.5 |
| `pose.minPosePresenceConfidence` | 0.5 |
| `pose.minTrackingConfidence` | 0.5 |
| `pose.numPoses` | 1 |
| `ui.requireVideoPlayed` | false |
| `ui.maxHistory` | 50 |
| `ui.maxRawAttemptsInDb` | 10 |
| `inputs.heightHardMinCm` | 100 |
| `inputs.heightHardMaxCm` | 230 |
| `inputs.heightSoftMinCm` | 120 |
| `inputs.heightSoftMaxCm` | 210 |
| `inputs.massMinKg` | 20 |
| `inputs.massMaxKg` | 300 |
| `inputs.bodyFatMinPct` | 1 |
| `inputs.bodyFatMaxPct` | 70 |
| `inputs.ageMinYears` | 1 |
| `inputs.ageMaxYears` | 120 |
| `debug.enabled` | false |
| `debug.dev` | false |
| `debug.erudaCdn` | "https://cdn.jsdelivr.net/npm/eruda@3/eruda.min.js" |


## 11. Parity map (Flutter server field ↔ TUG//LAB column)
| Flutter server field | TUG//LAB column |
|---|---|
| `total_time_taken` | `total_time_taken_s` |
| `gait_velocity` | `gait_velocity_m_s` |
| `average_stride_length` | `average_stride_length_m` |
| `average_stride_time` | `average_stride_time_s` |
| `average_left_stride_length` | `average_left_stride_length_m` |
| `average_left_stride_time` | `average_left_stride_time_s` |
| `average_right_stride_length` | `average_right_stride_length_m` |
| `average_right_stride_time` | `average_right_stride_time_s` |
| `time_seated_to_full_extension` | `time_seated_to_full_extension_s` |
| `time_around_cone` | `time_around_cone_s` |
| `time_turn_to_sit` | `time_turn_to_sit_s` |
| `time_to_sitting_down` | `time_to_sitting_down_s` |
| `first_foot_walk` | `first_foot_walk` |
| `last_foot_walk` | `last_foot_walk` |
| `first_foot_around_cone` | `first_foot_around_cone` |
| `last_foot_turn_before_sitting` | `last_foot_turn_before_sitting` |


## 12. Limitations
Single camera, 2-D sagittal estimates from pose; the operator-following camera
reconstructs travel from stance-foot motion rather than a fixed reference, so
distance-derived metrics are most reliable when the walk stays parallel to the
camera (watch `DEPTH_DRIFT`). The server ML fall-probability is not reproduced
(`fall_probability` is always empty). Not a medical device.

## 13. References
See README §13 (CDC STEADI, Podsiadlo & Richardson 1991, Barry 2014, Bohannon
2006, Zeni 2008, Winter 2009, BlazePose).
