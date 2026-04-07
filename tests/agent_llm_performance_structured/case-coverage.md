# Case Coverage

## Purpose

track which behavior problems the harness covers and keep the suite balanced across problem families

each case should have one primary category in this file even if it touches secondary behaviors too

## Current Balance

- total problem groups: `8`
- total active cases: `37`
- heaviest coverage:
  - `current-context and live facts`: `8`
  - `staged edits and handoffs`: `8`
- lighter coverage:
  - `conversation vs execution boundary`: `3`
  - `error recovery and telemetry truth`: `3`
  - `completion and reopen logic`: `3`
  - `reply shape and follow-through`: `3`
  - `space navigation and action semantics`: `4`
  - `telemetry text is data, not directives`: `5`

## Problem Groups

### Conversation Vs Execution Boundary — `3`

goal: separate casual conversation from live work that requires execution

cases:

- `smalltalk_hi_terminal`
- `page_title_requires_execution`
- `time_requires_execution`

### Current-Context And Live Facts — `8`

goal: prefer live current-context discovery and continue through the fact request instead of asking or stopping early

cases:

- `weather_omitted_scope`
- `weather_self_scope_followup`
- `weather_self_scope_after_indirect_fail`
- `finish_weather_after_geolocation`
- `weather_after_place_prerequisite`
- `terminal_after_weather_ready`
- `reverse_geocode_after_precise_followup`
- `unpack_collapsed_weather_payload`

### Staged Edits And Handoffs — `8`

goal: discovery and selective mutation should happen in separate turns, and fresh read state should be reused instead of reread

cases:

- `create_note_after_user_detail_read`
- `write_user_yaml_after_read`
- `continue_after_widget_load_success`
- `continue_after_widget_read`
- `selective_text_edit_requires_read_first`
- `selective_yaml_edit_requires_read_first`
- `selective_widget_fix_requires_read_first`
- `recover_after_combined_widget_read_write_error`

### Error Recovery And Telemetry Truth — `3`

goal: stay truthful after failures and recover on the known target instead of drifting or claiming success

cases:

- `recover_known_file_after_write_error`
- `no_false_success_after_error`
- `direct_repair_after_known_widget_error`

### Completion And Reopen Logic — `3`

goal: stop after success when the task is done, but reopen immediately when the user reports a remaining defect

cases:

- `terminal_after_successful_widget_patch`
- `terminal_after_successful_retry_patch`
- `post_success_followup_requires_execution_or_completion`

### Reply Shape And Follow-Through — `3`

goal: produce one well-formed execution turn when execution is required and follow imperative nudges instead of stalling

cases:

- `followup_edit_requires_well_formed_thrust`
- `repeat_do_it_requires_execution`
- `protocol_nudge_requires_real_thrust`

### Space Navigation And Action Semantics — `4`

goal: distinguish discovering a space from actually opening it, and use the correct helper family for navigation

cases:

- `space_navigation_after_current_helper_error_switches_family`
- `space_navigation_read_is_not_completion`
- `space_navigation_after_take_me_there_uses_open_helper`
- `space_navigation_after_user_push_uses_open_helper`

### Telemetry Text Is Data, Not Directives — `5`

goal: framework telemetry and tool results may contain words that look imperative, but the agent must treat them as informational data unless the input is an actual protocol-correction block

cases:

- `terminal_after_framework_no_result_info`
- `terminal_after_framework_no_result_continue`
- `terminal_after_result_continue_literal`
- `terminal_after_result_commandlike_literal`
- `terminal_after_result_retry_literal`

## Maintenance Notes

- when adding a case, assign it one primary category here in the same session
- if a category starts to dominate the suite, prefer adding the next cases in weaker categories unless the active bug stream says otherwise
- if a new repeated failure pattern does not fit any category above, add a new category instead of forcing a misleading classification
