/* =============================================================================
 * TUG//LAB — schema.js
 * THE single source of truth for the data model. Every exported column (CSV,
 * ZIP, Google Sheets) and the data dictionary are generated from here.
 *
 * Each field: { key, type, unit, group, desc, calc }
 *   type: string | number | integer | boolean | uuid | datetime
 *   unit: 's','m','m/s','deg','deg/s','cm','kg','%','px','bool','', etc.
 *   desc: plain-language meaning
 *   calc: how it is computed / its source
 *
 * Rule enforced by the test runner: no field may have an empty desc/unit/calc.
 * Conventions: t=0 at GO; negative t = pre-roll; vertical positive = up;
 * angles in degrees; booleans export TRUE/FALSE; null = empty cell (never 0);
 * path coordinate s positive toward the cone.
 * ========================================================================== */
(function (global) {
  'use strict';

  const f = (key, type, unit, group, desc, calc) => ({ key, type, unit, group, desc, calc });

  /* ---- SESSIONS (one row per submitted attempt) -------------------------- */
  const SESSIONS = [
    // Session & participant
    f('session_id', 'uuid', '', 'Session', 'Unique id for this attempt.', 'crypto.randomUUID() at test start.'),
    f('timestamp_utc', 'datetime', '', 'Session', 'UTC timestamp when the test was run.', 'new Date().toISOString().'),
    f('utc_offset_min', 'integer', 'min', 'Session', 'Local offset from UTC.', '-new Date().getTimezoneOffset().'),
    f('app_version', 'string', '', 'Session', 'App build version.', 'CONFIG.app.version.'),
    f('analysis_version', 'string', '', 'Session', 'Analysis engine version.', 'CONFIG.app.analysisVersion.'),
    f('schema_version', 'string', '', 'Session', 'Data schema version.', 'CONFIG.app.schemaVersion.'),
    f('participant_id', 'string', '', 'Session', 'Pseudonymous participant id (never a real name).', 'Operator input.'),
    f('age_years', 'integer', 'years', 'Session', 'Participant age.', 'Operator input.'),
    f('sex', 'string', '', 'Session', 'male / female / other.', 'Operator input.'),
    f('height_cm', 'number', 'cm', 'Session', 'Standing height.', 'Operator input; used for body-scale calibration.'),
    f('body_mass_kg', 'number', 'kg', 'Session', 'Body mass (optional).', 'Operator input.'),
    f('body_fat_pct', 'number', '%', 'Session', 'Body fat percentage (optional).', 'Operator input.'),
    f('bmr_kcal_day', 'number', 'kcal/day', 'Session', 'Basal metabolic rate (male/female only).', 'Mifflin–St Jeor from height, mass, age, sex.'),
    f('chair_seat_height_cm', 'number', 'cm', 'Session', 'Seat height of the chair used.', 'Operator input (default 46).'),
    f('assistive_device', 'string', '', 'Session', 'none / cane / walker / other.', 'Operator input.'),
    f('site', 'string', '', 'Session', 'Site or session label.', 'Operator input.'),
    f('operator_notes', 'string', '', 'Session', 'Free-text operator notes.', 'Operator input.'),
    f('instruction_language', 'string', '', 'Session', 'Demo video language shown (en/zh/yue).', 'Operator selection.'),
    f('attempt_no', 'integer', '', 'Session', 'Attempt number this sitting (1 or 2).', 'Counter.'),
    f('attempts_total', 'integer', '', 'Session', 'Total attempts recorded this sitting.', 'Counter.'),
    f('selected_attempt', 'boolean', 'bool', 'Session', 'Whether this attempt was the one submitted.', 'Operator choice on 2nd attempt.'),
    f('test_outcome', 'string', '', 'Session', 'completed / unable / aborted.', 'Flow state.'),
    f('unable_reason', 'string', '', 'Session', 'Reason if unable (medical/safety/refused/other + text).', 'Operator input.'),
    f('source', 'string', '', 'Session', 'live or replay (analysed from a file).', 'Capture mode.'),

    // Device & pose
    f('pose_model', 'string', '', 'Device', 'MediaPipe model used (lite/full/heavy).', 'Operator selection.'),
    f('pose_delegate', 'string', '', 'Device', 'GPU or CPU delegate actually used.', 'Resolved at load.'),
    f('camera_facing', 'string', '', 'Device', 'environment (rear) or user (front).', 'Operator selection.'),
    f('lens_label', 'string', '', 'Device', 'Label of the chosen camera/lens.', 'MediaDeviceInfo.label.'),
    f('video_width_px', 'integer', 'px', 'Device', 'Actual capture width.', 'video.videoWidth.'),
    f('video_height_px', 'integer', 'px', 'Device', 'Actual capture height.', 'video.videoHeight.'),
    f('orientation', 'string', '', 'Device', 'Screen orientation during capture.', 'screen.orientation.type.'),
    f('user_agent', 'string', '', 'Device', 'Browser user agent.', 'navigator.userAgent.'),
    f('effective_fs_hz', 'number', 'Hz', 'Device', 'Measured capture frame rate.', 'Frames counted over elapsed time.'),
    f('panning_mode', 'boolean', 'bool', 'Device', 'Operator-following (moving) camera used.', 'CONFIG.panning.enabled.'),

    // Protocol
    f('course_length_m', 'number', 'm', 'Protocol', 'Chair-to-cone distance.', 'CONFIG.protocol.courseLengthM.'),
    f('max_duration_s', 'number', 's', 'Protocol', 'Hard-stop duration.', 'CONFIG.protocol.maxDurationS.'),
    f('test_duration_s', 'number', 's', 'Protocol', 'Recording duration from GO to finish.', 'Live timer.'),
    f('manual_stop', 'boolean', 'bool', 'Protocol', 'Operator pressed STOP (aborted).', 'Flow state.'),
    f('auto_finished', 'boolean', 'bool', 'Protocol', 'Auto-complete fired (seated + still).', 'Live state machine.'),
    f('practice_done_confirmed', 'boolean', 'bool', 'Protocol', 'Practice-trial checkbox ticked.', 'Pre-test checks.'),
    f('safety_confirmed', 'boolean', 'bool', 'Protocol', 'Safety checkbox ticked.', 'Pre-test checks.'),
    f('armchair_confirmed', 'boolean', 'bool', 'Protocol', 'Armchair checkbox ticked.', 'Pre-test checks.'),
    f('footwear_assist_confirmed', 'boolean', 'bool', 'Protocol', 'Footwear/assist checkbox ticked.', 'Pre-test checks.'),
    f('calibration_method', 'string', '', 'Protocol', 'course / body / both / world.', 'Calibration performed.'),
    f('walk_dir_out', 'string', '', 'Protocol', 'Outbound direction (left_to_right / right_to_left).', 'From first walk segment / tap order.'),
    f('scale_m_per_px_walk', 'number', 'm/px', 'Protocol', 'Course-scale (metres per pixel along path).', 'course_length_m / course_px (if tapped).'),
    f('scale_m_per_px_body', 'number', 'm/px', 'Protocol', 'Body-scale (metres per pixel).', 'height×0.779 / chain pixel length (Winter 2009).'),
    f('scale_check_diff_pct', 'number', '%', 'Protocol', 'Percent difference between the two scales.', '|course-body|/mean×100.'),
    f('filter_cutoff_hz', 'number', 'Hz', 'Protocol', 'Body-marker low-pass cutoff.', 'CONFIG.signal.cutoffHz.'),
    f('filter_cutoff_foot_hz', 'number', 'Hz', 'Protocol', 'Foot-marker low-pass cutoff.', 'CONFIG.signal.cutoffFootHz.'),
    f('resample_hz', 'number', 'Hz', 'Protocol', 'Uniform analysis sample rate.', 'CONFIG.signal.resampleHz.'),
    f('live_time_s', 'number', 's', 'Protocol', 'Live (causal) timer value.', 'Feedback timer, GO to finish.'),
    f('live_vs_offline_diff_s', 'number', 's', 'Protocol', 'Live minus offline total time.', 'Audit of live vs authoritative time.'),

    // Primary outcome & risk
    f('total_time_taken_s', 'number', 's', 'Outcome', 'TUG time: GO to seat contact.', 't_seat_contact − 0.'),
    f('total_time_from_seat_off_s', 'number', 's', 'Outcome', 'Seat-off to seat-contact (excludes reaction).', 't_seat_contact − t_seat_off.'),
    f('reaction_time_s', 'number', 's', 'Outcome', 'GO to first movement.', 't_seat_off − 0.'),
    f('fall_risk_cdc', 'string', '', 'Outcome', 'CDC label: At risk / Not at risk.', '≥12.0 s → At risk (CDC STEADI).'),
    f('fall_risk_tier', 'string', '', 'Outcome', 'low / moderate / high (UI convention).', '<10 low; 10–<12 moderate; ≥12 high. [TUNE]'),
    f('fall_probability', 'number', '', 'Outcome', 'Server ML probability (not produced).', 'Always empty — model unavailable.'),
    f('alt_cutoff_flag_13_5', 'boolean', 'bool', 'Outcome', 'Time ≥ 13.5 s (Barry 2014 cut-point).', 'total_time ≥ 13.5.'),
    f('mobility_category', 'string', '', 'Outcome', 'Descriptive mobility band.', 'Podsiadlo & Richardson (1991) bands. [VERIFY]'),
    f('age_norm_band', 'string', '', 'Outcome', 'Age band used for norm comparison.', '60-69 / 70-79 / 80-99.'),
    f('age_norm_mean_s', 'number', 's', 'Outcome', 'Reference mean for the band.', 'Bohannon (2006). [VERIFY]'),
    f('age_norm_ci_low_s', 'number', 's', 'Outcome', 'Reference CI low.', 'Bohannon (2006). [VERIFY]'),
    f('age_norm_ci_high_s', 'number', 's', 'Outcome', 'Reference CI high.', 'Bohannon (2006). [VERIFY]'),
    f('age_norm_comparison', 'string', '', 'Outcome', 'Faster / Within / Slower than CI.', 'total_time vs band CI.'),
    f('valid_for_norm', 'boolean', 'bool', 'Outcome', 'Eligible for norm comparison.', 'No blocking QC, checks ticked, completed, age≥60.'),

    // Event times
    f('t_seat_off_s', 'number', 's', 'Events', 'Movement onset.', 'First p ≥ seatOffPct after GO.'),
    f('t_standing_s', 'number', 's', 'Events', 'Full extension reached.', 'First p ≥ standingPct and knee near standing.'),
    f('t_walk_start_s', 'number', 's', 'Events', 'First toe-off after standing.', 'First TO; fallback path speed ≥ minWalkSpeed.'),
    f('t_turn1_start_s', 'number', 's', 'Events', 'Start of turn at the cone.', 'Last out-speed ≥ turnSpeedFrac before furthest point.'),
    f('t_turn1_end_s', 'number', 's', 'Events', 'End of turn at the cone.', 'First back-speed ≥ turnSpeedFrac after furthest point.'),
    f('t_turn2_start_s', 'number', 's', 'Events', 'Start of turn at the chair.', 'Back-speed falls below turnSpeedFrac near chair.'),
    f('t_sit_descent_start_s', 'number', 's', 'Events', 'Start of final sit descent.', 'Last p ≥ standingPct before seat contact.'),
    f('t_seat_contact_s', 'number', 's', 'Events', 'Buttocks reach the seat (stops the clock).', 'First p ≤ sitContactPct with |hip v| < seatContactMaxSpeed.'),

    // Phase durations (★ Flutter parity)
    f('time_seated_to_full_extension_s', 'number', 's', 'Phases', '★ Sit-to-stand duration.', 't_standing − t_seat_off.'),
    f('time_walk_out_s', 'number', 's', 'Phases', 'Walk-out duration.', 't_turn1_start − t_standing.'),
    f('time_around_cone_s', 'number', 's', 'Phases', '★ Turn-at-cone duration.', 't_turn1_end − t_turn1_start.'),
    f('time_walk_back_s', 'number', 's', 'Phases', 'Walk-back duration.', 't_turn2_start − t_turn1_end.'),
    f('time_turn_to_sit_s', 'number', 's', 'Phases', '★ Turn-to-sit-approach duration.', 't_sit_descent_start − t_turn2_start.'),
    f('time_to_sitting_down_s', 'number', 's', 'Phases', '★ Sit-down descent duration.', 't_seat_contact − t_sit_descent_start.'),
    f('pct_sit_to_stand', 'number', '%', 'Phases', 'Sit-to-stand as % of total.', 'phase/total×100.'),
    f('pct_walk', 'number', '%', 'Phases', 'Walking (out+back) as % of total.', 'phase/total×100.'),
    f('pct_turns', 'number', '%', 'Phases', 'Turns as % of total.', 'phase/total×100.'),
    f('pct_stand_to_sit', 'number', '%', 'Phases', 'Stand-to-sit as % of total.', 'phase/total×100.'),

    // Gait summary (★ parity)
    f('gait_velocity_m_s', 'number', 'm/s', 'Gait', '★ Primary gait velocity.', 'Path distance / time between first & last HS per segment, distance-weighted.'),
    f('gait_velocity_nominal_m_s', 'number', 'm/s', 'Gait', 'Nominal velocity from course length.', '2×course / (time_walk_out + time_walk_back).'),
    f('walk_out_velocity_m_s', 'number', 'm/s', 'Gait', 'Mean velocity, outbound.', 'Out path distance / out walk time.'),
    f('walk_back_velocity_m_s', 'number', 'm/s', 'Gait', 'Mean velocity, return.', 'Back path distance / back walk time.'),
    f('velocity_change_pct', 'number', '%', 'Gait', 'Back vs out velocity change.', '(back−out)/out×100.'),
    f('average_stride_length_m', 'number', 'm', 'Gait', '★ Mean stride length (both feet).', 'Mean of included strides.'),
    f('average_stride_time_s', 'number', 's', 'Gait', '★ Mean stride time (both feet).', 'Mean of included strides.'),
    f('average_left_stride_length_m', 'number', 'm', 'Gait', '★ Mean left stride length.', 'Mean left-foot strides.'),
    f('average_left_stride_time_s', 'number', 's', 'Gait', '★ Mean left stride time.', 'Mean left-foot strides.'),
    f('average_right_stride_length_m', 'number', 'm', 'Gait', '★ Mean right stride length.', 'Mean right-foot strides.'),
    f('average_right_stride_time_s', 'number', 's', 'Gait', '★ Mean right stride time.', 'Mean right-foot strides.'),
    f('step_length_left_mean_m', 'number', 'm', 'Gait', 'Mean left step length.', 'Mean of left steps.'),
    f('step_length_right_mean_m', 'number', 'm', 'Gait', 'Mean right step length.', 'Mean of right steps.'),
    f('step_time_left_mean_s', 'number', 's', 'Gait', 'Mean left step time.', 'Mean of left steps.'),
    f('step_time_right_mean_s', 'number', 's', 'Gait', 'Mean right step time.', 'Mean of right steps.'),
    f('cadence_steps_min', 'number', 'steps/min', 'Gait', 'Cadence over straight walking.', 'steps / walking time × 60.'),
    f('n_steps_total', 'integer', '', 'Gait', 'Total detected steps.', 'HS count in straight segments.'),
    f('n_steps_out', 'integer', '', 'Gait', 'Steps outbound.', 'HS count in WALK_OUT.'),
    f('n_steps_back', 'integer', '', 'Gait', 'Steps return.', 'HS count in WALK_BACK.'),
    f('n_strides_left', 'integer', '', 'Gait', 'Left strides included.', 'Consecutive same-foot HS pairs.'),
    f('n_strides_right', 'integer', '', 'Gait', 'Right strides included.', 'Consecutive same-foot HS pairs.'),
    f('stride_time_cv_pct', 'number', '%', 'Gait', 'Stride-time variability.', 'SD/mean×100 (≥4 strides).'),
    f('stride_length_cv_pct', 'number', '%', 'Gait', 'Stride-length variability.', 'SD/mean×100 (≥4 strides).'),
    f('stride_length_asym_pct', 'number', '%', 'Gait', 'Stride-length L/R asymmetry.', '|L−R|/(0.5(L+R))×100.'),
    f('stride_time_asym_pct', 'number', '%', 'Gait', 'Stride-time L/R asymmetry.', '|L−R|/(0.5(L+R))×100.'),
    f('step_length_asym_pct', 'number', '%', 'Gait', 'Step-length L/R asymmetry.', '|L−R|/(0.5(L+R))×100.'),
    f('step_time_asym_pct', 'number', '%', 'Gait', 'Step-time L/R asymmetry.', '|L−R|/(0.5(L+R))×100.'),

    // Foot pattern (★ parity)
    f('first_foot_walk', 'string', '', 'FootPattern', '★ Foot of first toe-off after standing.', 'left / right.'),
    f('last_foot_walk', 'string', '', 'FootPattern', '★ Foot of last HS before cone turn.', 'left / right.'),
    f('first_foot_around_cone', 'string', '', 'FootPattern', '★ Foot of first toe-off in cone turn.', 'left / right.'),
    f('last_foot_turn_before_sitting', 'string', '', 'FootPattern', '★ Foot of last toe-off before sit descent.', 'left / right.'),

    // Turns
    f('turn1_n_steps', 'integer', '', 'Turns', 'Steps in cone turn.', 'HS count inside TURN_1.'),
    f('turn1_yaw_change_deg', 'number', 'deg', 'Turns', 'Total yaw change, cone turn.', 'Unwrapped torso yaw (expect ≈180°).'),
    f('turn1_peak_yaw_rate_deg_s', 'number', 'deg/s', 'Turns', 'Peak yaw rate, cone turn.', 'max |d(yaw)/dt|.'),
    f('turn1_mean_yaw_rate_deg_s', 'number', 'deg/s', 'Turns', 'Mean yaw rate, cone turn.', 'yaw change / duration.'),
    f('turn1_yaw_rate_peaks', 'integer', '', 'Turns', 'Yaw-rate peaks (smoothness proxy).', 'Count of yaw-rate velocity peaks. [exploratory]'),
    f('turn2_n_steps', 'integer', '', 'Turns', 'Steps in chair turn.', 'HS count inside TURN_2.'),
    f('turn2_yaw_change_deg', 'number', 'deg', 'Turns', 'Total yaw change, chair turn.', 'Unwrapped torso yaw.'),
    f('turn2_peak_yaw_rate_deg_s', 'number', 'deg/s', 'Turns', 'Peak yaw rate, chair turn.', 'max |d(yaw)/dt|.'),
    f('turn2_mean_yaw_rate_deg_s', 'number', 'deg/s', 'Turns', 'Mean yaw rate, chair turn.', 'yaw change / duration.'),
    f('turn2_yaw_rate_peaks', 'integer', '', 'Turns', 'Yaw-rate peaks, chair turn.', 'Count of yaw-rate velocity peaks. [exploratory]'),

    // Sit-to-stand
    f('sts_hip_rise_m', 'number', 'm', 'SitToStand', 'Hip vertical rise.', 'hip_up_stand − hip_up_seated.'),
    f('sts_ascent_time_s', 'number', 's', 'SitToStand', 'Ascent duration.', 't_standing − t_seat_off.'),
    f('sts_peak_ascent_velocity_m_s', 'number', 'm/s', 'SitToStand', 'Peak upward hip velocity.', 'max d(hip_up)/dt in ascent.'),
    f('sts_mean_ascent_velocity_m_s', 'number', 'm/s', 'SitToStand', 'Mean upward hip velocity.', 'hip_rise / ascent_time.'),
    f('sts_knee_flex_seatoff_deg', 'number', 'deg', 'SitToStand', 'Knee flexion at seat-off.', '180−∠(hip,knee,ankle) at seat-off.'),
    f('sts_knee_flex_standing_deg', 'number', 'deg', 'SitToStand', 'Knee flexion at standing.', 'At t_standing.'),
    f('sts_knee_rom_deg', 'number', 'deg', 'SitToStand', 'Knee ROM during rise.', 'seatoff − standing flexion.'),
    f('sts_knee_ext_peak_vel_deg_s', 'number', 'deg/s', 'SitToStand', 'Peak knee extension ang. velocity.', 'max |d(knee)/dt| in ascent.'),
    f('sts_hip_flex_seatoff_deg', 'number', 'deg', 'SitToStand', 'Hip flexion at seat-off.', '180−∠(shoulder,hip,knee).'),
    f('sts_hip_flex_standing_deg', 'number', 'deg', 'SitToStand', 'Hip flexion at standing.', 'At t_standing.'),
    f('sts_hip_ext_peak_vel_deg_s', 'number', 'deg/s', 'SitToStand', 'Peak hip extension ang. velocity.', 'max |d(hip)/dt| in ascent.'),
    f('sts_trunk_lean_peak_deg', 'number', 'deg', 'SitToStand', 'Peak forward trunk lean.', 'max trunk inclination in ascent.'),
    f('sts_trunk_incl_standing_deg', 'number', 'deg', 'SitToStand', 'Trunk inclination when standing.', 'At t_standing.'),
    f('sts_work_rate_proxy_w', 'number', 'W', 'SitToStand', 'Rise work-rate proxy (needs mass).', 'm·g·hip_rise / ascent_time; null if no mass.'),
    f('sts_arm_push_suspected', 'boolean', 'bool', 'SitToStand', 'Arm push on chair suspected (informational).', 'Wrist near chest/seat during rise.'),

    // Stand-to-sit
    f('sit_descent_time_s', 'number', 's', 'StandToSit', 'Descent duration.', 't_seat_contact − t_sit_descent_start.'),
    f('sit_peak_descent_velocity_m_s', 'number', 'm/s', 'StandToSit', 'Peak downward hip velocity.', 'max |d(hip_up)/dt| (down) in descent.'),
    f('sit_mean_descent_velocity_m_s', 'number', 'm/s', 'StandToSit', 'Mean downward hip velocity.', 'hip drop / descent_time.'),
    f('sit_controlled_descent_index', 'number', '', 'StandToSit', 'Descent control index (higher=less controlled).', 'peak / mean descent velocity. [exploratory]'),
    f('sit_trunk_lean_peak_deg', 'number', 'deg', 'StandToSit', 'Peak forward trunk lean on sitting.', 'max trunk inclination in descent.'),
    f('sit_knee_flex_at_contact_deg', 'number', 'deg', 'StandToSit', 'Knee flexion at seat contact.', 'At t_seat_contact.'),

    // Gait kinematics (mean over included strides)
    f('knee_flex_swing_peak_left_deg', 'number', 'deg', 'GaitKinematics', 'Peak left knee flexion in swing.', 'Mean over left strides.'),
    f('knee_flex_swing_peak_right_deg', 'number', 'deg', 'GaitKinematics', 'Peak right knee flexion in swing.', 'Mean over right strides.'),
    f('hip_flex_peak_left_deg', 'number', 'deg', 'GaitKinematics', 'Peak left hip flexion.', 'Mean over left strides.'),
    f('hip_flex_peak_right_deg', 'number', 'deg', 'GaitKinematics', 'Peak right hip flexion.', 'Mean over right strides.'),
    f('hip_ext_peak_left_deg', 'number', 'deg', 'GaitKinematics', 'Peak left hip extension.', 'Mean over left strides.'),
    f('hip_ext_peak_right_deg', 'number', 'deg', 'GaitKinematics', 'Peak right hip extension.', 'Mean over right strides.'),
    f('hip_rom_left_deg', 'number', 'deg', 'GaitKinematics', 'Left hip ROM per cycle.', 'flex−ext peak, mean over strides.'),
    f('hip_rom_right_deg', 'number', 'deg', 'GaitKinematics', 'Right hip ROM per cycle.', 'flex−ext peak, mean over strides.'),
    f('trunk_incl_walk_mean_deg', 'number', 'deg', 'GaitKinematics', 'Mean trunk inclination, walking.', 'Mean over straight segments.'),
    f('trunk_incl_walk_sd_deg', 'number', 'deg', 'GaitKinematics', 'SD trunk inclination, walking.', 'SD over straight segments.'),
    f('hip_vertical_osc_m', 'number', 'm', 'GaitKinematics', 'Vertical hip oscillation.', 'Mean peak-to-peak per stride.'),
    f('arm_swing_amp_left_trunklen', 'number', 'trunk-len', 'GaitKinematics', 'Left arm-swing amplitude.', 'Wrist x rel. shoulder, peak-to-peak. [exploratory]'),
    f('arm_swing_amp_right_trunklen', 'number', 'trunk-len', 'GaitKinematics', 'Right arm-swing amplitude.', 'Wrist x rel. shoulder, peak-to-peak. [exploratory]'),

    // Operator observations (CDC)
    f('obs_slow_tentative_pace', 'boolean', 'bool', 'Observations', 'Slow / tentative pace observed.', 'Operator checkbox (CDC).'),
    f('obs_loss_of_balance', 'boolean', 'bool', 'Observations', 'Loss of balance observed.', 'Operator checkbox (CDC).'),
    f('obs_short_strides', 'boolean', 'bool', 'Observations', 'Short strides observed.', 'Operator checkbox (CDC).'),
    f('obs_little_arm_swing', 'boolean', 'bool', 'Observations', 'Little or no arm swing observed.', 'Operator checkbox (CDC).'),
    f('obs_steadying_on_walls', 'boolean', 'bool', 'Observations', 'Steadying on walls observed.', 'Operator checkbox (CDC).'),
    f('obs_shuffling', 'boolean', 'bool', 'Observations', 'Shuffling observed.', 'Operator checkbox (CDC).'),
    f('obs_en_bloc_turning', 'boolean', 'bool', 'Observations', 'En bloc turning observed.', 'Operator checkbox (CDC).'),
    f('obs_assistive_device_misuse', 'boolean', 'bool', 'Observations', 'Assistive device misused.', 'Operator checkbox (CDC).'),

    // Calibration descriptors
    f('dominant_side', 'string', '', 'Calibration', 'Near-camera (dominant) side.', 'Higher mean chain visibility.'),
    f('calib_course_px', 'number', 'px', 'Calibration', 'Chair-to-cone pixel distance (if tapped).', '|cone_x − chair_x|.'),
    f('calib_chair_x_px', 'number', 'px', 'Calibration', 'Chair tap x.', 'Operator tap (static-camera option).'),
    f('calib_cone_x_px', 'number', 'px', 'Calibration', 'Cone tap x.', 'Operator tap (static-camera option).'),
    f('calib_chain_px', 'number', 'px', 'Calibration', 'Body chain pixel length.', 'Shoulder-hip-knee-ankle length.'),
    f('calib_hip_up_seated_m', 'number', 'm', 'Calibration', 'Seated hip height (world).', 'Pre-roll median world hip height.'),
    f('calib_hip_up_stand_m', 'number', 'm', 'Calibration', 'Standing hip height (world).', 'Median during steady walk.'),
    f('calib_standing_knee_flex_deg', 'number', 'deg', 'Calibration', 'Standing knee flexion.', 'Median during steady walk.'),
    f('calib_seated_knee_flex_deg', 'number', 'deg', 'Calibration', 'Seated knee flexion.', 'Pre-roll median.'),
    f('calib_seated_arm_dev', 'number', 'trunk-len', 'Calibration', 'Seated arm deviation baseline.', 'Pre-roll wrist-shoulder offset.'),
    f('calib_shank_from_vertical_deg', 'number', 'deg', 'Calibration', 'Standing shank angle from vertical.', 'Camera-tilt proxy.'),

    // Quality control
    f('valid_frame_pct', 'number', '%', 'QC', 'Frames with all chain markers.', 'valid/total×100.'),
    f('imputed_sample_pct', 'number', '%', 'QC', 'Samples imputed by gap bridging.', 'imputed/total×100.'),
    f('longest_gap_s', 'number', 's', 'QC', 'Longest tracking gap.', 'Max contiguous invalid span.'),
    f('median_chain_visibility', 'number', '', 'QC', 'Median visibility of the chain.', 'Median over frames.'),
    f('view_obliquity_median', 'number', '', 'QC', 'Median hip-sep/trunk-len (side-on check).', 'Lower = more side-on.'),
    f('depth_drift_pct', 'number', '%', 'QC', 'Chain-length drift along walk.', 'Walking not parallel to camera if high.'),
    f('knee_2d_3d_diff_deg', 'number', 'deg', 'QC', '2D vs 3D knee-angle disagreement.', 'Mean |2D−3D|.'),
    f('lr_swap_corrections', 'integer', '', 'QC', 'Left/right label corrections.', 'Count during continuity resolution.'),
    f('camera_yaw_rate_median_deg_s', 'number', 'deg/s', 'QC', 'Median camera pan rate (panning mode).', 'From world-vertical stability estimate.'),
    f('n_strides_included', 'integer', '', 'QC', 'Strides used in means.', 'Count.'),
    f('n_strides_excluded', 'integer', '', 'QC', 'Strides excluded.', 'Count (turn overlap, etc.).'),
    f('qc_flags', 'string', '', 'QC', 'Semicolon-separated QC flags.', 'See data dictionary §9.'),
    f('qc_pass', 'boolean', 'bool', 'QC', 'No blocking QC flag.', 'TRUE if no blocking flag raised.'),
  ];

  /* ---- STEPS (one row per heel strike) ----------------------------------- */
  const STEPS = [
    f('session_id', 'uuid', '', 'Steps', 'Owning session.', 'Join key.'),
    f('step_index', 'integer', '', 'Steps', 'Ordinal within the test.', 'Sequence.'),
    f('foot', 'string', '', 'Steps', 'left / right.', 'Foot identity (continuity-resolved).'),
    f('segment', 'string', '', 'Steps', 'OUT / BACK / TURN_1 / TURN_2.', 'Phase the HS fell in.'),
    f('t_hs_s', 'number', 's', 'Steps', 'Heel-strike time.', 'Zeni maxima of foot-ahead signal.'),
    f('t_to_prev_same_foot_s', 'number', 's', 'Steps', 'Time since previous same-foot HS.', 'Stride time (backward).'),
    f('t_to_next_same_foot_s', 'number', 's', 'Steps', 'Time to next same-foot HS.', 'Stride time (forward).'),
    f('heel_x_m_path', 'number', 'm', 'Steps', 'Heel position along path.', 'Path coordinate at HS.'),
    f('step_time_s', 'number', 's', 'Steps', 'Step time (opposite-foot HS to this HS).', 'HS_n − HS_{opposite}.'),
    f('step_length_m', 'number', 'm', 'Steps', 'Step length.', 'Heel-to-heel distance at HS.'),
    f('stride_time_s', 'number', 's', 'Steps', 'Stride time (same-foot).', 'HS_{k} − HS_{k-1} same foot.'),
    f('stride_length_m', 'number', 'm', 'Steps', 'Stride length (same-foot).', 'Heel displacement between same-foot HS.'),
    f('stride_velocity_m_s', 'number', 'm/s', 'Steps', 'Stride velocity.', 'stride_length / stride_time.'),
    f('t_toe_off_s', 'number', 's', 'Steps', 'Following toe-off time.', 'Zeni minima after HS.'),
    f('stance_pct', 'number', '%', 'Steps', 'Stance phase percentage.', 'stance / stride × 100.'),
    f('swing_pct', 'number', '%', 'Steps', 'Swing phase percentage.', '100 − stance_pct.'),
    f('knee_flex_swing_peak_deg', 'number', 'deg', 'Steps', 'Peak knee flexion in swing.', 'Max within the stride.'),
    f('hip_flex_at_hs_deg', 'number', 'deg', 'Steps', 'Hip flexion at HS.', 'At t_hs.'),
    f('hip_ext_peak_deg', 'number', 'deg', 'Steps', 'Peak hip extension.', 'Max within the stride.'),
    f('trunk_incl_at_hs_deg', 'number', 'deg', 'Steps', 'Trunk inclination at HS.', 'At t_hs.'),
    f('included_in_means', 'boolean', 'bool', 'Steps', 'Counted in summary means.', 'False if excluded.'),
    f('exclusion_reason', 'string', '', 'Steps', 'Why excluded (if any).', 'turn_overlap / first_last / nonalternating.'),
  ];

  /* ---- EVENTS (timeline) ------------------------------------------------- */
  const EVENTS = [
    f('session_id', 'uuid', '', 'Events', 'Owning session.', 'Join key.'),
    f('event_index', 'integer', '', 'Events', 'Ordinal in the timeline.', 'Sequence.'),
    f('event_code', 'string', '', 'Events', 'Event code.', 'GO/SEAT_OFF/STANDING/WALK_START/HS_L/HS_R/TO_L/TO_R/TURN1_START/TURN1_FAR/TURN1_END/TURN2_START/SIT_DESCENT_START/SEAT_CONTACT/END.'),
    f('t_s', 'number', 's', 'Events', 'Event time.', 'Relative to GO.'),
    f('path_s_m', 'number', 'm', 'Events', 'Path coordinate at event.', 'Reconstructed distance along course.'),
    f('hip_progress', 'number', '', 'Events', 'Hip-progress p at event.', '0 seated, 1 standing.'),
    f('facing', 'integer', '', 'Events', 'Facing direction (+1/−1).', 'Sign of toe-ahead-of-heel.'),
    f('note', 'string', '', 'Events', 'Optional note.', 'Free text (e.g. foot).'),
  ];

  /* ---- FRAMES (analysed 30 Hz series) ------------------------------------ */
  const FRAMES = [
    f('session_id', 'uuid', '', 'Frames', 'Owning session.', 'Join key.'),
    f('t_s', 'number', 's', 'Frames', 'Sample time.', 'Uniform 30 Hz grid, relative to GO.'),
    f('phase', 'string', '', 'Frames', 'Phase label.', 'From event segmentation.'),
    f('tracking_gap', 'boolean', 'bool', 'Frames', 'Sample was imputed.', 'True if bridged gap.'),
    f('facing', 'integer', '', 'Frames', 'Facing direction (+1/−1).', 'Debounced toe-ahead sign.'),
    f('progress', 'number', '', 'Frames', 'Hip progress p.', '(hip_up−seated)/(stand−seated).'),
    f('hip_up_m', 'number', 'm', 'Frames', 'Hip height (world).', 'World vertical of hip mid.'),
    f('path_s_m', 'number', 'm', 'Frames', 'Path coordinate.', 'Reconstructed travel distance.'),
    f('hip_vel_up_m_s', 'number', 'm/s', 'Frames', 'Vertical hip velocity.', 'd(hip_up)/dt.'),
    f('hip_vel_path_m_s', 'number', 'm/s', 'Frames', 'Along-path hip velocity.', 'd(path_s)/dt.'),
    f('knee_flex_l_deg', 'number', 'deg', 'Frames', 'Left knee flexion.', '180−∠(hip,knee,ankle).'),
    f('knee_flex_r_deg', 'number', 'deg', 'Frames', 'Right knee flexion.', '180−∠(hip,knee,ankle).'),
    f('hip_flex_l_deg', 'number', 'deg', 'Frames', 'Left hip flexion.', '180−∠(shoulder,hip,knee).'),
    f('hip_flex_r_deg', 'number', 'deg', 'Frames', 'Right hip flexion.', '180−∠(shoulder,hip,knee).'),
    f('knee_vel_l_deg_s', 'number', 'deg/s', 'Frames', 'Left knee angular velocity.', 'd(knee_l)/dt.'),
    f('knee_vel_r_deg_s', 'number', 'deg/s', 'Frames', 'Right knee angular velocity.', 'd(knee_r)/dt.'),
    f('trunk_incl_deg', 'number', 'deg', 'Frames', 'Trunk inclination (forward+).', 'atan2 signed by facing.'),
    f('shank_incl_l_deg', 'number', 'deg', 'Frames', 'Left shank inclination.', 'Knee-ankle vs vertical.'),
    f('shank_incl_r_deg', 'number', 'deg', 'Frames', 'Right shank inclination.', 'Knee-ankle vs vertical.'),
    f('torso_yaw_deg', 'number', 'deg', 'Frames', 'Torso yaw (world).', 'atan2 of shoulder vector, unwrapped.'),
    f('torso_yaw_rate_deg_s', 'number', 'deg/s', 'Frames', 'Torso yaw rate.', 'd(yaw)/dt.'),
    f('g_left_m', 'number', 'm', 'Frames', 'Left foot-ahead-of-pelvis signal.', 'Zeni g_L for HS/TO.'),
    f('g_right_m', 'number', 'm', 'Frames', 'Right foot-ahead-of-pelvis signal.', 'Zeni g_R for HS/TO.'),
    f('arm_dev_l', 'number', 'trunk-len', 'Frames', 'Left wrist deviation from shoulder.', 'Arm-swing proxy.'),
    f('arm_dev_r', 'number', 'trunk-len', 'Frames', 'Right wrist deviation from shoulder.', 'Arm-swing proxy.'),
    f('obliquity', 'number', '', 'Frames', 'Hip-sep/trunk-len.', 'Side-on view check.'),
    f('chain_px', 'number', 'px', 'Frames', 'Body chain pixel length.', 'Depth-drift monitor.'),
    f('cam_yaw_rate_deg_s', 'number', 'deg/s', 'Frames', 'Estimated camera pan rate.', 'World-vertical stability (panning mode).'),
  ];

  // Filtered pixel coordinate columns appended to FRAMES ({sh,hip,kn,an,heel,toe}_{l,r}_{x,y}_px)
  ['sh', 'hip', 'kn', 'an', 'heel', 'toe'].forEach((seg) => {
    ['l', 'r'].forEach((side) => {
      ['x', 'y'].forEach((ax) => {
        FRAMES.push(f(`${seg}_${side}_${ax}_px`, 'number', 'px', 'Frames',
          `Filtered ${ax} pixel of ${side} ${seg}.`, 'Low-pass filtered image coordinate.'));
      });
    });
  });

  /* ---- Pose markers (17 landmarks) --------------------------------------- */
  const MARKERS = [
    { key: 'nose', mpIndex: 0, name: 'Nose', role: 'Head reference', usedBy: 'Full-body-in-frame check' },
    { key: 'l_sh', mpIndex: 11, name: 'Left shoulder', role: 'Trunk / yaw', usedBy: 'Trunk inclination, torso yaw, arm swing' },
    { key: 'r_sh', mpIndex: 12, name: 'Right shoulder', role: 'Trunk / yaw', usedBy: 'Trunk inclination, torso yaw, arm swing' },
    { key: 'l_el', mpIndex: 13, name: 'Left elbow', role: 'Arm', usedBy: 'Arm-swing proxy' },
    { key: 'r_el', mpIndex: 14, name: 'Right elbow', role: 'Arm', usedBy: 'Arm-swing proxy' },
    { key: 'l_wr', mpIndex: 15, name: 'Left wrist', role: 'Arm', usedBy: 'Arm swing, chair-push detection' },
    { key: 'r_wr', mpIndex: 16, name: 'Right wrist', role: 'Arm', usedBy: 'Arm swing, chair-push detection' },
    { key: 'l_hip', mpIndex: 23, name: 'Left hip', role: 'Pelvis', usedBy: 'Hip progress, path, hip flexion' },
    { key: 'r_hip', mpIndex: 24, name: 'Right hip', role: 'Pelvis', usedBy: 'Hip progress, path, hip flexion' },
    { key: 'l_kn', mpIndex: 25, name: 'Left knee', role: 'Leg', usedBy: 'Knee flexion' },
    { key: 'r_kn', mpIndex: 26, name: 'Right knee', role: 'Leg', usedBy: 'Knee flexion' },
    { key: 'l_an', mpIndex: 27, name: 'Left ankle', role: 'Leg', usedBy: 'Knee/ankle angle, gait fallback' },
    { key: 'r_an', mpIndex: 28, name: 'Right ankle', role: 'Leg', usedBy: 'Knee/ankle angle, gait fallback' },
    { key: 'l_heel', mpIndex: 29, name: 'Left heel', role: 'Foot', usedBy: 'Heel strike / toe off, stride length' },
    { key: 'r_heel', mpIndex: 30, name: 'Right heel', role: 'Foot', usedBy: 'Heel strike / toe off, stride length' },
    { key: 'l_toe', mpIndex: 31, name: 'Left foot index', role: 'Foot', usedBy: 'Facing direction, toe-off' },
    { key: 'r_toe', mpIndex: 32, name: 'Right foot index', role: 'Foot', usedBy: 'Facing direction, toe-off' },
  ];

  const SCHEMA = {
    version: '1.0',
    tables: { Sessions: SESSIONS, Steps: STEPS, Events: EVENTS, Frames: FRAMES },
    markers: MARKERS,
    // Flutter server field -> TUG//LAB column (parity map, 16 metrics)
    parityMap: {
      total_time_taken: 'total_time_taken_s',
      gait_velocity: 'gait_velocity_m_s',
      average_stride_length: 'average_stride_length_m',
      average_stride_time: 'average_stride_time_s',
      average_left_stride_length: 'average_left_stride_length_m',
      average_left_stride_time: 'average_left_stride_time_s',
      average_right_stride_length: 'average_right_stride_length_m',
      average_right_stride_time: 'average_right_stride_time_s',
      time_seated_to_full_extension: 'time_seated_to_full_extension_s',
      time_around_cone: 'time_around_cone_s',
      time_turn_to_sit: 'time_turn_to_sit_s',
      time_to_sitting_down: 'time_to_sitting_down_s',
      first_foot_walk: 'first_foot_walk',
      last_foot_walk: 'last_foot_walk',
      first_foot_around_cone: 'first_foot_around_cone',
      last_foot_turn_before_sitting: 'last_foot_turn_before_sitting',
    },
    keysOf(table) { return (this.tables[table] || []).map((d) => d.key); },
  };

  global.SCHEMA = SCHEMA;
})(typeof window !== 'undefined' ? window : globalThis);
