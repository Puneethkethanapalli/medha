/**
 * Web search and deep research tools.
 *
 * Uses Tavily for BYOK search. The regular tool is optimized for quick,
 * cited answers; deep_research runs a small multi-query pass and returns a
 * richer source pack for the model to synthesize.
 */

import { fetch } from 'expo/fetch';
import type { Citation, ToolDefinition, ToolResult } from './types';
import { getApiKey } from '@/lib/storage/secure';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const REQUEST_TIMEOUT_MS = 30_000;

async function executeWebSearch(args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.query || '').trim();
  if (!query) {
    return buildUnavailableResult('No search query provided.');
  }

  const numResults = clampNumber(Number(args.num_results) || 5, 1, 10);
  const depth = args.search_depth === 'advanced' ? 'advanced' : 'basic';
  const freshness = String(args.freshness || '').trim();
  const searchQuery = withFreshness(query, freshness);

  const apiKey = await getApiKey('tavily');
  if (!apiKey) {
    return buildUnavailableResult('Web search is not available. Please add a Tavily API key in Settings -> API Keys.');
  }

  try {
    const data = await runTavilySearch(apiKey, searchQuery, {
      maxResults: numResults,
      depth,
      includeRawContent: depth === 'advanced',
    });

    if (data.results.length === 0) {
      return {
        content: `No results found for "${query}".`,
        display: {
          kind: 'search',
          title: 'Web search',
          status: 'error',
          query,
          summary: `No results found for "${query}".`,
        },
      };
    }

    const citations = toCitations(data.results);
    const content = buildResultsMarkdown(`Search results for "${query}"`, data.answer, citations);
    const raw = buildRawSearchContext(query, searchQuery, data.answer, data.results);

    return {
      content,
      raw,
      citations,
      display: {
        kind: 'search',
        title: 'Web search',
        subtitle: depth === 'advanced' ? 'Advanced source pass' : 'Quick source pass',
        status: 'success',
        query,
        summary: data.answer,
        citations,
        metadata: [
          { label: 'Depth', value: depth },
          { label: 'Sources', value: String(citations.length) },
        ],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown search error';
    return buildUnavailableResult(`Search failed: ${message}`, query);
  }
}

async function executeDeepResearch(args: Record<string, unknown>): Promise<ToolResult> {
  const question = String(args.question || '').trim();
  if (!question) {
    return buildUnavailableResult('No research question provided.');
  }

  const focus = String(args.focus || '').trim();
  const numResults = clampNumber(Number(args.num_results) || 8, 4, 12);
  const apiKey = await getApiKey('tavily');

  if (!apiKey) {
    return buildUnavailableResult('Deep research is not available. Please add a Tavily API key in Settings -> API Keys.', question);
  }

  const queries = buildResearchQueries(question, focus);
  const perQuery = Math.max(2, Math.ceil(numResults / queries.length));

  try {
    const passes = await Promise.all(
      queries.map(async (query) => ({
        query,
        data: await runTavilySearch(apiKey, query, {
          maxResults: perQuery,
          depth: 'advanced',
          includeRawContent: true,
        }),
      }))
    );

    const dedupedResults = dedupeResults(passes.flatMap((pass) => pass.data.results)).slice(0, numResults);
    const citations = toCitations(dedupedResults);
    const sections = passes.map((pass) => ({
      title: pass.query,
      content: pass.data.answer || `${pass.data.results.length} relevant sources found.`,
    }));

    const raw = [
      `Research question: ${question}`,
      focus ? `Focus: ${focus}` : '',
      `Research date: ${new Date().toISOString()}`,
      '',
      ...passes.map((pass, index) => {
        const lines = [
          `## Pass ${index + 1}: ${pass.query}`,
          pass.data.answer ? `Direct answer: ${pass.data.answer}` : '',
          ...pass.data.results.map((result, resultIndex) =>
            `${resultIndex + 1}. ${result.title} (${result.url})\n${result.raw_content || result.content || 'No excerpt'}`
          ),
        ].filter(Boolean);
        return lines.join('\n\n');
      }),
    ].filter(Boolean).join('\n\n');

    const content = buildResultsMarkdown(`Research sources for "${question}"`, undefined, citations);

    return {
      content,
      raw,
      citations,
      display: {
        kind: 'research',
        title: 'Deep research',
        subtitle: `${queries.length} search passes`,
        status: 'success',
        query: question,
        summary: focus ? `Focus: ${focus}` : 'Multi-source research pack ready.',
        citations,
        sections,
        metadata: [
          { label: 'Passes', value: String(queries.length) },
          { label: 'Sources', value: String(citations.length) },
        ],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown research error';
    return buildUnavailableResult(`Deep research failed: ${message}`, question);
  }
}

interface TavilySearchOptions {
  maxResults: number;
  depth: 'basic' | 'advanced';
  includeRawContent: boolean;
}

interface TavilyResponse {
  answer?: string;
  results: TavilyResult[];
}

interface TavilyResult {
  title: string;
  url: string;
  content?: string;
  raw_content?: string;
  score?: number;
}

async function runTavilySearch(
  apiKey: string,
  query: string,
  options: TavilySearchOptions
): Promise<TavilyResponse> {
  const response = await fetchWithTimeout(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      search_depth: options.depth,
      max_results: options.maxResults,
      include_answer: true,
      include_raw_content: options.includeRawContent,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || 'Unknown error'}`);
  }

  const data = await response.json();
  return {
    answer: typeof data.answer === 'string' ? data.answer : undefined,
    results: Array.isArray(data.results) ? data.results : [],
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function buildUnavailableResult(message: string, query?: string): ToolResult {
  return {
    content: message,
    display: {
      kind: 'error',
      title: 'Search',
      status: 'error',
      query,
      summary: message,
    },
  };
}

function buildResultsMarkdown(title: string, answer: string | undefined, citations: Citation[]): string {
  const answerBlock = answer ? `${answer}\n\n` : '';
  const lines = citations.map((citation, index) => {
    const snippet = citation.snippet ? `\n   ${citation.snippet.slice(0, 240)}` : '';
    return `${index + 1}. [${citation.title}](${citation.url})${snippet}`;
  });

  return `### ${title}\n\n${answerBlock}${lines.join('\n\n')}`;
}

function buildRawSearchContext(
  originalQuery: string,
  searchQuery: string,
  answer: string | undefined,
  results: TavilyResult[]
): string {
  const lines = [
    `Original query: ${originalQuery}`,
    `Search query sent: ${searchQuery}`,
    answer ? `Direct answer: ${answer}` : '',
    ...results.map((result) =>
      `[${result.title}](${result.url}): ${result.raw_content || result.content || 'No description'}`
    ),
  ];

  return lines.filter(Boolean).join('\n\n');
}

function toCitations(results: TavilyResult[]): Citation[] {
  return results.map((result) => ({
    title: result.title || result.url,
    url: result.url,
    snippet: result.content,
  }));
}

function dedupeResults(results: TavilyResult[]): TavilyResult[] {
  const seen = new Set<string>();
  const deduped: TavilyResult[] = [];

  for (const result of results) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    deduped.push(result);
  }

  return deduped;
}

function buildResearchQueries(question: string, focus: string): string[] {
  const currentYear = new Date().getFullYear();
  const queries = [
    focus ? `${question} ${focus}` : question,
    /\b(latest|recent|today|current|new)\b/i.test(question)
      ? `${question} authoritative sources`
      : `${question} latest ${currentYear} authoritative sources`,
    focus ? `${question} ${focus} analysis evidence` : `${question} analysis evidence`,
  ];

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))).slice(0, 3);
}

