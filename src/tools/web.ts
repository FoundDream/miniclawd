/**
 * Web tools: web_search and web_fetch.
 *
 * Search backends (in order of priority):
 * 1. Brave Search (requires BRAVE_API_KEY)
 * 2. Jina AI (free, no API key required)
 */

import { z } from "zod";
import { Tool } from "./base.js";

// Shared constants
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36";

/**
 * Strip HTML tags and decode entities.
 */
function stripTags(text: string): string {
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<[^>]+>/g, "");
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Normalize whitespace.
 */
function normalize(text: string): string {
  text = text.replace(/[ \t]+/g, " ");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Validate URL: must be http(s) with valid domain.
 */
function validateUrl(url: string): [boolean, string] {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return [false, `Only http/https allowed, got '${parsed.protocol || "none"}'`];
    }
    if (!parsed.hostname) {
      return [false, "Missing domain"];
    }
    return [true, ""];
  } catch (e) {
    return [false, String(e)];
  }
}

/**
 * Convert HTML to markdown.
 */
function toMarkdown(html: string): string {
  // Convert links
  let text = html.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, content) => `[${stripTags(content)}](${href})`
  );
  // Convert headings
  text = text.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_, level, content) => `\n${"#".repeat(parseInt(level))} ${stripTags(content)}\n`
  );
  // Convert list items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => `\n- ${stripTags(content)}`);
  // Convert paragraphs and divs
  text = text.replace(/<\/(p|div|section|article)>/gi, "\n\n");
  text = text.replace(/<(br|hr)\s*\/?>/gi, "\n");
  return normalize(stripTags(text));
}

/**
 * Search the web using Brave Search API or Jina AI.
 */
export class WebSearchTool extends Tool {
  readonly name = "web_search";
  readonly description = "Search the web. Returns titles, URLs, and snippets.";
  readonly parameters = z.object({
    query: z.string().describe("Search query"),
    count: z.number().min(1).max(10).optional().describe("Results (1-10)"),
  });

  private apiKey: string;
  private maxResults: number;

  constructor(options?: { apiKey?: string; maxResults?: number }) {
    super();
    this.apiKey = options?.apiKey || process.env.BRAVE_API_KEY || "";
    this.maxResults = options?.maxResults || 5;
  }

  async execute(params: { query: string; count?: number }): Promise<string> {
    const n = Math.min(Math.max(params.count || this.maxResults, 1), 10);

    // Try Brave Search first if API key is available
    if (this.apiKey) {
      try {
        return await this.searchBrave(params.query, n);
      } catch (e) {
        // Fall through to Jina
      }
    }

    // Fallback to DuckDuckGo (free, no API key)
    try {
      return await this.searchDuckDuckGo(params.query, n);
    } catch (e) {
      return `Error: ${e}`;
    }
  }

  private async searchBrave(query: string, count: number): Promise<string> {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.apiKey,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      throw new Error(`Brave search failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    const results = data.web?.results || [];

    if (results.length === 0) {
      return `No results for: ${query}`;
    }

    const lines = [`Results for: ${query}\n`];
    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      lines.push(`${i + 1}. ${item.title || ""}\n   ${item.url || ""}`);
      if (item.description) {
        lines.push(`   ${item.description}`);
      }
    }
    return lines.join("\n");
  }

  private async searchDuckDuckGo(query: string, count: number): Promise<string> {
    // Use DuckDuckGo HTML search and parse results
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: ${response.status}`);
    }

    const html = await response.text();

    // Parse results - DDG uses redirect URLs with uddg parameter
    const results: Array<{ title: string; url: string; description: string }> = [];

    // Match result blocks
    const resultBlocks = html.split('<div class="links_main');

