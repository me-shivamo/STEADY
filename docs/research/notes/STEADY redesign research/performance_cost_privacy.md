# Performance, Cost, Reliability, Privacy & Rollout for a Voice-First AI Calorie Tracker (STEADY)

*Researched 2026-10-27.*
- All prices were **retrieved 2026-10-27** from the linked official pages unless noted. Amounts are in USD unless noted.
- Several model names (GPT-5.6 "luna/terra/sol", Claude Haiku/Sonnet 5.5, Gemini 3.x Flash, AssemblyAI Universal-3.5) are newer than the researcher's training data. They are quoted exactly as the official pricing pages list them.
- Cost and latency *estimates* are the researcher's own arithmetic and are labelled as Inferences.

## 1. Latency perception: what "instant" means for a voice log

### Takeaway
The classic limits still hold:
- **0.1 s** feels instantaneous.
- **1 s** keeps the user's flow of thought.
- **10 s** is where attention is lost.

Humans leave only a few hundred ms between conversational turns, and voice-agent builders target ~500–1,000 ms end-to-end. For STEADY:
- Acknowledge speech within ~0.1 s.
- Show *something* (transcript or food names) within ~1 s of end-of-speech.
- Land final macros in ~2–3 s at p50 and well under 10 s at p95.
- Treat anything over ~2 s as needing visible, specific progress.

### Cited Findings
**NN/g response-time limits:**
- **0.1 s** is the limit for the user to feel the system reacts instantaneously, with the sense of "directly manipulating" objects.
- **1.0 s** is the limit for flow of thought to stay uninterrupted. Users notice delays of 0.1–1 s, but no special feedback is needed.
- **10 s** is the limit for keeping attention on the task.
- Source research: Miller (1968) and Card, Robertson & Mackinlay (1991).

— [NN/g, Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)

**NN/g progress guidance:**
- Delays over 1 s should show the system is working.
- Delays over ~10 s need a percent-done indicator and a clearly available cancel option.
- For ~2–10 s, a full percent-done bar is excessive, so use subtler feedback (busy indicator, slowly changing counter).
- For unknown amounts of work, show progress in absolute terms, naming each item as it is processed.

— [NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)

**Conversational turn-taking:** Stivers et al. (2009), *PNAS* 106(26):10587–10592, studied 10 languages.
- All 10 avoid overlapping talk and minimise silence between turns.
- Language means fall within ~250 ms of the cross-language mean.
- Responses are slower when the answer is contradictory or uninformative.