function withFreshness(query: string, freshness: string): string {
  if (!freshness) return query;
  if (/\b(latest|recent|today|current|new|202\d)\b/i.test(query)) return query;
  return `${query} ${freshness}`;
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * The web_search tool definition.
 * Register via `registerTool(webSearchTool)`.
 */
export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the web for current information with citations. Use this for recent events, facts that may have changed, source-backed answers, or anything requiring up-to-date context.',
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
      minimum: 1,
      maximum: 10,
      default: 5,
    },
    search_depth: {
      type: 'string',
      description: "Search depth: 'basic' for quick answers or 'advanced' for richer source context.",
      required: false,
      enum: ['basic', 'advanced'],
      default: 'basic',
    },
    freshness: {
      type: 'string',
      description: 'Optional freshness phrase, such as "latest 2026" or "past week".',
      required: false,
    },
  },
  execute: executeWebSearch,
};

export const deepResearchTool: ToolDefinition = {
  name: 'deep_research',
  description:
    'Run a deeper multi-query research pass with citations. Use this for comparisons, investigations, market research, technical due diligence, or questions where one quick search is not enough.',
  parameters: {
    question: {
      type: 'string',
      description: 'The research question to investigate.',
      required: true,
    },
    focus: {
      type: 'string',
      description: 'Optional focus area, constraints, or source preference.',
      required: false,
    },
    num_results: {
      type: 'number',
      description: 'Total number of unique sources to return (4-12, default 8).',
      required: false,
      minimum: 4,
      maximum: 12,
      default: 8,
    },
  },
  execute: executeDeepResearch,
};
