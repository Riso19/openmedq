# FSRS Parameter Optimization Standards

## 🔍 New Information & Implementation Findings

1. **Client-Side Calibration (Coordinate Descent)**:
   - Spaced repetition weights ($w_0$ to $w_{20}$) can be trained directly in the client browser using a lightweight **Coordinate Descent** (local hill-climbing) optimization algorithm.
   - The loss function is the average **Log Loss** (cross-entropy) between the actual recall outcome ($y \in \{0, 1\}$ where $1 = \text{Success}$, $0 = \text{Again}$) and the predicted retrievability ($R$) computed from the FSRS forgetting curve:
     $$R = \left(1 + \text{factor} \times \frac{t}{S}\right)^{\text{decay}}$$
     where $\text{decay} = -w_{20}$ and $\text{factor} = e^{\frac{\ln(0.9)}{\text{decay}}} - 1$.
   - Clamping all updated weights to their mathematical boundaries (`FSRS_BOUNDS`) is mandatory to prevent scheduler validation crashes (finite constraints are defined in `CLAMP_PARAMETERS` in `ts-fsrs`).

2. **Event Loop Non-Blocking (Responsive UX)**:
   - Simulating reviews and computing log loss iteratively over thousands of records is CPU-bound and will block the browser's single-threaded event loop, leading to frozen UI screens and browser crash warnings.
   - **Solutions**:
     - Slice the training logs to the most recent 2,000 reviews (keeps computations fast and focuses parameters on recent memory patterns).
     - Yield thread execution back to the browser after every training epoch using `await new Promise(resolve => setTimeout(resolve, 0))`.
     - Provide visual progress feedback (e.g., percentage completion and loss status).

3. **Weights Padded Normalization**:
   - Custom weights arrays stored in user profiles could originate from older FSRS versions (e.g., 17 elements for FSRS-4.5 vs 21 elements for FSRS-6). Directly reading indices like `w[20]` from raw storage arrays will resolve to `undefined` and propagate `NaN` values, crashing rescheduling.
   - **Solution**: Always instantiate a temporary scheduler using the imported weights first to run parameters migration:
     ```typescript
     const tempScheduler = fsrs({ w: settings.w });
     const w = Array.from(tempScheduler.parameters.w); // Always returns normalized 21-element FSRS-6 weights
     ```

4. **Reactive Settings Sync**:
   - Calibrated weights must be written to the `-999` IndexedDB settings record and gzipped alongside card progress.
   - The app must reactively load synced weights by listening to the `openmedq_settings_updated` event, instantly applying updated parameters to the active scheduler and rescheduling card due dates.

5. **Same-Day Review Log Filtering**:
   - Including multiple reviews of the same question on the same day (spaced minutes apart) in FSRS parameter optimization leads to **stability inflation** (fitting short-term intervals rather than long-term retention). This causes the optimizer to compute excessively long intervals for future reviews.
   - **Solution**: Filter out duplicate reviews on the same calendar day before running optimization, retaining only the chronologically first review per question per local calendar day.

6. **TypeScript Read-Only Parameters Mismatch**:
   - `ts-fsrs`'s `checkParameters` utility function returns a `readonly number[]` or `number[] | readonly number[]`. Passing this directly to validation helper routines that require mutable `number[]` arrays (like `clipParameters`) results in a type mismatch error:
     * *The type 'readonly number[]' is 'readonly' and cannot be assigned to the mutable type 'number[]'.*
   - **Solution**: Cast or clone the output of `checkParameters` using `Array.from(checkParameters(customW))` before calling `clipParameters`.
