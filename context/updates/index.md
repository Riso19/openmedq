# context/updates/index.md

This directory logs updates, deprecated patterns, and common mistakes encountered during development. Before making changes, check this index and read only the updates relevant to your task.

## 📁 Index of Updates

* [fsrs_integration_standards.md](file:///Users/sain/development/openmedq/context/updates/fsrs_integration_standards.md):
  * **Category**: New info learned via web research.
  * **Description**: Implementing FSRS spaced repetition scheduler in local Dexie IndexedDB and Cloudflare D1.
* [clerk_hono_migration.md](file:///Users/sain/development/openmedq/context/updates/clerk_hono_migration.md): 
  * **Category**: Deprecated patterns from training weights.
  * **Description**: Clerk has deprecated the `@hono/clerk-auth` package; all Hono backends must use `@clerk/hono` instead.
* [qbank_custom_module_timer_standards.md](file:///Users/sain/development/openmedq/context/updates/qbank_custom_module_timer_standards.md):
  * **Category**: New information learned via web research.
  * **Description**: Custom module timing patterns for Indian medical QBanks (Stopwatch, Countdown per question, and Total countdown).
* [common_mistakes_to_avoid.md](file:///Users/sain/development/openmedq/context/updates/common_mistakes_to_avoid.md):
  * **Category**: Common mistakes to avoid.
  * **Description**: Checklist of recurrent mistakes (such as missing type declarations in browser contexts, duplicate declarations, empty Wrangler environment variables, 0-vs-1 indexing option key mismatches, and missing IndexedDB caching for online custom practice questions).
* [dashboard_structure_standards.md](file:///Users/sain/development/openmedq/context/updates/dashboard_structure_standards.md):
  * **Category**: New information learned via web research.
  * **Description**: PG QBank dashboard layouts, professional phases grouping, and active recall triggers.
* [r2_api_upload_standards.md](file:///Users/sain/development/openmedq/context/updates/r2_api_upload_standards.md):
  * **Category**: New info learned via web research.
  * **Description**: Bulk seeding R2 buckets using Cloudflare REST API v4, handling list pagination response shape, throttling, and 429 rate limit backoffs.
* [fsrs_visualizations_standards.md](file:///Users/sain/development/openmedq/context/updates/fsrs_visualizations_standards.md):
  * **Category**: New information learned via web research.
  * **Description**: Spaced repetition metrics standards and custom SVG visualization practices for React 19 and Tailwind v4.
* [custom_mock_exam_standards.md](file:///Users/sain/development/openmedq/context/updates/custom_mock_exam_standards.md):
  * **Category**: New information learned via web research.
  * **Description**: Standards for Computer-Based Test (CBT) mock simulations, color palettes, question navigation tracking, suppressed review rules, and answer revision metrics.
* [d1_rest_sync_standards.md](file:///Users/sain/development/openmedq/context/updates/d1_rest_sync_standards.md):
  * **Category**: New info learned via web research / Common mistakes to avoid.
  * **Description**: Standards for D1 REST two-way sync merging, client LWW conflict resolution, tombstone rules, browser-native Gzip compression, settings synchronization, dynamic streak calculations, and sync latency optimizations.
* [fsrs_parameter_optimization_standards.md](file:///Users/sain/development/openmedq/context/updates/fsrs_parameter_optimization_standards.md):
  * **Category**: New info learned via web research.
  * **Description**: Standards for client-side FSRS weight parameter optimization, coordinate descent simulation, responsive UI event-loop yielding, and weights migration/normalization.
* [react_native_expo_monorepo_standards.md](file:///Users/sain/development/openmedq/context/updates/react_native_expo_monorepo_standards.md):
  * **Category**: New info learned via web research / Architecture standards.
  * **Description**: Standards for Expo React Native workspace layout, shared module design, platform compatibility constraints, and AI agent mobile MCP/skills integration.
* [expo_typescript_clerk_standards.md](file:///Users/sain/development/openmedq/context/updates/expo_typescript_clerk_standards.md):
  * **Category**: Common mistakes to avoid / Architecture standards.
  * **Description**: Standards for resolving TypeScript monorepo type leakage, Clerk signals SDK compiler errors, useEffect setState linter warnings, deep link scheme collision fixes, and Metro environment variable caching in the Expo mobile app.
* [cloudflare_free_tier_scalability_standards.md](file:///Users/sain/development/openmedq/context/updates/cloudflare_free_tier_scalability_standards.md):
  * **Category**: New info learned via web research / Architecture standards.
  * **Description**: Standards for Cloudflare Free Tier scalability optimization, including Workers request quota bypass using static R2 direct routing, D1 query optimizations, and client-side caching.
* [mobile_ui_parity_assets_standards.md](file:///Users/sain/development/openmedq/context/updates/mobile_ui_parity_assets_standards.md):
  * **Category**: New info learned via web research / Architecture standards.
  * **Description**: Standards for static asset imports, strict theme color reassignments, and native emoji visuals in the Expo mobile app.
* [markdown_and_image_lightbox_standards.md](file:///Users/sain/development/openmedq/context/updates/markdown_and_image_lightbox_standards.md):
  * **Category**: New info learned via web research.
  * **Description**: Standards for lightweight markdown parsing, superscript/subscript transformations, and premium image lightbox dialogs using native HTML5 and allow-discrete transition behaviors.
* [offline_caching_metadata_alignment.md](file:///Users/sain/development/openmedq/context/updates/offline_caching_metadata_alignment.md):
  * **Category**: Common mistakes to avoid / Architecture standards.
  * **Description**: Standards for resolving offline cache completeness check discrepancies by calculating topic and subject counts from final written pack files.
* [pyq_configuration_consolidation.md](file:///Users/sain/development/openmedq/context/updates/pyq_configuration_consolidation.md):
  * **Category**: Common mistakes to avoid / Architecture standards.
  * **Description**: Standards for centralizing virtual subjects, PYQ paper lists, and question counts in the shared library to avoid duplication in web and mobile codebases.
* [logo_theme_and_asset_optimization_standards.md](file:///Users/sain/development/openmedq/context/updates/logo_theme_and_asset_optimization_standards.md):
  * **Category**: New info learned via development / Architecture standards.
  * **Description**: Standards for logo downsampling size reduction, dynamic theme-based swapping, and conforming startup animated icons to solid layouts.