— [Stivers et al. 2009 (MPI record)](https://forms.mpi.nl/node/50939); [EMCA wiki](https://emcawiki.net/Stivers-etal2009)

**Press coverage of the same study:** Japanese had the fastest average gap (~7 ms) and Danish the longest ("about half a second"). — [National Geographic](https://www.nationalgeographic.com/science/article/pregnant-pauses-and-rapid-fire-how-do-different-cultures-take-turns-to-talk)

**Voice-agent latency budgets (vendor and practitioner estimates, not benchmarks):**
- **Vapi playbook:** ~1,000 ms total, split as STT 200 ms, LLM 400 ms, TTS 200 ms and network 200 ms. — [Vapi playbook](https://vapi.ai/playbook/build)
- **"800 ms rule" breakdown:** STT 100–300 ms, LLM TTFT 200–600 ms, TTS first audio 150–400 ms, network 20–100 ms. Stage worst cases sum to ~1,450 ms, so stages must stream and overlap to hit the target. — [Twig: Latency budgets for voice AI agents](https://www.twig.so/blog/voice-ai-agents-latency-budget-800ms)
- **Sub-500 ms guide:** STT first partial 100–150 ms, LLM TTFT 200–300 ms, TTS 80–150 ms, RTT 30–50 ms. It advises measuring **p95/p99, never averages**. — [FutureAGI sub-500ms guide](https://futureagi.com/blog/sub-500ms-voice-ai-guide-2026/); [FutureAGI: measuring voice AI latency](https://futureagi.com/blog/how-to-measure-voice-ai-latency-2026/)
- **Endpointing:** VAD/end-of-speech detection itself adds ~100–200 ms before final STT, and is often left out of budgets. The search summary did not say which of these two pages gives the figure, so verify before quoting. — [Deepgram: voice agent pipeline design](https://deepgram.com/learn/voice-agent-architecture-stt-llm-tts-pipeline-design); [tianpan.co 300ms budget](https://tianpan.co/blog/2026/04/09/voice-ai-production-300ms-latency-budget)

**Skeleton screens vs spinners: the evidence is mixed.**
- A 2017 Viget test with 136 participants found the skeleton group perceived the *longest* wait. Only 59% said content loaded quickly, versus 74% for a spinner.
- An academic study ("The Effect of Skeleton Screens") found skeletons rated higher on perceived speed.
- Slow, steady skeleton motion felt shorter than fast motion, but on a small sample.
- Large claims like "40% faster perceived load" could not be traced to primary studies.

— [UX Collective summary of the studies](https://uxdesign.cc/what-you-should-know-about-skeleton-screens-a820c45a571a)

### Inferences
- **What the 200–500 ms target applies to:** STEADY's flow is dictate-then-confirm, not a spoken dialogue with TTS. The conversational target applies to the *acknowledgement* (mic animation, live partial words, haptic) at end-of-speech, not to the final macro numbers.
- **Proposed latency budget**, measured from end-of-speech:

  | Step | Target |
  |---|---|
  | UI acknowledgement / haptic | ≤100 ms |
  | Transcript visible | ≤700 ms |
  | Food names visible (progressive disclosure) | ≤1.5 s |
  | Macros + ring animation | ≤2.5 s p50 / ≤5 s p95 |
  | Hard timeout, then "saved, finishing in background" | 10 s |

  Instrument p95, not the mean.
- **What to show during the wait:** a skeleton row that *names each recognised food as it resolves* ("Dal makhani… 1 katori… ✓"). This follows NN/g's "name each item as processed" advice and is better supported than a generic shimmer, whose evidence is mixed.

### Gaps
- No primary, dated source was found for Google Assistant or Alexa internal latency targets. Do not quote specific Alexa/Google ms targets.
- No study was found specifically on the perceived latency of voice-to-structured-log (non-conversational) flows.

## 2. Speech-to-text options in 2026

### Takeaway
Cloud STT now costs about **$0.0025–$0.006/min**, so a 10-second food utterance costs well under $0.001. Price is not the deciding factor. What decides it is **Hinglish food-vocabulary accuracy, latency and data retention**.

The candidates:
- **Sarvam Saaras v3**: India-native, with an explicit code-mix mode.
- **Deepgram Nova-3 Multilingual**: officially supports Hindi–English code-switching.
- **OpenAI gpt-4o-mini-transcribe ($0.003/min) or gpt-4o-transcribe ($0.006/min)**: an existing vendor relationship.

On-device recognisers are free and private, but Hindi support is weak or unverified, and they need native modules (no Expo Go).

### Cited Findings
**OpenAI** (per minute):

| Model | Price | Notes |
|---|---|---|
| gpt-4o-transcribe | **$0.006** | Token rates $2.50 in / $10 out per 1M |
| gpt-4o-mini-transcribe | **$0.003** | Token rates $1.25 / $5 per 1M |
| gpt-transcribe | **$0.0045** | |
| Whisper | **$0.006** | |
| gpt-live-transcribe / gpt-realtime-whisper | **$0.017** | Streaming |

— [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) (retrieved 2026-10-27)

**Deepgram** (pay-as-you-go, per minute; $200 free credit):

| Model | Streaming | Pre-recorded |
|---|---|---|
| Nova-3 Monolingual | **$0.0048** | $0.0043 |
| Nova-3 Multilingual | **$0.0058** | $0.0052 |
| Flux English | $0.0065 | — |
| Flux Multilingual | $0.0078 | — |
| Whisper Large | — | $0.0048 |

Streaming rates are marked "limited-time promotional". The struck-through regular rates are $0.0077 (Mono) and $0.0092 (Multi). — [Deepgram pricing](https://deepgram.com/pricing) (retrieved 2026-10-27)

**Deepgram Hindi:**
- Nova-3 Multilingual (`model=nova-3&language=multi`) supports real-time code-switching across 10 languages including **Hindi and English**, for streaming and pre-recorded audio. — [Deepgram changelog 2025-03-31](https://developers.deepgram.com/changelog/2025/3/31); [Nova-3 Multilingual GA](https://deepgram.com/changelog/nova-3-multilingual-ga)
- A secondary blog reports developers seeing Hinglish misidentified as Spanish under `multi`. This is unverified. — [convertaudiototext.com](https://convertaudiototext.com/blog/hindi-transcription-code-switching)

**AssemblyAI** ($50 free credit):
- Async: Universal-3.5 Pro **$0.21/hr** (≈$0.0035/min); Universal-2 **$0.15/hr** (≈$0.0025/min).
- Streaming: Universal-Streaming (English or Multilingual) **$0.15/hr**; Universal-3.6 Pro Realtime $0.45/hr.
- **Streaming is billed on WebSocket session duration, not on audio sent.**
- The pricing page does not state Hindi support.

— [AssemblyAI pricing](https://www.assemblyai.com/pricing) (retrieved 2026-10-27)

**ElevenLabs:** Scribe v2 **$0.22/hr** (≈$0.0037/min). Scribe v2 Realtime **$0.39/hr** (≈$0.0065/min), with "~150 ms" latency claimed. Both cover "90+ languages", but Hindi is not named on the pricing page. — [ElevenLabs API pricing](https://elevenlabs.io/pricing/api) (retrieved 2026-10-27)

**Sarvam AI:**
- STT pay-as-you-go **₹0.49/min**, real-time or batch, or ₹0.59/min with diarization. It drops to ₹0.38/min on the ₹1,99,999/mo Business plan.
- Free sign-up credits are offered, but the amount is not stated.

— [Sarvam API pricing](https://www.sarvam.ai/api-pricing) (retrieved 2026-10-27)

**Sarvam Saaras v3:**
- WebSocket streaming with `mode="codemix"` and `language_code="hi-IN"` handles mid-sentence Hindi–English switching.
- Sarvam claims **<150 ms time-to-first-token in "Fast" mode** (vendor claim). The modes are Accurate, Balanced and Fast.

— [Sarvam streaming STT docs](https://docs.sarvam.ai/api/speech-to-text/apis/streaming); [Sarvam STT page](https://www.sarvam.ai/speech-to-text); [Sarvam Hindi STT](https://www.sarvam.ai/apis/speech-to-text/hindi)

**Google Cloud STT V2:**
- Standard recognition is **$0.016/min** for the first 500k min/month, falling to $0.004/min at 2M+ min.
- Chirp 3-specific pricing could not be confirmed on Google's page (it is JS-rendered). A third-party aggregator lists V2 dynamic batch, including Chirp, at $0.003/min, which is lower confidence. OpenRouter resells Chirp 3 at $0.016/min.

— [Google Cloud STT pricing](https://cloud.google.com/speech-to-text/pricing); [developersdigest aggregator](https://www.developersdigest.tech/models/speech/google-cloud); [OpenRouter Chirp 3](https://openrouter.ai/google/chirp-3)

**iOS 26 SpeechAnalyzer / SpeechTranscriber (on-device):**
- Runs fully on-device with a system-downloaded model.
- An independent test found it **55% faster than Whisper Large-v3** on a 34-minute video.
- The published launch-language list **does not include Hindi**. It covers English, Spanish, French, German, Italian, Japanese, Korean, Portuguese, Chinese and Cantonese.

— [Gigazine speed test](https://gigazine.net/gsc_news/en/20250619-apple-speech-analyzer); [Anton Gubarenko guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide); [Callstack: SpeechAnalyzer in React Native](https://www.callstack.com/blog/on-device-speech-transcription-with-apple-speechanalyzer)

**expo-speech-recognition (community library):**
- Wraps iOS SFSpeechRecognizer (iOS 17+) and Android SpeechRecognizer.
- On-device mode (`requiresOnDeviceRecognition`), continuous mode and record-to-file need **Android 13+**. Android ≤12 gets basic recognition only.
- Android on-device needs the locale model downloaded first.
- Supports interim (partial) results.
- **Requires a development build** (config plugin).

— [expo-speech-recognition README](https://github.com/jamsch/expo-speech-recognition)

### Inferences
- **STT cost per 10-second voice log** (0.167 min):

  | Provider | Cost per log |
  |---|---|
  | AssemblyAI Universal-2 | ≈$0.0004 |
  | gpt-4o-mini-transcribe | ≈$0.0005 |
  | ElevenLabs Scribe v2 | ≈$0.0006 |
  | Deepgram Nova-3 Multi (pre-recorded) | ≈$0.0009 |
  | Sarvam | ≈₹0.08 (≈$0.001 at an assumed, unsourced ₹85–90/USD) |
  | gpt-4o-transcribe | ≈$0.001 |

- **Per user per month:** 4 voice logs/day × 30 days × 10 s ≈ 20 min, so **$0.05–$0.12 per active user per month** for STT.
- **Pre-recorded vs streaming:** sending a short clip after the user releases the mic is cheaper, simpler, and works with an offline queue (§5). Streaming only buys live words on screen.
- **Cheap path to live words:** show the free platform recogniser's partials as a live caption, and treat the cloud transcript as authoritative for parsing. This needs a dev build.
- **What to A/B for India:** run Sarvam Saaras v3 (codemix), gpt-4o-mini-transcribe and Deepgram Nova-3 multi on real STEADY Hinglish utterances (e.g., "do roti aur ek katori dal makhani"). Measure **food-noun and quantity accuracy**, not generic WER. The existing `scripts/eval/` harness could host this.
- **Prompt-steered transcription:** OpenAI's transcribe models accept a text prompt, so a food-vocabulary hint list could improve dish names. The researcher did not verify the parameter for the newest models.
- **Expo Go constraint:** per project memory, STEADY currently runs on Expo Go (SDK 54), so any on-device STT module forces a move to EAS development builds. Recording a clip with expo-audio and sending it to cloud STT stays Expo Go-compatible.

### Gaps
- No independent benchmark of Hinglish food-vocabulary WER across vendors was found. STEADY must measure its own.
- Android on-device Hindi recogniser availability on low-end devices is unverified.
- Per-request minimum billing increments (e.g., rounding up to 15 s) were not verified for any vendor.
- Apple's Hindi support in DictationTranscriber or the legacy SFSpeechRecognizer on-device mode is unverified. Check `supportedLocales` at runtime.

## 3. LLM costs (2026) and per-user estimate

### Takeaway
Fast-tier models are cheap enough that one structured food parse costs about **$0.0002–$0.003**. The real cost driver is **how many sequential calls the agent loop makes**, plus output and reasoning tokens. A typical active user (4 logs/day + ~20 coach messages/month) costs about **$0.10/month on a lean stack** and **$0.80/month on a premium stack**. That is tiny at 36 users, and about $1k–$8k/month at 10k MAU.

### Cited Findings
**OpenAI** (per 1M tokens; standard tier, ≤272K context; retrieved 2026-10-27):

| Model | Input | Cached input | Output |
|---|---|---|---|
| gpt-5-nano | $0.05 | $0.005 | $0.40 |
| gpt-5-mini | $0.25 | $0.025 | $2.00 |
| gpt-5.4-nano | $0.20 | $0.02 | $1.25 |
| gpt-5.6-luna | $0.20 | $0.02 | $1.20 |
| gpt-5.4-mini | $0.75 | $0.075 | $4.50 |
| gpt-4.1-nano | $0.10 | $0.025 | $0.40 |
| gpt-4.1-mini | $0.40 | $0.10 | $1.60 |
| gpt-4o-mini | $0.15 | $0.075 | $0.60 |

Regional endpoints carry a +10% uplift. — [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)

**Anthropic** (per 1M tokens; retrieved 2026-10-27):

| Model | Input | 5-min cache write | 1-h cache write | Cache hit | Output |
|---|---|---|---|---|---|
| Claude Haiku 5.5 (prompts ≤100K) | $0.10 | $0.125 | $0.20 | $0.01 | $0.50 |
| Claude Haiku 5.5 (prompts >100K) | $0.50 | $0.625 | $1.00 | $0.05 | $2.50 |
| Claude Haiku 4.5 | $1 | $1.25 | $2 | $0.10 | $5 |
| Claude Sonnet 5.5 | $2 | $2.50 | $4 | $0.10 (5% of base) | $10 |

- **Batch API is 50% off.**
- US-only inference costs 1.1×.
- Caching pays off after 1 read on the 5-min TTL, or 2 reads on the 1-h TTL.

— [Claude API pricing docs](https://platform.claude.com/docs/en/about-claude/pricing); [claude.com/pricing](https://claude.com/pricing)

**Google Gemini** (paid tier, per 1M tokens; retrieved 2026-10-27):

| Model | Input (audio input) | Output | Cache |
|---|---|---|---|
| 2.5 Flash-Lite | $0.10 ($0.30) | $0.40 | $0.01 |
| 3.1 Flash-Lite | $0.25 ($0.50) | $1.50 | $0.025 |
| 2.5 Flash | $0.30 ($1.00) | $2.50 | $0.03 |
| 3 Flash Preview | $0.50 ($1.00) | $3.00 | — |
| 3.6 / 3.8 Flash | $0.75 | $3.75 | — |

- 3.6 / 3.8 Flash pricing runs **through 2026-12-31, then rises to $1.50 / $7.50 from 2027-01-01**.
- **Free-tier content is used to improve Google products; paid-tier content is not.**

— [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

**Sarvam LLMs** (INR per 1M tokens: input / cached / output): Sarvam 105B ₹15 / ₹5 / ₹60. — [Sarvam API pricing](https://www.sarvam.ai/api-pricing)

**OpenAI's latency guide:**
- "Cutting 50% of your output tokens may cut ~50% of your latency".
- "Cutting 50% of your prompt may only result in a 1–5% latency improvement".

Output tokens therefore drive both cost *and* speed. — [OpenAI latency optimization guide](https://developers.openai.com/api/docs/guides/latency-optimization)

### Inferences
These are the researcher's estimates, not sourced figures.

**Assumptions:**
- **Single-shot structured parse:** ~2,000 input tokens (~1,500 static, cacheable system prompt and schema + ~500 dynamic) and ~300 output tokens.
- **Current agent loop:** ~4 sequential calls averaging ~2,500 input each, so ~10,000 input + ~600 output in total.
- GPT-5-family reasoning tokens are billed as output. Use minimal reasoning effort for parsing, or costs can rise 2–3×.

**Cost per log:**

| Model | Single-shot, no cache | Single-shot, cached prefix | ~4-call agent loop, no cache |
|---|---|---|---|
| Claude Haiku 5.5 | $0.00035 | ~$0.00022 | ~$0.0013 |
| gpt-5-nano | $0.00022 | — | — |
| Gemini 2.5 Flash-Lite | $0.00032 | — | — |
| gpt-5.6-luna / gpt-5.4-nano | ~$0.00076–0.00078 | — | — |
| gpt-5-mini | $0.0011 | ~$0.00076 | ~$0.0037 (≈3.4× single-shot) |
| Gemini 2.5 Flash | $0.00135 | — | — |
| gpt-5.4-mini | $0.00285 | — | — |
| Claude Sonnet 5.5 | $0.007 | — | — |

**Coach message** (~4,000 in / 400 out): Sonnet 5.5 ≈ $0.012; Haiku 5.5 ≈ $0.0006.

**Per active user per month** (120 logs + 20 coach messages):

| Stack | Components | STT | Parse | Coach | Total |
|---|---|---|---|---|---|
| Lean | gpt-4o-mini-transcribe + single-shot Haiku 5.5 or gpt-5-nano + Haiku-class coach | ~$0.06 | ~$0.03 | ~$0.01 | **≈ $0.10** |
| Premium | gpt-4o-transcribe + gpt-5-mini agent loop + Sonnet 5.5 coach | $0.12 | $0.44 | $0.24 | **≈ $0.80** |

**At scale:**

| Users | Lean | Premium |
|---|---|---|
| 36 | ≈$4/month | ≈$29/month |
| 10,000 MAU | ≈$1k/month | ≈$8k/month |

With no monetisation in v1, the lean stack plus a cost cap per user per day (e.g., max N AI calls) is prudent.

**What moves the bill:**
- Architecture (single-shot vs loop) swings cost ~3× and latency more.
- Model tier swings cost ~5–10×.
- Caching the static system prompt saves ~90% of its input cost on Claude and the GPT-5 family. That is a modest absolute saving because output dominates.

### Gaps
- Real per-log token counts were not measured. Pull them from Edge Function logs and recompute.
- Photo-log image-token cost was not computed. It depends on resolution and detail settings.
- OpenAI automatic prompt-caching thresholds were not re-verified in this pass.
- The INR/USD rate is unsourced.

## 4. Architecture patterns to cut latency

### Takeaway
OpenAI's own guidance ranks the levers as: fewer output tokens, **fewer sequential requests**, parallelising independent steps, speculative execution, streaming and showing progress, and not using an LLM where a lookup will do. STEADY's up-to-8-tool sequential agent loop violates the second and third. The fix is one structured extraction call, then parallel deterministic lookups, then an optional single fallback call.

### Cited Findings
**OpenAI latency-optimization principles:**
1. Process tokens faster: smaller models.
2. Generate fewer tokens: shorter JSON field names help.
3. Use fewer input tokens: a small effect.
4. **Make fewer requests:** "combine sequential steps into one prompt", e.g., return named JSON fields.
5. **Parallelize** independent steps, and use **speculative execution** for likely outcomes.
6. **Make users wait less:** streaming "cuts the *waiting* time to a second or less", plus showing progress and tool use.
7. **Don't default to an LLM:** pre-compute responses for constrained inputs; use caching and hash maps.

— [OpenAI latency optimization guide](https://developers.openai.com/api/docs/guides/latency-optimization)

**Voice-agent practice:** stages are streamed and overlapped (the LLM starts before STT fully finishes) because stage worst cases otherwise sum to ~1.45 s. — [Twig](https://www.twig.so/blog/voice-ai-agents-latency-budget-800ms)

### Inferences
**Proposed pipeline** (Edge Function):
1. **Pre-LLM cache hit (skip the LLM).** Normalise the transcript and check a per-user "recent/frequent foods" map and a global hot-food cache, e.g., "2 roti dal" → known items. Many repeat logs then never touch an LLM.
2. **One structured-output call** to a fast model (Haiku 5.5, gpt-5-nano/mini at minimal reasoning, or Gemini Flash-Lite). It returns `[{food, qty, unit, confidence}]` with terse field names.
3. **Parallel lookups:** `Promise.all` across items, each item resolved cache → USDA tiers → INDB/IFCT. This matches the existing macro-resolution architecture.
4. **Fallback only for unresolved items:** one more call for AI estimates, flagged as estimates.

**Expected effect:** latency drops from about (N sequential model round-trips × ~0.5–2 s each) to about (1 model call + the slowest DB lookup). The per-call figure is unmeasured and should be confirmed in STEADY's logs.

**Optimistic/speculative UI:**
- As soon as food names arrive, render rows. Animate the ring with a *provisional* value (e.g., from cached per-food defaults), shown visually as pending (hatched or dimmed).
- Reconcile when final macros return.
- Never commit an unresolved estimate silently, consistent with the "never LLM-invented macros" rule.

**Streaming:** stream the structured result (partial JSON) or emit server-sent events per resolved item, so the UI fills progressively.

**Region:** keep the Supabase project, the Edge Function region and the AI vendor endpoint close together. For an India-heavy base, the Mumbai `ap-south-1` region (see §8) minimises DB round-trips. However, OpenAI processes India traffic outside India (storage only in-region).

### Gaps
- Measured round-trip times for STEADY's current loop are not available. Use Edge Function timing logs.
- Where Supabase Edge Functions execute relative to the project region was not confirmed. The regions page does not say.

## 5. Offline / bad network

### Takeaway
Major calorie trackers offer only partial offline support (recents/custom foods; no database search or new barcodes). A voice-first app can do better by **recording locally, queueing the clip or transcript durably, showing a "pending" entry immediately, and syncing and parsing when back online**. Established React Native patterns exist:
- TanStack Query persisted paused mutations.
- PowerSync's local-SQLite upload queue for Supabase.

### Cited Findings
**MyFitnessPal offline (vendor-blog sources, unofficial):**
- You can view cached recent history and log from recents, custom foods or frequent foods. Previously-scanned barcodes may resolve.
- Full database search, new barcodes and new database logging need a connection. Quick-add calories works.
- Sync on reconnect can occasionally duplicate entries edited both offline and remotely.

— [Nutrola: calorie tracker without internet](https://nutrola.app/en/blog/calorie-tracker-that-works-without-internet-offline-2026); [Nutrola: offline calorie trackers 2026](https://nutrola.app/en/blog/offline-calorie-trackers-which-actually-work-2026); [Rigorous Themes](https://rigorousthemes.com/blog/best-food-tracking-apps-that-work-offline/). Nutrola is a competitor, so treat these as lower confidence.

**Cronometer** users have publicly requested an offline mode ("Limited offline mode please, it's 2022"), showing demand. — [Cronometer forum](https://forums.cronometer.com/discussion/5430/limited-offline-mode-please-its-2022)

**PowerSync + Supabase:**
- Writes go to a **local SQLite database and an upload queue**, which is processed through the Supabase client when connectivity returns, so reads and writes keep working offline.
- Attachments (photos, files) sync metadata through the DB and bytes via Supabase Storage, with queued uploads, retries and persisted state.
- The standalone `@powersync/attachments` JS package is deprecated in favour of SDK-built-in helpers.

— [PowerSync Supabase guide](https://docs.powersync.com/integration-guides/supabase); [PowerSync attachments blog](https://www.powersync.com/blog/building-offline-first-file-uploads-with-powersync-attachments-helper); [PowerSync docs PR](https://github.com/powersync-ja/powersync-docs/pull/289.diff)

**TanStack Query:**
- Paused offline mutations can be **persisted (dehydrated) and resumed after app restart** via `resumePausedMutations()`.
- You must register default mutation functions with `setMutationDefaults`, because only mutation *state* is persisted, not functions. Otherwise you get "No mutationFn found".

— [TanStack Query mutations guide](https://tanstack.com/query/latest/docs/react/guides/mutations); [DEV: RN offline-first with TanStack Query](https://dev.to/fedorish/react-native-offline-first-with-tanstack-query-1pe5)

### Inferences
**Recommended offline flow for STEADY:**
1. Record the clip with expo-audio and save it to app storage.
2. Write a `pending_log` row (id, clip path, timestamp, meal slot, status) into a durable local store: SQLite, or MMKV for a small queue.
3. Immediately show a "Pending — will log when online" card in the diary.
4. On reconnect or app foreground, upload → STT → parse → reconcile.
5. Notify only if the result needs user confirmation.

**Idempotency:** use client-generated UUIDs as idempotency keys so retries never double-log. This addresses the duplicate-entry problem reported for MyFitnessPal.

**Offline-capable without the network:** a local "recent/frequent foods" cache, plus on-device STT where available, lets common repeat meals ("same breakfast as yesterday") log fully offline.

**Cost-versus-complexity choice:** PowerSync is the heavier, full-sync option. A simple custom queue (SQLite/MMKV + NetInfo + retry with exponential backoff) is likely sufficient for ~36 users and fewer moving parts.

### Gaps
- No official competitor documentation on offline behaviour was found. MyFitnessPal claims come from competitor and vendor blogs.
- Android background-upload constraints for Expo were not researched in this pass. That covers which Expo background-task API works on SDK 54 and how OEM battery-killers on low-end Android affect it.
- India mobile-network quality statistics (e.g., Ookla median speeds) were not gathered.

## 6. Failure-handling UX for AI features

### Takeaway
Google PAIR and Microsoft HAX converge on four rules:
- Make **correction and dismissal cheap**.
- **Degrade gracefully when uncertain**: partial results plus a targeted question, never silent failure.
- **Explain limits plainly** and specifically.
- Always **hand control back** to manual entry.

For a calorie tracker, silently writing a wrong number to the ring is the worst failure.

### Cited Findings
**Google PAIR People + AI Guidebook (Errors + Graceful Failure):**
- **Error types:** *context errors* are wrong assumptions about user intent; *failstates* are system limits; *background errors* go unnoticed by both user and system.
- Error messages should "inform the user as specifically as possible about the system's limitations".
- Make proactive suggestions only at high confidence. At low confidence, explain and offer alternatives.
- "Provide paths forward" and "return control to the user", with the situational awareness they need to continue.
- Collect feedback in error states, and ask for it if users repeatedly reject outputs.
- Make failure "safe, boring, and a natural part of the product". The stakes are higher in health contexts.

— [PAIR Guidebook: Errors + Graceful Failure](https://pair.withgoogle.com/chapter/errors-failing/)

**Microsoft HAX, 18 Guidelines for Human-AI Interaction** (introduced in a CHI 2019 paper):

| # | Guideline | # | Guideline |
|---|---|---|---|
| G1 | Clarify system capabilities | G10 | **Disambiguate or degrade gracefully when uncertain** |
| G2 | Convey how reliable the system is | G11 | Explain why the system acted as it did |
| G3 | Time actions to context | G12 | Retain short-term memory of interactions |
| G4 | Show context-relevant information | G13 | Personalize from user behavior |
| G5 | Respect social norms | G14 | **Adapt changes cautiously** |
| G6 | Avoid reinforcing social biases | G15 | Enable granular feedback |
| G7 | **Make invocation easy** | G16 | Show consequences of user actions |
| G8 | **Make dismissal easy** | G17 | Provide global controls |
| G9 | **Make correction easy** | G18 | **Notify users of changes** |

— [HAX Design Library](https://www.microsoft.com/en-us/haxtoolkit/library/); [HAX AI guidelines](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/); [CHI 2019 paper page](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/)

**Apple:** Guideline 2.5.14 requires a "clear visual and/or audible indication when recording … microphone". This is relevant to the mic-state UI. — [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

### Inferences
**States the voice-log UI must design for:**

| State | What happens | Guidelines |
|---|---|---|
| (a) Full success | Logged, with an undo toast and per-item tap-to-edit | G8, G9, G16 |
| (b) Partial | Resolved items logged; unresolved shown as "Couldn't find 'X' — pick one / type it" | G10 |
| (c) Low-confidence quantity | Ask one targeted question ("1 katori ≈ 150 g?") rather than guessing | — |
| (d) STT failure / empty audio | Show the editable transcript, or offer to re-record | — |
| (e) Network failure | Saved to queue (§5) | — |
| (f) Timeout over 10 s | Keep the transcript, finish in the background, offer manual search | — |

- **Show source and confidence per item** ("USDA", "IFCT", "AI estimate"). This maps to G2 and G11 and reinforces the existing never-LLM-invented-macros rule.
- **Feed corrections back** into the per-user food cache (G13, G12) so the same utterance is right next time.

### Gaps
- The Apple HIG "Machine learning" page is JS-rendered and could not be fetched, so no verified Apple HIG ML quotes are included.

## 7. Low-end Android performance

### Takeaway
Google Play reduces visibility for apps above:
- A **1.09% user-perceived crash rate** or a **0.47% ANR rate** overall, or 8% per phone model.
- Excessive starts: **cold ≥5 s, warm ≥2 s, hot ≥1.5 s** (time to initial display).

Memory metrics become visibility factors from **February 2027**. Hermes (default in modern Expo/RN) is the single biggest startup win reported for low-end Android, though the public numbers are anecdotal.

### Cited Findings
**Android vitals bad-behaviour thresholds:**

| Metric | Overall | Per phone model |
|---|---|---|
| User-perceived crash rate | **1.09%** | 8% |
| User-perceived ANR rate | **0.47%** | 8% |
| Excessive partial wake locks | 5% | — |

- If exceeded, "Play may reduce the visibility of your title" and may show a store-listing warning.
- Vitals use a 28-day window. Issues lasting more than 7 days become "emerging issues" with 21 days to fix.
- Memory usage, bitmap memory and DEX optimisation "may affect store visibility starting February 2027". The 4 GB-device limits are 2.00 GB foreground and 1.00 GB background.

— [Android vitals](https://developer.android.com/topic/performance/vitals)

**Startup:**
- Excessive is **cold ≥5 s, warm ≥2 s, hot ≥1.5 s**, measured by TTID (first frame).
- TTFD (fully drawn, interactive) must be reported by the app via `reportFullyDrawn()`.

— [App startup time in Android vitals](https://developer.android.com/google/play/vitals/launch-time); [Launch-time guide](https://developer.android.com/topic/performance/vitals/launch-time)

**Hermes:**
- Ships precompiled bytecode, which reduces launch work.
- Instawork reported Android average time-to-interactive of **5–6 s vs 1–1.5 s on iOS** before adopting Hermes to close the gap on low-to-mid devices. — [Instawork engineering](https://engineering.instawork.com/boost-android-performance-using-hermes-e01da8a2baaa)
- A widely-cited low-end-device figure (Wiko Fever 4G: 3.9 s with Hermes vs 12.9 s without) is attributed to a Theodo article whose URL now redirects. **Unverified.**

**New Architecture / Hermes V1:**
- RN 0.82 ships Hermes V1 as experimental. Expensify's tests reportedly showed only a modest TTI gain on Android (~7.6%).
- TurboModules lazy-load native modules on first access. One developer reports cold-start TTI falling from 3.8 s to 1.1 s on a Pixel 4a, which is anecdotal.

— [Medium: RN 0.82 overview](https://medium.com/@nikhithsomasani/react-native-0-82-the-future-is-now-faster-leaner-fully-new-architecture-5899cd8ab6d3); [React Native Relay startup guide 2026](https://reactnativerelay.com/article/react-native-startup-time-optimization-tti-hermes-2026). Secondary, lower confidence.

### Inferences
**Budgets for STEADY on a ~2–3 GB RAM Android device:**
- Cold start TTID: ≤2.5 s, giving headroom under the 5 s threshold.
- Mic button interactive: ≤3 s from cold start.
- Crash rate: ≤0.5%.
- ANR rate: ≤0.2%.

**Practical levers:**
- Keep the home screen lean. Lazy-load the coach/journal screens.
- Avoid heavy charts on first render.
- Use core `Animated` with the native driver for the ring. This is already a project rule, per memory.
- Downsample photos before upload.
- Keep the audio recorder warm only after a tap, not at launch.
- The voice feature itself should not raise ANR risk if audio encoding and upload stay off the JS thread (native recorder + async fetch).

### Gaps
- No controlled, official Hermes/New Architecture benchmark on low-end devices was found. Measure on a real budget device (e.g., an Android Go-class or 3 GB phone common in India).
- STEADY's current Android vitals were not reviewed. Check Play Console.

## 8. Privacy & law

### Takeaway
- **Voice audio:** industry norm has moved to "process in the cloud, don't keep the recording unless the user opts in".
- **OpenAI and Anthropic APIs** don't train on API data by default and delete logs within ~30 days. Zero-retention needs vendor approval.
- **India's DPDP obligations** bite on **13 May 2027**.
- **Apple** now requires *explicit* consent before sending personal data to third-party AI.
- **Supabase** offers a Mumbai region.

The design implication: explicit AI-processing consent, delete raw audio after transcription, an India data-region decision, and erasure/export built before May 2027.

### Cited Findings
**Voice-recording norms (consumer assistants):**
- **Apple Siri:** since 2019, Apple does not keep Siri audio by default. Users must opt in to "Improve Siri & Dictation", and opted-in samples are reviewed only by Apple employees. — [IT Pro Today (2019)](https://itprotoday.com/macos/apple-apologizes-over-siri-privacy-and-will-no-longer-retain-audio-recordings)
- **Apple Siri today:** Apple's current page says dictation sent to servers is not stored unless the user opts in. Request history is tied to a rotating random device identifier, not the Apple Account. — [Apple: Siri, Dictation & Privacy](https://www.apple.com/legal/privacy/data/en/ask-siri-dictation)
- **Amazon Alexa:** on **28 March 2025** Amazon removed the "Do Not Send Voice Recordings" local-processing option on Echo Dot 4th gen and Echo Show 10/15 (US English).
  - All requests now go to the cloud, with a "Don't save recordings" option that deletes them after processing.
  - Amazon cited generative-AI features and said fewer than 0.03% of owners used the option.

  — [TechCrunch](https://techcrunch.com/2025/03/15/amazons-echo-will-send-all-voice-recordings-to-the-cloud-starting-march-28); [The Register](https://www.theregister.com/2025/03/17/amazon_kills_on_device_alexa/)

**OpenAI API:**
- API data is not used for training by default.
- Abuse-monitoring logs are kept up to **30 days**, but OpenAI's table lists **no abuse-monitoring retention for `/v1/audio/transcriptions`**.
- **Zero Data Retention needs OpenAI approval.** It covers transcriptions, chat completions, Responses (with limits) and realtime.
- Responses API objects are stored ≥30 days unless `store=false`.
- **India: regional *storage* only (`in.api.openai.com`), no in-country processing.** Regional processing is available only for the US, EU and UAE.

— [OpenAI "Your data" guide](https://developers.openai.com/api/docs/guides/your-data)

**Anthropic API:**
- API inputs and outputs are deleted from the backend within 30 days by default. Exceptions include the Files API, ZDR agreements, usage-policy enforcement and legal requirements.
- **ZDR** is available by arrangement. Under ZDR, data is not stored at rest after the response, except as law or misuse prevention requires.
- Certain "Covered Models" require 30-day retention. Check the doc's model-specific section.

— [Claude API & data retention docs](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention); [Anthropic privacy: how long do you store data](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-data)

**Google Gemini API:** free-tier content *is* used to improve Google products; paid tier is not. Do not use the free tier for user data. — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

**India DPDP Act 2023 + DPDP Rules 2025:**
- The Rules were notified **13 November 2025**, and the Data Protection Board was constituted immediately.
- Consent-manager provisions start after ~12 months (≈ November 2026).
- **Core data-fiduciary obligations** (notice, consent, security safeguards, breach intimation, erasure and similar) apply after **18 months, i.e., 13 May 2027**.
- The maximum penalty is widely reported as up to **₹250 crore** per breach. PTI's "Rs 250" appears to be a typo.

— [The Week/PTI](https://www.theweek.in/wire-updates/business/2025/11/14/del148-biz-dpdp-rules-ld-govt.html); [Deccan Herald](https://www.deccanherald.com/india/centre-notifies-dpdp-rules-implementation-planned-in-phases-spread-over-12-18-months-3798465); [AZB Partners](https://www.azbpartners.com/?p=87799); [Mondaq](https://www.mondaq.com/india/privacy-protection/1708830/dpdp-act-compliance-mandate)

**GDPR:**
- *Data concerning health* (Art. 4(15); Recital 35) is special-category data under Art. 9. Processing is prohibited unless an Art. 9(2) condition applies, and most health apps rely on **explicit consent (Art. 9(2)(a))**.
- Whether wellness or fitness data (steps, sleep, and by extension calorie and weight logs) counts as health data is **context-dependent and contested** among commentators.

— [Chino.io GDPR for health apps](https://www.chino.io/compliance/gdpr-compliance-health-applications); [Thryve: wearable data under GDPR](https://www.thryve.health/blog/wearable-data-special-category-gdpr); [Momentum: GDPR consent for health data](https://themomentum.ai/blog/gdpr-consent-requirements-health-data). All secondary sources.

**Apple App Store:**
- **5.1.2(i):** "You must clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain explicit permission before doing so."
- **5.1.3(i):** health and fitness data may not be used or disclosed for advertising, marketing or data mining other than improving health management or research.
- **5.1.3(ii):** no personal health information in iCloud.
- **2.5.14:** explicit consent and a clear recording indicator are required for microphone use.

— [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

**Google Play:** apps using Health Connect must complete the **Health apps declaration form** plus Data safety. They must request only the data types needed, justify each one, and resubmit when the set changes. — [Publish your health app](https://developer.android.com/health-and-fitness/health-connect/publish); [Declare access](https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access)

**Supabase regions:**
- India is available as **South Asia (Mumbai) `ap-south-1`**, along with Singapore, six EU regions and four US regions.
- Choose a *specific* region for jurisdiction-bound data, because "general" regions can deploy outside the jurisdiction (e.g., "Europe" includes London and Zurich).

— [Supabase regions](https://supabase.com/docs/guides/platform/regions)

### Inferences
- **Audio retention:** default to deleting raw audio right after transcription. Keep the transcript (which is useful for corrections and evals) under the user's control, with a "keep my voice clips" opt-in if they are ever needed for quality work. This mirrors the Apple and Amazon norms.
- **Consent (Apple 5.1.2(i)):** add a one-time, explicit "STEADY uses OpenAI/Anthropic to understand your food descriptions, photos and voice" consent before first AI use. A privacy-policy mention alone is likely not enough.
- **Consent (DPDP and GDPR):** the same consent screen also serves DPDP notice-and-consent and GDPR Art. 9 explicit consent if calorie and weight logs are treated as health data. Treating them as health data is the safe assumption.
- **Data location:**
  - Even with a Mumbai Supabase region, AI processing happens outside India.
  - DPDP permits cross-border transfer except to countries the government blacklists. *This is from the researcher's background knowledge, not verified in this pass.*
  - Disclose the transfer and the vendors by name.
- **Build before 13 May 2027:** account deletion and erasure (already a Play requirement), data export, breach-notification runbook, and a grievance contact.
- **Analytics:** never send voice, transcripts or free text to analytics. This is already the project rule (PostHog typed `track()`).

### Gaps
- No primary EDPB or ICO text was retrieved on whether diet or calorie logs are "health data". Secondary sources only.
- DPDP cross-border-transfer rules and the specific DPDP obligations applicable to a small app were not verified against the official MeitY gazette text in this pass.
- Google Assistant's current audio-retention default was not verified.
- Whether STEADY's existing Supabase project is in Mumbai or elsewhere was not checked. A region change usually requires migrating to a new project; this was not verified.

## 9. Rolling out a redesign to existing users

### Takeaway
Redesign backlashes are well-documented and expensive: Sonos (CEO exit, $20–30M fix cost), Snapchat (first-ever DAU decline) and MyFitnessPal in 2026, a direct competitor whose ratings collapsed after the Diary was replaced. The common failure pattern:
- Forcing the new UI on everyone at once.
- **Adding taps to the core task.**
- Removing features people relied on.
- Shipping data-loss bugs.

Use staged rollout, an opt-in or flagged new experience, untouched history and streaks, and a path back.

### Cited Findings
**Sonos (May 2024 app rewrite):**
- CEO Patrick Spence stepped down in January 2025.
- Spence said the fix would cost **$20–30M** over two quarters.
- The stock fell ~13% after launch. Fiscal Q4 2024 revenue fell ~16%; another outlet reports −8% for FY2024.
- An outside analyst estimated ~$500M in lost market cap (third-party estimate).

— [Fast Company](https://www.fastcompany.com/91259432/sonos-ceo-steps-down-following-a-disastrous-app-redesign); [The Register](https://theregister.com/2025/01/14/sonos_ceo_steps_down); [CX Dive](https://www.customerexperiencedive.com/news/sonos-ceo-departs-botched-app-roll-out/737177/)

**Snapchat (late-2017/2018 redesign):**
- DAU fell for the first time ever, **191M (Q1 2018) → 188M (Q2 2018)**. The CEO cited "disruption caused by our redesign".
- A Change.org petition to revert reached ~1.2M signatures.
- Snap partially rolled back changes.

— [The Week UK](https://www.theweek.co.uk/95712/why-have-3-million-users-left-snapchat); [Pocket-lint](https://www.pocket-lint.com/apps/news/snapchat/145326-snapchat-s-controversial-redesign-caused-it-to-hemorrhage-users); [Hartford Business](https://hartfordbusiness.com/article/snapchat-user-growth-stagnant-amid-redesign-backlash/)

**MyFitnessPal (2026):**
- v26.16.0 (21 April 2026) replaced the classic Diary with a "Today" screen. Users complained of **extra taps for logging** and removed features, such as step-calorie adjustment and copying individual foods.
- The prior release, v26.15.0 (14 April 2026), reportedly erased meal entries.
- The company reportedly called the new UI "the path forward" with no revert, and set up a feedback channel.
- Reported rating drops vary (e.g., −1.7 stars; a 2.31 average for April 2026 in MyNetDiary's scorecard). Sources include competitors with an interest in the outcome.

— [mwm.ai v26.16.0](https://mwm.ai/articles/myfitnesspal-v26-16-0-replaces-diary-with-new-ui-sparking-rating-drop-in-april-2026); [mwm.ai v26.15.0](https://mwm.ai/articles/app-updates/myfitnesspal-calorie-counter-v26-15-0-causes-data-loss-and-entry-bugs-april-2026); [MyNetDiary April 2026 scorecard](https://www.mynetdiary.com/diet-app-scorecard-april-2026.html) (competitor); [Unstar review analysis](https://unstar.app/blog/is-myfitnesspal-premium-worth-it-paywall-app-reviews-2026)

**Google Play staged rollouts:**
- Staged rollouts work for **updates only**, not first publish.
- Users are chosen at random per release, and successive rollouts use the same user group.
- You can **halt** a rollout (no new users get it) and resume it. **Users who already updated stay on that version.**
- The percentage does not increase automatically.
- Countries cannot be removed once a rollout starts.
- To fix a bad build, ship a new release.

— [Play Console Help: staged rollouts](https://support.google.com/googleplay/android-developer/answer/6346149)

**HAX guidance:** G14 "Adapt changes cautiously" and G18 "Notify users of changes". — [HAX library](https://www.microsoft.com/en-us/haxtoolkit/library/)

### Inferences
**Rollout plan for STEADY (~36 users):**
- Because a halted Play rollout cannot pull users back, put the redesign behind a **remote feature flag** (PostHog is already in the stack) inside a binary rolled out in stages (e.g., 20% → 50% → 100%). That way the *UI* can be reverted server-side even after the binary has shipped.
- Offer it first as an **opt-in "Try the new STEADY"** to the most engaged users. Keep a "switch back" option for one or two releases.
- **Migrate history, streaks, goals and custom foods untouched**, and verify with a pre/post count check. MyFitnessPal's data-loss bug was the most damaging complaint.
- **Hard rule: the new log flow must take ≤ the current number of taps** for every common case, including "same as yesterday", copy-meal and manual entry. Voice is *added*, not a replacement for manual search.
- Announce changes in-app (G18) with a short "what changed and why" sheet, and add a feedback entry point.
- Monitor rating, crash/ANR and log-count-per-user deltas daily during the rollout.
- MyFitnessPal's 2026 backlash creates a positioning opportunity: "log in one sentence, fewer taps than ever".

### Gaps
- No STEADY-specific user research on redesign tolerance exists. With 36 users, direct interviews or messages are feasible.
- iOS phased-release mechanics (App Store Connect 7-day phased release) were not fetched in this pass.
