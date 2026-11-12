# Cal AI ("Cal AI - Calorie Tracker"): teardown and lessons for STEADY

*Researched 2026-11-11. Store data and review feeds were pulled live that day.*

Throughout these notes, **vendor claims** (Cal AI, MyFitnessPal and their store listings) are kept separate from **independent evidence** (the NIH study, journalists, store reviews), and competitor-run blogs are flagged as such.

Review quotes are verbatim from Apple's public review RSS feeds: [US](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json), [GB](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json), [CA](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json), [AU](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json), [IN](https://itunes.apple.com/in/rss/customerreviews/id=6480417616/sortBy=mostRecent/json). Pages 1 to 5 were read, with `/page=N/` inserted before `/id=`. Each quote is tagged with storefront, stars, date and app version.

---

## Company and scale (founders, launch, downloads, revenue, ratings, ownership)

### Takeaway
Cal AI went from a teen side project, launched April 2024, to a reported $30M+ annual-revenue app with 15M+ downloads in under two years. The revenue and download figures are MyFitnessPal's, not audited. MyFitnessPal (MFP) bought it in a deal that closed December 2025 and was announced March 2026. It still runs as a standalone app.

Since then it has been pulled from the App Store once, in April 2026, over deceptive billing design, and hit by an alleged 3M-user data breach in March 2026. Its founder-CEO left MFP in June 2026. Store ratings remain very high: 4.8★ from 375K ratings in the US App Store, 4.5★ from 272K reviews on US Google Play.

### Cited Findings

**Founders and early claims**
- **Founders (TechCrunch, 2025-03-16):**
  - Zach Yadegari (18, co-founder) and Henry Langmack (18, co-founder), both high-school students at the time.
  - Blake Anderson (24, co-founder), who previously built the ChatGPT-based apps RizzGPT and Umax.
  - Jake Castillo (28, COO, runs influencer marketing).
  - Team: 8 full-time employees.
  - [TechCrunch 2025-03-16](https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/)
