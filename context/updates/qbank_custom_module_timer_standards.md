# context/updates/qbank_custom_module_timer_standards.md

## 🔍 New Information (Web Research Findings)
Indian medical PG students preparing for NEET PG, FMGE, and INI-CET utilize highly customized mock generators. When building QBank generators, do not assume a single countdown timer. Industry leaders (Marrow/PrepLadder) support three distinct timing modes depending on whether the student is studying concepts or practicing speed.

## 🛠️ Correct Implementation
Provide the following three timer modes in Custom Module creators:
1. **Stopwatch (Count Up)**: Default for relaxed, conceptual study. Counts up from 0 and tracks elapsed time per question and total session. Answer feedback and explanations are revealed immediately after selecting an option (Study Mode).
2. **Countdown per Question**: Counts down from a set limit (e.g., 60 seconds) for the current question. If the timer hits 0, it auto-marks the question as unanswered/incorrect and auto-advances to the next question. Used for strict speed practice.
3. **Total Test Time Countdown**: Counts down a single pool of time for the entire test block (e.g., 10 minutes for a 10-question set). If the total timer hits 0, the test session automatically submits and terminates, transitioning the user to the Scorecard.

All countdown modes hide answer feedback and detailed explanations during the test, revealing them only on the summary scorecard at the end (Test Mode).
