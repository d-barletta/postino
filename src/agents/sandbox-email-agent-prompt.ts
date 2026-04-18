export const SANDBOX_EMAIL_AGENT_PROMPT = `You have an email HTML file at /vercel/sandbox/email.html that needs processing.

FROM: __EMAIL_FROM__
SUBJECT: __EMAIL_SUBJECT____ATTACHMENTS_LINE__

RULES:
__RULES_TEXT__

IMPORTANT:
__CAVEMAN_IMPORTANT_LINE__
__HTML_EDITING_IMPORTANT_LINE__
- Hard runtime limit: this sandbox execution is capped at __SANDBOX_PLATFORM_TIMEOUT_MINUTES__ minutes total. Complete your work and write final outputs well before that limit.
- The user's rules are the source of truth, but preserve the original email as much as possible while applying them.
- Default behavior: keep the email structurally and semantically intact. Make the smallest effective change that satisfies the rules.
- Do not rewrite from scratch unless a rule clearly asks for a full rewrite, a completely new version, or a fundamentally different email.
- If a rule asks to translate the email, translate only user-visible email content that should appear in the rendered message. Do not translate HTML tags, attributes, CSS, URLs, tracking parameters, code snippets, hidden metadata, or technical identifiers unless the rule explicitly asks for that.
- If a rule asks to summarize, condense, simplify, or shorten the email, keep the original intent, key facts, promises, dates, names, links, calls to action, and tone whenever possible.
- If a rule asks to modify or improve the email, edit only the portions necessary to satisfy that request and preserve the rest of the message.
- If a rule asks to change tone, wording, or clarity, retain the original meaning unless the rule explicitly asks to change the meaning.
- If a rule asks to remove content, remove only the targeted content and keep the remaining message intact.
- If a rule asks to completely change, fully rewrite, or regenerate the email, then a substantial rewrite is allowed.
- If a rule asks to translate into a language the email already uses, skip translation and preserve the original content unchanged.
- Apply applicable rules to 100% of the message (all relevant subject/body content), not just a subset.
- Before finishing, double-check that every applicable rule was correctly applied to the final subject/body output.
- If an edit tool call fails because oldString was not found, do NOT give up or declare success. Read the file again, locate the exact current text, and retry the edit. If a targeted edit keeps failing, fall back to rewriting the entire file with the correct content.
- After writing subject.txt, always verify its content with a bash cat command. If the subject still shows the original value and a rule requires a subject change (e.g. translation, rewording), overwrite subject.txt with the correctly transformed subject.
__ANALYSIS_SECTION____MEMORY_SECTION__

INSTRUCTIONS:
1. __CAVEMAN_STEP_INSTRUCTION__
2. __HTML_EDITING_STEP_INSTRUCTION__
3. IMMEDIATELY write the subject line to /vercel/sandbox/subject.txt. Do this before reading or processing the email. Write the original subject as-is: "__ORIGINAL_SUBJECT__"
4. Read the file /vercel/sandbox/email.html
5. Apply the rules above to both the subject and body.
6. Preserve the original HTML structure, layout, CSS styles, inline styles, classes, links, images, and rendering behavior unless a rule explicitly requires changing them.
7. Modify only content that is necessary to satisfy the rules, keeping untouched content exactly as close to the original as possible.
8. Write the processed HTML back to /vercel/sandbox/email.html (overwrite).
9. If the rules required a subject change, overwrite /vercel/sandbox/subject.txt with the new subject.
10. Do NOT create any other files.`;

export const SANDBOX_EMAIL_AGENT_VERIFICATION_PROMPT = `VERIFICATION PASS: A previous step has already processed this email. Your job is to verify that every applicable rule was fully applied and to fix anything that was missed or only partially done.

FROM: __EMAIL_FROM__
ORIGINAL SUBJECT: __EMAIL_SUBJECT__

RULES THAT SHOULD HAVE BEEN APPLIED:
__RULES_TEXT__

INSTRUCTIONS:
1. __CAVEMAN_STEP_INSTRUCTION__
2. __HTML_EDITING_STEP_INSTRUCTION__
3. Read the current /vercel/sandbox/email.html (this is the already-processed output).
4. Read the current /vercel/sandbox/subject.txt.
5. For each rule above, verify it was correctly and completely applied to the subject and body.
6. If any rule was missed, partially applied, or incorrectly applied, fix it now. If an edit tool call fails (oldString not found), read the file again and locate the exact text before retrying. Fall back to a full file rewrite if targeted edits keep failing.
7. If all rules are fully and correctly applied, you may leave the files unchanged.
8. Write the final HTML back to /vercel/sandbox/email.html (overwrite).
9. Write the final subject to /vercel/sandbox/subject.txt (overwrite).
10. Do NOT create any other files.`;
