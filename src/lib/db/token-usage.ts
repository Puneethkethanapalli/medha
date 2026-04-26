import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './schema';

export interface TokenUsageRecord {
  id: string;
  conversation_id: string;
  message_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number | null;
  created_at: number;
}

export function recordUsage(
  conversationId: string,
  messageId: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  costUsd: number | null,
): void {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.runSync(
    `INSERT INTO token_usage (id, conversation_id, message_id, model, prompt_tokens, completion_tokens, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, conversationId, messageId, model, promptTokens, completionTokens, costUsd, now]
  );
}

export interface ConversationUsage {
  totalPrompt: number;
  totalCompletion: number;
  totalCost: number;
}

export function getConversationUsage(conversationId: string): ConversationUsage {
  const db = getDatabase();
  const row = db.getFirstSync<{
    total_prompt: number;
    total_completion: number;
    total_cost: number;
  }>(
    `SELECT
       COALESCE(SUM(prompt_tokens), 0) AS total_prompt,
       COALESCE(SUM(completion_tokens), 0) AS total_completion,
       COALESCE(SUM(cost_usd), 0) AS total_cost
     FROM token_usage
     WHERE conversation_id = ?`,
    [conversationId]
  );

  return {
    totalPrompt: row?.total_prompt ?? 0,
    totalCompletion: row?.total_completion ?? 0,
    totalCost: row?.total_cost ?? 0,
  };
}

export interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  byProvider: { provider: string; tokens: number; cost: number }[];
  byModel: { model: string; tokens: number; cost: number; count: number }[];
}

export function getUsageSummary(startTime: number, endTime: number): UsageSummary {
  const db = getDatabase();

  // Totals
  const totals = db.getFirstSync<{ tokens: number; cost: number }>(
    `SELECT
       COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens,
       COALESCE(SUM(cost_usd), 0) AS cost
     FROM token_usage
     WHERE created_at >= ? AND created_at < ?`,
    [startTime, endTime]
  );

  // By model (top 5)
  const byModel = db.getAllSync<{
    model: string;
    tokens: number;
    cost: number;
    count: number;
  }>(
    `SELECT
       model,
       SUM(prompt_tokens + completion_tokens) AS tokens,
       COALESCE(SUM(cost_usd), 0) AS cost,
       COUNT(*) AS count
     FROM token_usage
     WHERE created_at >= ? AND created_at < ?
     GROUP BY model
     ORDER BY tokens DESC
     LIMIT 5`,
    [startTime, endTime]
  );

  // By provider (extract from model ID: "provider/model" → "provider", else use model as provider)
  const byProvider = db.getAllSync<{
    provider: string;
    tokens: number;
    cost: number;
  }>(
    `SELECT
       CASE
         WHEN INSTR(model, '/') > 0 THEN SUBSTR(model, 1, INSTR(model, '/') - 1)
         ELSE 'direct'
       END AS provider,
       SUM(prompt_tokens + completion_tokens) AS tokens,
       COALESCE(SUM(cost_usd), 0) AS cost
     FROM token_usage
     WHERE created_at >= ? AND created_at < ?
     GROUP BY provider
     ORDER BY tokens DESC`,
    [startTime, endTime]
  );

  return {
    totalTokens: totals?.tokens ?? 0,
    totalCost: totals?.cost ?? 0,
    byProvider,
    byModel,
  };
}

export interface DailyUsage {
  date: string;   // YYYY-MM-DD
  tokens: number;
  cost: number;
}

export function getDailyUsage(days: number = 7): DailyUsage[] {
  const db = getDatabase();
  const now = new Date();
  const startTime = new Date(now);
  startTime.setDate(startTime.getDate() - (days - 1));
  startTime.setHours(0, 0, 0, 0);

  const rows = db.getAllSync<{
    day: string;
    tokens: number;
    cost: number;
  }>(
    `SELECT
       DATE(created_at / 1000, 'unixepoch', 'localtime') AS day,
       SUM(prompt_tokens + completion_tokens) AS tokens,
       COALESCE(SUM(cost_usd), 0) AS cost
     FROM token_usage
     WHERE created_at >= ?
     GROUP BY day
     ORDER BY day ASC`,
    [startTime.getTime()]
  );

  // Fill in missing days with zeros
  const result: DailyUsage[] = [];
  const rowMap = new Map(rows.map((r) => [r.day, r]));
  for (let i = 0; i < days; i++) {
    const d = new Date(startTime);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    const row = rowMap.get(key);
    result.push({
      date: key,
      tokens: row?.tokens ?? 0,
      cost: row?.cost ?? 0,
    });
  }

  return result;
}

export function clearAllUsage(): void {
  const db = getDatabase();
  db.runSync('DELETE FROM token_usage');
}
