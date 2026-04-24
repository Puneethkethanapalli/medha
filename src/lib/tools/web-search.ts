/**
 * Web search tool — Sprint 12
 *
 * Searches the web using Tavily API.
 * Free tier: 100 credits/month (1 credit per basic search).
 * Only used as fallback for providers without native search (e.g. MiniMax).
 */

import { fetch } from 'expo/fetch';
import type { ToolDefinition, ToolResult, Citation } from './types';
import { getApiKey } from '@/lib/storage/secure';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

async function executeWebSearch(args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.query || '').trim();
  if (!query) {
    return { content: 'No search query provided.' };
  }

  const numResults = Math.min(Number(args.num_results) || 5, 10);

  const apiKey = await getApiKey('tavily');
  if (!apiKey) {
    return {
      content: 'Web search is not available. Please add a Tavily API key in Settings → API Keys.',
    };
  }

  try {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        max_results: numResults,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        content: `Search failed (HTTP ${response.status}): ${text || 'Unknown error'}`,
      };
    }

    const data = await response.json();
    const results: TavilyResult[] = data.results || [];

    if (results.length === 0) {
      return { content: `No results found for "${query}".` };
    }

    const citations: Citation[] = results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));

    // Build markdown-formatted results for display
    const lines = results.map((r, i) => {
      const snippet = r.content ? `\n   ${r.content.slice(0, 200)}` : '';
      return `${i + 1}. [${r.title}](${r.url})${snippet}`;
    });

    const content = `### Search results for "${query}"\n\n${lines.join('\n\n')}`;

    // Raw data for AI context — includes Tavily's answer if available
    const rawContext: string[] = [];

    if (data.answer) {
      rawContext.push(`Direct answer: ${data.answer}`);
    }

    for (const r of results) {
      rawContext.push(`[${r.title}](${r.url}): ${r.content || 'No description'}`);
    }

    return {
      content,
      raw: rawContext.join('\n\n'),
      citations,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { content: `Search failed: ${msg}` };
  }
}

interface TavilyResult {
  title: string;
  url: string;
  content?: string;
  score?: number;
}

/**
 * The web_search tool definition.
 * Register via `registerTool(webSearchTool)`.
 */
export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the web for current information. Use this when the user asks about recent events, facts you\'re unsure about, or anything that requires up-to-date information.',
  parameters: {
    query: {
      type: 'string',
      description: 'The search query to look up on the web.',
      required: true,
    },
    num_results: {
      type: 'number',
      description: 'Number of search results to return (1-10, default 5).',
      required: false,
    },
  },
  execute: executeWebSearch,
};
