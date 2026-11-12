# AI Nutrition Coaching and AI Voice-Call Check-ins: Evidence, Design, Feasibility, Cost, Legal

Research date: 2026-10-27. Prices and policies are as shown on the cited pages on that date unless noted. Several official pages (openai.com pricing, PIB, INFORMS) returned HTTP 403, and secondary sources are flagged where used.

**Options compared (summary for the report writer; details in sections 5–7):**

| Option | Feels like a call? | Cost (3 min/day/user) | iOS/Android policy | India legal exposure | Build effort (Expo) |
|---|---|---|---|---|---|
| A. Real PSTN call (Retell/Vapi/ElevenLabs + Twilio/Plivo/Exotel) | Yes, phone rings | ≈$0.10–0.15/min → ≈$9–13/month | None (outside app) | High: TRAI DLT/1600-series, Aug 2024 blacklisting of computer-generated calls from unregistered senders | Low app work, backend + telecom compliance |
| B. CallKit/PushKit + Android full-screen "incoming call" UI to an in-app AI | Yes, native ringing screen | ≈$0.07–0.10/min AI only → ≈$6–9/month | Grey: PushKit is for VoIP phone services; FSI not default-granted to non-calling apps | Low (no telecom network) | High: native modules, dev client, App Review risk |
| C. Scheduled time-sensitive notification ("Coach is ready, tap to talk") → in-app voice session | Partly (no ringing) | Same AI cost as B | Allowed on both platforms | Low | Moderate: Expo Notifications already live; add WebRTC/realtime voice |
| D. Text/chat check-in notification → chat or voice-note logging | No | Cents/month (LLM text) | Allowed | Low | Lowest |

## 1. Does AI/chatbot or human coaching improve nutrition/weight outcomes or adherence?

### Takeaway
Chatbots produce small to moderate improvements in lifestyle behaviours (diet, activity, sleep), but evidence specifically for weight loss is thin and low quality. Adding a human coach on top of an app consistently adds weight loss. The most relevant data point for STEADY is a 2026 observational study of ~65,000 users of HealthifyMe (an Indian app), where users with AI plus human coaching lost more weight than AI-only users.

