// B6: an unreadable AI reply must become a typed error, not a fake chat
// answer — while genuine prose answers (~4% of live replies) keep working.

import { parseAiContent, AI_PARSE_FAILED_MESSAGE } from '../../supabase/functions/_shared/parseAiContent';

const FAILED = { ok: false, code: 'ai_parse_failed' };

describe('parseAiContent', () => {
  it('parses a JSON food log', () => {
    const content = '{"intent":"log","meal_name":"Toast","foods":[{"name":"toast","quantity_g":30}]}';
    expect(parseAiContent(content)).toEqual({
      ok: true,
      value: { intent: 'log', meal_name: 'Toast', foods: [{ name: 'toast', quantity_g: 30 }] },
    });
  });

  it('parses a JSON answer with surrounding whitespace', () => {
    expect(parseAiContent('  \n{"intent":"answer","reply":"About 7 g."}\n ')).toEqual({
      ok: true,
      value: { intent: 'answer', reply: 'About 7 g.' },
    });
  });

  it('unwraps a ```json fence', () => {
    expect(parseAiContent('```json\n{"intent":"answer","reply":"Hi"}\n```')).toEqual({
      ok: true,
      value: { intent: 'answer', reply: 'Hi' },
    });
    expect(parseAiContent('```\n{"intent":"answer","reply":"Hi"}\n```')).toEqual({
      ok: true,
      value: { intent: 'answer', reply: 'Hi' },
    });
  });

  it('keeps plain prose as a conversational answer', () => {
    expect(parseAiContent('Paneer is a good protein source — about 18 g per 100 g.')).toEqual({
      ok: true,
      value: { intent: 'answer', reply: 'Paneer is a good protein source — about 18 g per 100 g.' },
    });
  });

  it('treats a bare number or JSON string as a short prose answer', () => {
    expect(parseAiContent('70')).toEqual({ ok: true, value: { intent: 'answer', reply: '70' } });
    expect(parseAiContent('"Sure!"')).toEqual({ ok: true, value: { intent: 'answer', reply: 'Sure!' } });
  });

  it('fails on empty or missing content', () => {
    expect(parseAiContent('')).toEqual(FAILED);
    expect(parseAiContent('   ')).toEqual(FAILED);
    expect(parseAiContent(null)).toEqual(FAILED);
    expect(parseAiContent(undefined)).toEqual(FAILED);
  });

  it('fails on truncated JSON instead of showing it as a reply', () => {
    expect(parseAiContent('{"intent":"log","meal_name":"Dal","foods":[{"name":"dal","quan')).toEqual(FAILED);
    expect(parseAiContent('[{"name":"dal"')).toEqual(FAILED);
  });

  it('fails on a fence whose body is not JSON', () => {
    expect(parseAiContent('```json\n{"intent":"log", oops\n```')).toEqual(FAILED);
    expect(parseAiContent('```json\n{"intent":"log"')).toEqual(FAILED);
  });

  it('fails on JSON embedded in prose', () => {
    expect(parseAiContent('Here you go: {"intent": "log", "foods": [')).toEqual(FAILED);
  });

  it('fails on JSON that is not an object', () => {
    expect(parseAiContent('null')).toEqual(FAILED);
    expect(parseAiContent('[1,2,3]')).toEqual(FAILED);
  });

  it('exposes fixed user-facing copy that never echoes the model output', () => {
    expect(AI_PARSE_FAILED_MESSAGE).toMatch(/try again/i);
  });
});
