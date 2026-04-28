/**
 * Bundled skills — Sprint 19
 *
 * Ships 5 practical workflow skills as SKILL.md content strings.
 * These are seeded to {documentDirectory}/skills/ on first launch.
 */

export interface BundledSkillDef {
  name: string;
  content: string;
  version: string;
}

export const BUNDLED_SKILLS: BundledSkillDef[] = [
  {
    name: 'code-review',
    version: '1.0',
    content: `---
name: code-review
description: Review code for bugs, security issues, style problems, and performance. Use when the user asks to review, audit, or check code quality.
license: MIT
metadata:
  author: medha
  version: "1.0"
---

## When to Use
Use this skill when the user shares code and asks for review, feedback, or quality assessment.

## Instructions
1. Read the code carefully before commenting
2. Prioritize: security issues > bugs > performance > style
3. Be specific — reference line numbers and suggest fixes
4. Acknowledge what's done well, not just problems
5. Consider edge cases and error handling
6. Check for common vulnerabilities (injection, XSS, auth bypass)

## Output Format
Structure your review as:
- **Summary**: 1-2 sentence overall assessment
- **Critical Issues**: Security/correctness problems (if any)
- **Suggestions**: Improvements ranked by impact
- **Positive Notes**: What's well-done

## Guidelines
- Be constructive, not nitpicky
- Suggest concrete fixes, not just "this is bad"
- Note when something is a style preference vs. a real issue
- If the code is production-ready, say so confidently
`,
  },
  {
    name: 'research',
    version: '1.0',
    content: `---
name: research
description: Deep research with systematic investigation using web search. Use when thorough investigation is needed on a topic, technology, or question.
license: MIT
allowed-tools: web_search
metadata:
  author: medha
  version: "1.0"
---

## When to Use
Use this skill when the user needs thorough investigation — comparing technologies, understanding a topic deeply, or finding current/accurate information.

## Instructions
1. Break the research question into sub-questions
2. Use web_search to find current, authoritative sources
3. Cross-reference multiple sources for accuracy
4. Distinguish between facts, opinions, and speculation
5. Note when information may be outdated

## Research Process
1. **Understand**: Clarify what the user actually needs to know
2. **Search**: Use targeted queries — specific terms, site-specific searches
3. **Analyze**: Read and synthesize findings across sources
4. **Verify**: Cross-check key claims from multiple sources
5. **Present**: Organize findings clearly with citations

## Output Format
- **Key Findings**: The most important takeaways (bulleted)
- **Details**: Expanded analysis organized by sub-topic
- **Sources**: Links and references used
- **Caveats**: Limitations, conflicting information, or areas needing more research
`,
  },
  {
    name: 'translate-document',
    version: '1.0',
    content: `---
name: translate-document
description: Translate text between languages with context preservation. Use when translation is requested for any text, document, or conversation.
license: MIT
metadata:
  author: medha
  version: "1.0"
---

## When to Use
Use this skill when the user asks to translate text between languages.

## Instructions
1. Identify source and target languages
2. Translate naturally — not word-for-word
3. Preserve formatting (headings, lists, code blocks)
4. Keep technical terms accurate (don't over-translate jargon)
5. Adapt idioms and cultural references appropriately
6. If the source language is ambiguous, ask

## Guidelines
- Prioritize meaning over literal translation
- Preserve the original tone (formal stays formal, casual stays casual)
- For technical content, keep standard English terms where the target language commonly uses them
- Include transliteration for non-Latin scripts when helpful
- If a phrase doesn't translate well, explain the original meaning in parentheses

## Output Format
Provide the translation directly, without preamble. If context is important:
- Add a brief note about translation choices at the end
- Mark any uncertain translations with [?]
`,
  },
  {
    name: 'summarize',
    version: '1.0',
    content: `---
name: summarize
description: Summarize long text, documents, or conversations into concise formats. Use when the user needs a shorter version of content.
license: MIT
metadata:
  author: medha
  version: "1.0"
---

## When to Use
Use this skill when the user asks to summarize, condense, or get the key points from text, documents, or conversations.

## Instructions
1. Read the full content before summarizing
2. Identify the main thesis/purpose
3. Extract key points, not every detail
4. Preserve important numbers, names, and dates
5. Match the user's requested format and length

## Summary Formats
Adapt to what the user needs:
- **TL;DR**: 1-2 sentences capturing the essence
- **Key Points**: Bulleted list of 3-7 main takeaways
- **Executive Summary**: 1-2 paragraphs for decision-makers
- **Detailed Summary**: Multi-section summary preserving structure

## Guidelines
- Default to "Key Points" format if no preference stated
- Don't add information not in the original
- Don't inject opinions — stay faithful to the source
- If content is already short, say so rather than padding
- For conversations, capture decisions and action items
`,
  },
  {
    name: 'debug-error',
    version: '1.0',
    content: `---
name: debug-error
description: Systematic error debugging - reproduce, isolate, diagnose, fix. Use when the user reports a bug, error, or unexpected behavior.
license: MIT
metadata:
  author: medha
  version: "1.0"
---

## When to Use
Use this skill when the user shares an error message, stack trace, unexpected behavior, or asks for debugging help.

## Debugging Process
1. **Understand**: Read the error message/stack trace carefully
2. **Reproduce**: Ask for steps to reproduce if not provided
3. **Isolate**: Narrow down the root cause
4. **Diagnose**: Explain WHY the error occurs
5. **Fix**: Provide a concrete solution with code

## Instructions
1. Always read the FULL error message — key info is often at the end
2. Check for common causes first (typos, missing imports, wrong types)
3. Consider the environment (Node version, OS, package versions)
4. Provide the fix AND explain why it works
5. Suggest how to prevent similar issues

## Output Format
- **Error**: Restate the error concisely
- **Root Cause**: What's actually going wrong and why
- **Fix**: Code changes needed (with before/after when helpful)
- **Prevention**: How to avoid this in the future

## Guidelines
- Don't guess — if you need more info, ask specific questions
- Check if it's a known issue with the library/framework
- Consider if the error is a symptom of a deeper problem
- Suggest adding error handling if the code lacks it
`,
  },
];
