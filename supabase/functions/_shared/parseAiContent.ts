// Reads the text a chat-completion returned for log-food-from-text.
//
// The system prompt asks for JSON ({ "intent": "log", ... } or
// { "intent": "answer", "reply": ... }). The old parser fell back to "treat
// the raw text as a chat answer" on ANY parse failure, so a truncated or
// malformed food log came back to the user as a chat bubble full of broken
// JSON, was saved to their history, and looked like success.
//
// But not every non-JSON reply is broken: about 4% of live replies (71 of the
// 1,774 non-empty ones in 60 days of ai_logs, read-only count on 2026-11-13)
// are plain prose answers to questions, and those must keep working. So the
// line is drawn at what the reply was trying to be:
//   - JSON object                         → use it
//   - a JSON attempt that doesn't parse   → failure (starts with { or [, sits
//     in a ``` fence, or mentions "intent":)
//   - empty                               → failure
//   - anything else (prose)               → a conversational answer
//
// Pure and dependency-free so jest can test it; the Edge Function imports it.

export type AiContentParse =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: 'ai_parse_failed' }

const FAILED: AiContentParse = { ok: false, code: 'ai_parse_failed' }

// A whole reply wrapped in a markdown code fence, with or without "json".
const FENCED = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/

export function parseAiContent(content: string | null | undefined): AiContentParse {
  const raw = (content ?? '').trim()
  if (!raw) return FAILED

  const fence = raw.match(FENCED)
  const body = fence ? fence[1].trim() : raw

  let parsed: unknown
  let parsedOk = false
  try {
    parsed = JSON.parse(body)
    parsedOk = true
  } catch {
    // not JSON — decided below
  }

  if (parsedOk) {
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, value: parsed as Record<string, unknown> }
    }
    // Valid JSON but not an object. A bare string or number is just a short
    // prose reply that happens to parse ("70", "\"Sure!\""); null or an
    // array is a malformed response.
    if (typeof parsed === 'string' && parsed.trim()) {
      return { ok: true, value: { intent: 'answer', reply: parsed.trim() } }
    }
    if (typeof parsed === 'number' || typeof parsed === 'boolean') {
      return { ok: true, value: { intent: 'answer', reply: raw } }
    }
    return FAILED
  }

  const looksLikeJson =
    fence !== null ||
    raw.startsWith('```') ||
    body.startsWith('{') ||
    body.startsWith('[') ||
    /"intent"\s*:/.test(body)
  if (looksLikeJson) return FAILED

  return { ok: true, value: { intent: 'answer', reply: raw } }
}

// What the user sees when parsing fails. Fixed copy — never the model's text,
// which can quote the user's own words back.
export const AI_PARSE_FAILED_MESSAGE = 'Something went wrong reading that — please try again.'
