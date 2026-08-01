// Wraps a single OpenRouter call with structured logging into ai_logs.
// Fire-and-forget-safe: a logging failure never breaks the caller — this is
// an observability side-channel, not part of the request's success path.
// See supabase/migrations/015_ai_logs.sql for the table + access rationale.

export type AiLogSource = 'analyze-food-photo' | 'log-food-from-text' | 'macro-resolver'

interface LogAiCallArgs {
  userId: string | null
  source: AiLogSource
  model: string
  requestPayload: unknown
  // A function that performs the actual call and returns its parsed response.
  // Wrapping it here (rather than taking a pre-computed result) is what lets
  // this helper measure latency and catch thrown errors in one place.
  run: () => Promise<{ response: unknown; promptTokens?: number; completionTokens?: number }>
}

// deno-lint-ignore no-explicit-any
export async function logAiCall(supabase: any, args: LogAiCallArgs): Promise<{ response: unknown }> {
  const startedAt = Date.now()

  try {
    const { response, promptTokens, completionTokens } = await args.run()
    void insertLog(supabase, {
      userId: args.userId,
      source: args.source,
      model: args.model,
      requestPayload: args.requestPayload,
      responsePayload: response,
      status: 'success',
      errorMessage: null,
      latencyMs: Date.now() - startedAt,
      promptTokens: promptTokens ?? null,
      completionTokens: completionTokens ?? null,
    })
    return { response }
  } catch (err) {
    void insertLog(supabase, {
      userId: args.userId,
      source: args.source,
      model: args.model,
      requestPayload: args.requestPayload,
      responsePayload: null,
      status: 'error',
      errorMessage: err?.message ?? String(err),
      latencyMs: Date.now() - startedAt,
      promptTokens: null,
      completionTokens: null,
    })
    throw err
  }
}

interface InsertLogArgs {
  userId: string | null
  source: AiLogSource
  model: string
  requestPayload: unknown
  responsePayload: unknown
  status: 'success' | 'error'
  errorMessage: string | null
  latencyMs: number
  promptTokens: number | null
  completionTokens: number | null
}

// deno-lint-ignore no-explicit-any
async function insertLog(supabase: any, log: InsertLogArgs): Promise<void> {
  try {
    await supabase.from('ai_logs').insert({
      user_id: log.userId,
      source: log.source,
      model: log.model,
      request_payload: log.requestPayload,
      response_payload: log.responsePayload,
      status: log.status,
      error_message: log.errorMessage,
      latency_ms: log.latencyMs,
      prompt_tokens: log.promptTokens,
      completion_tokens: log.completionTokens,
    })
  } catch (err) {
    // Never let logging break the caller — same "swallow and console.error"
    // convention as saveChatTurn() in the two index.ts files.
    console.error('[aiLogger] insert failed:', err)
  }
}