    for (const block of resultBlocks.slice(1)) {
      // Only process up to count results
      if (results.length >= count) break;

      // Extract URL from uddg parameter
      const urlMatch = block.match(/uddg=([^&"]+)/);
      if (!urlMatch) continue;

      const url = decodeURIComponent(urlMatch[1]);
      if (!url.startsWith("http")) continue;

      // Extract title
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
      const title = titleMatch ? stripTags(titleMatch[1]) : "";

      // Extract snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+)/);
      const description = snippetMatch ? stripTags(snippetMatch[1]) : "";

      if (title || url) {
        results.push({ title, url, description });
      }
    }

    if (results.length === 0) {
      return `No results for: ${query}`;
    }

    const lines = [`Results for: ${query}\n`];
    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      lines.push(`${i + 1}. ${item.title}\n   ${item.url}`);
      if (item.description) {
        lines.push(`   ${item.description}`);
      }
    }
    return lines.join("\n");
  }
}

/**
 * Fetch and extract content from a URL using Readability.
 */
export class WebFetchTool extends Tool {
  readonly name = "web_fetch";
  readonly description = "Fetch URL and extract readable content (HTML → markdown/text).";
  readonly parameters = z.object({
    url: z.string().describe("URL to fetch"),
    extractMode: z.enum(["markdown", "text"]).optional().default("markdown"),
    maxChars: z.number().min(100).optional(),
  });

  private defaultMaxChars: number;

  constructor(options?: { maxChars?: number }) {
    super();
    this.defaultMaxChars = options?.maxChars || 50000;
  }

  async execute(params: {
    url: string;
    extractMode?: "markdown" | "text";
    maxChars?: number;
  }): Promise<string> {
    const maxChars = params.maxChars || this.defaultMaxChars;
    const extractMode = params.extractMode || "markdown";

    // Validate URL
    const [isValid, errorMsg] = validateUrl(params.url);
    if (!isValid) {
      return JSON.stringify({ error: `URL validation failed: ${errorMsg}`, url: params.url });
    }

    // Try Jina Reader first (better extraction)
    try {
      const result = await this.fetchJina(params.url, maxChars);
      if (result) return result;
    } catch {
      // Fall through to direct fetch
    }

    // Direct fetch fallback
    return this.fetchDirect(params.url, extractMode, maxChars);
  }

  private async fetchJina(url: string, maxChars: number): Promise<string | null> {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: "application/json",
        "X-Return-Format": "json",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      data?: { title?: string; content?: string; url?: string };
    };

    if (!data.data?.content) {
      return null;
    }

    let text = data.data.content;
    if (data.data.title) {
      text = `# ${data.data.title}\n\n${text}`;
    }

    const truncated = text.length > maxChars;
    if (truncated) {
      text = text.slice(0, maxChars);
    }

    return JSON.stringify({
      url: url,
      finalUrl: data.data.url || url,
      status: 200,
      extractor: "jina",
      truncated,
      length: text.length,
      text,
    });
  }

  private async fetchDirect(
    url: string,
    extractMode: "markdown" | "text",
    maxChars: number
  ): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return JSON.stringify({ error: `HTTP ${response.status}`, url });
      }

      const contentType = response.headers.get("content-type") || "";
      const body = await response.text();

      let text: string;
      let extractor: string;

      // JSON
      if (contentType.includes("application/json")) {
        try {
          text = JSON.stringify(JSON.parse(body), null, 2);
          extractor = "json";
        } catch {
          text = body;
          extractor = "raw";
        }
      }
      // HTML
      else if (
        contentType.includes("text/html") ||
        body.slice(0, 256).toLowerCase().startsWith("<!doctype") ||
        body.slice(0, 256).toLowerCase().startsWith("<html")
      ) {
        const { Readability } = await import("@mozilla/readability");
        const { parseHTML } = await import("linkedom");

        const { document } = parseHTML(body);
        const reader = new Readability(document);
        const article = reader.parse();

        if (article) {
          text =
            extractMode === "markdown" ? toMarkdown(article.content) : stripTags(article.content);
          text = article.title ? `# ${article.title}\n\n${text}` : text;
          extractor = "readability";
        } else {
          text = stripTags(body);
          extractor = "fallback";
        }
      }
      // Plain text
      else {
        text = body;
        extractor = "raw";
      }

      const truncated = text.length > maxChars;
      if (truncated) {
        text = text.slice(0, maxChars);
      }

      return JSON.stringify({
        url,
        finalUrl: response.url,
        status: response.status,
        extractor,
        truncated,
        length: text.length,
        text,
      });
    } catch (error) {
      return JSON.stringify({ error: String(error), url });
    }
  }
}