- **Early traction, founder claims that TechCrunch "couldn't validate":** 5M+ downloads in about 8 months, retention above 30% (paraphrased), and $2M+ revenue in the prior month. — [TechCrunch 2025-03-16](https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/)
- **Store stats in March 2025:** App Store 4.8★ from about 66K reviews; Google Play 1M+ downloads, 4.8★, about 75K reviews. — [TechCrunch 2025-03-16](https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/)
- **Launch date:** The App Store lists a first release of 2024-04-08. A Founderpath interview page says it launched in May 2024. — [iTunes Lookup API, US](https://itunes.apple.com/lookup?id=6480417616&country=us); [Founderpath](https://founderpath.com/resources/zach-yadegari-cal-ai-onboarding-tests-and-influencer-marketing)
- **Legal entities:** The iOS seller is "Viral Development LLC". The Google Play developer is "Cal AI, Inc." The privacy policy gives an HQ at 100 Congress Ave, Suite 400, Austin, TX. — [iTunes Lookup US](https://itunes.apple.com/lookup?id=6480417616&country=us); [Google Play US](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US&gl=US); [Privacy policy](https://www.calai.app/privacy)

**Acquisition and team changes**
- **Acquisition (TechCrunch, 2026-03-02):**
  - MyFitnessPal acquired Cal AI. The deal closed in December 2025 after talks lasting "almost a year". The price was not disclosed.
  - MFP says Cal AI had 15M+ downloads and $30M+ annual revenue in under 2 years.
  - All 7 employees and the contractors were retained. Cal AI stays a separate app.
  - Cal AI is now integrated with MFP's nutrition database (paraphrased), which holds about 20M foods, 68,500 brands and 380+ restaurant chains.
  - [TechCrunch 2026-03-02](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)
- **MFP's positioning of Cal AI:** CEO Mike Fisher: "Cal AI is for those preferring speed over accuracy." Also: "We realized that there is an audience of people that want it fast, they want AI based." — [TechCrunch 2026-03-02](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)
- **Founder departure:** Yadegari left the acquiring company in June 2026 and raised $10M (led by Vine Ventures) for Persona, an AI-assistant wearable startup. — [TechCrunch 2026-10-08](https://techcrunch.com/2026/10/08/cal-ais-19-year-old-founder-just-raised-10m-for-his-new-ai-startup/)

**Revenue figures beyond MFP's**
- Aggregator and secondary figures, low reliability and conflicting:
  - Latka lists $35M for 2025 and $40M as of March 2026. — [Latka](https://getlatka.com/companies/calai.app)
  - Superframeworks claims January 2026 alone reached $5.7M. — [Superframeworks](https://superframeworks.com/case-study/cal-ai)
  - A Founderpath speaker card lists "$35M" company revenue with no timeframe. — [Founderpath](https://founderpath.com/resources/zach-yadegari-cal-ai-onboarding-tests-and-influencer-marketing)
  - ScreensDesign estimates about $1.8M to $2M a month and about 500K to 550K installs a month. — [ScreensDesign](https://screensdesign.com/showcase/cal-ai-calorie-tracker)
- **Founder-reported revenue ramp** (Yadegari at TechCrunch Disrupt 2026, reported 2026-10-22): about $30K in month 1, more than $100K in month 2, more than $300K in month 3, $500K in month 4, $1M by month 6. Paid spend later moved monthly revenue from $2M to $4M. — [Net Influencer](https://www.netinfluencer.com/cal-ai-founder-zach-yadegari-breaks-down-the-influencer-playbook-behind-his-apps-growth/)

**Ratings and store data as of 2026-11-11**
- **App Store US:** 4.80 from 374,781 ratings. The web page shows "375K Ratings · 4.8 · Chart #6 Health & Fitness · iPhone, Apple Watch". — [iTunes Lookup US](https://itunes.apple.com/lookup?id=6480417616&country=us); [App Store US](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- **App Store India:** 4.66 from 13,668 ratings. — [iTunes Lookup IN](https://itunes.apple.com/lookup?id=6480417616&country=in)
- **Google Play:** US 4.5★ from 272K reviews; India 4.4★ from 2.72 lakh (272K) reviews. Updated 2026-11-07. The download badge shows "1M+", which looks stale against 272K reviews and MFP's 15M total; not resolved. — [Play US](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US&gl=US); [Play IN](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_IN&gl=IN)
- **Current version and cadence:** 26.45.0, released 2026-11-10. Versions are now calendar-week numbered (26.38 on Sep 22 through 26.45 on Nov 10), so releases are weekly. Every release note reads "Improvements and tweaks to help you build and be your best". Minimum iOS 18.0; app size 335 MB. — [App Store US](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)

**Incidents**
- **App Store removal, mid-April 2026; reinstated about 4 days later.** Apple said Cal AI:
  - routed purchases through a Stripe flow without the required in-app purchase;
  - showed the weekly-calculated price more prominently than the amount actually billed;
  - used a free-trial toggle that did not make auto-renewal clear;
  - pushed users who declined into a second, different subscription flow.
  - [MacRumors 2026-04-21](https://www.macrumors.com/2026/04/21/apple-cal-ai-app-store-removal/); [9to5Mac 2026-04-21](https://9to5mac.com/2026/04/21/popular-calorie-tracker-briefly-pulled-from-app-store-over-iap-and-billing-violations/)
- **Alleged breach, 2026-03-09:**
  - Claimed on BreachForums by "vibecodelegend": 12 GB covering more than 3M users and about 2.8M unique emails.
  - Alleged fields: date of birth, name, gender, height and weight, PINs, subscription details, meal logs including eating times.
  - SC World, relaying Cybernews, says the source was a misconfigured Google Firebase instance.
  - Not independently verified; Cal AI had not responded.
  - [Hackread 2026-03-10](https://hackread.com/cal-ai-myfitnesspal-data-breach-3m-users/); [SC World](https://www.scworld.com/brief/over-3m-allegedly-impacted-by-cal-ai-app-breach)

### Inferences
- Two independent signals put Cal AI near the top of US Health & Fitness: #6 on the App Store chart and 375K ratings. Commercially it is the reference competitor for AI-photo tracking. MFP owning it means Cal AI now leans on MFP's large, US-centric branded and restaurant database.
- Since mid-2026 the product has had no founder-CEO, weekly opaque releases and recurring trust incidents (billing, breach). That is a window for a competitor to win on trust and consistency.

### Gaps
- Retention figures beyond the March 2025 "above 30%" claim (no definition, unverified) were not found.
- No audited revenue figure exists, and the deal price is undisclosed.
- Total Android downloads are unclear: Play's "1M+" badge conflicts with the other data.
- Who runs Cal AI inside MFP after June 2026 was not found.

---

## Logging flows (photo, barcode, label, describe, voice, search, saved foods; taps, confirmation, edits)

### Takeaway
Cal AI is camera-first: one "+" leads to a camera with three modes (Scan Food, Barcode, Food Label), plus a food-database search with Voice Log, Manual Add, and Saved foods. Users describe a scan as 2 to 3 taps.

Results appear as an ingredient breakdown with a health score, a "Fix Issue" box for natural-language corrections, and "Done". Scanning appears to add the item to today's log immediately rather than asking for confirmation first. Most friction is in correcting results and re-logging repeat foods. Voice exists but is secondary, and some users can't find it.

### Cited Findings

**Entry points**
- **Vendor framing:** "Snap a photo, scan a barcode, or describe your meal". "You can also add your own foods and recipes". — [calai.app](https://www.calai.app/)
- **"+" menu:** an action modal with a "Scan food" button and a grid of quick actions for food and exercise. Options include:
  - Food database search, e.g. "Caesar", with a confirmation bar.
  - Saved foods, with "My meals" and "My foods" tabs and a "Create meal" button.
  - Manual Add.
  - A "Voice Log" button inside food search, which needs microphone and speech-recognition permission.
  - Exercise logging: Run, Weight lifting, Describe, Manual, then intensity and duration.
  - [ScreensDesign UX flow, 147 screens; some screenshots dated April 2026](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- **Camera:** three modes (Scan Food, Barcode, Food Label) sit in one camera surface. Voice input appears at 12:25 of the walkthrough video. — [ScreensDesign showcase](https://screensdesign.com/showcase/cal-ai-calorie-tracker)

**Result screen and edits**
- **Result screen:** calories, a macro breakdown, a health score (e.g. 8/10), and an ingredient list with per-ingredient calories and portions. Then a feedback card plus "Fix Issue" and "Done" buttons, and a correction form with a text box for AI feedback and an "Update" button. An info modal explains that AI-generated ingredients are hidden for accuracy (paraphrased by the page summary). — [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- **Editing:** correcting a misidentified item "takes several steps" (06:25 to 06:48 of the walkthrough). — [ScreensDesign showcase](https://screensdesign.com/showcase/cal-ai-calorie-tracker)
- **Confirmation before saving: apparently none for scans.**
  - A Google Play reviewer (2★, 2026-02-13): "You also cannot scan a food without adding it to your daily calorie count, so if you only want to add something for later use…" — [Play US](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US&gl=US)
  - Database search, by contrast, shows a confirmation bar. — [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- **Fix Issue in practice** ([US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json); [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)):
  - A correction to one field can silently change others: "I'll say something like 'it's not 280 calories, it's 250' and then it will update it but … the protein count was correct and it was 10 grams, all of a sudden it will be 7 grams!" (US 1★, 2026-09-22, v26.38.0)
  - "Attempting to use the fix issue button seems to confuse things further and I end up having to delete the entry and start again." (GB 2★, 2026-09-25)
  - Praise: "If you feel like you need to adjust for something, there is a fix issue button. It's amazing how sometimes it will pick out the most miniscule things in say a salad" (US 5★, 2026-11-09)
- **Portion and serving edits are clumsy:**
  - "some places you can enter fractions and others only while numbers. The same with servicing sizes - sometimes grams, sometimes only a portion." (GB 2★, 2025-04-06) — [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
  - "Even after inputing manually, then you try to modify the portions, it resets everything" (AU 3★, 2026-08-26) — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Barcode serving-versus-package error:** "I scanned a package of ground beef and it input the serving size macros instead of the full package so i have to go in and fix it" (US 1★, 2026-11-03). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Repeat foods and organisation**
- **Repeat foods are a sore point** despite the Play listing's "Food Memory: Your food diary remembers your frequent meals" ([Play US](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US&gl=US)):
  - "the same coffee with milk and every morning I have to scroll through to find it. It should be the top two things Cal AI please learn me." (US 3★, 2026-11-04)
  - "my recently scanned barcodes don't appear in the recently logged food… I end up having to photo my yogurt pot every day despite the fact it's identical every time" (GB 4★, 2026-07-12)
  - [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json); [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **No meal categories:** "Why wouldn't it let you categorize your food by breakfast, lunch and dinner." (CA 1★, 2026-10-13). Another reviewer asks for the ability to "group together ingredients/ items for each meal" (GB 4★, 2026-09-11). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json); [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Voice**
- **Voice is real but secondary:**
  - The privacy policy (effective 2026-05-21) mentions food logged "via voice and image logging". — [Privacy policy](https://www.calai.app/privacy)
  - A 2025 review complains the empty-meal button was "replaced … with 'log with voice'" (CA 1★, 2025-05-04). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
  - A 2026 reviewer says "one is no voice recording" (US 2★, 2026-10-13). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
  - Competitor blogs claim Cal AI has no voice logging, which conflicts with the evidence above. — [Nutrola](https://nutrola.app/en/blog/nutrola-vs-cal-ai-on-apple-watch)

**Speed and taps**
- **Vendor claims:** "AFTER: 3-second photo, accurate calorie count" ([Play US](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US&gl=US)). Cal AI's blog claims results "in under 15 seconds", as summarised by RaftLabs, a third-party teardown dated 2026-08-30 ([RaftLabs](https://www.raftlabs.com/blog/cal-ai-product-teardown)).
- **Users:** "it can be done with 2-3 taps MAXIMUM as opposed to spending several minutes when using apps like MyFitnessPal" (AU 5★, 2025-10-10). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Android outside the US is slow** (Google Play India, 3★, 2026-11-02): "very slow specially outside US even with VPN. I even pay for the premium features and I have to wait in between 3 to 5 minutes just to accurately log a meal, and searching a meal or product can take 1-2 minutes… what phone do I use? a S26 ultra". — [Play IN](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_IN&gl=IN)

**Widgets**
- Home and lock-screen widgets show "calories left" (CA 5★, 2025-05-22).
- The widget's "scan barcode" opens the general camera, so users have to tap "scan barcode" again (CA 2★, 2026-02-21).
- [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

### Inferences
- The fast path is fast only when the first answer is right. When it is wrong, the correction loop is several steps, sometimes changes the wrong field, or ends in deleting and re-logging. That erases the time saving, which the Lifehacker reviewer also concluded (see the accuracy section).
- Logging without confirmation, combined with variable AI output, plausibly drives the "delete and start again" pattern. A one-glance confirm, or an undo toast, with stable numbers would be strictly better.
- Voice is buried inside food search rather than being a first-class capture mode. STEADY's plan to make voice equal to photo would be a real differentiator.

### Gaps
- No primary measurement of taps or seconds per log was found; the figures are vendor claims and anecdotes.
- Whether any "portion slider" exists was not confirmed. Sources describe per-ingredient portions and servings fields, but no slider.
- The help centre was not found or indexed, so official flow documentation is missing.

---

## Technology (AI models, food database vs model-generated numbers, portion estimation)

### Takeaway
Publicly, Cal AI says only that it uses "AI" plus "your phone's depth sensor". In 2025 the founders told TechCrunch they used Anthropic and OpenAI models with retrieval-augmented generation (RAG) over open-source food data. After the acquisition, Cal AI was integrated with MyFitnessPal's 20M-food database.

Nothing public says whether numbers come from database rows or from the model, and the privacy policy names no AI sub-processors. The depth-sensor claim is unverified: LiDAR exists only on iPhone Pro models, and the Android app has no such path.

### Cited Findings
- **Models, from the founders in 2025:**
  - Cal AI uses models from Anthropic and OpenAI plus RAG to improve accuracy (paraphrased).
  - It is trained on open-source food calorie and image databases, such as those on GitHub.
  - Yadegari: "We have found that different models are better with different foods."
  - [TechCrunch 2025-03-16](https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/)
- **Database after the acquisition:** Cal AI is now integrated with MFP's nutrition database (paraphrased) (about 20M foods, 68,500 brands, 380+ restaurant chains). — [TechCrunch 2026-03-02](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)
- **Vendor portion claim:** "your phone's depth sensor calculates food volume". No model or database is named on the site. — [calai.app](https://www.calai.app/)
- **Per Cal AI's own blog, as summarised by RaftLabs:** depth sensor plus "an AI model trained on food images". RaftLabs notes that Cal AI "hasn't published its model architecture, training data size, or backend". — [RaftLabs 2026-08-30](https://www.raftlabs.com/blog/cal-ai-product-teardown)
- **Privacy policy (effective 2026-05-21):**
  - Names no vendors, only categories: hosting, analytics, ads networks, chatbot support.
  - Mentions "voice and image logging", "Progress photos", HealthKit and Health Connect.
  - Does not say whether photos go to third-party AI providers.
  - [calai.app/privacy](https://www.calai.app/privacy)
- **App Store privacy label:** "Data Used to Track You: Identifiers, Usage Data". Third-party advertising data includes device ID and advertising data. — [App Store US](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- **Backend hint:** the alleged March 2026 breach is attributed to "a misconfigured Google Firebase instance". — [SC World](https://www.scworld.com/brief/over-3m-allegedly-impacted-by-cal-ai-app-breach)
- **Internal evaluation:** Yadegari said retention rose in direct correlation with accuracy improvements (paraphrased) to the food-scanning pipeline, measured against an internal evaluation set. — [Net Influencer 2026-10-22](https://www.netinfluencer.com/cal-ai-founder-zach-yadegari-breaks-down-the-influencer-playbook-behind-his-apps-growth/)
- **User observations suggesting pipeline churn:**
  - "for the first two or three days after every update, it's like it forgets how to do its job" (US 4★, 2026-10-25). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
  - "its AI is most likely using a cheaper model" (AU 3★, 2026-08-26; user speculation). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

### Inferences
- The run-to-run variance users report (next sections) is what you'd expect if per-item calories and macros come mostly from a generative model rather than a deterministic database lookup. Database grounding would make identical inputs give identical outputs.
- MFP-database integration probably helps barcodes and US branded foods first. It does little for mixed home-cooked dishes, hidden fats or Indian food.
- "Depth sensor" volume estimation can't be the general mechanism: only some iPhones have LiDAR, Android has no equivalent path, and many users log by text, label or barcode. Most portion estimation is likely visual inference by the model. This is an inference, not confirmed.

### Gaps
- No current (2026) statement names Cal AI's model providers. The Anthropic/OpenAI detail dates from March 2025 and may have changed after the MFP integration.
- No source says whether displayed numbers are database rows, model output, or a blend.
- No technical write-up of the depth or LiDAR pipeline exists; it is a marketing claim only.

---

## Accuracy: vendor claims vs independent evidence

### Takeaway
Cal AI's own accuracy claims have drifted downward, from "about 90%" in 2025 to "about 80% accurate" on its FAQ in November 2026. Neither comes with a method.

The best independent evidence is an NIH/NIDDK weighed-meal study presented in July 2026, a conference abstract not yet peer-reviewed. Cal AI under-estimated calories by 345 kcal per meal on average, the worst of the four apps tested, and every app missed about 30 g of fat. A Lifehacker hands-on test in June 2025 found misidentification and large under-counts. Store reviews add a separate failure the lab study did not measure: the same meal gives different numbers on different scans.

### Cited Findings

**Vendor claims**
- About 90% accuracy, claimed by the founders in 2025 (paraphrased). — [TechCrunch 2025-03-16](https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/)
- "CalAI is about 80% accurate" (FAQ, 2026-11-11). — [calai.app](https://www.calai.app/)
- "Insanely accurate" (Play listing). — [Play US](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US&gl=US)
- MFP's own CEO: "Cal AI is for those preferring speed over accuracy." — [TechCrunch 2026-03-02](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)

**NIH/NIDDK weighed-meal study** (NUTRITION 2026, presented 2026-07-25; Aaron Hengist and Olivia Charles)
- **Method:** 102 meals prepared in a metabolic kitchen with ingredients weighed to 0.1 g. Standardised photos were run through MyFitnessPal, Lose It!, Cal AI and Appediet, and compared against national food composition tables with paired t-tests.
- **Mean energy under-estimate per meal:**

  | App | Under-estimate | 95% CI |
  |---|---|---|
  | Appediet | 252 kcal | 210 to 295 |
  | MyFitnessPal | 327 kcal | 269 to 385 |
  | Lose It! | 333 kcal | 282 to 383 |
  | Cal AI | 345 kcal | 296 to 392 |

- About 33% overall. Cal AI and Lose It! under-estimated carbohydrates by about 14 g; all four apps under-estimated fat by about 30 g.
- **Follow-up:** more than 200 further meals suggest high-fat, keto-style meals are worst.
- **Interpretation:** Frame (commentary in the Healio piece) calls the bias systematic rather than random.
- Hengist: "People using a photo-based tracking app without adjusting the portions or entering the amounts of food should take the results with a grain of salt."
- **Status:** preliminary; the abstract is not peer-reviewed.
- [Healio 2026-08-04](https://www.healio.com/news/primary-care/20260804/ai-photobased-calorietracking-tools-underestimate-them-by-33); [ScienceDaily 2026-07-26](https://www.sciencedaily.com/releases/2026/07/260726015237.htm)

**Lifehacker hands-on test** (Meredith Dietz, 2025-06-03)
- A 222 g Pink Lady apple was first identified as "tikka masala".
- Retaken with the barcode and a scale in frame, it was estimated at 80 kcal against roughly 120.
- A tofu-feta-chickpea salad with oil dressing: fried tofu was read as croutons, and the dish was estimated at 450 kcal against the author's 800 to 900.
- Less than a quarter of the salad was estimated at 250 kcal, so "the math simply doesn't work".
- Conclusion: verifying each entry leaves "the worst of both worlds".
- [Lifehacker, via Pipedot mirror](https://pipedot.org/6XQ7T); original at [lifehacker.com](https://lifehacker.com/health/ai-powered-calorie-counting-apps-worse-than-expected), which blocked fetching.

**Consistency, from App Store users** (not measured by the NIH study)
- "you can scan the same item 3 different times and get three entirely different percentage" (US 4★, 2026-10-25, v26.42.0). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "If you snap your food twice it will give you two wildly different calorie counts. Simply unreliable" (CA 1★, 2026-08-10). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "take it again from a different angle it gives totally different calories … first food it gave 400kcal and for the second 700kcal." (GB 1★, 2026-04-18). — [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "One day I got oatmeal with bran cereal 480 calories the next day I got 870 calories for the same thing." (AU 3★, 2026-01-20). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Under-counting from hidden fats, matching the NIH fat finding**
- "it doesn't know what you cook with so all butter and oil is not accounted for… You will get fat if you followed this" (US 1★, 2026-08-27). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "will tell you a 1000 calorie meal is 250 calories" (CA 1★, 2026-06-17). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Over-counting protein, the reverse failure**
- "if there 8 medium shrimp on my plate, it'll say I ate 35g protein" (US 3★, 2026-11-01). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Label and barcode reading failures**
- "I clearly scanned the actual nutrition label for the shake. All it had to do was read the numbers but it came up as 7250 cal per serve" (AU 1★, 2025-06-26). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "I scanned the barcode of an arla chocolate protein shake and apparently it had 1g of protein in." (GB 1★, 2026-09-17). — [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Missing micronutrients**
- "fiber content often seems blank even for basic things like apples, or beans" (US 4★, 2026-11-01). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "One avocado, four slices of a whole wheat toast on this app is only equal to 7 g of fiber" (US 1★, 2026-10-23). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Users cross-checking with ChatGPT**
- "I have to use a secondary app like chat gbt to determine the macros of my meals and then, put the results into cal ai which defeats its purpose" (CA 1★, 2026-10-07). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "I also frequently used ChatGPT to double-check calorie and macro estimates" (US 5★, 2026-10-23). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Competitor-run tests (low independence; listed only for completeness)**
- Callie's own 20-meal test reports 17% error for Cal AI and says the test is not independent. — [Callie](https://www.mycallie.app/en/blog/ai-calorie-accuracy-research)
- CalorieTrackerLab cites a "Dietary Assessment Initiative" study giving Cal AI ±14.6% mean absolute percentage error (MAPE). I could not retrieve or verify that study. — [CalorieTrackerLab](https://calorietrackerlab.com/reviews/cal-ai/)

### Inferences
- Two separate problems exist:
  - **Bias:** systematic under-counting, especially of fat. This is shared by all photo apps, MFP included.
  - **Variance:** different numbers for the same food. Users experience variance as "it's broken" faster than bias, because they can see it.
- A database-grounded, cached pipeline attacks variance directly. A cooking-fat prompt or a per-cuisine default attacks bias. Both suit Indian home cooking (ghee and oil, tadka).
- The NIH researchers' advice to adjust portions and enter amounts supports STEADY's design of letting users state grams or pieces and learning their typical portions.

### Gaps
- No peer-reviewed, Cal AI-specific accuracy paper was found, and the NIH abstract has no published full text yet.
- No independent test of repeatability (same photo, N runs) was found; the evidence is user anecdote only.
- No independent dietitian review from a mainstream outlet was found. Most "reviews" in search results are competitor blogs.

---

## UX and visual design (onboarding, paywall, home, progress, widgets, Health and Watch)

### Takeaway
Cal AI's funnel follows the "long quiz, then plan reveal, then paywall" pattern: about 28 to 33 onboarding screens, including an App Store rating prompt *before* the user has logged anything. A 3-day trial follows, with essentially nothing free afterwards.

Home is a calories-left card with progress rings for calories and macros, a calendar strip, a health score out of 10, a streak card and a "recently uploaded" list. An October 2026 experiment recolouring the rings red, yellow and green by health score drew backlash and was reverted. Apple Health integration mostly reads steps and workouts; users complain that nutrition isn't written back.

### Cited Findings

**Onboarding**
- **Screen order:**
  1. Splash
  2. Gender
  3. Workouts per week
  4. How the user heard about the app
  5. Whether they've tried other calorie apps
  6. Weight-loss results graph
  7. Height and weight
  8. Date of birth
  9. Coach or nutritionist?
  10. Goal
  11. Desired weight
  12. Goal message with social proof
  13. **Weight-loss pace slider**
  14. Comparison chart
  15. Obstacles
  16. Diet type
  17. Health goal
  18. Weight transition graph
  19. Privacy
  20. Apple Health permissions
  21. "Add calories burned back to goal?"
  22. "Calorie rollover?"
  23. **App review prompt**
  24. Notification permission
  25. Referral code
  26. "All done"
  27. App Tracking Transparency prompt
  28. Plan-building progress (97%)
  29. Custom plan summary with health score
  30. Science-backed instructional cards
  31. Sign-up (Apple, Google or email)
  32. Email magic link
  33. Name, username and profile photo
  - [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- **Length:** ScreensDesign counts 28 steps, running roughly 00:15 to 02:30 of its walkthrough video ([ScreensDesign showcase](https://screensdesign.com/showcase/cal-ai-calorie-tracker)). Adapty describes "25+ onboarding cards before serving a tailored paywall" ([Adapty](https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/)).
- **Founder on question count:** extra onboarding questions raised conversion ("pretty confirmed"), and about 20 to 25% of users convert to a trial or to paid. — [Founderpath](https://founderpath.com/resources/zach-yadegari-cal-ai-onboarding-tests-and-influencer-marketing)

**Paywall and pricing**
- **Paywall design:** a soft paywall after the plan reveal. A 3-day free trial converts to yearly, with a trial timeline. Monthly and annual plans are shown, annual pre-selected in one version, and there is a separate family-plan paywall. — [ScreensDesign showcase](https://screensdesign.com/showcase/cal-ai-calorie-tracker); [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- **Founder on testing:** Yadegari says Cal AI uses Superwall and wants a dedicated hire for paywall experiments. — [Founderpath](https://founderpath.com/resources/zach-yadegari-cal-ai-onboarding-tests-and-influencer-marketing)
- **US in-app purchases (2026-11-11):** "Unlimited" at $29.99, $19.99, $9.99, $5.99 and $2.99; "Unlimited Plan" $19.99; "Streak Restore" $0.99; Family Sharing supported. — [App Store US](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- **Play price ranges:** $9.99 to $59.99 per item in the US; ₹990 to ₹6,500 per item in India. — [Play US](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US&gl=US); [Play IN](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_IN&gl=IN)
- **Price points from a third-party guide (edited 2026-06-16):** $9.99 a month, $29.99 a year, family plan $59.99 a year. Onboarding variants of $2.99 a week, $5.99 a month, $19.99 a year and $49.99 a year have also been seen. — [eesel](https://www.eesel.ai/blog/cal-ai-pricing)
- **What's free:** the listing says "*FOOD SCANNING ANALYSIS RESULTS REQUIRE A SUBSCRIPTION". Users report: "there are no free features. You only get a 3-day free trial, and then you're automatically billed $14.99." (AU 2★, 2026-09-23). — [iTunes Lookup US](https://itunes.apple.com/lookup?id=6480417616&country=us); [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Home screen**
- Daily calorie card showing remaining calories, with macro cards and progress rings for calories and macros.
- A calendar strip, a health score (e.g. "7/10", or "uncalculated" when empty) and a streak card.
- A "recently uploaded" list of food, water and activity, plus steps and water in some variants.
- A floating "+" button and a bottom navigation bar.
- [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- Swiping reveals secondary metrics such as fibre and sodium. — [ScreensDesign showcase](https://screensdesign.com/showcase/cal-ai-calorie-tracker)

**October 2026 ring-colour experiment, reverted**
- "I don't know what intern decided to switch the colour rings (calories) with the health score rings, but it's horrible. Im glad they switched it back." (CA 5★, 2026-10-28) — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- US 1★ and 4★ reviews from 2026-10-25 to 27 (v26.42.0) are titled "New ring update" and "Please get rid of the new ring color system". One describes red rings as demotivating. — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Health score contradicting the rings**
- "I have 1000 spare calories for the day, 17grams of fat left and 30 grams of protein left and the health score is trying to say that I've exceeded all 3 of them and gives me a 5" (AU 1★, 2026-10-24). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "The health score also seems strangely calculated - 4/10 for plain apples" (US 4★, 2026-11-01). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Progress, Milestones and Settings**
- **Progress:** weight chart and log, a ruler picker, progress photos, a BMI card, daily average calories, stacked macro charts, and weekly energy comparison. — [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- **Milestones:** badges such as "Clean Sweep", "Hydrated", "Forking Around" and "The Omega Log", plus streak cards. — [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- **Settings:** auto-generated goals, tracking reminders, appearance including dark mode, a language picker, widget setup, feature-request voting, PDF summary export, and delete account. — [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- Dark mode was promoted as new: "Dark Mode for a sleek tracking experience!" — [calai.app](https://www.calai.app/)

**Integrations**
- **Apple Health and Google Fit:** "Connect with Apple Health"; Google Fit sync is mentioned. — [calai.app](https://www.calai.app/)
- **Health write-back complaints:**
  - "doesn't send nutritional information to Apple health just step count" (AU 3★, 2026-03-24). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
  - "Doesn't sync to apple health for nutrition! Only steps" (GB 1★, 2026-06-21). — [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
  - "you see duplication of data from time to time" (CA 3★, 2026-06-06). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Apple Watch:** the App Store lists "iPhone, Apple Watch" (requires watchOS 10.0). A user reports: "Then why the hell do they have an apple watch connection if it doesn't sync. It shows zero calories." (US 1★, 2026-10-20). Competitor blogs claim there is no Watch app, which conflicts with the store listing. — [App Store US](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616); [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Languages:** 15 are listed, including Hindi, Arabic, Japanese, Korean, Simplified Chinese, Spanish and Russian. — [iTunes Lookup US](https://itunes.apple.com/lookup?id=6480417616&country=us)

**Data limits**
- "Caps out at 3 weeks of history" (US 4★, 2026-10-31). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "You cannot download your data." (US 2★, 2026-10-22). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- This conflicts with the PDF-export setting seen by ScreensDesign. — [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)

### Inferences
- The rating prompt sits at screen 23 of onboarding, before any real use. That likely explains much of the gap between the 4.8★ headline rating and the far more negative written reviews (see the sentiment section). Users rate the promise, not the product.
- The ring-colour backlash shows that users want rings to show progress toward their own goal, not a moral judgement about their food. This is directly relevant to STEADY's goal-aware over/under design: for a gainer, under is the problem, so red-for-over would be wrong.
- No independent source documents Cal AI's exact colours or typography. The "dark plus cream minimal" reference should be checked against actual screenshots or the Claude Design reference, not these notes.

### Gaps
- No colour palette or typeface was confirmed from a reliable source.
- Whether a Watch app exists or only a Watch data connection was not confirmed.
- The exact free tier after the trial is not verified: eesel says barcode, search and describe are free; users say nothing is free.

---

## Growth and retention mechanics

### Takeaway
Growth came from paid influencers: about 250 creators on monthly retainers, chosen for tight communities and paid against view guarantees, then amplified with Facebook ads. Conversion was optimised in a long onboarding quiz feeding Superwall paywalls and a web-to-app Stripe funnel.

Retention levers are streaks with a paid $0.99 "Streak Restore", Milestones badges, groups, a $10 referral, widgets and heavy notifications. Several of these are now sources of 1★ reviews. The only retention number is a 2025 founder claim of "above 30%", undefined and unverified.

### Cited Findings

**Influencer engine**
- "We have about 250 influencers right now on retainer that are just posting, integrating us into their content monthly". Creators are paid flat monthly fees because "they want to be guaranteed a payment". — [Founderpath](https://founderpath.com/resources/zach-yadegari-cal-ai-onboarding-tests-and-influencer-marketing)
- **Origins, per Yadegari at Disrupt (reported 2026-10-22):**
  - First influencer post: about $2K, bringing about 1,000 downloads in 2 days and about 100 paying users.
  - Creator criteria: at least about 50K followers, with "very tight communities".
  - Paid deals were restructured around view thresholds or multi-video packages.
  - Facebook spend on creator content was capped at about $5K a day.
  - UGC was rejected as "mass spray and pray"; influencers were "a sniper approach".
  - [Net Influencer](https://www.netinfluencer.com/cal-ai-founder-zach-yadegari-breaks-down-the-influencer-playbook-behind-his-apps-growth/)
- **Ownership:** COO Jake Castillo runs influencer marketing. — [TechCrunch 2025-03-16](https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/)

**Conversion funnel**
- More onboarding questions raised conversion. About 20 to 25% of users reach a trial or paid plan. Paywalls run on Superwall. — [Founderpath](https://founderpath.com/resources/zach-yadegari-cal-ai-onboarding-tests-and-influencer-marketing)
- **Web funnel:** quiz, then email capture, then a plan-ready screen, then a paywall with a trial and discount through Stripe checkout. This is a third-party teardown with no internal metrics. — [Web2Wave](https://resources.web2wave.com/calai/)

**Retention mechanics**
- **Retention data:** above 30% (founder claim, 2025, metric undefined; paraphrased). — [TechCrunch 2025-03-16](https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/)
- **Retention tracked accuracy:** retention rose with accuracy gains on an internal eval set. — [Net Influencer](https://www.netinfluencer.com/cal-ai-founder-zach-yadegari-breaks-down-the-influencer-playbook-behind-his-apps-growth/)
- **Streaks with paid restore:**
  - "get a notification saying I lost my 60 day streak but I can restore it by paying $0.99!" (CA 1★, 2026-06-04)
  - "as a paid subscriber, it's absurd how you have to pay every time to get your streak back" (CA 4★, 2026-05-06)
  - "Streak Restore $0.99" appears in the App Store in-app purchase list.
  - [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json); [App Store US](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- **Streak bugs:** "it continues to tell me I've lost my streak when I can see I've done x number of days" (Google Play 4★, 2025-04-13). — [Play US](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US&gl=US)
- **Positive streak effect:** "The streak keeps me motivated to track my calories" (US 5★, 2026-10-12). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Badges:** a Milestones "trophy room" with animated badges for streaks, logging meals and drinking water. — [ScreensDesign showcase](https://screensdesign.com/showcase/cal-ai-calorie-tracker)
- **Referral:** a $10-per-friend referral and a referral-code step in onboarding. — [ScreensDesign showcase](https://screensdesign.com/showcase/cal-ai-calorie-tracker); [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
- **Groups:**
  - A Groups screen shown as under maintenance. — [ScreensDesign UX flow](https://screensdesign.com/apps/cal-ai-calorie-tracker/?id=1739&ts=0&vt=1)
  - "groups feature no longer available and explicit language on group names" (AU 1★, 2026-03-10). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
  - "after taking a few weeks off it lost my group and our chat history" (US 1★, 2026-11-10). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Share and workout prompts:** "The new update with the 'do you want to share your food' and 'are you going to workout' needs to be a way to turn this off ASAP" (US 2★, 2026-11-08, v26.44.0). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Notifications:**
  - "within an hour had received around 9 identical 'Hungry? Open Cal AI' notifications back to back… The trial end reminder never came through, I got billed" (GB 1★, 2026-06-23). — [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
  - "I logged three items and it sent me six (6) identical notifications and six (6) identical emails" (CA 1★, 2026-06-25). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Win-back discounting:** after a trial, an email offered 80% off, and a promotional banner kept showing after the user subscribed (AU 1★, 2025-11-21/22). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

### Inferences
- The engine is "influencer to quiz to paywall". Accuracy matters to it mainly through retention and renewal, which matches Yadegari's own statement.
- STEADY has no monetisation in v1, so the parts worth borrowing are the habit mechanics: streaks, milestones and widgets. Cal AI's monetised versions (paid streak repair, spammy pushes, share pop-ups) are visibly generating 1★ reviews.

### Gaps
- No D1, D7 or D30 retention or churn numbers were found.
- No data on referral uptake, group usage, or notification cadence beyond the anecdotes.

---

## User sentiment (praise and complaints)

### Takeaway
The star average is excellent (4.8 iOS US, 4.5 Play US), but the newest *written* reviews are mostly negative: the mean is 2.2 to 2.9 across US, CA, GB and AU, and 3.4 in India.

Praise is about ease, speed and weight-loss results. Complaints are billing and trial traps (the largest cluster), inconsistent or inaccurate numbers, clumsy fixes, repeat-food friction, health-score and ring confusion, weak Apple Health write-back, and US-centric food coverage. Reddit was not accessed directly; Reddit-sourced claims seen in search results came via competitor blogs and are excluded.

### Cited Findings

**My sample:** 1,007 written reviews from the five storefronts' "most recent" feeds, pulled 2026-11-11.

| Storefront | Reviews | Date range | Mean rating |
|---|---|---|---|
| US | 250 | 2026-08-20 to 2026-11-10 | 2.88 |
| CA | 250 | 2025-05 to 2026-10 | 2.45 |
| GB | 250 | 2025-03 to 2026-11 | 2.22 |
| AU | 186 | 2024-08 to 2026-11 | 2.18 |
| IN | 71 | 2024-05 to 2026-10 | 3.37 |

[US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json) · [CA](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json) · [GB](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json) · [AU](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json) · [IN](https://itunes.apple.com/in/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Theme counts** (my keyword regexes, approximate), across the same feeds:

| Theme | Reviews matching | 1★ |
|---|---|---|
| Billing, trial, subscription, refund | 294 | 236 |
| Rings or health score | 132 | 68 |
| Portion, serving or grams | 108 | 40 |
| Fix or edit | 89 | 43 |
| Search or database | 55 | not counted |
| Barcode | 50 | not counted |
| Indian or international | 33 | not counted |
| Inconsistency, exact-phrase match | 22 | not counted |

**Praise**
- "Makes tracking calories quick and easy. You need to manually adjust the entries sometimes but with the help of this app I have lost 23 pounds in 5 months!" (CA 5★, 2026-07-24). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "Down 76 lbs. Worth every penny." (title, US 5★, 2026-10-23). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "The barcode scanner is pretty good, and lots of foods are already in the database. I've lost 25 pounds in 6 months" (CA 5★, 2026-08-12). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "the only thing it does better than other apps is the UI design" (AU 1★, 2026-04-14). Even critics concede the UI. — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "Nice UI and somewhat easy to use. Unfortunately it really struggles to accurately log food." (Google Play 2★, 2026-02-13). — [Play US](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US&gl=US)

**Billing and paywall**
- "App asks for basically all of your information except for your social security number and then makes you pay!" (US 1★, 2026-10-12). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "3 day trial is a scam … they charge you for a full year and you can't get your money back" (CA 1★, 2026-10-13). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "It says I get a 3 day free trial and it took 41$ already." (AU 1★, 2026-06-15). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Support:** "I was greeted with ai support that repeatedly tells you to follow the same steps that I outlined don't work" (GB 1★, 2026-01-22). — [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Over-aggressive goals**
- "this app told me a 500cal diet was my best…" (AU 1★, 2026-04-09). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- Lifehacker's tester was told "losing 10 lbs is a realistic target", which would have made her underweight. — [Pipedot/Lifehacker](https://pipedot.org/6XQ7T)

**Simplicity versus feature creep**
- "I just want a calorie tracker not some place to write down my life's history." (US 3★, 2026-11-03). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

### Inferences
- The two biggest controllable drivers of negative sentiment are trust in billing and trust in numbers, and neither is a hard technical problem.
- Ease and UI are Cal AI's clear moat in user perception. STEADY should match that polish before competing on accuracy, because accuracy alone won't win against "it's so easy".

### Gaps
- Reddit was not searched directly. Search results only surfaced competitor blogs summarising Reddit, which were excluded as untrustworthy.
- Only 3 Google Play reviews were visible in the static page. The full Play review corpus needs the Play API or a browser.
- Theme counts come from keyword matching, not manual coding.

---

## Indian and international food handling

### Takeaway
Users consistently describe Cal AI as US-centric. Indian reviewers say it fails to recognise Indian dishes and compare it unfavourably with HealthifyMe's catalogue. UK and Australian users hit vocabulary mismatches (chips vs fries, rock melon vs cantaloupe). Android is very slow outside the US. No controlled test of Cal AI on Indian food was found.

### Cited Findings

**Indian users**
- "Compared with Healthify, this app doesn't even come close to the food catalogue it hosts. Especially for asian and indian dishes." (IN 3★, 2025-07-09). — [IN feed](https://itunes.apple.com/in/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "they drastically fail to identify Indian mealnutritions. Also their fix results option does not work most of the time." (IN 2★, 2025-02-25). — [IN feed](https://itunes.apple.com/in/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "has trouble with Indian foods (although, GPT does it great, so not sure where the problem is)" (IN 3★, 2026-04-20). The same review reports a "Massive bug with Sodium, Sugar, Fiber calculations". — [IN feed](https://itunes.apple.com/in/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "Unable to recognize Indian food images as advertised… Poor value for Rs. 1,999 (~$25)" (IN 1★, 2025-01-08). — [IN feed](https://itunes.apple.com/in/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "Cuisines are limited to the more popular ones in the west. Please add some more to the database, at least the more popular ones like Indian and Chinese" (IN 3★, 2025-07-31). — [IN feed](https://itunes.apple.com/in/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**South Asian and other non-Western users elsewhere**
- "Not Suitable for South Asian food… The database isnt elaborate enough to include South Asian food varieties." (CA 3★, 2025-10-06). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "The application do not work with indian diet/meals." (CA 1★, 2026-01-26). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "If you are on a non-traditional western cuisine, the food data base is non-existence… (not even exotic, like Thai food or Vietnamese Pho)." (CA 1★, 2025-09-03). — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Regional vocabulary and brands**
- "It doesn't know the UK word for Chips, so you end up having to write French fries" (GB 3★, 2026-06-29). — [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "the food options are all US based 'coffee with cream' etc and also mentions of $" (GB 2★, 2026-10-10). — [GB feed](https://itunes.apple.com/gb/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "It doesn't recognise alternate names for universal foods such as rock melon for cantaloupe" (AU 2★, 2026-03-02). — [AU feed](https://itunes.apple.com/au/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- "Not good at capturing international food; important to learn based on client inputs." (US 4★, 2026-11-03). — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

**Performance and pricing in India**
- **Android outside the US:** 3 to 5 minutes to log a meal, and 1 to 2 minutes per search (Google Play India, 3★, 2026-11-02, on a Galaxy S26 Ultra). — [Play IN](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_IN&gl=IN)
- **Hindi UI:** Hindi is among the 15 listed UI languages. Users' complaints are about food knowledge, not the UI language. — [iTunes Lookup IN](https://itunes.apple.com/lookup?id=6480417616&country=in)
- **Prices:** India Play in-app purchases are ₹990 to ₹6,500 per item. An earlier Indian review mentions Rs 1,999. — [Play IN](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_IN&gl=IN); [IN feed](https://itunes.apple.com/in/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)

### Inferences
- MFP's database (68,500 brands, 380+ restaurant chains, per TechCrunch) is US-weighted. Integrating it is unlikely to fix Indian home-cooked dishes.
- STEADY's INDB and IFCT seeding plus multilingual synonyms (roti, chapati, phulka; chips and fries) targets the exact gap Indian users name.
- Latency outside the US, presumably US-hosted inference, is a concrete opening for an India-heavy app.
- An Indian user saying "GPT does it great" suggests the gap is in Cal AI's retrieval and database layer, not in raw model capability. This is an inference.

### Gaps
- No independent, quantitative test of Cal AI on Indian meals (roti, dal, sabzi, biryani) was found. Search results were vendor marketing for other apps.
- The India review sample is small (71 written reviews).

---

## Lessons for STEADY (borrow vs avoid)

### Takeaway
Borrow Cal AI's surface and habit loop:
- one capture surface with modes;
- a calories-left hero with rings and recents;
- an ingredient breakdown;
- natural-language fixes;
- widgets, streaks and milestones;
- a personalised plan reveal;
- an internal eval set treated as a retention metric.

Avoid its failure modes:
- non-deterministic numbers;
- fixes that mutate other fields;
- auto-saving without a confirm or undo;
- hidden-fat under-counting;
- US-only food knowledge and slow non-US performance;
- moralising colour schemes;
- paid streak repair, notification spam and billing dark patterns;
- weak backend security.

### Cited Findings
These are the evidence anchors, all cited in full in the sections above.
- **Speed is the product's appeal, but MFP itself frames it as "speed over accuracy".** — [TechCrunch 2026-03-02](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)
- **Accuracy work moved retention**, measured on an internal eval set. — [Net Influencer 2026-10-22](https://www.netinfluencer.com/cal-ai-founder-zach-yadegari-breaks-down-the-influencer-playbook-behind-his-apps-growth/)
- **Systematic under-count**: Cal AI 345 kcal per meal, fat −30 g across all apps. — [Healio 2026-08-04](https://www.healio.com/news/primary-care/20260804/ai-photobased-calorietracking-tools-underestimate-them-by-33)
- **Same-food variance and Fix-Issue field drift**: US, CA, GB and AU reviews quoted above. — [US feed](https://itunes.apple.com/us/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Ring-colour backlash** in October 2026. — [CA feed](https://itunes.apple.com/ca/rss/customerreviews/id=6480417616/sortBy=mostRecent/json)
- **Apple removal for billing design** in April 2026. — [MacRumors](https://www.macrumors.com/2026/04/21/apple-cal-ai-app-store-removal/)
- **Alleged breach** from a misconfigured Firebase instance in March 2026. — [SC World](https://www.scworld.com/brief/over-3m-allegedly-impacted-by-cal-ai-app-breach)

### Inferences

**Borrow**
1. **One capture surface, mode-switchable.** Cal AI puts Scan Food, Barcode and Food Label in one camera. STEADY can extend this to voice, text and photo at equal weight, since Cal AI's voice is buried in search and some users can't find it.
2. **Home hierarchy.**
   - Lead with calories left (or "to go" for gainers) in a dominant ring, then protein, then meals logged.
   - Show a recents list on home.
   - Use a calendar strip for day switching.
   - Put secondary nutrients behind a swipe.
   - Users praise the UI even in 1★ reviews, so polish is table stakes.
3. **Ingredient breakdown plus natural-language fix.** Keep both, but make a fix a *targeted, deterministic edit*:
   - Parse the correction, change only the named item or field, and recompute from the database.
   - Show a before/after diff, so "fix calories" never silently changes protein.
4. **Quick-log memory.** Surface each user's top repeat foods first: "same coffee with milk every morning … should be the top two things". Include barcode items in recents. Allow custom amounts on saved meals. STEADY's per-user portion learning is the direct answer.
5. **Habit loop without monetising it.** Keep streaks and milestones, but give free streak freezes. Offer widgets that deep-link straight into a specific capture mode; Cal AI's widget needs a second tap for barcode.
6. **Personalised plan reveal and pace slider** in onboarding. These are cheap and effective. Keep it far shorter than 28 to 33 screens. Do not put a rating prompt before any real use if STEADY wants honest ratings.
7. **Treat the eval harness as a product KPI**, as Cal AI apparently did. STEADY already has scripts/eval; Yadegari's statement supports investing in it.

**Avoid**
1. **Variance.** The same photo, description or barcode must return the same numbers. Database grounding, a cache keyed on the normalised item, and the user's learned portion achieve this. Market it explicitly, for example: "same meal, same numbers".
2. **Silent auto-save of uncertain results.** Show a one-glance confirm, or save with an undo toast. Flag low-confidence items such as oil, ghee or dressing for a quick yes/no.
3. **Hidden-fat under-count**, the NIH's fat −30 g finding. Ask a cooking-fat question by cuisine (tadka, ghee, butter, oil), or default to IFCT and INDB standard recipes that already include fat.
4. **Barcode ambiguity.** Ask "how much did you eat?" with serving, package and grams options, instead of defaulting to one serving.
5. **US-centric vocabulary and slow non-US performance.** Use INDB and IFCT, regional synonyms, a multilingual parser, and India-region hosting or edge inference for latency.
6. **Moralising colour and scores.**
   - Avoid a "health score" that contradicts the rings.
   - Avoid red rings for normal days.
   - Use goal-aware over/under: for gainers, being under is the problem.
7. **Growth dark patterns.** Avoid:
   - hiding the trial's auto-renewal;
   - weekly-price prominence;
   - second-offer flows;
   - paid streak restores;
   - repeated identical pushes ("Hungry? Open Cal AI" ×9);
   - share pop-ups with no off switch.
   Cal AI was pulled from the App Store over billing design, and these patterns dominate its 1★ reviews.
8. **Security.** The alleged breach included meal logs and eating times. STEADY's Supabase row-level security (RLS) and service-role key hygiene should be audited before scale. Note that STEADY's `.env` holds a service_role key; see project memory.
9. **Missing basics users ask for:** meal categories or grouping, full history without a three-week cap, data export, Apple Health and Health Connect nutrition *write-back* (not just steps), and no data loss on update.

### Gaps
- STEADY-specific prioritisation, effort and impact estimates are outside this research's scope.
- Cal AI's actual colour tokens and typography should be taken from screenshots or the Claude Design reference, not from these notes.
