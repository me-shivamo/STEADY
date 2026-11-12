# Food-Logging UX (Voice/AI) and Journal/History UX in Calorie-Tracking Apps

*Research notes compiled 2026-10-27 for the STEADY redesign (one-tap voice logging, busy lean-gainer persona, India-heavy Hinglish user base, plus a past-day "journal").*

Source-quality tags used below: **[vendor]** = company's own press/help/marketing; **[competitor]** = written by a rival app with a commercial interest; **[indep]** = independent press or academic; **[aggregator]** = review-scraping / SEO / app-intel site. Vendor and competitor claims are reported as claims, not facts.

---

## Q1. Which apps offer voice logging, how does each flow work (steps, confirm vs auto-log, edit), and are there published speed/tap-count comparisons?

### Takeaway
Voice logging is now table stakes (MyFitnessPal, Lose It, Lifesum, SnapCalorie, Welling, Alma, Healthify, Cal AI, Nutrola, and a long tail of voice-first indie apps). Almost every incumbent uses **speak → AI parses → review screen → tap "Log"**. Chat-first apps (Welling, Healthify Ria) come closest to auto-logging, posting an editable entry right away. The only "speed" numbers are vendor-run (Lose It "3.5x faster"; MacroFactor's action-count index). No independent tap-count or seconds-per-meal study exists.

### Cited Findings
**MyFitnessPal: Voice Log** (Premium)
- Announced in the "2025 Winter Release" (Feb 2025; launched ~Dec 2024). Flow: pick Voice Log from the navigation bar → grant mic permission the first time → say what you ate in everyday language → app suggests best database matches → review and adjust serving sizes or quantities → tap **"Log"**. Initially US-only, English app language only. — [MFP 2025 Winter Release (Webull repost)](https://www.webull.com/news/12377891991156736); [Investors Hangout summary](https://investorshangout.com/explore-myfitnesspals-exciting-new-features-for-2025-225962-/) [vendor]
- Architecture: on-device speech recognition feeds Claude 3.5 Sonnet (Amazon Bedrock), which outputs structured items, quantities, serving units, brands and **meal context**. These are matched against MFP's 20M+ food DB. Supports **multiple foods in one phrase, or a whole day of eating across multiple meals**. Explicit review step before adding to the diary. No latency or accuracy metrics published. — [Tribe.ai case study](https://www.tribe.ai/case-studies/myfitnesspal) [vendor]. Model version is inconsistent: another Tribe page says "Claude 2" — [Tribe.ai older case study](https://www.tribe.ai/case-studies/myfitnesspal-case-study)
- CONFLICT: Nutrola's blog says MFP voice handles "one food at a time" at 10–15 s per item. This contradicts MFP's own vendor material. — [Nutrola blog, Apr 4 2026](https://nutrola.app/en/blog/what-is-the-best-calorie-tracker-with-voice-logging) [competitor]
- Context: MFP acquired **Cal AI** (deal closed Dec 2025, announced Mar 2 2026). Cal AI stays a standalone app aimed at "speed over accuracy" users, while MFP targets precision users. Cal AI is now wired to MFP's DB (~20M foods, 68.5k brands, 380+ restaurant chains). Cal AI: >15M downloads, >$30M annual revenue, 7 staff. — [TechCrunch, Mar 2 2026](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens) [indep]; [Athletech News](https://athletechnews.com/myfitnesspal-cal-ai-acquisition)

**Lose It!: "Say It!" voice + "Snap It" photo** (Premium)
- Say a full meal, e.g. "I had 2 eggs, toast with butter and jam". The app matches each item to its 63M-item DB. — [Lose It! App Store listing](https://apps.apple.com/no/app/id297368629); [Lose It! press release, Apr 22 2025 (Barchart)](https://www.barchart.com/story/news/31984516/lose-it-finds-ai-powered-logging-boosts-weight-loss-success-and-greater-nutritional-mindfulness) [vendor]
- Vendor-reported results for AI (voice + photo) loggers: meals logged **3.5x faster**, **2x as many foods** logged, **6% more weight loss**. Methodology not public. — [same press release](https://www.barchart.com/story/news/31984516/lose-it-finds-ai-powered-logging-boosts-weight-loss-success-and-greater-nutritional-mindfulness) [vendor]
- CONFLICT: Nutrola (Apr 2026) claims Lose It has no voice logging. Contradicted by Lose It's own listing and press release. — [Nutrola blog](https://nutrola.app/en/blog/what-is-the-best-calorie-tracker-with-voice-logging) [competitor]

**Lifesum: Multimodal Tracker** (Premium, Feb 2025)
- Photo (complex dishes), hands-free voice, barcode and manual entry in one tracker. Users can toggle it on or off in diary settings. Available in all markets except Russia and Belarus. Lifesum reports higher retention and goal completion, with no independent data. — [Lifesum press release](https://lifesum.com/page/lifesum-transforms-meal-tracking-with-world-first-ai-powered-multimodal-tracker); [NutritionInsight](https://www.nutritioninsight.com/news/lifesum-multimodal-tracker-meal-calorie-nutrition-image-recognition-voice-input.html); [Lifesum help](https://help.lifesum.com/de/article/was-ist-der-unterschied-zwischen-multimodalem-tracking-und-dem-traditionellen-tracking-1jb1x1u)

**MacroFactor: AI logging**
- Flow: tap **+** → **AI** → Photo / Photo & Text / Upload → AI analysis → **"Plate" view** → edit servings, or expand ("Explode") a recipe into ingredients → tap **"Log Foods"**. **Nothing logs automatically.** Matches go to MacroFactor's own DB, including branded items. The help-article example shows the AI underestimating rice and the user fixing it by hand. — [MacroFactor help: AI food logging](https://help.macrofactorapp.com/en/articles/258-ai-food-logging) [vendor]
- The food-logger page also offers "describe your meal using voice or text". — [MacroFactor food logger](https://macrofactorapp.com/?p=4543); [AI food logging launch](https://macrofactor.com/ai-food-logging/) [vendor]
- The feature is still labelled Beta: "AI is not perfect and can make mistakes, and we give users the control to edit". — [MacroFactor Apr 2025 newsletter](https://macrofactor.com/mm-april-2025/) [vendor]

**Cal AI**
- Supports manual entry, voice, barcode and photo. In MacroFactor's testing, Cal AI voice logging **failed** (possible permissions bug), barcode often showed a blank screen, and label/meal analysis loaded slowly. Cal AI returns a **single outcome**, not a plate or timeline. Edits happen after the estimate, and low-confidence ingredients were sometimes hidden. — [MacroFactor vs Cal AI, updated Apr 6 2026](https://macrofactor.com/macrofactor-vs-cal-ai/) [competitor]
- App Store: 4.8★ from 373K ratings. A reviewer praises "you don't have to select if it's breakfast or dinner" (no meal-slot picker). Another says meals "sometimes disappear" and have to be rebuilt. There is a $0.99 "Streak Restore" in-app purchase. Weekly releases (26.38–26.42, Sep–Oct 2026) all carry generic release notes. — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616) [vendor + user reviews]

**SnapCalorie**
- Voice is secondary to photo. The listing says the "voice note algorithm is as accurate as the information you give it" and suggests dictating gram weights while weighing. — [SnapCalorie App Store](https://apps.apple.com/app/id1574239307); [Macaron review 2026](https://macaron.im/blog/snapcalorie-review-2026) [aggregator]

**Welling (chat-first)**
- The home screen is a chat with a mic. Five inputs: chat text, voice, label photo, food photo, barcode. Saying "for dinner I had chicken and a salad" logs **at the right time of day** and updates macros. The entry appears as an **editable popup**; a reviewer contrasts this with chat trackers where you have to scroll back through the conversation to correct something. — [Welling review (welling.ai)](https://www.welling.ai/articles/welling-review-chatgpt-for-weight-loss); [Welling review 2](https://www.welling.ai/articles/welling-app-review-ai-calorie-tracker-truth) [vendor-hosted]

**Alma** (launched Feb 5 2025, ex-Whoop team, Anthropic Anthology Fund investor)
- Voice, photo, text and barcode logging. A changelog entry fixes "voice logging timeouts and missing meals". — [TechCrunch, Feb 5 2025](https://techcrunch.com/2025/02/05/former-whoop-execs-new-app-alma-uses-ai-for-all-things-nutrition); [Alma App Store](https://apps.apple.com/us/app/alma-nutrition-coach/id6736372798); [Fitt Insider](https://insider.fitt.co/alma-ai-nutrition-app/)

**Healthify (India): Ria live voice/camera mode** (Dec 2 2025)
- Real-time conversation by voice or camera. 50+ languages, including 14 Indian languages, and **mixed-language input such as Hinglish**. Users can describe **several meals at once** and Ria logs them. Ria can also **scan the photo gallery for food pictures and suggest meals the user missed logging**. Built mainly on OpenAI models. 45M+ registered users. — [TechCrunch, Dec 2 2025](https://techcrunch.com/2025/12/02/healthify-upgrades-its-ai-assistant-ria-with-real-time-conversation-capabilities) [indep]
- Healthify's earlier "Snap" photo feature was built for Indian thalis. — [TechCrunch, Sep 21 2023](https://techcrunch.com/2023/09/21/khosla-backed-healthifyme-introduces-ai-powered-image-recognition-for-indian-food/)

**Nutrola / Samsung Health** (from a competitor's comparison)
- Nutrola: tap mic → speak → parse → review → save. Claims <5 s parse and 5–8 s from speech to saved entry, 10+ languages, and an unsourced "30–60 s per item" for manual logging. Samsung Health uses Bixby ("Log 200 calories for lunch") and records a calorie number only. — [Nutrola blog, Apr 4 2026](https://nutrola.app/en/blog/what-is-the-best-calorie-tracker-with-voice-logging) [competitor]

**Voice-first indie apps (2025–26)**: Calorie Tracker: Voice AI, TalkFood (English and Arabic), VoiCal, Healthshape, CalEasy (queues uploads when offline), SnapCal (voice from the Home screen; **the recognized text can be edited before analysis**). — [Voice AI](https://apps.apple.com/app/id6755983901); [TalkFood](https://apps.apple.com/app/id6757200636); [VoiCal](https://apps.apple.com/us/app/-/id6754181304); [CalEasy](https://apps.apple.com/app/id6751424787); [SnapCal](https://apps.apple.com/app/id6758917472)

**Speed / tap-count comparisons**
- MacroFactor's "Food Logging Speed Index" (actions per workflow, lower is better): food search 10 vs Cal AI 19; barcode 5 vs 10; multi-add 6 vs 8; quick-add 3 vs 8; **total 24 vs 45** ("~1.9x as many discrete actions"). — [MacroFactor vs Cal AI](https://macrofactor.com/macrofactor-vs-cal-ai/) [competitor]
- MacroFactor says it "analyzed 20 food loggers" before redesigning. Multi-Add adds a food's default serving to the Plate with no extra taps and remembers the last serving used per food. — [MacroFactor new food logger, Sep 2024](https://macrofactor.com/new-food-logger/) [vendor]
- MFP's spring 2026 "Today" redesign drew complaints that logging "requires more taps", that the diary is "no longer visible at a glance", and that individual copy/paste was removed. MFP's monthly review score (from written reviews only) fell to 1.82 in May and 2.23 in June 2026, the lowest of the ten apps tracked. — [MyNetDiary Diet App Scorecard, Jun 2026](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html) [competitor]; [mwm.ai on v26.16.0, Apr 21 2026 (page now 410)](https://mwm.ai/articles/myfitnesspal-v26-16-0-replaces-diary-with-new-ui-sparking-rating-drop-in-april-2026) [aggregator]. The rollout date conflicts: March 2026 per [MyNetDiary scorecard index](https://www.mynetdiary.com/diet-app-scorecard.html), and a Reddit post from Nov 2025 already describes the Today tab.

### Inferences
- The industry norm is "AI drafts, human confirms". STEADY can win by making the confirm step nearly free (glanceable result plus implicit accept), not by being the only app with voice.
- MFP's 2026 backlash is a direct warning for STEADY's redesign: power users punish anything that adds taps or hides the day's totals. Count taps for every core flow and treat any increase as a regression.
- The Cal AI-under-MFP split (speed vs precision) confirms a market segment that values speed over accuracy. That fits STEADY's busy-professional persona, but the gainer persona also needs reliable protein numbers.
- Healthify (the closest India-market competitor) already ships Hinglish live voice, multi-meal voice and gallery-based missed-meal suggestions. STEADY's Hinglish voice is a necessity in India, not a differentiator.

### Gaps
- No independent tap-count or seconds-per-meal comparison of voice flows across apps.
- MFP's official Voice Log help article could not be retrieved (support.myfitnesspal.com is not indexed in search).
- Cal AI's own documentation of its voice flow was not found. TechCrunch's acquisition coverage mentions only photo logging.
- No adoption share for any app's voice feature (e.g., % of MFP Premium users who use Voice Log).

---

## Q2. Auto-log with undo vs explicit confirmation card vs confidence-based: what does UX research say, and what do food apps do?

### Takeaway
UX research (NN/g) favours **undo over confirmation for frequent, low-stakes, reversible actions**: routine confirmations get clicked through by habit. Food logging is frequent, low-stakes and fully reversible, so it fits the auto-log + undo pattern. Yet most food apps still use a review card before saving, because AI estimates are often wrong. Confidence-based gating ("confirm only when unsure", like NN/g's bank example that confirms only unusually large payments) is the principled middle ground. No food app was found documenting confidence-gated auto-log.

### Cited Findings
- NN/g (Jakob Nielsen, 2018, reviewed Aug 2026): confirmation dialogs are an interruption worth the delay "only if they prevent errors". Generic "Are you sure?" prompts invite reflexive clicking, and overuse trains users to ignore warnings. Use confirmations for serious or irreversible actions and avoid them for routine ones. **Offer undo wherever possible.** Resolve the conflict by weighing outcome severity against how often the action happens. Example: a bank confirms only payments well above the user's normal range. — [NN/g: Confirmation Dialogs Can Prevent User Errors — If Not Overused](https://www.nngroup.com/articles/confirmation-dialog/) [indep]
- Undo-over-confirmation is a widely cited principle. — [Andy Matuschak: Prefer undo to confirmation steps](https://notes.andymatuschak.org/zXH4ASvHNz488hCNgrBjQJK); [InformIT: Ask Forgiveness, Not Permission](https://informit.com/articles/article.aspx?p=1091575)
- Gmail Undo Send is the canonical "deferred commit" pattern: mail is held for a configurable 5/10/20/30 s (default 5 s), and Undo returns it to drafts. — [Ask Leo: How does Undo Send work](https://askleo.com/how_does_gmails_undo_send_work/); [Inverse](https://www.inverse.com/tech/how-to-increase-gmail-undo-send-time-desktop-app); [UX Collective](https://uxdesign.cc/an-underrated-ux-gmails-undo-send-d2a1ff04251f)
- Snackbar timing: Android snackbars auto-dismiss after "a few seconds", with adjustable duration and action label. — [Android developers: snackbar](https://developer.android.com/quick-guides/content/create-snackbar-notification). A community pattern library suggests 8–10 s minimum when Undo is offered (not an official Material spec). — [Pattern Playground: transient feedback](https://pattern-playground.onrender.com/patterns/transient-feedback)
- Doherty Threshold: give system feedback within **400 ms** to keep attention. Optimistic UI and skeletons are the usual tools when the backend is slower. — [Laws of UX: Doherty Threshold](https://lawsofux.com/doherty-threshold/)
- Food apps in practice: MacroFactor ("Nothing logs automatically", Plate → "Log Foods") — [MacroFactor help](https://help.macrofactorapp.com/en/articles/258-ai-food-logging); MFP Voice Log (review → "Log") — [MFP release](https://www.webull.com/news/12377891991156736); Nutrola (review → save) — [Nutrola](https://nutrola.app/en/blog/what-is-the-best-calorie-tracker-with-voice-logging); Welling (logs immediately, editable popup) — [Welling review](https://www.welling.ai/articles/welling-review-chatgpt-for-weight-loss); Cal AI ("Point and click and it logs it") — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Error rates that justify some review step: in the SnappyMeal field study, users **edited 20.7% of AI logs and deleted 5.8%**. — [SnappyMeal, arXiv 2511.03907 (Nov 2025)](https://arxiv.org/html/2511.03907v1) [indep]. User reviews of photo-first apps (Cal AI, BitePal, FoodPilot, Municorn) report "inaccurate photo and barcode results". Municorn users specifically complain they "could not edit entries". — [MyNetDiary scorecard Jun 2026](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html) [competitor]
- LLM photo estimates systematically **underestimate large portions** (ChatGPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro on 52 standardized photos), with high macro variability. — [Fridolfsson et al., summarised in PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12513282/) [indep]. GPT-4V portion MAE was 54.6 g vs 43.6 g for humans. — [Lo et al., arXiv 2312.08592](https://arxiv.org/pdf/2312.08592) [indep]

### Inferences
- For STEADY, a hybrid looks best. **High-confidence parses auto-commit optimistically** (UI updates in under 400 ms, entry shown with an inline "Undo / Edit" snackbar for roughly 8–10 s). **Low-confidence or high-calorie-impact parses** show a compact confirm card. This applies NN/g's "confirm only outside normal range" logic.
- A ~20% edit rate means editing must be one tap from the logged entry, ideally with inline portion chips rather than a full edit screen.
- Underestimating large portions is the worst failure for a weight-gain persona: logged intake reads low, the user eats more, and the logs and the scale disagree. This argues for showing the assumed portion visibly in the result.

### Gaps
- No published A/B test from any food app comparing auto-log vs confirm-card retention or accuracy.
- No primary NN/g article specifically on optimistic UI or undo toasts was retrieved; the Material Design snackbar page itself was not retrieved.

---

## Q3. Handling ambiguity ("a bowl of curry"): follow-up questions vs default portion guesses vs multiple choice. What does clarification research say about user tolerance?

### Takeaway
Clarifying questions help **only when they are high-quality, specific, and their benefit is obvious to the user**. Generic or poorly timed questions hurt satisfaction. The one food-logging field study to test always-on follow-ups (SnappyMeal) found users wanted to **skip questions for simple foods**, disliked context-insensitive questions, and saw **no measurable accuracy gain**. The evidence favours sensible defaults plus optional, targeted multiple-choice refinement ("adaptive friction") over mandatory Q&A.

### Cited Findings
- **SnappyMeal** (Univ. of Washington, Nov 2025): every new log triggered clarifying questions by default (multi-turn Gemini). In a 3-week deployment (6 completers, 502 logs), questions were rated relevant (3.83/5 for food, 3.83/5 for goals), but users found them context-insensitive ("phrased for photo input" when they had typed). Generic defaults were frustrating to edit, and users asked to skip questions for simple foods like a banana. Question types: portion/quantity 34.3%, food type/detail 31.8%. Number of questions did not correlate with opinion. In a 100-image ablation, **follow-ups alone increased calorie MAE (148.88 → 161.82)**, so there was no conclusive accuracy benefit. Recommendations: modality-aware questions, skipping for simple foods, and **"adaptive friction"** (intervene only when the accuracy gain outweighs the burden). — [SnappyMeal, arXiv 2511.03907](https://arxiv.org/html/2511.03907v1) [indep]
- **Clarification usefulness** (Rahmani et al., 2024, Bing MIMICS data): specific, facet-seeking questions beat generic rephrasing (rephrasing "could consume the user's patience"). **3–5 answer options outperform 2**: the share rated "Good" was 64.6% with 2 options, 74.6% with 3, 83.6% with 4 and 84.8% with 5. Questions covering too many aspects at once are less useful. — [Rahmani et al., arXiv 2402.01934](https://arxiv.org/html/2402.01934v1) [indep]
- Template wording matters: "What would you like to know about [QUERY]?" scored 0.94 "Good"; "What are you trying to do?" scored 0.0. — [same](https://arxiv.org/html/2402.01934v1)
- Zou et al. (ACM TOIS 2023): high-quality clarifying questions improve user performance and satisfaction, while **low- and mid-quality ones are harmful**. Users are more satisfied when they can **foresee the benefit** of answering. — cited via [Rahmani et al.](https://arxiv.org/html/2402.01934v1); [TU Delft record](https://research.tudelft.nl/en/publications/users-meet-clarifying-questions-toward-a-better-understanding-of-)
- Kiesel et al. (SIGIR 2018, "Toward Voice Query Clarification"): users **like being prompted for clarification** in voice search, according to secondary summaries (full text not retrieved). — [MIMICS/Zamani et al., arXiv 2006.00166](https://ar5iv.arxiv.org/html/2006.00166); [Webis anthology](https://ir.webis.de/anthology/people/j/johannes+kiesel/)
- Poorly timed or inappropriate questions can cause significant frustration. — [Empirical Study of Clarifying Question-Based Systems, arXiv 2008.00279](https://arxiv.org/pdf/2008.00279)
- What food apps do instead: MacroFactor uses "commonly associated ingredients" for restaurant meals and gives estimated, adjustable servings; it recommends Photo + Text for complex meals. — [MacroFactor help](https://help.macrofactorapp.com/en/articles/258-ai-food-logging). SnapCalorie: voice is "as accurate as the information you give it". — [SnapCalorie listing](https://apps.apple.com/app/id1574239307). Calorio: brand names or portion sizes "enhance accuracy". — [G2 Calorio](https://www.g2.com/products/calorio/discuss)
- In a Google Play review analysis of Cal AI, one complaint theme was **"excessive questions"**. — [Kimola Cal AI Google Play report](https://kimola.com/reports/unlock-insights-cal-ai-review-analysis-report-google-play-157291) [aggregator]

### Inferences
- Recommended pattern for STEADY: **default-and-disclose**. Log "1 bowl dal makhani (~250 g, 1 katori)" immediately with the assumed portion visible, and offer 3–4 one-tap portion chips (small katori / regular / large / custom). Ask a blocking question only when the calorie spread between plausible interpretations is large (e.g., "curry" could be 150 or 600 kcal) **and** the user's own history doesn't resolve it.
- Use history before asking. If the user logged "dal, 1 katori" 20 times, default to that.
- Phrase any question so the benefit is visible ("Paneer or chicken? Changes protein by ~15 g") and match it to the input modality (no "in the photo" wording for voice).

### Gaps
- No study measuring user tolerance for clarifying questions specifically in voice food logging, or in Indian/Hinglish contexts.
- No data on how often real food utterances are ambiguous enough to warrant a question.

---

## Q4. Multi-meal utterances, logging past meals ("yesterday's dinner"), and time attribution

### Takeaway
LLM parsers already handle multi-item and even whole-day utterances (MFP Voice Log, Healthify Ria), and chat-first apps infer the meal time from the utterance (Welling). MacroFactor dropped meal "buckets" for a 24-hour **timeline** that defaults to "now" and lets users press-and-hold any hour to backfill. Explicit "yesterday" handling is rarely documented. Back-logging is error-prone in older apps (entries landing on "today").

### Cited Findings
- MFP Voice Log extracts "meal context" and supports several foods in one phrase or "a whole day of eating across multiple meals". — [Tribe.ai](https://www.tribe.ai/case-studies/myfitnesspal) [vendor]
- Healthify Ria: users "describe several meals at once", and Ria scans the gallery to suggest **missed meals**. — [TechCrunch, Dec 2025](https://techcrunch.com/2025/12/02/healthify-upgrades-its-ai-assistant-ria-with-real-time-conversation-capabilities)
- Welling: "for dinner I had chicken and a salad" is placed at the right time of day automatically. — [Welling review](https://www.welling.ai/articles/welling-review-chatgpt-for-weight-loss) [vendor-hosted]
- MacroFactor timeline: a 24-hour timeline replaces Breakfast/Lunch/Dinner ("three square meals a day ... is seldom the reality"). Foods default to the current hour. **Press and hold any hour** or choose date/time from the Plate to pre-log or back-log. Timeline 2.0 came out of a 1,400-participant beta. — [MacroFactor: Timeline-Based Food Log](https://macrofactor.com/timeline-based-food-logger/) [vendor]. Cronometer offers a similar timestamped, group-less diary as a paid feature. — [Cronometer forum](https://forums.cronometer.com/discussion/comment/16477/)
- MacroFactor "Photo + Text": photograph a receipt and add context (e.g., ate only half) to **log a meal after the fact**. — [MacroFactor: 10 features, Jul 2026](https://macrofactor.com/10-macrofactor-features/)
- Cal AI user praise: "You don't have to select if it's breakfast or dinner." — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Foodzilla auto-suggests the meal type from time (an ~8 AM entry is suggested as Breakfast). — [Foodzilla help](https://foodzilla.helpscoutdocs.com/article/226-how-to-track-meal-times-in-a-food-diary)
- Back-logging pitfalls: Fitbit users who logged food for a past day found it appeared under "Today". Staff advised switching the date first. — [Fitbit community](https://community.fitbit.com/t5/Android-App/food-log/td-p/1698426)
- Real eating times are irregular. In 21,006 myCircadianClock users, the first eating event shifts by **1 h 31 m** day to day on average and the last by **1 h 53 m**. Only 5.2% had both under 1 hour. The average 95% eating window is 13 h 29 m. — [Tran et al. 2025 (Research Square; peer-reviewed version in Nature Metabolism)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12340925/) [indep]

### Inferences
- STEADY's parser should output, per item: `food, qty, unit, eaten_at (absolute timestamp), meal_label (derived)`. It should resolve relative time ("yesterday's dinner", "subah", "abhi", "kal raat") against the device clock and timezone, and default to "now" when no time is given.
- When an utterance spans several meals or days, show a grouped confirm card ("Yesterday dinner: 2 items · Today breakfast: 1 item"). This is the one case where a confirm step is clearly worth it, because misattribution is invisible and corrupts history.
- Given 1.5–2 h day-to-day timing drift, fixed time windows for meal labels are fragile. Derive labels from the timestamp plus the user's own history.

### Gaps
- No published accuracy data on LLM relative-time resolution in food logging (e.g., "kal raat" misread as "tomorrow night"; in Hindi, "kal" means both yesterday and tomorrow).
- No app documentation found that explicitly describes how "yesterday's dinner" is handled in a voice flow.

---

## Q5. Repeat meals: favourites, recents, "copy yesterday", time-of-day predictions. What share of meals are repeats?

### Takeaway
People eat a small, highly repetitive core: **half of users' logs come from just ~9 unique items**, and **breakfast is by far the most repetitive meal** (~65% item recurrence vs ~24% for dinner). Repetition is also associated with better weight-loss outcomes. Leading apps exploit this with time-of-day "smart history" (MacroFactor, FoodNoms, Nutritionix, Carbon), copy/paste of items or whole days (MacroFactor, Cronometer), and saved meals. Removing copy/paste was a top complaint in MFP's 2026 redesign.

### Cited Findings
**Repetition data**
- myCircadianClock (N = 21,006; 2.66M logs; 14 days): unique items per person rose from 9.7 (day 1) to 50.3 (day 14). **Half of users had 9 unique items making up 50% of their logs**; 21 items made up 75% and 35 items made up 90%. On average 3.85 habitual items per person. The most-logged item averaged 16.2 logs in 14 days. Items ranked below ~22nd were logged only once. **Habitual foods are eaten earlier in the day; novel foods cluster later.** — [Tran et al., "The diversity and consistency of what and when people eat" (2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12340925/) [indep]
- MyFitnessPal diaries (Pai & Sabharwal, Sensors 2022; 1,581 users with ≥28 days): food-item recurrence was **breakfast 0.65, snacks 0.36, lunch 0.28, dinner 0.24**. Exact whole-meal recurrence was much lower (breakfast 0.11, lunch 0.02, dinner 0.01). 93% of users had some breakfast item recurrence vs 58% for dinner. Recurrence was significantly higher on weekdays than weekends. Logging duration showed no significant correlation with recurrence (so app convenience doesn't appear to inflate it). — [Pai & Sabharwal 2022, PMC9002488](https://pmc.ncbi.nlm.nih.gov/articles/PMC9002488/) [indep]
- Drexel/Oregon Research Institute (Health Psychology, Mar 2026; N = 112, 12-week behavioural weight-loss programme, Fitbit logging): participants whose logs were **>50% repeat entries lost ~5.9% of body weight vs 4.3%** for more varied eaters. Each +10 percentage points of high-frequency foods (logged >10 times) was associated with ~1.6% more weight loss. Weight loss dropped ~0.6% per 100-kcal day-to-day swing in intake. Observational. — [APA press release, Mar 2026](https://apa.org/news/press/releases/2026/03/lose-weight-same-meals); [Drexel research record](https://researchdiscovery.drexel.edu/esploro/outputs/journalArticle/Do-routinized-eating-behaviors-support-weight/991022171709404721); [PhillyVoice](https://prod.aws.phillyvoice.com/eating-same-food-repetitive-diet-weight-loss/). One outlet reported 4.9% for the varied group. — [NutritionInsight](https://www.nutritioninsight.com/news/consistent-meals-boost-weight-loss.html). 4.3% is the figure in most coverage.

**How apps exploit repetition**
- MacroFactor learns "your go-to foods at the times you tend to eat them" and surfaces them at those times. It remembers the last serving per food. — [MacroFactor timeline](https://macrofactor.com/timeline-based-food-logger/); [new food logger](https://macrofactor.com/new-food-logger/) [vendor]
- MacroFactor copy/paste: copy one food, several items, or **a whole day**, and paste to any date/time, **including multiple days**. Save a meal as a recipe. "Explode" a recipe to log only the parts eaten. "Log by calories/macros" solves for the amount that fits a target. — [MacroFactor: 10 features, Jul 2026](https://macrofactor.com/10-macrofactor-features/) [vendor]
- FoodNoms "Smart Suggestions": foods recently logged around the same time of day, weighted by recency. — [MacStories: FoodNoms](https://www.macstories.net/?p=61547)
- Nutritionix Track predictive search: "before you even start searching ... suggests food that you typically eat around that time" (2018). — [Nutritionix help](https://help.nutritionix.com/articles/7665-logging-)
- Carbon "Smart Suggestions" appear only after **≥7 active logging days** and only when a **strong repeat pattern** exists for that meal and day. — [Carbon help](https://help.joincarbon.com/en/articles/16242219-smart-suggestions-log-foods-you-eat-often-without-searching)
- There is a patent on "Predictive food logging". — [USPTO 9817559](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9817559)
- Cal AI "can remember meals for easy logging" (user review). — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Complaints when repeat tools break: MFP's 2026 redesign removed individual copy/paste and multi-select/copy-meal shortcuts. — [MyNetDiary Jun 2026](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html); [Fitia MFP alternatives, May 2026](https://fitia.app/learn/article/best-myfitnesspal-alternatives-2026/). A Cronometer search update "breaks recently used lists". — [MyNetDiary Jun 2026](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html)

### Inferences
- For STEADY, repeat-logging is probably a **bigger time saver than voice**. Breakfast and snacks are highly repetitive, so a time-aware "Your usual?" card at the user's typical breakfast time (one tap to log, long-press to tweak) could cover a large share of logs. Gate it like Carbon (≥7 days of data and a strong pattern) to avoid wrong guesses.
- Voice should resolve against personal history first. "Same as yesterday's breakfast", "mera usual nashta" and "the usual" should map to stored patterns before any DB or AI lookup.
- Whole-meal recurrence is low (0.01–0.11) while item recurrence is high. Suggestions should therefore be item-level (or editable bundles), not rigid "saved meals" only.
- The repetition–weight-loss link supports positioning repetition as good ("consistent eaters see better results") rather than nagging for variety.

### Gaps
- No India-specific repetition data (Indian home-cooked diets may be even more repetitive: dal/roti/sabzi).
- No public data from MacroFactor, MFP or Cal AI on what share of logs come from history, favourites or copy vs search, photo or voice.

---

## Q6. Photo vs voice vs text vs barcode: which do users actually use most, and why?

### Takeaway
There is **no public usage-share data** from any major app. Small academic studies point the same way: **photo wins on first impression but loses on sustained use**, text and voice are steadier, and **real users mix modalities** (photos at meals, text for snacks). Voice showed higher engagement in one small trial but was **unused** in another, apparently because of social awkwardness in public. Barcode remains valued for packaged foods but is frequently paywalled.

### Cited Findings
- Silverman, Barasch, Diehl & Zauberman (J. Assoc. for Consumer Research, Oct 2022): consumers are **more likely to adopt photo-based logging** and expect a better experience. But in a week-long field study they found taking photos **harder than writing text**, **logged less of what they ate**, and were **less likely to continue**. — [UDSpace record: "Harder Than You Think"](https://udspace.udel.edu/items/d9c90351-88e3-4540-8267-63a247eeea23/full) [indep]
- SnappyMeal (2025, N = 6, 3 weeks, 502 logs): image and text were preferred equally (3 vs 3). **No participant used audio**, which the authors attribute to public settings and eating while logging. Images clustered at regular meal times, text was used for snacks. Image recognition was a frustration ("Sometimes accurate, 25–50% of the time"). — [SnappyMeal, arXiv 2511.03907](https://arxiv.org/html/2511.03907v1) [indep]
- base2Diet (JMIR Formative Research 2023, N = 18, 28 days, voice vs text arms): distinct logging events per participant were **1.7x higher with voice**, with lower dropout. The authors conclude voice is "more effective and better received", but the sample is very small. — [JMIR Form Res 2023;e46659](https://formative.jmir.org/2023/1/e46659) [indep]
- FoodScrap (DIS 2021, N = 11, 1 week): speech captured richer data (ingredients, reasons for choices). Participants also worried about **re-recording, mental effort, talking in front of others, and privacy**. — [Microsoft Research: FoodScrap](https://www.microsoft.com/en-us/research/?p=744916); [UMD news](https://info.umd.edu/news/foodscrap-promoting-rich-data-capture-and-reflective-food-journaling-through-speech-input/) [indep]
- Cordeiro et al. (CHI 2015): a survey of 141 current/lapsed journalers plus 5,526 forum posts identified **barriers to reliable entry** and **negative nudges** (e.g., tools that make packaged/barcoded foods easier to log than home-cooked ones). — [UW CSE news](https://news.cs.washington.edu/2015/04/16/barriers-and-negative-nudges-uw-cse-research-team-led-by-james-fogarty-co-authors-new-study-of-mobile-food-journaling/); [paper PDF](https://homes.cs.washington.edu/~jfogarty/publications/chi2015-decaf.pdf) [indep]
- User reviews (Jun 2026, 1,379 US reviews across 10 apps): photo logging is repeatedly praised for **speed** (Cal AI, Calo, MacroFactor, BitePal), but reviews report **accuracy failures** (Cal AI, BitePal, FoodPilot, Municorn). **No app's reviews mentioned voice logging at all.** Barcode is valued and its paywalling is resented (MFP, Lose It). — [MyNetDiary scorecard Jun 2026](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html) [competitor]
- MFP moved barcode scanning behind the Premium paywall (late 2022). — [SnapCalorie vs MyFitnessPal (Macaron)](https://macaron.im/de/blog/snapcalorie-vs-myfitnesspal) [aggregator]
- Welling-hosted reviews rate text/voice accuracy (~90–95%) above photo (~80%). — [Welling review](https://www.welling.ai/articles/welling-app-review-ai-calorie-tracker-truth) [vendor-hosted]

### Inferences
- "Voice-first" should not mean "voice-only". Expect STEADY users to say meals at home or in the car, type in meetings or on the metro, and photograph restaurant plates. Typing must be equally fast from the same entry point (e.g., mic button with a text field one tap away, or long-press for camera).
- For an Indian office-goer, speaking aloud in an open office or on public transport is a real barrier. Text fallback and repeat-meal cards cover those moments.
- Photo's "adoption high, retention low" pattern suggests not leading onboarding with photo magic. Lead with the habit loop (repeat + voice).

### Gaps
- No usage-share data from MFP, Lose It, MacroFactor, Cal AI or Healthify by modality.
- No India-specific modality preference data.

---

## Q7. Multilingual and code-mixed (Hinglish) speech recognition quality: Whisper, gpt-4o-transcribe, Deepgram, Google Chirp, Sarvam, AI4Bharat

### Takeaway
On Indian conversational Hindi, **Indian-specialist and Google models lead, and OpenAI's gpt-4o-transcribe ranks last**. On the April 2026 Voice of India benchmark (AI4Bharat + IIT Madras, telephonic conversational speech), Hindi OI-WER was **Sarvam Audio 5.0%, Gemini 3 Pro 6.0%, Saarika 2.5 6.2% ... Deepgram Nova-3 13.0%, GPT-4o Mini Transcribe 19.6%, GPT-4o Transcribe 34.0%**. Whisper-large-v3 is far worse than specialists on code-switched sets (~30–34% WER vs ~8–16%). Code-mixed results vary a lot by dataset, and food-name recognition has not been benchmarked by anyone.

### Cited Findings
- **Voice of India benchmark** (Josh Talks with AI4Bharat and IIT Madras, Apr 2026): 15 Indic languages, 36,691 speakers, 536 h of unscripted telephonic conversation. The metric is OI-WER, which credits valid spelling, code-mix, script and numeral variants. **Hindi OI-WER**: Sarvam Audio 5.0, Gemini 3 Pro 6.0, Saarika 2.5 6.2, Amazon Transcribe 6.8, ElevenLabs Scribe v2 7.7, AI4Bharat IndicConformer 8.2, Gemini 3 Flash 8.3, Gemma E4B 11.2, Microsoft STT 11.4, **Deepgram Nova-3 13.0**, OmniASR 7B 13.7, AssemblyAI 19.3, **GPT-4o Mini Transcribe 19.6, GPT-4o Transcribe 34.0**. GPT-4o Transcribe scored 64.2 on Tamil and 97.0 on Malayalam. No separate Hinglish aggregate. Caveats: some internal inconsistencies (text says 16 models, table lists 15), and the core set is private. — [Voice of India (Josh Talks AI research blog)](https://voiceofindiablogs.ai.joshtalks.com/) [indep-ish: academic partners, but Josh Talks sells speech data]
- **Trelis "Tara"** (2026), with commercial results measured by the authors using a matra-preserving normaliser. Hinglish/code-switched WER: **CoSHE-500** (conversational) Tara 14.41 / Sarvam Saaras-v3 11.25 / ElevenLabs Scribe-v2 12.40; **CS-FLEURS hi-en** (read) 8.37 / 16.47 / 7.57; HiACC adult 12.93 / 13.16 / 12.87. Hindi Vistaar mean 12.06 / 12.32 / 13.79. The page notes the default Whisper normaliser "strips matras and inflates Devanagari WER". — [Trelis Tara model card](https://huggingface.co/Trelis/tara) [vendor, open eval code]
- Whisper-large-v3 on the same code-switched sets: **29.74 (CoSHE-500), 33.92 (cs-fleurs)**; FLEURS-hi 27.50. — [Trelis whisper-hinglish-preview](https://friendli.ai/models/Trelis/whisper-hinglish-preview) [vendor]. ElevenLabs cites Whisper Large v3 at 33.3% WER on FLEURS Hindi. — [ElevenLabs Hindi STT](https://elevenlabs.io/speech-to-text/hindi) [vendor]
- **Sarvam Saaras v3** (page updated May 2026): 19.31% WER on IndicVoices across 10 languages (v2: 22%). Vendor claims it beats GPT-4o Transcribe, Gemini 3 Pro, Deepgram Nova-3 and Scribe v2, without per-model numbers. One model handles **Hinglish/Tanglish/Benglish** with output modes Transcribe (native script), **Codemix** (native script with English words in Latin), **Transliteration** (romanized), Translate (to English). 22 Indian languages plus Indian English. <150 ms time-to-first-token in fast mode. REST for clips under 30 s. **₹1.5/min**. — [Sarvam Speech-to-Text](https://www.sarvam.ai/speech-to-text); [Sarvam docs: Saaras](https://docs.sarvam.ai/api/models/saaras) [vendor]. Saarika v2.5 is being deprecated in favour of Saaras v3. — [Sarvam docs: Saarika](https://docs.sarvam.ai/api/models/saarika)
- **Ringg benchmark** (normalised WER, Hindi sets): ElevenLabs 8.94, Sarvam 9.76, Deepgram 12.36. — [Ringg STT](https://www.ringg.ai/models/speech-to-text/v1) [vendor]
- **AI4Bharat IndicWhisper / Vistaar** (2023): 59 benchmarks across 12 languages. IndicWhisper had the lowest WER on 39 of 59, with an **average Hindi WER of 13.6**. Google STT averaged 23.9 across benchmarks (59.9 on GramVaani telephony). — [Vistaar, arXiv 2305.15386](https://arxiv.org/pdf/2305.15386); [GitHub AI4Bharat/vistaar](https://github.com/AI4Bharat/vistaar) [indep]
- **Google Chirp 3** on the Vaani Hindi benchmark (2026): best on background-noise speech. On **code-switched tokens Chirp 3 degrades only 2.6 points (10.2% → 12.8%)**, vs 15.6 points for Shrutam-HindiASR (12.8% → 28.3%). Whisper-large-v3 had substantially higher WER. — [Vaani Benchmark V1.0, arXiv 2606.21408](https://arxiv.org/pdf/2606.21408) [indep]
- Deepgram: Nova-3 supports **keyterm prompting** (up to 100 terms) for monolingual and multilingual transcription. Hindi exists on Deepgram's Enhanced tier. No official confirmation was found that keyterm prompting improves Hindi. — [Deepgram docs: Keyterm](https://developers.deepgram.com/docs/keyterm); [Deepgram changelog: Hindi](https://developers.deepgram.com/changelog/2022/11/23)
- Deepgram itself argues plain WER fails for Indian languages (script/transliteration variants). — [Deepgram: Why WER fails Indian languages](https://deepgram.com/learn/why-wer-fails-indian-languages-bridge-7-metric-framework)
- An OpenAI community thread could not reproduce OpenAI's published FLEURS numbers for gpt-4o-transcribe (results 0.4–0.6 pts worse; normalisation suspected). — [OpenAI community](https://community.openai.com/t/reproducing-gpt-4o-transcribe-fleurs-results/1151187)
- Healthify ships Hinglish live voice on OpenAI models. — [TechCrunch Dec 2025](https://techcrunch.com/2025/12/02/healthify-upgrades-its-ai-assistant-ria-with-real-time-conversation-capabilities). SnappyMeal sends raw audio straight to **Gemini 2.5 Flash** (no separate ASR step). — [SnappyMeal](https://arxiv.org/html/2511.03907v1)

### Inferences
- STEADY's stack uses OpenAI. If voice runs through gpt-4o-transcribe, Voice of India suggests it may be the **weakest option for Indian conversational Hindi** (34% OI-WER vs 5–8% for Sarvam/Gemini). Test this on STEADY's own eval harness with real Hinglish food utterances before committing. The benchmark is telephony audio, which is harder than phone-mic audio, but the gap is large.
- For food logging, the transcript only needs to feed an LLM parser, not be perfect text. Two architectures worth A/B testing: (a) Sarvam Saaras v3 in **Codemix or Transliteration** mode, then the LLM parser; (b) audio-native multimodal LLM (Gemini Flash / gpt-4o audio input) that goes straight to structured JSON, skipping a separate ASR error surface.
- Food-name biasing matters most. Words like "rajma", "poha", "chole", "paneer bhurji", "katori", "ek plate" are the high-value tokens. Use keyterm/vocabulary biasing where supported, seeded from the user's own history plus a top-N Indian food lexicon (STEADY already has INDB/IFCT seeded).
- Always show the transcript (or the parsed items) so users can see and fix an ASR error, as SnapCal does with editable recognized text.

### Gaps
- **No benchmark of food-name recognition** for any ASR engine in Hindi/Hinglish or English. STEADY will need its own test set.
- No independent Hinglish aggregate covering gpt-4o-transcribe, Deepgram and Chirp on the same dataset.
- No published Hindi number for gpt-4o-transcribe on FLEURS from OpenAI itself.
- Sarvam's v3-vs-competitor claims have no per-model numbers on its own page.

---

## Q8. Journal/history: what do leading apps show for a past day, week and month, what do users praise or complain about, and should weight/water/workouts/sleep/notes live there?

### Takeaway
History UX falls into three patterns: (1) **day diary with date navigation** (MFP, Cronometer, Lose It; a calendar picker to jump to a date); (2) **averages and trends over ranges** (Cronometer Nutrition Report & Trends, MacroFactor daily/weekly/monthly/yearly averages, nutrient "contributors", energy balance vs expenditure); (3) **calendar of completion markers** (Apple Fitness ring calendar, Cronometer Gold's green-shaded calendar). Complaints centre on slow or laggy history, paywalled ranges, and diaries no longer visible at a glance. Users and apps routinely put weight and biometrics alongside food.

### Cited Findings
**Cronometer**
- Past days: on mobile, use the arrows beside the date or tap the date to open a **calendar**, then view or add foods and **biometrics** for that day. A calendar shading days by status (light green = has data, **dark green = marked complete**) is a Gold feature on web. — [Cronometer forum: view previous day](https://forums.cronometer.com/discussion/994/how-do-i-view-what-i-ate-on-a-previous-day); [calendar thread](https://forums.cronometer.com/discussion/4631/is-it-possible-to-get-a-calendar-view-visualisation-of-all-the-times-i-consumed-a-particular-food-it)
- **Nutrition Report** shows average daily nutrition over a range. Basic users are limited to the past week; Gold gets custom ranges. Users can exclude today (partial days drag averages down) and filter to All / Non-Empty / **Complete Days**. **Trends charts** plot food breakdown, weight and individual nutrients over time. — [Cronometer support: Nutrition Report](https://support.cronometer.com/hc/en-us/articles/360019864891); [Trends date range thread](https://forums.cronometer.com/discussion/3022/how-to-set-up-the-date-range-in-trends-to-track-how-much-fat-i-am-eating-today-only)
- A user wanted a calendar of every day they ate a specific food; this isn't built in. — [Cronometer forum](https://forums.cronometer.com/discussion/4631/is-it-possible-to-get-a-calendar-view-visualisation-of-all-the-times-i-consumed-a-particular-food-it)

**MacroFactor**
- Dashboard "Nutrition & Targets" shows daily intake vs targets plus **the week's totals**, and lets users view previous and future days. The Expenditure widget charts the estimated TDEE over time. **Energy Balance** compares intake vs expenditure over the last 30 days. Chart ranges are customisable for Expenditure, Weight Trend, Goal Progress, Scale Weight and Nutrition. — [MacroFactor help: Get to know your dashboard](https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard); [Dashboard revamp](https://macrofactor.com/dashboard-revamp/) [vendor]
- Nutrient Explorer (v2.2.1, 2023): **daily, weekly, monthly, yearly** calorie/macro/micro averages, the **top 3 contributor foods** per nutrient, and micronutrients pinnable to the dashboard. "Nutrition Contributors" works over a past week or month. — [MacroFactor: Nutrient Explorer](https://macrofactor.com/micronutrients-nutrient-explorer/); [10 features, Jul 2026](https://macrofactor.com/10-macrofactor-features/) [vendor]
- Reviews: praised for fast logging and clean interface (Jun 2026 rating 4.47, highest of 10 apps). — [MyNetDiary scorecard](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html)

**MyFitnessPal**
- The spring 2026 "Today" redesign replaced the classic Diary. Complaints: "the daily diary is no longer visible at a glance", "per-meal macro breakdowns are harder to find", "food diary no longer displays calories per meal at a glance", more taps, lost copy/paste. MFP reportedly called the new UI "the path forward" with no revert. These quotes come from search-result summaries across these sources. The per-meal-macros and no-revert claims trace mainly to [mwm.ai (now 410)](https://mwm.ai/articles/myfitnesspal-v26-16-0-replaces-diary-with-new-ui-sparking-rating-drop-in-april-2026). — [MyNetDiary Jun 2026](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html); [Fitia, May 2026](https://fitia.app/learn/article/best-myfitnesspal-alternatives-2026/); [Unstar review analysis, Jul 2026](https://unstar.app/blog/is-myfitnesspal-premium-worth-it-paywall-app-reviews-2026) [competitor/aggregator]

**Cal AI**
- Progress tab: current weight, weight change, progress over time, **average calorie intake**. No timeline or time-based log. The daily log shows recently uploaded foods. PDF exports of history repeatedly failed in testing. — [MacroFactor vs Cal AI](https://macrofactor.com/macrofactor-vs-cal-ai/) [competitor]
- Users complain Cal AI fails to write data to Apple Health. — [MyNetDiary Jun 2026](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html)

**Lose It!**
- Historically: a daily calorie-budget bar graph that highlights overages, and a **weekly** view of consumption to see whether you have "a few extra calories to treat yourself" (weekly-budget framing). — [Health Advocate review 2014](https://blog.healthadvocate.com/2014/01/wellness-app-review-lose-it/); [Grand Forks Herald](https://www.grandforksherald.com/lifestyle/appsnap-lose-it-pushes-you-toward-your-ideal-weight) (old sources; current UI unverified)
- 2026 complaint: **lag when browsing history**. — [MyNetDiary Jun 2026](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html)

**MyNetDiary**: users request seeing **the full day on one screen**. — [MyNetDiary Jun 2026](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html)

**Apple Fitness / Health**
- Fitness app: tap the Activity ring, then the Calendar icon to see **all rings in a monthly calendar**. Weekly/monthly views. Tapping a day opens its breakdown. A small green dot marks workout days. Health app shows Week/Month/Year **bar charts** instead of rings. — [iDownloadBlog](https://www.idownloadblog.com/2016/10/27/how-to-look-back-at-your-weekly-move-goals-progress-in-the-activity-app/); [MacStories: iOS 14 Fitness](https://www.macstories.net/stories/the-new-fitness-app-in-ios-14/); [Cult of Mac](https://www.cultofmac.com/how-to/hidden-activity-app-features) (older guides; UI may have changed)

**Other data in the journal**
- Cronometer lets users add **biometrics** (weight etc.) to past days alongside food; Trends chart weight with nutrients. — [Cronometer forum](https://forums.cronometer.com/discussion/994/how-do-i-view-what-i-ate-on-a-previous-day); [Cronometer Trends](https://forums.cronometer.com/discussion/3022/how-to-set-up-the-date-range-in-trends-to-track-how-much-fat-i-am-eating-today-only)
- MacroFactor co-locates weight trend, scale weight and expenditure with nutrition. — [MacroFactor dashboard help](https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard)
- Welling's chat log and Cal AI's step meter/workouts put activity next to food. — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- FoodScrap research: richer context (mood, environment, reasons) captured by voice "foster[s] self-reflection". This supports optional notes in a journal. — [FoodScrap](https://library.selfresearch.org/research/foodscrap-promoting-rich-data-capture-and-reflective-food-journaling-through-speech-input/)

### Inferences
- For STEADY's journal: (a) **month view = calendar of mini-rings** (Apple-style), coloured by goal-aware state (hit protein / under / over), plus a dot for weigh-ins. (b) **Week view = 7 bars + weekly average vs target**. Weekly averages matter more than single days for a gainer and calm "missed a day" anxiety. (c) **Day view = time-ordered timeline** (MacroFactor-style), with the full day visible on one screen and per-meal totals, the specific things MFP users complained about losing.
- Put weight trend, workouts and optional notes/mood on the day page, but keep food totals as the hero. Users explicitly want "the full day on one screen".
- History must load instantly (local cache). "Lag when browsing history" is a live complaint against Lose It.
- Averages should exclude today and empty/incomplete days by default (Cronometer's lesson), or the weekly average will understate intake and push a gainer to overeat.

### Gaps
- Could not verify current Yazio or Google Fit / Health Connect history views. No official docs surfaced.
- No current (2026) official description of Lose It's weekly view.
- No quantitative data on how often users open past days vs today.

---

## Q9. Editing history: do apps lock past entries? Implications for streaks

### Takeaway
No major app hard-locks past days by default; back-filling is universally allowed. **Cronometer** offers an optional, reversible **"Mark Day Complete"** that locks a day and cleans up trend averages. Streaks are where apps diverge. **Cronometer counts only same-day logging** ("logging items retroactively will not contribute to your streak"); **Cal AI sells a $0.99 "Streak Restore"**; Apple doesn't update rings or streaks when past Health data is edited. Users complain about streaks breaking after illness or backfilling and ask for "flexible streaks".

### Cited Findings
- Cronometer: "Mark Day Complete" **locks the day against changes until unmarked**. It also lets reports filter to complete days and avoids skewed Trends. Empty days can be marked complete for fasting. To import Apple Health data into a completed day you must unmark it, import, and re-mark. — [Cronometer forum: purpose of Mark Day Complete](https://forums.cronometer.com/discussion/comment/21511); [sync only completed day](https://forums.cronometer.com/discussion/3911/how-to-synchronize-only-completed-day)
- Cronometer streaks: "consecutive days of logging items to your diary". You must log **day-of**; retroactive logging and imported exercises/metrics don't count. A "Reset Streak" toggle exists, but there is no documented freeze or grace day. — [Cronometer support: Streaks](https://support.cronometer.com/hc/en-us/articles/16510001783956) (page summary via search; direct fetch blocked); [Cronometer blog: Streaks](https://cronometer.com/blog/new-feature-streaks)
- Users: after a hospital stay, "logging the day after broke the streak and there is no way to adjust that". Requests for streaks that "should not require a log in every day". — [Cronometer forum: Streaks](https://forums.cronometer.com/discussion/5792/streaks); [Flexible Streaks](https://forums.cronometer.com/discussion/6516/flexible-streaks)
- Cal AI sells "Streak Restore" ($0.99 IAP), so streak repair is monetised. — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Apple: editing a past day in the Health app **won't update rings or streak**. — [Apple Support Communities](https://discussions-jp-prz.apple.com/thread/251340148)
- Nutrium: streak breaks if more than 24 hours pass without logging. — [Nutrium help](https://help.nutrium.com/en/articles/13005165-how-does-the-food-diary-page-work)
- Similar apps use non-punitive tone: CalTracker uses a flame streak with milestones and avoids red warnings when over goal (a proxy for the Cal AI-style genre). — [CalTracker App Store](https://apps.apple.com/py/app/caltracker-ai-calorie-tracker/id6745227182)
- MacroFactor encourages backfilling: copy/paste a day to "catch up when you mostly ate the same foods", and receipt photos to log after the fact. — [MacroFactor 10 features](https://macrofactor.com/10-macrofactor-features/)
- Cronometer's report options (exclude today, complete days only) exist because partial or empty days distort averages. — [Cronometer Nutrition Report](https://support.cronometer.com/hc/en-us/articles/360019864891)

### Inferences
- STEADY should **allow editing any past day** (needed for accuracy and the AI coach) but **decouple the streak from the edit**. Count a streak day when something was logged on that calendar day, or within a grace window such as before noon the next day for "yesterday's dinner". Late backfills should still improve data and weekly averages without "earning" a streak, which preserves streak integrity.
- Offer a non-punitive mechanism (e.g., 1 free "rest day" per week, or a weekly consistency goal like 5 of 7 days) instead of selling streak repair. A monetised restore conflicts with STEADY's v1 "no monetization" scope and can feel exploitative.
- An optional "Day complete" marker (auto-suggested at night: "Done for today?") gives clean data for averages and the coach, and doubles as the daily closure moment, without hard-locking.

### Gaps
- MFP's current streak/login-counter rules and whether "Complete this entry" locks a day could not be verified from official sources.
- No research found on whether lenient vs strict streak rules affect long-term retention in food logging specifically.
- MacroFactor's, Lose It's and Yazio's streak/backfill rules not found.