### Cited Findings
- **Singh et al., npj Digital Medicine 2023 (meta-analysis of 19 chatbot trials, n=3,567):** pooled effects (Hedges' g) were physical activity 0.28 (95% CI 0.16–0.40); daily steps 0.28 (≈ +735 steps/day); MVPA 0.53 (≈ +103 min/week); fruit and vegetable intake 0.59 (0.25–0.93; 4 studies, 289 participants; ≈ +1 serving/day); sleep duration 0.44 (≈ +45 min/night). No weight/BMI meta-analysis. — [PMC10290125](https://pmc.ncbi.nlm.nih.gov/articles/PMC10290125/)
- Same review: text-based chatbots beat speech/voice chatbots for fruit and vegetable intake, and AI/NLP chatbots beat rule-based ones for that outcome; there was no difference for physical activity or sleep. Multicomponent interventions (chatbot plus trackers etc.) beat chatbot-only for sleep. 14 of 19 studies were rated "weak" quality, samples were small, and no trial ran longer than one year. — [PMC10290125](https://pmc.ncbi.nlm.nih.gov/articles/PMC10290125/)
- **JMIR 2023 systematic review of conversational agents for body weight management** (searched to Dec 2022): weak evidence. Only 3 of 8 studies (38%) reported substantial weight loss (1.3–2.4 kg at 12–15 weeks), and overall study quality was low. — [JMIR 2023;25:e42238 (PMC10257112)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10257112/)
- **Antoun et al., JMIR mHealth 2022 (meta-analysis, 34 studies):** smartphone-app interventions gave −1.99 kg vs controls at 3 months (95% CI −2.19 to −1.79; I²=81%). Only apps combined with intensive behavioural coaching or feedback from a human coach showed significant loss in the behavioural subgroup (~2.6 kg at 6 months). The authors concluded "the human-based behavioral component remained key to higher weight loss results." — [JMIR mHealth 2022 e35479](https://mhealth.jmir.org/2022/4/e35479/PDF)
- **RCT reported May 2024 (JAMA Network, via news summary):** ~400 adults were randomized to a wireless feedback system alone or the same system plus brief weekly human coaching calls. At 6 months the coached group lost more (mean ≈4.8 kg vs ≈2.5 kg). Only a news summary was available, not the paper. — [Labroots, 23 May 2024](https://labroots.com/trending/cardiology/27166/technology-can-t-treat-obesity-2)
- **HealthifyMe (Indian app; AI coach "Ria") observational study** (Manchanda/Michigan Ross, Kapoor/Missouri, Narayanan/Stanford; ~65,000 users over 3 years; matching on age, gender, starting weight and app usage). At 3 months, AI plus human coach users lost **2.12 kg vs 1.22 kg for AI-only**, "74% more" relative but only ~0.9 kg absolute, which the release itself calls "modest". Mechanism: **human-coached users logged meals 102 vs 49.7 times/week** (≈2×) and weighed in 1.35 vs 1.12 times/week. Benefits were larger for women, older users and lower-BMI users. Plan prices were $50 vs $44/month. INFORMS lists the publication as Marketing Science (2026). It is observational, so residual selection bias is possible. — [Newswise release](https://www.newswise.com/articles/human-ai-coaching-models-boost-weight-loss); [INFORMS news release](https://www.informs.org/News-Room/INFORMS-Releases/News-Releases/Research-Finds-that-AI-Weight-Loss-Apps-Work-Best-When-Combined-with-Human-Coaching)
- **LLM-specific RCT (Malaysia, enrolled Jul–Dec 2024, n=160):** a personalized AI prompt generator plus ChatGPT, vs structured manual ChatGPT use. Weight loss was 6.6 kg vs 3.0 kg at 12 weeks and 5.5 kg vs 1.7 kg at 24 weeks, with little difference in cardiometabolic markers. The control was also ChatGPT, so this tests personalization rather than AI vs no AI. — [medRxiv preprint](https://www.medrxiv.org/content/10.1101/2025.09.07.25335255v1.full); [Springer journal version, 2026](https://link.springer.com/article/10.1007/s41347-026-00618-2)
- **Noom (prediabetes, BMJ Open Diabetes Research & Care):** in a single-arm 24-week study (n=43), 64% lost >5% of body weight, the mean loss was 7.5%, and 84% completed. This was a small, company-promoted study. — [MobiHealthNews](https://www.mobihealthnews.com/news/study-finds-health-coaching-app-nooms-weight-loss-outcomes-comparable-traditional-diabetes)
- LLM nutrition advice has real-world limits: an arXiv 2025 paper evaluates "when LLMs can't help" in nutrition (not yet reviewed in detail). — [arXiv 2511.20652](https://arxiv.org/pdf/2511.20652)
- Wizard-of-Oz comparison of a scripted chatbot coach vs human text coaches: humans were better at empathy and probing questions. The chatbot was more persistent and more consistently offered choices, which supports autonomy. — [PMC9605038](https://pmc.ncbi.nlm.nih.gov/articles/PMC9605038)

### Inferences
- The evidence supports a coach that drives **self-monitoring and personalized feedback**, not one that only answers questions. A "pure Q&A chatbot" has the weakest evidence.
- Human coaching adds measurable benefit. The closest STEADY can get without human coaches is to copy what coaches do: scheduled check-ins, accountability, personalized feedback on logs, and follow-ups.
- In the HealthifyMe data, the human coach's measurable effect ran through **logging frequency (≈2× meal logs)**. A coach call or check-in whose job is to get the day's food logged targets exactly that mechanism. It is the strongest evidence-based rationale for the "AI calls you" idea, though it is unproven that an AI caller reproduces the human effect.
- The finding that text beat voice chatbots (for F&V, few studies) is a caution flag for voice-first coaching, not proof against it.

### Gaps
- No 2024–2026 meta-analysis specifically pooling LLM/chatbot effects on **weight** was found.
- No peer-reviewed RCT of an AI voice-call coach for diet logging was found.
- Lark DPP/AI-coach outcome data was not retrieved.
- A Noom RCT figure (41% vs 19.5% reaching ≥5% loss at 68 weeks) appeared in a search snippet only. Its journal is unverified, so it is excluded.

## 2. Notifications and proactive messaging: frequency, fatigue, timing, JITAI

### Takeaway
A single well-timed daily notification greatly increases short-term app opening, and in a 30-day trial its effect did not decay. Fixed or random notification schedules did not improve long-term retention, though. Evidence favours adaptive (JITAI-style) prompts, user-chosen timing, and easy snooze or opt-out.

### Cited Findings
- **Bell et al., JMIR mHealth 2023 (Drink Less micro-randomized trial, n=350, first 30 days):** a daily 8 pm notification raised the probability of opening the app in the next hour 3.5-fold (RR 3.52, 95% CI 2.91–4.25; 13.1% standard msg, 12.2% new msg, 3.6% none). Over 24 hours the effect was RR 1.26. New message text was no better than the standard message. — [PMC10337295](https://pmc.ncbi.nlm.nih.gov/articles/PMC10337295/)
- Same trial: the notification effect did **not** decline significantly over 30 days (daily multiplicative change 0.993, 95% CI 0.975–1.012). Time to disengagement did not differ across arms (median 11 days standard, 11 random, 7 none; log-rank P=.42). The authors suggest notifications may work better as "dynamic, adaptive components." — [PMC10337295](https://pmc.ncbi.nlm.nih.gov/articles/PMC10337295/)
- **HeartSteps II (year-long):** the number of daily prompts received was positively associated with app page views. Users could snooze lock-screen messages for 4, 8 or 12 hours, which the authors called "critical to maintaining buy-in." Decision times were user-specified. — [ScienceDirect, J Biomed Inform 2024](https://www.sciencedirect.com/science/article/pii/S1532046424001394)
- **HeartSteps MRT:** responses to activity suggestions began ~10 minutes after the push and tapered off around 40 minutes. — [Klasnja et al., via ResearchGate](https://www.researchgate.net/publication/327451781_Efficacy_of_Contextually_Tailored_Suggestions_for_Physical_Activity_A_Micro-randomized_Optimization_Trial_of_HeartSteps)
- **Workplace well-being app MRT:** users were 3.9% more likely to engage in the next 24 h when a tailored message was sent. The effect attenuated over the study, but not significantly. — [PMC6293241](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6293241/)
- **JITAI meta-analysis (Digital Health, 2023):** 21 effect sizes, 592 participants, medium effect on objectively measured behaviour (g=0.77, 95% CI 0.32–1.22). Passive sensing was associated with better retention than passive-plus-active assessment. All included studies were pre-post designs. — [UvA DARE](https://dare.uva.nl/id/4c8814cc-b448-46e0-87b1-30ef52385731)
- Reviews note that repeated messaging can cause habituation and burden, and that missing responses can signal disengagement. — [arXiv 2609.23374](https://arxiv.org/pdf/2609.23374)

### Inferences
- One daily, user-timed check-in prompt is well supported. More is not clearly better, and long-term retention needs adaptivity (for example, skip the prompt when the user has already logged).
- Proactive insights should be triggered by state (missed logs, a goal at risk, a streak), not sent on a fixed schedule.

### Gaps
- No dose-response study directly quantifying notification fatigue (for example, 1 vs 3 vs 5 per day) in nutrition apps was found.

## 3. Coach persona and tone: supportive vs directive, empathy, choosable personality

### Takeaway
Small studies favour empathic, autonomy-supporting tone. I found no rigorous study of directive vs supportive framing in nutrition chatbots. In the market, wearable coaches (Whoop, Oura) use a calm, data-grounded tone with user-editable memory, and Carrot Fit shows that an opt-in "mean" persona can be a viral differentiator.

### Cited Findings
- An empathic medical chatbot was rated significantly higher on empathy than an advice-only bot and was preferred by most participants (small study, N=12). — [Leiden CLIN34 abstract](https://clin34.leidenuniv.nl/abstracts/natural-chatbots-designing-an-intuitive-healthcare-conversational-agent-by-studying-the-role-of-empathy-in-generated-messages/)
- Scripted chatbot vs human text coaches: humans were better at empathy and probing questions. The chatbot was more persistent and more consistently offered choices, supporting client autonomy. — [PMC9605038](https://pmc.ncbi.nlm.nih.gov/articles/PMC9605038)
- In an empathetic AI coach study (self-attachment therapy), participants reported higher engagement with human-like personas than with a non-human-styled one, but empathy ratings were inconclusive. — [arXiv 2209.08316](https://arxiv.org/pdf/2209.08316)
- **Carrot Fit:** a "snarky", female-voiced AI that praises weight loss and berates gains. Its creator built it as a deliberate counterpoint to peppy, always-positive apps. — [MobiHealthNews](https://www.mobihealthnews.com/news/snarky-app-maker-carrot-launches-weight-loss-app); [Cult of Mac](https://www.cultofmac.com/news/sarcastic-ai-carrot-apps-brian-mueller)
- **Whoop Coach (GPT-4-powered) and "My Memory":** users add context such as goals and injuries, Whoop "follows up" proactively, and users can view, edit, delete or turn off memory entirely. — [Whoop: My Memory](https://www.whoop.com/us/en/thelocker/my-memory-whoop/); [Wareable launch coverage](https://www.wareable.com/wearable-tech/whoop-launches-gpt-4-ai-coach); [Gadgets & Wearables, 8 May 2026](https://gadgetsandwearables.com/2026/05/08/whoop-memory/)
- **Oura Advisor:** fully launched after Oura Labs beta, keeps continuity across sessions, and tailors responses to ongoing goals. — [Wareable](https://www.wareable.com/news/oura-advisor-puts-ai-coaching-on-hand)
- **MacroFactor's stance is "adherence-neutral":** users "don't have to eat like a robot or perfectly adhere to your macro targets to receive the adjustment." The app shows no warnings or red numbers when targets are exceeded, aiming for no "stress or rigidity," and targets are rebuilt at a weekly check-in from real results. A secondary source lists Coached / Collaborative / Manual modes. — [MacroFactor App Store listing](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471); [NutriScan comparison blog](https://nutriscan.app/blog/posts/macrofactor-vs-mynetdiary-2026-best-paid-macro-tracker-d8f89974e0) (secondary)

### Inferences
- Default to an empathic, non-judgmental, autonomy-supporting tone (offer choices, avoid shaming). A selectable "tough love" or snark mode is a reasonable opt-in differentiator, but it should not be the default for a health app.
- User-visible, editable coach memory (the Whoop pattern) is becoming table stakes and supports trust.

### Gaps
- No study was found comparing directive vs supportive tone on adherence in nutrition or weight apps.
- Bevel and Fitbod coach-style settings were not researched.

## 4. Agentic actions: coaches that log foods or change targets

### Takeaway
Shipping coaches increasingly act on memory and context, but I found little published evidence on the risks of AI agents changing nutrition targets. The trust pattern in market leaders is transparency plus user control.

### Cited Findings
- Whoop's coach stores user-shared context and acts on it proactively. Users keep full control: view, edit, delete, or turn off. — [Whoop: My Memory](https://www.whoop.com/us/en/thelocker/my-memory-whoop/)
- Naver CareCall's design reminds older users that they are talking to an AI, and lets social workers review call recordings and analysis (human oversight of an AI caller). — [EU Futurium "AI for people"](https://futurium.ec.europa.eu/da/node/12561); [CLOVA tech blog, Aug 2024](https://clova.ai/en/tech-blog/en-clova-carecall-research-paper-understanding-the-benefits-and-challenges-of-deploying-conversational-ai-leveraging-large-language-models-for-public-health-intervention)

### Inferences
- For STEADY, food logging by the coach (from voice or chat) is low-risk if it shows a confirm or undo card. Changing calorie or macro targets is higher-risk and should be a proposal the user approves, with a visible history. Both should be reversible.

### Gaps
- No peer-reviewed study on user trust in AI agents that modify health targets was found.

## 5. AI phone-call providers: pricing, latency, India support

### Takeaway
All-in cost for an outbound AI phone call is about **$0.08–$0.15/min** on mid-tier models (Retell, Vapi, ElevenLabs, Bland). Premium speech-to-speech models (OpenAI GPT Realtime full) push it to $0.40+/min. In-app (WebRTC) voice removes telephony cost but not the AI cost. India PSTN termination is cheap (≈$0.05/min via Twilio). The binding constraint in India is regulation (see section 6), not price.

### Cited Findings
- **Retell AI (official pricing page, no effective date; © 2026):** voice infrastructure $0.055/min. LLM per minute: GPT-4.1 mini $0.0128, GPT-5 mini $0.008, Claude 4.5 Haiku $0.025, Claude 4.6 Sonnet $0.08, Gemini 3.0 Flash $0.016. Speech-to-speech: GPT Realtime mini $0.07/min, GPT Realtime $0.345/min, GPT Realtime 2/2.1 $0.38/min. TTS: platform, Cartesia or OpenAI voices $0.015/min, ElevenLabs Flash $0.04, ElevenLabs Multilingual v2 $0.06. Telephony $0.015/min, and the country list includes India (Twilio and Telnyx). Numbers cost $2/month, 20 concurrent calls are free, billing is per second (silence is billed), failed calls are not billed, the advertised range is $0.07–$0.31/min, and new accounts get $10 free credit. — [retellai.com/pricing](https://www.retellai.com/pricing)
- **Vapi (official pricing page):** platform fee $0.05/min. Pass-through: Deepgram STT ~$0.0095–0.0099/min, OpenAI LLM $0.0077–0.0452/min, ElevenLabs TTS $0.0146–0.0238/min. Vapi's own estimate is $82–$129 per 1,000 min (≈$0.08–$0.13/min). Transport: Twilio outbound $0.014/min, Telnyx $0.0055/min, Daily WebRTC and Vapi SIP free. Plans: free tier (1 number, 4 concurrent calls, $5 credit), Core $29/month (5 numbers, 10 concurrent, ZDR), HIPAA add-on $2,000/month. — [vapi.ai/pricing](https://vapi.ai/pricing)
- **ElevenLabs Agents (official API pricing page):** $0.08/min connected audio across tiers, with $0.16/min "burst" pricing above the concurrency limit. Realtime v1 Mini and Max carry extra LLM token charges ("$0.08+ LLM usage"). Telephony is not listed. — [elevenlabs.io/pricing/api](https://elevenlabs.io/pricing/api)
- **Bland AI (secondary):** pricing changed in December 2025. Start plan is $0.14/min (previously $0.09), Build ($299/month) is $0.12/min, Scale ($499/month) is $0.11/min. Older sources still cite $0.09. — [Retell blog, Vapi vs Bland 2026](https://www.retellai.com/blog/vapi-vs-bland) (competitor source); [AINORA cost comparison 2026](https://ainora.lt/blog/ai-voice-agent-cost-per-minute-2026)
- **Twilio India voice (official):** outbound to Indian mobiles $0.0496/min, local and major cities $0.0699/min, browser/app/SIP $0.004/min. International numbers start at $1.15/month. The page does not state India-number regulatory restrictions. — [twilio.com/en-us/voice/pricing/in](https://www.twilio.com/en-us/voice/pricing/in)
- **Plivo (secondary summary of the official page):** outbound from $0.0010/min, inbound $0.0028/min, Voice AI Agent fee $0.03/min excluding telephony. A competitor says Plivo India outbound is ≈₹0.38/min. — [plivo.com/pricing](https://www.plivo.com/pricing/); [Vobiz migration guide](https://www.vobiz.ai/resources/blogs/buyers-guide/migrating-to-vobiz-plivo-twilio-exotel-telnyx-switching-guide/)
- **Exotel (secondary, conflicting):** telephony is quote-based. Exotel AI is cited as ₹0.60–₹1.20/min with a ₹25,000–80,000 setup fee in one guide, and ₹0.50/min AI in another. Indian outbound-to-mobile is cited at ₹0.80–1.80/min via aggregators. — [Scalify Labs India 2026](https://scalifylabs.com/blog/ai-calling-pricing-india-2026); [Edesy Exotel page](https://edesy.in/ai-voice-assistant/integrations/exotel); [caller.digital comparison](https://caller.digital/blog/telephony-partner-voice-ai-india-plivo-exotel-ozonetel-knowlarity-twilio-2026)

- **Latency (methodology-dependent; mostly vendor sources):** Retell self-reports ~600 ms. In a May 2026 third-party test, medians were Vapi (optimized) ~500–700 ms, Retell ~600–620 ms and Bland ~700–900 ms, all with P95 of 1.2–2.4 s under load, and LLM choice added ~200 ms. The Cekura/Openbenchmarks leaderboard (updated 12 Oct 2026; 82 scenarios, 246 calls per config) found mean response times of 1.27 s fastest to 3.08 s slowest, with Retell at 2.21 s. Telnyx's 118 ms vs Twilio's 161 ms is audio-network RTT only, and ElevenLabs' ~75 ms is TTS-only, not end to end. — [Telnyx latency benchmark](https://telnyx.com/resources/voice-ai-latency-benchmark); [Retell latency benchmarks](https://www.retellai.com/learn/voice-ai-latency-benchmarks-comparing-real-time-response-performance); [SoftwareSeni](https://www.softwareseni.com/voice-agent-latency-solved-enough-for-production-benchmarks-and-architecture-tradeoffs); [Macha](https://www.getmacha.com/blog/voice-ai-agent-latency)

### Inferences (cost model; my arithmetic from the figures above)
- **Retell, cost-efficient stack:** $0.055 infra + $0.013 GPT-4.1 mini + $0.015 TTS + $0.015 telephony ≈ **$0.10/min**. With ElevenLabs Flash ≈ $0.12/min. With GPT Realtime mini speech-to-speech ≈ $0.14/min (assuming infra and telephony stack on top).
- **A 3-minute daily food-log call costs ≈ $0.30, or ≈ $9/user/month (90 min).** For all 36 current users that is ≈ $330/month. That is far above typical Indian app subscription prices, so calls must be infrequent (for example, weekly or opt-in), premium-gated, or in-app.
- **In-app voice (WebRTC, no PSTN):** saves only the ~$0.015–0.05/min telephony. The AI cost (~$0.07–0.10/min) remains, so the in-app version is still ≈ $6–9/user/month at 3 min/day.

### Gaps
- Independent, methodology-matched latency numbers for **India-terminated** calls (longer network path) were not found. Expect worse than US figures.
- Direct OpenAI Realtime token pricing could not be fetched (openai.com returned 403). Retell's per-minute pass-through rates are used as a proxy.
- Whether Twilio, Plivo or Exotel can provision Indian numbers for **outbound AI calls to Indian consumers** from a non-telemarketer business (DLT registration, 1600-series eligibility) was not confirmed.

## 6. Legal: US TCPA/FCC, India TRAI, UK/EU

### Takeaway
- **US:** AI-voice calls count as "artificial voice" calls under the TCPA. They are legal with **prior express consent** (informational) or **prior express written consent** (anything promotional), plus disclosure and opt-out.
- **India:** the regime is hostile to automated or computer-generated calls from ordinary 10-digit numbers. Commercial voice calls must go through registered (DLT) telemarketers on 140 (promotional) or 1600 (service/transactional) series. Whether a user-requested coaching call is a "commercial communication" is unresolved.
- **UK/EU:** automated marketing calls need prior consent. AI voice agents are a grey area.

### Cited Findings
- **FCC Declaratory Ruling, 8 Feb 2024 (CG Docket 23-362, FCC 24-17):** adopted unanimously, effective immediately. It clarifies that AI-generated voices are "artificial" under the TCPA, so such calls fall under the same consent, disclosure and opt-out rules as prerecorded or artificial-voice calls. It is not a ban. — [Cooley, 15 Feb 2024](https://cooley.com/news/insight/2024/2024-02-15-fcc-ai-generated-robocalls-illegal-under-the-tcpa); [Orrick, "Did the FCC Really Ban AI-Generated Voice Calls? No"](https://orrick.com/Insights/2024/02/Did-the-FCC-Really-Ban-AI-Generated-Voice-Calls-No-But-Restrictions-Apply); [Mayer Brown, 27 Feb 2024](https://www.mayerbrown.com/en/insights/publications/2024/02/fcc-declares-authority-and-intent-to-regulate-ai-generated-calls-under-the-tcpa); [Wiley](https://www.wiley.law/alert-FCC-Extends-Regulatory-Reach-Over-AI-Announces-TCPA-Restrictions-Cover-AI-Generated-Voices-in-Outbound-Calls)
- **One-to-one consent rule vacated:** the 11th Circuit vacated it on 24 Jan 2025, one business day before its 27 Jan 2025 effective date, finding the FCC exceeded its authority. — [Kelley Drye](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/eleventh-circuit-vacates-tcpa-11-consent-rule); [McGuireWoods](https://www.mcguirewoods.com/client-resources/alerts/2025/1/delayed-one-to-one-consent-rule-gives-companies-reprieve-plus-other-tcpa-updates/)
- **Consent-revocation rule (effective 11 Apr 2025):** consumers may revoke by any reasonable means, and callers may not designate an exclusive method. Revocations must be honoured within 10 business days. The FCC reportedly revisited parts of this in late 2025 (details not found). — [Florida Realtors](https://floridarealtors.org/news-media/news-articles/2025/01/court-cancels-new-robocall-rules-back-fcc); [ActiveProspect](https://activeprospect.com/blog/fcc-tcpa/)
- **TCPA healthcare exemption (2015 FCC order):** certain free-to-end-user informational healthcare calls to wireless numbers (appointment reminders, lab results, prescription notices) are exempt, under strict conditions. The written-consent exemption for "health care messages" applies to **HIPAA covered entities and business associates**. Anything with telemarketing, advertising or billing content needs prior express written consent. — [Mintz, 27 Jul 2015](https://www.mintz.com/insights-center/viewpoints/2015-07-27-fcc-ruling-addresses-robocalls-health-care-providers); [Holland & Hart](https://hollandhart.com/are-you-TCPA-compliant); [FCC DA 20-669 (Anthem ruling, 2020)](https://docs.fcc.gov/public/attachments/DA-20-669A1_Rcd.pdf)
- **India TCCCPR 2018 amendment (12 Feb 2025):** telemarketers use the 140 series for promotional calls and the 1600 series for service and transactional calls. Telcos must block 10-digit numbers used for business communications. Consent for transactional messages lapses after 7 days. Senders must wait 90 days before re-asking opted-out users. Robocall and autodialer use and purpose must be disclosed. The complaint threshold drops to 5 complaints in 10 days, with industry-wide disconnection for repeat offenders. Telco fines are ₹2 lakh, ₹5 lakh, then ₹10 lakh. — [Securiti summary](https://securiti.ai/india-spam-rules-trai-latest-amendment/); [PIB press release PRID 2102413](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2102413) (official, returned 403 to fetch); [Saikrishna & Associates](https://www.saikrishnaassociates.com/strengthening-consumer-protection-by-trai-amendment-to-the-tcccpr/)
- **TRAI Direction, 13 Aug 2024:** access providers must stop promotional voice calls, **including pre-recorded and computer-generated calls**, from unregistered telemarketers using SIP, PRI or other resources. Offenders face disconnection of all telecom resources and blacklisting for up to 2 years, shared across operators via DLT within 24 hours. — [TRAI Direction PDF](https://trai.gov.in/sites/default/files/Direction_13082024.pdf); [TRAI PR 51/2024](https://trai.gov.in/sites/default/files/PR_No.51of2024.pdf); [DT Next](https://www.dtnext.in/news/business/trai-directs-telcos-to-disconnect-unregistered-telemarketers-lines-over-spam-calls-blacklist-them-799370)
- BFSI entities were reportedly required to migrate service calls to the 1600 series by 1 Jan 2026 (vendor source, unverified). — [SMS Gateway Provider](https://smsgatewayprovider.com/resources/trai-announcements/trai-tcccpr-february-2025-amendment-140-1600-series-ai-spam/)
- **UK PECR Regulation 19:** sending recorded direct-marketing material via an automated calling system requires the subscriber's prior consent. A Data & Marketing Association article (4 Jun 2026) notes that AI agents challenge the traditional "pre-recorded" reading (trade-body commentary, not ICO guidance). The ICO has fined HELM for 6M+ recorded marketing calls without consent. — [DMA, 4 Jun 2026](https://www.dma.org.uk/about/articles/automated-outbound-contact-and-the-collapse-of-the-human-review); [Covington Inside Privacy](https://www.insideprivacy.com/advertising-marketing/uk-ico-issues-largest-ever-fine-in-connection-with-automated-marketing-calls/); [Data Protection People, PECR and phone calls](https://dataprotectionpeople.com/resource-centre/pecr-and-phone-calls/)

- **EU ePrivacy Directive Art. 13(1):** automated calling "without human intervention" for direct marketing is allowed only with the subscriber's prior consent. Commentary generally treats a fully AI voice agent as a likely "automated calling machine," with member-state variation. Germany requires documented prior express consent for consumer marketing calls (UWG §7/§7a). **EU AI Act Art. 50(1)** requires telling people they are interacting with an AI, applicable from 2 Aug 2026. These are vendor and commentary sources, so verify with EUR-Lex. — [Softcery EU voice AI guide 2026](https://www.softcery.com/lab/eu-voice-ai-regulations-founders-guide); [Knowlee EU 2026](https://www.knowlee.ai/blog/ai-cold-calling-compliance-eu-2026); [Retell: AI calling laws by country](https://www.retellai.com/learn/ai-calling-laws-by-country-a-guide-to-international-voice-agent-compliance)

### Inferences
- **US:** a user who opts in inside the app (clear checkbox, schedule they choose, AI disclosure, "reply STOP / say stop" revocation) gives at least prior express consent. Collecting it in **written/e-sign form** anyway is cheap insurance, because coaching calls may drift into promotion (upsells, premium). STEADY is not a HIPAA covered entity, so the healthcare exemption is unlikely to apply.
- **India:** placing automated AI calls from a regular 10-digit number risks being classified as an unregistered telemarketer making computer-generated calls (up to 2-year blacklisting). A compliant PSTN route likely means DLT registration and a 1600-series number via a registered provider. That is heavy for a 36-user startup. **In-app voice avoids the telecom-network regime entirely.**
- **UK/EU:** strictly non-marketing, user-requested service calls are more defensible, but prior consent should be collected regardless.

### Gaps
- No official TRAI text was found on whether a **user-scheduled, user-requested** AI check-in call is "commercial communication" (likely service, but unconfirmed).
- The primary EUR-Lex text of ePrivacy Art. 13 and any EDPB guidance on AI voice were not fetched (secondary sources only).
- The GDPR Art. 9 health-data implications of recording food and voice were not researched in this pass.
- The ICO's official position on AI voice agents (vs recorded messages) was not found.

## 7. In-app alternative that looks like a call: iOS CallKit/PushKit, Android full-screen intent

### Takeaway
- **iOS:** PushKit VoIP pushes are only for apps providing VoIP phone services, and every push must be reported to CallKit as a real incoming call. An "AI coach calls you" ringing screen is a policy grey zone with App Review risk. The safe path is a time-sensitive standard notification that opens straight into a voice session.
- **Android:** the full-screen-intent "ringing" screen is default-granted only to apps whose core function is calling or alarms. STEADY would have to ask the user for permission and degrade gracefully.

### Cited Findings
- **Apple:** "If your app provides Voice-over-IP (VoIP) phone services, you may use PushKit… For apps built using the iOS 13 SDK or later, PushKit requires you to use CallKit when handling VoIP calls… **If you are unable to support CallKit in your app, you cannot use PushKit to handle push notifications.** Instead, configure your app's push notification support with the User Notifications framework." Apple also says to set `apns-expiration` to 0 or a few seconds. — [Apple: Responding to VoIP Notifications from PushKit](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit.md)
- **Apple (delegate docs):** "On iOS 13.0 and later, if you fail to report a call to CallKit, the system will terminate your app. Repeatedly failing to report calls may cause the system to stop delivering any more VoIP push notifications to your app. If you want to initiate a VoIP call without using CallKit, register for push notifications using the User Notifications framework instead of PushKit." Reporting the call shows the standard incoming-call UI, unless an error occurs such as Do Not Disturb. — [Apple: pushRegistry(_:didReceiveIncomingPushWith:for:completion:)](https://developer.apple.com/documentation/pushkit/pkpushregistrydelegate/pushregistry(_:didreceiveincomingpushwith:for:completion:).md); also [Sinch iOS docs](https://developers.sinch.com/docs/in-app-calling/ios/push-notifications-callkit.md)
- A third-party skill file claims an iOS 26.4+ `PKVoIPPushMetadata.mustReport` flag can relax this. **Unverified** against Apple docs. — [tessl.io CallKit skill](https://tessl.io/registry/dpearson2699/swift-ios-skills/3.6.1/files/skills/callkit/SKILL.md)
- **Google Play Full-Screen Intent policy:** only "apps whose core functionality is a high-priority use case of setting an alarm or receiving phone or video calls" get the permission by default. A Play Console declaration has been required since 31 May 2024. From 22 Jan 2025, for apps targeting Android 14+, only calling and alarm apps keep it on by default. Other apps must prompt users and handle denial gracefully. "Core functionality" means the app is broken or unusable without it. — [Google Play Console Help 13392821](https://support.google.com/googleplay/android-developer/answer/13392821)
- **AOSP:** on Android 14+, Play revokes FSI on install for apps without calling or alarm functionality. Apps can check `NotificationManager#canUseFullScreenIntent()` and send users to `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`. — [AOSP: Full-screen intent limits](https://source.android.com/docs/core/permissions/fsi-limits?hl=en)

### Inferences
- **Recommended pattern:** a scheduled local or remote notification ("Your coach is ready — tap to talk, 2 min"), using iOS time-sensitive interruption level and an Android high-priority channel, that deep-links into an in-app voice session. That is allowed on both platforms, needs no telecom compliance, and works on Expo Go/EAS with existing Expo Notifications.
- A CallKit ringing UI would need STEADY to present itself as a VoIP calling service. That risks App Review rejection and requires native modules (a dev client, not Expo Go). A PSTN phone call is the only way to get a true "ringing" experience without platform-policy risk, at the telecom and legal cost described in section 6.

### Gaps
- The exact App Store Review Guideline text on PushKit/CallKit misuse was not retrieved.
- iOS 26 LiveCommunicationKit and `mustReport` changes were not verified.

## 8. Products that call users for check-ins, and user reception

### Takeaway
AI check-in callers exist (Naver CareCall at public-health scale for elderly people living alone, plus small accountability startups), but I found no public data on answer rates or annoyance for AI habit calls. General data shows most people ignore unknown-number calls, which argues for a known, saved caller identity and user-scheduled times.

### Cited Findings
- **Naver CLOVA CareCall (Korea):** an LLM (HyperCLOVA) chatbot that calls residents living alone twice a week, with social workers given access to recordings and analysis. It launched about a year before ChatGPT. The paper won a CHI 2023 Best Paper award. The system reminds older users they are talking to AI. — [CLOVA tech blog, Aug 2024](https://clova.ai/en/tech-blog/en-clova-carecall-research-paper-understanding-the-benefits-and-challenges-of-deploying-conversational-ai-leveraging-large-language-models-for-public-health-intervention); [EU Futurium](https://futurium.ec.europa.eu/da/node/12561)
- A follow-up CHI 2024 paper studies how long-term memory affects self-disclosure in CareCall. — [CLOVA tech blog 2](https://clova.ai/en/tech-blog/en-clova-carecall-research-paper-2)
- **CareCall engagement typologies (Khor & Choi, Gerontechnology):** 2,727 rural users in Jeongeup over 3 months fell into **six engagement types, from highly expressive to silent**. Reception of AI check-in calls is heterogeneous, and a meaningful segment answers but barely engages. — [Gerontechnology](https://journal.gerontechnology.org/currentIssueContent.aspx?aid=4820)
- In a field study of proactive smart speakers (13 participants), the device's own check-in conversations were used as probes. Proactive check-ins were seen as enabling health use cases, such as checking patient state and medication reminders, while intrusiveness and interruption were recurring concerns. — [Wei, Dingler & Kostakos, Univ. of Melbourne](https://findanexpert.unimelb.edu.au/scholarlywork/1625368-understanding%20user%20perceptions%20of%20proactive%20smart%20speakers)
- Naver also used CLOVA voice calls to check on seniors after COVID-19 vaccination. — [Voicebot.ai](https://voicebot.ai/?p=23073)
- **Accountability callers:** Coach Call AI (calls plus WhatsApp; directory release dates conflict), Habit Coach AI (Google Play, daily check-ins by call or text), FineStreak (calls or texts at check-in time, optional fines), and Overlord (YC, "text/call you, text your friends, take your money"). — [TAAFT: Coach Call AI](https://theresanaiforthat.com/ai/coach-call-ai/); [Google Play: Habit Coach AI](https://play.google.com/store/apps/details?id=ai.habitcoach.app&hl=en); [FineStreak blog](https://finestreak.com/blog/ai-accountability-partner) (self-promotional); [YC: Forfeit/Overlord](https://www.ycombinator.com/companies/forfeit)
- **Answer rates:** Pew (July 2020, n=10,211 US adults) found that 80% generally don't answer unknown-number cellphone calls, and only 19% generally pick up. — [Pew Research, 14 Dec 2020](https://www.pewresearch.org/short-reads/2020/12/14/most-americans-dont-answer-cellphone-calls-from-unknown-numbers/)

### Inferences
- If PSTN calls are used, the number must be saved or branded (Retell sells "Branded Call" at +$0.10/call) and calls placed only at user-chosen times. Otherwise answer rates will be poor.
- No AI habit-calling startup shows public traction data. The "super wow" may be strongest as an occasional, opt-in ritual (for example, an evening recap), not a daily default.

### Gaps
- No answer-rate, retention or annoyance data for AI check-in calls in consumer apps was found.
- Reception data for Sesame, Hume or companion voice apps was not retrieved (rate limit).
- A 2026 Hiya multi-country survey (86% won't answer unidentified calls) appeared only in a search summary without a verified primary URL, so it is excluded.
