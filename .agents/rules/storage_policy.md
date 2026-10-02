# CRITICAL DIRECTORY POLICY: Test Files, Reports & Temporary Artifacts

## MANDATORY STORAGE PATH
ALL test files, test fixtures, test scripts, Playwright specs, test reports, audit reports, temporary downloads, test screenshots, and scratch artifacts MUST ALWAYS be stored in and executed from:

`F:\Me & My Docs\1. Recent Projects\SnaSignFit extra files\SnapSignFit_Extra_Files`

### STRICT RULES FOR ALL AI MODELS AND AGENTS:
1. **NEVER create or save test files in the main project directory** (`f:\Me & My Docs\1. Recent Projects\SnapSignFit`).
2. **NEVER create or save report files in the main project directory** (e.g. `report.md`, `audit-report.html`, `test-results.json`, `fix-requests.md`, etc.).
3. **NEVER create test directories** like `tests/`, `fixtures/`, `test-results/`, `test_downloads/`, or `screenshots/` in the main project repository.
4. **All testing assets reside strictly in the extra files directory**:
   - Test suites & specs: `F:\Me & My Docs\1. Recent Projects\SnaSignFit extra files\SnapSignFit_Extra_Files\tests`
   - Test fixtures & sample images: `F:\Me & My Docs\1. Recent Projects\SnaSignFit extra files\SnapSignFit_Extra_Files\tests\fixtures`
   - Playwright results: `F:\Me & My Docs\1. Recent Projects\SnaSignFit extra files\SnapSignFit_Extra_Files\test-results`
   - Test JSON reports: `F:\Me & My Docs\1. Recent Projects\SnaSignFit extra files\SnapSignFit_Extra_Files\test-results.json`
   - Downloads & Screenshots: `F:\Me & My Docs\1. Recent Projects\SnaSignFit extra files\SnapSignFit_Extra_Files\tests_downloads` and `tests_screenshots`
   - Audit / Markdown reports: `F:\Me & My Docs\1. Recent Projects\SnaSignFit extra files\SnapSignFit_Extra_Files\*.md` or `*.html`
5. **If any model or script accidentally creates test or report files in the main project directory, they MUST be immediately relocated to `F:\Me & My Docs\1. Recent Projects\SnaSignFit extra files\SnapSignFit_Extra_Files`.**
6. **Main repository contains ONLY production application code, styles, assets, and standard deployment configurations.**
