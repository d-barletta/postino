---
name: html-email-editing
description: Expert at surgically editing HTML emails while preserving structure, styles, and layout. Use when processing email HTML files.
---

## What I do

- Edit HTML email content while preserving ALL original structure
- Maintain inline styles, CSS classes, table layouts, and image references
- Make minimal, surgical changes — only modify what the rules require
- Handle multi-part HTML emails (with nested tables, media queries, etc.)

## Guidelines

- Never strip or rewrite the HTML skeleton — only edit text content nodes
- Preserve `<style>` blocks, `<meta>` tags, and `<head>` content exactly
- Keep all `class`, `id`, `style`, `width`, `height`, `bgcolor`, and other layout attributes
- Do not remove tracking pixels, spacer GIFs, or structural `<table>` elements
- When translating, translate visible text only — not HTML attributes, URLs, or alt text for logos
- If an email uses `<!--[if mso]>` conditional comments, preserve them verbatim
- Multi-byte characters (emoji, accented letters) must remain valid UTF-8

## Common pitfalls

- Do NOT convert `<table>` layouts to `<div>` — email clients need tables
- Do NOT remove `&nbsp;` entities — they may be structural spacers
- Do NOT "clean up" or reformat the HTML — email clients are fragile
- Do NOT add `<!DOCTYPE>` or `<html>` tags if they weren't in the original
