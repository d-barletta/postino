---
name: html-email-editing
description: Deterministic HTML email editor. Performs minimal, rule-driven edits while preserving exact structure and rendering.
---

## Mission

Apply user rules to HTML email content using **minimal, surgical edits**.

If no rule applies → DO NOT modify the HTML.

---

## Hard Constraints (NON-NEGOTIABLE)

- Input is ALWAYS HTML
- Preserve 100% of:
  - structure
  - tag hierarchy
  - attributes
  - inline styles
  - CSS
  - layout
  - rendering behavior

- DO NOT:
  - reformat
  - prettify
  - normalize
  - restructure
  - convert to plain text
  - inject new wrappers

---

## Editing Model (CRITICAL)

- Modify ONLY what rules explicitly require
- Edit ONLY:
  - visible text nodes

- Everything else MUST remain byte-equivalent when possible

- Use **minimal-diff strategy**:
  - smallest possible change
  - no collateral edits

---

## Rule Application

- Apply rules **sequentially (top → bottom)**
- If conflict:
  - **later rule overrides earlier**

- Ignore irrelevant rules

---

## Allowed Transformations

### Translation

- Translate ONLY visible text
- NEVER translate:
  - HTML
  - attributes
  - CSS
  - URLs
  - tracking params

### Summarization / Rewrite

- Preserve:
  - meaning
  - facts
  - names
  - dates
  - links
  - CTAs

- DO NOT change structure

### Content Removal

- Remove ONLY:
  - explicitly targeted content
  - clearly irrelevant sections (ads) IF safe

- Do NOT break layout:
  - keep spacing elements if needed

---

## Strict Preservation

Always preserve EXACTLY:

- `<head>`, `<style>`, `<meta>`
- conditional comments (`<!--[if mso]>`)
- tables and nested tables
- attributes (`class`, `id`, `style`, `width`, etc.)
- images, links, tracking pixels
- HTML entities (`&nbsp;`, etc.)
- spacer elements

---

## Rendering Guarantee

After editing:

- Visual rendering MUST remain unchanged
  - except intended text changes

- No layout shifts
- No broken email client behavior

---

## Failure Handling

If edit fails:

1. Re-locate target content
2. Retry with precise match
3. If still failing:
   - rewrite ONLY the affected fragment

NEVER rewrite entire document unless explicitly required

---

## Determinism

- Same input → identical output
- No randomness
- No stylistic variation

---

## Anti-Patterns (FORBIDDEN)

- Converting tables → divs
- Removing `&nbsp;`
- Modifying `<head>`
- Cleaning or modernizing HTML
- Editing outside rule scope
- Rewriting large sections unnecessarily

---

## Output

- Valid, well-formed HTML
- Structurally identical (except minimal edits)
- All changes traceable to rules
