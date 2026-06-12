# FSRS Spaced Repetition Visualizations Standards

## Category
New information learned via web research.

## Description
When implementing spaced repetition statistics for medical aspirants using FSRS (Free Spaced Repetition Scheduler), the visual metrics should reflect the mathematical states of the scheduler to help users optimize their recall rate. Additionally, custom SVG-based visualization is chosen over standard charting libraries (like Recharts) to guarantee compatibility with React 19 + Tailwind v4 and prevent a generic "AI-generated template" appearance.

## Key Performance Metrics
1. **Queue Composition (Card States):**
   - Categorize all cards in the system into four states: *New* (unsolved), *Learning* (recent attempts), *Review* (stable card queued for later), and *Relearning* (lapsed/recently incorrect).
   - Render these states in a stacked progress bar representing the total deck volume.
2. **FSRS Difficulty Spectrum (1-10):**
   - FSRS tracks card difficulty on a scale from 1 (easiest) to 10 (hardest).
   - A histogram displaying the distribution of card difficulty identifies "leeches" (highly difficult concepts) and tells users if they are overloading their queue with hard content.
3. **Memory Stability Distribution:**
   - Stability (S) is the estimated time (in days) before recall probability drops below 90%.
   - Group stability values into buckets (e.g. `< 3 days`, `3–10 days`, `10–30 days`, `30–90 days`, `90+ days`) to show the user how much information is stored in long-term memory vs. short-term.
4. **Review Forecast (Upcoming Load):**
   - An upcoming 7-day review bar chart showing reviews due per calendar day enables planning of study times.
5. **Practice Volume & Accuracy Overlay:**
   - A dual-axis chart comparing daily answered questions (stacked bars showing correct vs. incorrect) with running correctness percentage (trend line) allows progress tracking.

## Technical Choice: React 19 Custom SVGs
- **The Issue:** Version compatibility for charting libraries (like Recharts or Chart.js) is often lagging for React 19 and Tailwind v4, resulting in peer dependency warnings, layout ref-forwarding errors, and canvas resizing issues.
- **The Solution:** Custom SVG components inside React provide zero dependency bloat, instant rendering, clean TypeScript typechecking, and total styling freedom. We can style them using standard Tailwind v4 color variables (e.g., `stroke-clay-pink`, `fill-clay-teal`) to adhere strictly to the design system and avoid a generic template look.

## Implemented Mathematical Models & UI Blocks
1. **FSRS Retrievability & Memory Retention:**
   - Retrievability $R = 0.9^{t / S}$ where $t$ is days since last review and $S$ is stability. If stability or last review is missing, defaults to $0.9$.
   - **Memory Retention Index:** The average retrievability value across all reviewed cards, rendered in Bento Card 2.
   - **Estimated Knowledge Score:** The sum of retrievability ($\sum R$) across all reviewed cards, representing the estimated total retained concepts, rendered in Bento Card 4.
2. **Leech Concept Detection:**
   - Leeches are flagged when `(lapses >= 3 && difficulty >= 7.0) || (status === 'INCORRECT' && difficulty >= 7.5)`.
   - Flashed in a warning section displaying up to 4 leeches with lapse counts, difficulty levels, and preview text, plus a dedicated CTA to launch custom practice sessions.
3. **Bulk Rescheduling:**
   - Triggered on memory settings change (target retention or max interval). Recalculates `scheduledDays` using:
     $$I = \min(I_{max}, \max(1, \text{round}(S \cdot \frac{\ln(R_{target})}{\ln(0.9)})))$$
   - Re-estimates due dates in a bulk IndexedDB transaction with an interactive loading spinner.
