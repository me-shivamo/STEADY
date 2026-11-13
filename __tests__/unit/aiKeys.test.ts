import { isEvalAccount, openRouterKeyFor } from '../../supabase/functions/_shared/aiKeys'

// Pins the rule that kept a 2026-11-13 outage from repeating: the eval account
// bills its own key when OPENROUTER_EVAL_API_KEY is set; nobody else ever does.
const envWith = (vars: Record<string, string>) => (k: string) => vars[k]
const ALL = { OPENROUTER_API_KEY: 'live-text', OPENROUTER_IMAGE_API_KEY: 'live-image', OPENROUTER_EVAL_API_KEY: 'eval' }

describe('aiKeys', () => {
  it('recognises the eval account case-insensitively', () => {
    expect(isEvalAccount('eval@steadyapp.internal')).toBe(true)
    expect(isEvalAccount('EVAL@SteadyApp.Internal')).toBe(true)
    expect(isEvalAccount('someone@gmail.com')).toBe(false)
    expect(isEvalAccount('steadyapp.internal@gmail.com')).toBe(false)
    expect(isEvalAccount(null)).toBe(false)
    expect(isEvalAccount(undefined)).toBe(false)
  })

  it('real users always bill the app keys, even when the eval key is set', () => {
    expect(openRouterKeyFor('text', 'user@gmail.com', envWith(ALL))).toBe('live-text')
    expect(openRouterKeyFor('image', 'user@gmail.com', envWith(ALL))).toBe('live-image')
    expect(openRouterKeyFor('text', null, envWith(ALL))).toBe('live-text')
  })

  it('the eval account bills the eval key for text and image when it is set', () => {
    expect(openRouterKeyFor('text', 'eval@steadyapp.internal', envWith(ALL))).toBe('eval')
    expect(openRouterKeyFor('image', 'eval@steadyapp.internal', envWith(ALL))).toBe('eval')
  })

  it('the eval account falls back to the app keys when the eval key is unset', () => {
    const env = envWith({ OPENROUTER_API_KEY: 'live-text', OPENROUTER_IMAGE_API_KEY: 'live-image' })
    expect(openRouterKeyFor('text', 'eval@steadyapp.internal', env)).toBe('live-text')
    expect(openRouterKeyFor('image', 'eval@steadyapp.internal', env)).toBe('live-image')
  })
})
