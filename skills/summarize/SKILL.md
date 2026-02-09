---
name: summarize
description: "Summarize web articles, documents, or any content into concise key points."
---

# Summarize Skill

Summarize content from URLs, files, or text into digestible formats.

## Summarizing URLs

1. Use `web_fetch` tool to get the content:

```
web_fetch(url="https://example.com/article")
```

2. Extract and summarize the key points

## Summarizing Files

1. Use `read_file` tool to read the content:

```
read_file(path="/path/to/document.md")
```

2. Process and summarize

## Summary Formats

### Brief Summary (Default)

- 2-3 sentences capturing the main idea
- Best for quick understanding

### Key Points

- Bullet list of 5-7 main points
- Include important facts, numbers, quotes

### Structured Summary

```
## TL;DR
One sentence summary

## Key Points
- Point 1
- Point 2
- Point 3

## Details
Expanded explanation if needed

## Takeaways
What reader should remember or do
```

### Executive Summary

For business/technical documents:

```
## Overview
Brief context

## Key Findings
- Finding 1
- Finding 2

## Recommendations
- Action item 1
- Action item 2

## Next Steps
What happens next
```

## Language Handling

- Summarize in the same language as the source by default
- If user specifies a language, translate the summary
- Keep technical terms in original language when appropriate

## Tips

- Preserve important numbers, dates, and names
- Note if content seems incomplete or paywalled
- For long documents, offer to summarize by section
- Mention content type (news, research, blog, etc.)
