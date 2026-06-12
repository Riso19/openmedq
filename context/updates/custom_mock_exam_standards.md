# context/updates/custom_mock_exam_standards.md

## 🔍 New Information (Web Research Findings)
For professional CBT (Computer-Based Test) simulation (like NEET PG, INI-CET, and FMGE), QBanks must mimic standard exam console behaviors rather than typical quiz formats. Important components include:
1. **Timing Constraint**: Mock exams strictly enforce a total test duration (un-timed stopwatch or per-question timers are deactivated) to train overall pacing.
2. **CBT Navigation Palette**: Represents the question status at a glance. Standard codes:
   - *Unvisited*: Indicates the student hasn't seen the question. Styled with a dotted grey border.
   - *Visited but Unanswered*: Rose background/border, highlighting that the student skipped it.
   - *Answered*: Teal background.
   - *Marked for Review*: Purple border/light purple background.
   - *Answered & Marked for Review*: Solid purple background with a green dot indicator.
3. **Revision/Switching Analytics**: Tracking first vs. last selected options on questions where answers were changed. Reconsideration metrics help identify if second-guessing leads to gains (Incorrect ➔ Correct) or losses due to overthinking (Correct ➔ Incorrect).

## 🛠️ Correct Implementation
1. **Mock Configuration in Creator**: Include toggles for Mock Exam Mode. If enabled, force timer mode to `TOTAL_LIMIT` and disable others. Render numeric inputs for Positive Marks (default 4) and Negative Marks (default 1, with an optional toggle to disable penalty).
2. **Review Suppression**: Supress all immediate validations, correct/incorrect badges, and high-yield explanation displays while the test is active. Show them only on the final Completed Scorecard.
3. **Advanced Scorecard Metrics**:
   - **Obtained Score**: Calculate `(correctCount * marksPerQ) - (incorrectCount * penaltyPerQ)`.
   - **Pacing**: Display average time spent on correct vs. incorrect answers, plus a "Wasted Time" indicator (total time spent on incorrect questions).
   - **Review Success Rate**: Percentage of flagged questions that the student eventually answered correctly.
   - **Answer Switching Analytics**: Report count of Incorrect-to-Correct, Correct-to-Incorrect, and Incorrect-to-Incorrect switches, along with a calculated **Net Marks Gain/Loss** to evaluate student instinct.
   - **Performance Matrix Table**: Breakdown of questions attempted/total, correct/wrong, accuracy, and average speed grouped by Subject and Topic.
