# User Voice: What Real Users Say About Calorie Trackers (Reddit, forums, app-store reviews, HN), for the STEADY redesign

> **Method and access caveats (read first).**
> - **Reddit could not be accessed directly.** Reddit blocks Anthropic's crawler: WebSearch refuses `reddit.com` ("domains not accessible to our user agent") and direct requests return HTTP 403. We did **not** try to get around that block with mirrors or archives. Every Reddit quote below comes through a **non-Reddit page that quotes it** (Fortune, TechRadar, 9to5Google, PiunikaWeb). Each is labeled "(Reddit, via X)" and links to the thread URL that article gives. We could not verify upvote counts.
> - **Primary sources we could fetch in full:** (1) the **Apple App Store public review feed**, giving 200 US reviews of **Cal AI** (May 2024 to Oct 2026) and 50 India reviews of **HealthifyMe** (2018 to Oct 2026). The feed returned empty for MyFitnessPal, MacroFactor, Lose It, Cronometer and SnapCalorie in Oct 2026, so for those we parsed the ~10 reviews embedded in each App Store web page; those dates are approximate. (2) **Hacker News** full comment trees via the Algolia API, chiefly the June 2025 thread "I used AI-powered calorie counting apps, and they were even worse than expected" (245 points, 292 comments). (3) Forum and press pages. (4) A **peer-reviewed study** of 13,799 negative posts on X about the top-5 grossing fitness apps (Sheen et al., *British Journal of Health Psychology*, 2025).
> - **Sample bias:** the App Store feed favors recent and "most helpful" reviews, so it is skewed negative. Cal AI's sample was 92 of 200 at ≤2★, yet the app is rated 4.8★ from about 373k ratings ([App Store lookup](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)). HealthifyMe's sample was 29 of 50 at ≤2★, against a 4.55★ rating from about 67k. HN skews toward technical, skeptical, US/EU users. Treat the frequencies as "share of complaints", not "share of users".
> - **Theme frequency counts** come from rough keyword matching over the review text (n=200 Cal AI, n=50 HealthifyMe). They are directional only.

---

## 1. Why people stop using calorie trackers (burnout, tedium, guilt, bad data, ads/paywalls)

### Takeaway
People quit for five overlapping reasons: (a) **logging tedium**, meaning searching, picking entries and fiddling with portions; (b) **shame and guilt** from deficit-centric numbers, red warnings, nagging reminders and streak resets; (c) **untrustworthy numbers**, from bad database entries, wildly variable AI estimates and absurd targets; (d) **hostile monetization**, meaning long onboarding quizzes that end in a hard paywall, ads, and core features moved behind paywalls; and (e) **data loss or bugs** that wipe history or streaks. A notable minority "graduate": they quit because tracking taught them to eat. That is positive churn.

### Cited Findings
**Tedium and friction**
- "With MFP, there was always searching, then selecting the best entry, then fiddling with portion size. It usually ends up taking many times longer for me." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44243322)
- "now that I'm a serial entrepreneur and single parent... I just did NOT have the patience for the data entry." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44230592)
- "counting my calories has always given me stress & as a college student I don't have time in my day to sit down & track my food." (Cal AI 4★, Dec 2024) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "Finally I feel like there is a way for me to track calories without having to spend 5 minutes before each meal looking up information about all of the ingredients." (Cal AI 4★, May 2024) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "I always found traditional calorie trackers tedious with all the database searching." (HN, Jan 2026) — [HN](https://news.ycombinator.com/item?id=46630604)
- A founder built an app after "not consistently using any calorie tracking apps due to the poor UX (many clicks, too much friction)" (Show HN, Nov 2024) — [HN](https://news.ycombinator.com/item?id=42079321)

**Guilt, shame, impossible targets (peer-reviewed social-listening study)**
- Study: 58,881 X posts mentioning the 5 highest-grossing fitness apps (as of Mar 2022), filtered to 13,799 negative posts. Five themes: emphasis on quantifying calories, oversimplified and inaccurate algorithms, data loss from malfunctions, plus shame and lost motivation. "Notifications became nagging, streak resets erased months of effort, and small slip-ups felt like failure." — [StudyFinds summary](https://studyfinds.com/fitness-app-motivation-study-myfitnesspal); paper: [Sheen et al. 2025, Br J Health Psychol, doi:10.1111/bjhp.70026](https://doi.org/10.1111/bjhp.70026)
- "I just got a notification from my fitness pal reminding me to log my dinner for today but I don't want to bc I'm ashamed I just ate dominos" (X post, cited in study) — [StudyFinds](https://studyfinds.com/fitness-app-motivation-study-myfitnesspal)
- "My Fitness Pal should be used for tracking calories ONLY. If you allow it to prescribe your calories you'll end up with a deficit that's unachievable, unsustainable and very unhealthy." (X post, cited in study) — [StudyFinds](https://studyfinds.com/fitness-app-motivation-study-myfitnesspal)
- Judging ordinary foods backfires: on MFP warning about sugar in a banana, "a fu*king banana. Fu*k off." (X post) — [StudyFinds](https://studyfinds.com/fitness-app-motivation-study-myfitnesspal)
- The study found avoidance behavior, where users deliberately skipped logging certain foods to escape negative feedback, and repeated "back to [old habits]" defeat language — [StudyFinds](https://studyfinds.com/fitness-app-motivation-study-myfitnesspal)
- "If I diligently track calories using one of these things and don't lose weight I'll say 'screw it' and stop bothering" (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44225634)
- Health scores feel judgmental. From a lifter in eating-disorder recovery: "this app is a trap and subtly encourages eating disorders... ALWAYS labeled 3/10 on the stupid health score" (Cal AI 1★, Jan 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)

**Untrustworthy data**
- Accuracy and inconsistency is the #2 Cal AI complaint theme (about 50/200 reviews; 24 of 92 low ratings). See Section 3 — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "Correcting errors in MFP is the bane of my existence." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44224904)

**Monetization and onboarding (the most common single 1★ trigger)**
- Paywall, trial or billing words appear in about 76/200 Cal AI reviews and about 52 of 92 ≤2★ reviews. Onboarding-quiz complaints appear in about 16 of 92 low ratings — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "It asks 50 questions and then it tells you to pay" (1★, Oct 2026). "Only after collecting all your personal info and making you create the account does the app reveal there is no free version" (1★, Oct 2026, titled "Dark design patterns"). "I've downloaded over 30 cal tracking apps, and every single one of them is asking arbitrary questions before allowing me to simply use the platform... I'm a professional athlete. I know exactly what my macros need to be. I just want a place to track them." (1★, Sep 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "I tried the top 50 apps on the Android Play store. Every. Single. One of them require a 15min long quizz, and an account" (Ask HN, Apr 2024) — [HN](https://news.ycombinator.com/item?id=40120488)
- MFP (2022, older): "Was fine with the tradeoff of getting crappy ads... The app has not improved at all in years... introduced an extremely dark pattern of overlaying the 'back' navigation" — [HN](https://news.ycombinator.com/item?id=32594918)
- India: "Too many pop-ups for buying subscription and constantly asking for permissions" (HealthifyMe 1★, May 2026); "Why should I pay ₹2-4k if all I need is simple calorie tracking" (1★, Jan 2026). Paywall themes appear in 23 of 29 low HealthifyMe ratings — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)

**Data loss**
- "used this app without missing a day for 240 days, went camping, had no service... When I got service a few days later everything was deleted" (Cal AI 1★, Sep 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "my entire weight data is gone from 2018 up until the data from yesterday! It was quite devastating" (MFP 3★, ~Jun 2022) — [MFP App Store](https://apps.apple.com/us/app/myfitnesspal-calorie-counter/id341232718)

**Positive churn ("I learned how to eat")**
- "by using the app daily for about a year, I learned how to eat. With that knowledge, I don't use the app daily now... But there are times like during the holidays" (Lose It 5★, ~Jul 2023) — [Lose It App Store](https://apps.apple.com/us/app/lose-it-calorie-counter/id297368629)
- "it was like a really tedious 3 or 4 days then I pretty much knew what to take out." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44221562); "use a tracker at first... Track for a month and drop it afterwards." (HN, Jul 2025) — [HN](https://news.ycombinator.com/item?id=44739358)

**Counterpoint: friction as a feature**
- "the act of calorie counting (ie the effort of working it out and labour of putting it into the app) is a key part of why it works... Making it easier I would expect to make it also easier to eat more." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44222704)
- "I'd absent-mindedly snack on something, go to log it, then think 'wait, why am I eating this right now?' and stop." (HN, ~100 lb lost) — [HN](https://news.ycombinator.com/item?id=44223616)

### Inferences
- For a **gainer** persona the "friction as a feature" argument flips. Friction that deters eating is harmful when the goal is to eat *more*, which strengthens the case for STEADY's speed-first approach for this persona specifically.
- A long onboarding quiz followed by a hard paywall is the most reliable way to earn 1★ reviews in this category. Showing the logging UI before asking for payment or a long profile directly answers the most common complaint.
- Users plan to "re-enter" tracking episodically (holidays, cuts, bulks). A fast re-onboarding path ("welcome back, here's your last week") supports that pattern.

### Gaps
- No direct r/loseit, r/CICO or r/caloriecount quotes, because Reddit was inaccessible. We found no reliable quantitative quit-rate data. Vendor-blog claims such as "80% quit in the first month" conflict with each other and are unsourced ([foodbuddy.my blog, vendor](https://foodbuddy.my/blog/mfp-meaning-and-why-easier-apps-win-for-weight-loss-20260814)).

---

## 2. What bulking/gaining users need and hate

### Takeaway
Gainers' voices were thin in accessible sources (r/gainit and r/bulking are blocked). The signals we did find agree: deficit-first apps treat gainers as an afterthought (locked or odd targets, "over" framed as failure). Gainers care mostly about **hitting calorie and protein numbers daily** with minimal effort. Underweight people often find **eating itself a chore**. Precision matters because a surplus is small. Some users explicitly see rough AI estimates as "good enough" for surplus tracking but not for cutting.

### Cited Findings
- "If you're not looking to lose weight, this app sucks... I'm trying to lean bulk using this app... It told me to eat 2800 calories a day and nearly 200 grams of protein and would not let me change it." (Cal AI 1★, Sep 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "Was super excited to gain weight and not be skinny anymore then found out it's a subscription thing 😢" (Cal AI 3★, Sep 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "the app does a great job for a lazy person who desires to keep track of their diet/surplus of calories. I would never advertise this for someone going on a diet as the accuracy of the log is like 80%" (Cal AI 4★, Mar 2025) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Protein-only tracking as a maintenance habit: "After I have just used to track my protein intake everyday. Easy to use." (Cal AI 4★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "someone working out to gain muscle will want to monitor that they're getting enough protein" (HN, 2022, older) — [HN](https://news.ycombinator.com/item?id=32596275)
- Eating as a chore: "Some people just don't like to eat that much... Eating is just a chore to them so they rarely do it... If I'm busy working on something, I will go 12 hours without eating" (HN, Jul 2025) — [HN](https://news.ycombinator.com/item?id=44738109); a reply describes friends at "6' and 135lbs" for whom food was not a priority — [HN](https://news.ycombinator.com/item?id=44738721)
- Precision in a small surplus: "A 250 calorie surplus per day will add half a pound per week. That being off by two tablespoons of oil." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44239682); "As a gym enthusiast, if this app can't give me accurate calorie counts and nutrient data, it's basically useless to me." — [HN](https://news.ycombinator.com/item?id=44221252)
- Undercounting misleads gainers too: "after using it for 2 months I noticed it undercounts the calories im eating" (Cal AI 2★, Sep 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Adaptive targets can feel arbitrary: "program cut my calories, lost 3lbs week two, program cut my calories... I declined as it would have me eating barely 1300 calories" (MacroFactor 3★, ~Jul 2025) — [MacroFactor App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471). Praise for not needing precision: "You don't have to exactly hit your macros for it to work." (MacroFactor 5★, ~Jan 2023) — [MacroFactor App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471)
- Wrong-direction feedback: "sometimes even if i am well under my calorie limit the circle shows as red" (Cal AI 3★, Oct 2026). "No matter if I'm way over calories the health description says 'significantly under'" (Cal AI 3★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Bulking guidance from coaching blogs (not user voice): a surplus of roughly 250 to 500 kcal/day, plus about 200 kcal if weight stalls for a couple of weeks — [Bony to Beastly](https://bonytobeastly.com/bulking-guide-for-skinny-beginners/); liquid calories and frequent meals for low appetite — [Fitbod](https://fitbod.me/blog/how-to-bulk-if-you-have-a-low-appetite/)

### Inferences
- For gainers, **under target is the failure state** and over target is usually fine. Ring colors and copy must invert relative to deficit apps, and wrong-color bugs destroy trust fast (see the Cal AI reviews).
- **Protein** is the metric gainers keep tracking after they stop tracking calories. A protein ring may be the most "sticky" ring.
- Because surpluses are small, gainers need **consistency** (the same meal logs the same number) and easy correction more than perfect absolute accuracy.
- Low-appetite and "forgot to eat" behavior points to **timely nudges** ("you're 900 kcal short with 4 hours left; a shake would close it") over passive dashboards.

### Gaps
- No direct r/gainit, r/bulking or r/naturalbodybuilding quotes (Reddit blocked). Searches for forum threads (bodybuilding.com, T-Nation) returned only blogs and guides. We have no data on how gainers want to *see* progress (weight trend vs. photos vs. lifts).

---

## 3. Opinions on AI calorie apps (Cal AI, MFP Meal Scan, SnapCalorie, Lose It, MacroFactor AI, ChatGPT)

### Takeaway
Users **love the speed** of photo and description logging, and many say it is why they finally stuck with tracking. Trust breaks on (1) **inconsistency** (the same plate gives different numbers), (2) **absurd values** per ingredient, (3) **invisible calories** (oil, butter, sugar), and (4) a **correction burden** that cancels out the speed. Apps that ground AI in a **verified database** and let users **edit ingredient breakdowns** (MacroFactor, Lose It) earn praise. Many technical users simply speak or type to **ChatGPT** and find it good enough. Subscription and billing practices draw as much anger as accuracy does.

### Cited Findings
**Speed and convenience (the positive case)**
- "You don't have to select if it's breakfast or dinner which is the issue I had with fitness pal because I just want a quick scan and be done with it." (Cal AI 3★, Feb 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "Tracking calories used to feel restrictive, but this makes it incredibly easy to scan foods, adjust portions" (Cal AI 5★, Sep 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "the layout is nice and clean (compared to MyFitnessPal which is a disaster of too much stuff)" (Cal AI 2★, May 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "I spent all this time manually entering the ingredients, only to find out that it was within a few calories of what they original said anyway." (Cal AI 5★, Aug 2025) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)

**Inconsistency and wrong values (most damaging to trust)**
- "You take 3 pictures of the same dish and get a variance of 50% in calories." (1★, Oct 2026). "I scanned the same plate twice and gave me two different readings" (1★, Oct 2026). "you can scan the same item 3 different times and get three entirely different percentage" (4★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "it accurately identified basically all of the ingredients - impressive! But then when I click into each ingredient, it has macros that make no sense - like 9g of protein for 1 cup of tortilla chips" (2★, Feb 2026, titled "AI hallucinating?"). "estimated a chocolate cookie at 1650 cal" (3★). "Even told me 47,000 Calories the other day" (1★). "I took a picture of 8 grapes this morning and it told me that was 8 servies of grapes and was over 700 calories" (2★, Apr 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "If the barcodes are inaccurate how can I trust the AI plate analysis?" (2★, Sep 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "At first it felt super convenient... But over time I kept seeing mistakes. Sometimes it would even tag a salad as soup. Eventually I went back to the old way." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44221048)
- "I can make two dishes that look identical and have +/- 50% caloric content, easily." (HN, Apr 2025) — [HN](https://news.ycombinator.com/item?id=43581468)
- Invisible calories: "A tablespoon of oil is 100 calories, but probably not visible in an image. Sugar in cooked meals is impossible to see. Is this aimed at a world where every food product is individually wrapped? Because most of the world doesn't live that way." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44224023)

**Correction burden**
- Correction and editing language appears in about 49/200 Cal AI reviews. "Paying for it is not worth it if i have to keep manually fixing /inputing everything in" (1★, Oct 2026). "I end up doing it nearly every time I eat, which can take a lot of time." (3★, May 2026). "The AI function is just okay and requires a lot of editing on my end." (2★, Oct 2026). Editing one macro silently changes others: "if I try to change the protein to what I'm actually reading it'll change the calories" (4★, Aug 2025) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Partial plates: "if you take a picture of your food and you only eat half of it, so that you can take leftovers ho[me]..." and "I have to stand up to get the plate within the picture frame" (3★, May 2025) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)

**What works: AI plus database plus editable breakdown**
- MacroFactor: "The ability to give it text alongside a photo and then adjust the results (broken out by ingredients) are critical. I've also been taking pictures of food sitting on scales and it will take the measurement into account." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44224162); "they perform a search of the foods in Macrofactor's database which means that you're more likely to get a good estimate" — [HN](https://news.ycombinator.com/item?id=44237220)
- Lose It: "impressed, not for the caloric estimate, but when given a picture of a breakfast burrito it accurately split it out into the component parts, from there I could manually adjust amounts" (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44223069)
- "I would love to be able to say to MyFitnessPal that 'I ate this and that food, same as usual'... I wouldn't trust a pure AI solution without some proper database behind it." (HN) — [HN](https://news.ycombinator.com/item?id=44224152)
- "AI is excellent for augmenting your tracking experience, it's not yet reliable enough to be the primary tracking method. Consistency is key" (HN, app builder) — [HN](https://news.ycombinator.com/item?id=44225837)
- Description beats photo: "It does do a great job if you describe in detail what's on your plate instead of having to find each individual thing" (Cal AI 3★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)

**ChatGPT as tracker**
- "I speak a sentence every night on a thread to ChatGPT about what I had for breakfast, lunch and dinner along with quantities and it spits out my macros... the easiest and most no nonsense way I have found" — [HN](https://news.ycombinator.com/item?id=44220415); "I do this too and it's been spot on. I also have a very good idea of what I'm eating" — [HN](https://news.ycombinator.com/item?id=44220637)
- "Ive been using ChatGPT to track my calories for 6 months now and dropped 20kg because of it... This isn't super accurate but apparently enough to get an idea" (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44256993)
- A caution from others: "summing a bunch of numbers... over a specific time period are still pretty error prone for LLMs" — [HN](https://news.ycombinator.com/item?id=44220658)

**Subscriptions and freemium AI limits**
- SnapCalorie: "After 3 photos I cannot take another, the message says 'You used all of your photo logs!'" (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44264019). Cal AI billing complaints ("charged me $19 immediately", "cancelled... before the trial ended but I was still charged for the full year") recur throughout the 1★ reviews — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "You cannot download your data. That's lame." (Cal AI 2★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Google Health's Gemini coach food logging (2026): "so inaccurate it's almost dangerous" (Reddit r/fitbit, via TechRadar) — [TechRadar](https://www.techradar.com/ai-platforms-assistants/this-is-a-neverending-fight-fitbit-users-are-sick-of-google-healths-ai-hallucinations-and-now-its-affecting-their-food-tracking-metrics); thread: [r/fitbit](https://www.reddit.com/r/fitbit/comments/1w4gmks/the_ai_coach_food_logging_is_so_inaccurate_its/)

### Inferences
- **Consistency beats raw accuracy for trust.** Users forgive "roughly right" but not "different every time". Caching a user's own repeated meals so the same meal gives the same number directly addresses the top complaint. This matches STEADY's existing cache→USDA→AI design.
- The winning UX pattern is **AI first pass, then an editable ingredient breakdown backed by a real database**, where editing one field does not silently corrupt the others.
- Explicitly prompting for **hidden fats** (oil, ghee, butter: "how much oil, roughly?") turns the most common technical objection into a quick question.

### Gaps
- We found no independent accuracy benchmark with user sentiment for MFP Meal Scan or Lose It "Snap It" specifically. The HN post "5 models tested against kitchen scale" (Jun 2026) had no comments ([HN](https://news.ycombinator.com/item?id=48689528)).

---

## 4. Voice logging: do people want to talk to log food? Social awkwardness? Input preferences

### Takeaway
Among technical and early-adopter users there is **clear enthusiasm** for speaking or typing a free-form sentence, often called faster than taking a photo, and the **absence of voice is now a stated complaint** in Cal AI reviews. There is also a **real skeptic camp** on social awkwardness ("I don't know anyone who openly talks to a machine"). No survey quantifies this. Free-text and voice in one box, plus photo for restaurants and barcode for packaged food, appears to be the preferred mix.

### Cited Findings
- "I actually think it's quicker to just speak to the LLM about your diet than even taking a picture." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44220790)
- "voice is really the perfect UI to me. I would be totally fine if I could trigger a 'call' from the app and talk to an AI on the phone for 30s and it could log my meal, give me some advice" (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44227000)
- Skeptic: "Do you talk to your voice assistant on your devices as-is? Do you do it in the company of others? With the exception of a few legally blind folks I know, I don't know anyone who openly talks to a machine, nor anyone who does it in private." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44238931)
- Multi-item sentences: "just type what you ate... You can log several dishes or meals in the same sentence - You can use voice" (ParrotPal user, HN) — [HN](https://news.ycombinator.com/item?id=44243322)
- Missing voice is now a complaint: "It's a good app to start with but it's has flaws one is no voice recording" (Cal AI 2★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Typing praised: "Love the AI portion that determines what you are by just typing it" (Cal AI 5★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Speech-to-text accuracy concern: "Oh no, it is TERRIBLY wrong. Using VTT is better but still not perfet. The only certain way to do it is measure everything with a scale" (HN) — [HN](https://news.ycombinator.com/item?id=44224891)
- Portion vagueness in natural language: "How does it handle portion sizes? Like if I say 'had a burger' vs 'had a big burger'?" (HN, Jan 2026) — [HN](https://news.ycombinator.com/item?id=46630604)
- Barcode is still valued for packaged food: "I do like the convenience of scanning barcodes, that makes it more accurate" (Cal AI 2★, Jun 2025) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616). Produce, meat and home-cooked food lack barcodes: "a lot of fruit, fish and meat people buy has no barcode" — [HN](https://news.ycombinator.com/item?id=44224638)
- A founder claim (not user voice) that photo is least accurate and that users prefer text: the ParrotPal founder "points out that using photos is one of the least accurate ways for tracking food... Users also seem to like using photos less than text" — [HN](https://news.ycombinator.com/item?id=44221121)
- A vendor-blog claim (unverified) that MacroFactor's and Lose It's voice input is English-only — [nutrola.app (vendor)](https://nutrola.app/en/blog/8-best-nutrition-apps-with-voice-logging-2026)

### Inferences
- **One-tap voice should share a box with typing.** The same natural-language parser serves both, and typing covers the office and public case that the skeptics raise. A widget or lock-screen entry that opens straight into dictation would cut taps without forcing speech.
- **Multi-item, multi-meal sentences** ("2 roti, dal, some bhindi and chai") are the killer capability. For India, **Hinglish speech-to-text** quality is a make-or-break unknown.

### Gaps
- We found **no survey or study** on social awkwardness of voice logging in offices or public places, and no Indian or Hinglish voice-logging user feedback. Vendor blogs make unsourced claims ("manual entry 3 to 5 minutes vs voice 10 seconds"), so we did not rely on them.

---

## 5. Streaks, rings, gamification: liked or resented? Being "red" when over

### Takeaway
Streaks and rings **motivate one segment and harm another**. The harm is concentrated in three moments: **losing a long streak** (especially to a bug or because the user was offline), **being upsold to restore it**, and **feeling judged** (red, low health scores, "over" warnings). Apple Watch ring culture has an active backlash about compulsion ("walk at 11:30 p.m. just to complete my ring"), and some users move to "gentler" alternatives. Wrong-color rings are a trust-killer.

### Cited Findings
**Streak loss**
- "I had technical issues with it yesterday and lost my 395-day streak. The app immediately asked for $10 to restore it. And it just kills my desire to use it from here on." (Cal AI 4★, Sep 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "it drops the streak for no reason... because I didn't have good cell reception it stated 0% analyzed and lost my streak." (Cal AI 4★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "I was three days away from hitting my 100 day log streak on My Fitness Pal. I missed one day and it's back at zero" (X post in the BJHP study) — [StudyFinds](https://studyfinds.com/fitness-app-motivation-study-myfitnesspal)
- Cal AI's "'streak' attempt at gamification is so bad it literally cannot count" (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44221935)
- When Fitbit's 2023 redesign removed steps streaks, user backlash led Fitbit to promise to bring them back (per search snippet; TechRadar article not fetched) — [TechRadar](https://www.techradar.com/health-fitness/fitbit-responds-to-furious-fans-with-five-much-needed-app-fixes)

**Streak and ring as motivator**
- "The streak keeps me motivated to track my calories" (Cal AI 5★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- "I really like the feature that shows milestones, telling you what object is equivalent to your weight loss." (Lose It 4★, ~Mar 2025) — [Lose It App Store](https://apps.apple.com/us/app/lose-it-calorie-counter/id297368629)
- "The rings are meant to be a tool or a reference, and not the end-all, be-all." (Reddit, via Fortune) — [Fortune](https://www.fortune.com/well/2025/01/24/apple-watch-bullied-burn-calories-close-rings-obsession-fitness-trackers-notifications)

**Ring obsession and backlash (Apple Watch)**
- "I feel ashamed but I've been taking a walk at 11:30 p.m. just to complete my ring before midnight" and "I was feeling angry if I exercised and forgot to activate the exercise app." (Reddit r/AppleWatch, via Fortune, Jan 2025) — [Fortune](https://www.fortune.com/well/2025/01/24/apple-watch-bullied-burn-calories-close-rings-obsession-fitness-trackers-notifications); thread: [r/AppleWatch "Ditching the Apple Watch"](https://www.reddit.com/r/AppleWatch/comments/1dxbzfa/ditching_the_apple_watch/) (~mid-2024)
- "After five years focusing on closing the rings, I decided that I don't care anymore... I subscribed to Gentler Streak and enjoy a healthier view on working out" (Reddit, via Fortune) — [Fortune](https://www.fortune.com/well/2025/01/24/apple-watch-bullied-burn-calories-close-rings-obsession-fitness-trackers-notifications)
- "No more stress from constant monitoring, no more notifications that friends have completed workouts... I feel free." (Reddit, via Fortune) — [Fortune](https://www.fortune.com/well/2025/01/24/apple-watch-bullied-burn-calories-close-rings-obsession-fitness-trackers-notifications)
- "There's also this stress to hit these random numbers every single day, where even my rest days didn't feel restful." (TikTok, trainer, via Fortune) — [Fortune](https://www.fortune.com/well/2025/01/24/apple-watch-bullied-burn-calories-close-rings-obsession-fitness-trackers-notifications)
- A columnist turns off all Apple Watch fitness notifications, saying worry about rings and streaks made people more anxious — [Tom's Guide](https://www.tomsguide.com/opinion/i-turn-off-every-apple-watch-fitness-notification-heres-why)

**Red, colors and judgment**
- "sometimes even if i am well under my calorie limit the circle shows as red" (3★); "Rings are constantly flipping colors and missing entries" (2★); "I'll have met my calorie and protein goal for the day but then score will tell me I hadn't?... it makes me lose faith in the whole ai" (1★) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Lose It's mismatched praise: "On cheat days I'll even see 'positive trend noticed' under an unhealthy [day]" (Lose It 4★, ~Dec 2023) — [Lose It App Store](https://apps.apple.com/us/app/lose-it-calorie-counter/id297368629)
- Some users prefer bars to rings: "I love the Energy and Macronutrient target bars, as they are very easy to read (nice color coding and I like that they are bars and not circular graphs)" (Cronometer 5★, ~Jan 2021, older) — [Cronometer App Store](https://apps.apple.com/us/app/cronometer-calorie-counter/id1145935738)
- A SnapCalorie founder (not a user) places fruit and veg counters above the calorie meter, arguing a "maximization mindset" is healthier than a "minimization mindset" — [HN](https://news.ycombinator.com/item?id=44226016)

### Inferences
- For a **gainer**, "closing" rings is naturally a *maximization* goal (eat enough, hit protein), which avoids much of the shame dynamic of deficit apps. STEADY should keep "over" neutral or positive, never red, for gain goals.
- **Streak forgiveness** matters: freezes, grace days, offline-safe counting, and never charging to restore a streak. Losing a long streak is the single most cited demotivating event.
- Ring state must be computed correctly and consistently (no color flicker). Users read ring color as the app's verdict on their day.

### Gaps
- No quantitative data on what share of users like versus resent streaks. No direct r/AppleWatch scrape. We have no gainer-specific reactions to rings.

---

## 6. Favourite apps and why (MacroFactor, Cronometer, MFP, Lose It, Cal AI, Yazio, HealthifyMe); past-day/history views

### Takeaway
- **MacroFactor:** loved for adaptive targets, no ads, fast logging, and AI grounded in its database.
- **Cronometer:** loved for accurate data, micronutrients, and being snappier than MFP.
- **Lose It:** loved for simplicity, free barcode scanning, and milestones.
- **MFP:** kept for its huge database, despite ads, paywalls and the 2026 redesign.
- **Cal AI:** loved for convenience and the lock-screen live activity.
- **HealthifyMe:** the only one with a credible Indian food database.

On history, users want **fast re-logging of recent and repeated meals, copy-to-today, long history, and export**. Short history windows and losing old data cause outrage.

### Cited Findings
- MacroFactor: "It's like going from email to text. There isn't just one thing that works better, rather it is the way the small improvements add up." (5★, ~Nov 2023) — [MacroFactor App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471); "I actually like paying for stuff I find useful, preferring that to the ad machine... MacroFactor's killer feature is you input your daily weight" (HN, 2022) — [HN](https://news.ycombinator.com/item?id=32595611); "Macrofactor is also the only app I've seen that actually estimates your underlying metabolic rate and adjusts accordingly." (HN, Jun 2025) — [HN](https://news.ycombinator.com/item?id=44220948)
- Cronometer: "a lot snappier and less bloated than MFP, which I feel is crippled with ads" (HN, 2022) — [HN](https://news.ycombinator.com/item?id=32598842); "When MFP decided to make the ads in their ad super annoying, I set off to find an alternative... the free version allowed customizing the macros, unlike MFP" (4★, ~Oct 2023) — [Cronometer App Store](https://apps.apple.com/us/app/cronometer-calorie-counter/id1145935738); "It's probably the only thing that would get me to start taking photos of my food, but it would need to be about as accurate as I am in chronometer." (HN) — [HN](https://news.ycombinator.com/item?id=44221173)
- Lose It: "The idea of just having to scan a barcode is super easy and it's hard to forget to log your meal because you always gotta eat!" (5★, ~2019, older) — [Lose It App Store](https://apps.apple.com/us/app/lose-it-calorie-counter/id297368629); "Downside is they constantly try to get you to upgrade." (4★, ~Dec 2023) — same link
- MFP's moat is database breadth: "the databases in all of those are smaller and notably much less accurate" (HN, 2022) — [HN](https://news.ycombinator.com/item?id=32595849)
- Yazio (EU): "Almost every product I scan is already present in the app which was not the case withe MFP." (HN, 2022) — [HN](https://news.ycombinator.com/item?id=32594946)
- Cal AI lock screen and watch: "the live activity tracker that displays how many calories you have left right on your lock screen or Apple Watch is a huge feature" (4★, Jan 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Habit and repeat meals: "Thankfully we're mostly creatures of habit. Source accurate numbers for everything you eat in a week and you're 90% covered for every other week." (HN) — [HN](https://news.ycombinator.com/item?id=44221381); a spreadsheet user: "When I ate something, I'd copy out the row" (HN, 2024) — [HN](https://news.ycombinator.com/item?id=40132105)

**History and past days**
- "why is there not a rapid way to add my most recently logged foods???? The whole point of this app is to reduce the amount of effort to log what you eat." (Cal AI 2★, Sep 2026). "it doesn't really keep track of your recent meals, it only goes back a few items. I hate this. It would be nice to go back and look at what you ate or logged" (3★, Jul 2025). "whenever I try to copy my meals to other days it always says it copied and never actually does" (3★, Oct 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616); "lacking basic functionality such as 'duplicate for today'" (HN) — [HN](https://news.ycombinator.com/item?id=44221935)
- HealthifyMe: "Calorie and macronutrient data is only stored for past 7 days, which makes my weekly deficits tedious to calculate, like I have to use notes app to rewrite all the macros" (1★, Jul 2025); "One of the biggest issues is finding food entries I previously added using the photo feature" (1★, Oct 2026) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)
- Saved meals and recipes: "There needs to be a way to add an entire recipe with all the ingredients, list how many portions it makes" (Cal AI 2★, Jan 2026); "When trying to enter a meal you can't choose ingredients off your saved list" (3★, May 2025) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Trainer review use case: an AI app that can "track pictures and create short descriptions that someone else (my trainer) can easily review has been pretty helpful" (HN) — [HN](https://news.ycombinator.com/item?id=44226171)

### Inferences
- The **journal of past days** should double as the fastest logging surface: tap yesterday's meal, then "add to today". Repeat meals cover most logs for habitual eaters.
- **Long history plus export** is a trust feature. Users notice short windows (HealthifyMe's 7 days) and no export (Cal AI).

### Gaps
- No direct Reddit "favorite app" polls. App Store web pages exposed only about 10 reviews per app for MFP, MacroFactor, Lose It and Cronometer, and several were developer replies. We found no user voice on Yazio beyond one HN comment, and nothing on which history *visualizations* (calendar vs. list vs. weekly averages) users prefer.

---

## 7. Indian users: tracking Indian home food (roti, dal, sabzi, portions), HealthifyMe, data gaps

### Takeaway
HealthifyMe is valued almost entirely for its **Indian food database**. Indian users complain about **duplicate and inconsistent entries (Hindi and English variants with different calories)**, **katori and spoon-based portions**, **aggressive sales calls and upsell pop-ups**, a **7-day history limit**, and **generic coaching**. Hidden oil and ghee in home cooking is the core accuracy problem for both photo and database logging.

### Cited Findings
- Database moat: "there are a wide range of Indian dishes here which really aren't there on any other apps because most of them aren't Indian apps" (4★, 2020); "It has all the indian food items u can think of" (5★, 2019); "my sole focus is the fact that it d[o]es relatively well with Indians foods" (2★, May 2026) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)
- Duplicates and inconsistency: "Every food item I search has multiple (sometimes over 10 similar listings) listings with similar names in both Hindi and English, and mostly different calories and nutrients information for same food item. No tech to [dedupe]..." (1★, Aug 2026) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)
- Portions: "include picture of katori, Chinese bowl and specifically for tea spoon and tablespoons as it wil b very helpful for those who don't have measuring sc[ales]" (4★, 2020, older) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)
- AI-read screenshots ignored: "when I upload a screen shot of with written calorific values (from Swiggy) it still captures what it wants to and assign whatever values, doesn't allow you to modify it individually!" (1★, May 2025) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)
- Just-tracking demand: "Please have an option for unlocking just all the app features without any AI/personal trainer." (4★, Sep 2024); "I don't need AI features or AI image analysis. May be create a simple calorie tracki[ng plan]" (1★, Jan 2026) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)
- Generic coaching: "The plan they make is worse than what you can get from ChatGPT. They give you 7 options of breakfast lunch and dinner" (1★, May 2026); "The coaching and diet recommendations felt generic rather than tailored" (1★, Jul 2026). Strong positives exist for human coaches too ("my coach, Asfa... always prompt in responding", 4★, Jul 2026; "Dropping from 104 kg to below 90 kg", 5★, Jul 2026) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)
- Wearables in India: "I use boat extend, it's honestly quite frustrating to manually input stuff" (4★, 2022) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)
- Hidden oil (general): see the HN "tablespoon of oil" comment — [HN](https://news.ycombinator.com/item?id=44224023). Vendor blogs surfaced in search claim a sabzi can range from about 90 to 250 kcal depending on oil, and that roti calories vary from about 80 to 120 kcal by size and source (vendor content, unverified) — [calfix.app](https://calfix.app/blog/best-calorie-tracker-indian-food), [superliving.app](https://www.superliving.app/blog/indian-food-calorie-chart/), [yourtrainer.in](https://www.yourtrainer.in/blog/indian-food-calories-macro-chart-60-dishes)

### Inferences
- STEADY's INDB/IFCT-seeded database is a real differentiator *if* it is **deduplicated**, with one canonical "dal tadka" rather than ten, and if entries **accept katori, bowl, piece and spoon** as portion units.
- An **oil and ghee question** ("light / normal / heavy tadka?") may matter more for Indian home food accuracy than better photo recognition.
- Indian users are primed to read app-initiated **phone calls as sales calls** (see Section 8). Any "AI calls you" feature needs explicit opt-in and clear framing.

### Gaps
- **No r/fitness_india, r/indianfitness or r/india quotes** (Reddit blocked), no Google Play reviews (the Play page did not render), and **no Hinglish-specific user feedback** found. Indian App Store reviewers skew toward iPhone owners, a higher-income segment, so Android-majority India is underrepresented.

---

## 8. Reactions to AI coaches and to apps that call or message a lot (notification annoyance)

### Takeaway
AI coaches draw **sharp backlash when they are forced, hallucinate, or over-comment**. Google Health's Gemini coach (2026) is the cautionary tale. Users dislike **nagging reminders when they are already ashamed**. In India, **app-initiated phone calls are associated with HealthifyMe's aggressive sales teams**. A small, self-selected group explicitly *wants* AI calls for accountability, with the evidence coming from HN and a 2-review niche app.

### Cited Findings
**AI coaches**
- Google Health (replaced the Fitbit app in May 2026, built around a Gemini coach): Reddit posts call it "ruined" and "slop", and the Play Store was review-bombed — [9to5Google, 27 May 2026](https://9to5google.com/2026/05/27/google-health-roadmap-fitbit-backlash/); threads: [r/fitbit "Thank Google for ruining Fitbit"](https://www.reddit.com/r/fitbit/comments/1to5347/thank_google_for_ruining_fitbit/), [r/fitbit "wtf is this bs app I want a refund"](https://www.reddit.com/r/fitbit/comments/1tomawj/wtf_is_this_bs_app_i_want_a_refund/)
- "This is a neverending fight": the AI "often neglects to add foods when asked, then does so inaccurately" (Reddit, via TechRadar). "I have been trying SO HARD to give this the benefit of the doubt, but the hassle of getting nutrition right in the app finally broke me... I've honestly never been more disappointed in a Google product in my life." (Reddit, via TechRadar) — [TechRadar](https://www.techradar.com/ai-platforms-assistants/this-is-a-neverending-fight-fitbit-users-are-sick-of-google-healths-ai-hallucinations-and-now-its-affecting-their-food-tracking-metrics)
- Google's own roadmap concedes over-commenting and memory problems: "Tune which of your activities warrant a message from the Coach, so you should expect less commentary on brief walks"; "Have better recall of guiding instructions such as 'Stop mentioning…', 'Forget that I…'" — [9to5Google](https://9to5google.com/2026/05/27/google-health-roadmap-fitbit-backlash/)
- HealthifyMe AI and coaches: "AI responses are mediocre" (2★, Jan 2024). On the other hand, "Every morning, I get a detailed summary with AI" (5★, Jan 2025) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)

**Calls and messages**
- HealthifyMe sales calls: "the back end team takes your number from the app and calls you within 24 hours to push their plans" (1★, Aug 2024); "One sales executive continuously kept calling me until the time I got enrolled" (1★, 2021); "the sales team is extremely aggressive and pushy" (1★, 2023) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)
- Shame-triggering reminders: "Hate when my fitness pal asks why I haven't logged my dinner!... leave me alone!" (X post in the BJHP study) — [StudyFinds](https://studyfinds.com/fitness-app-motivation-study-myfitnesspal)
- Email spam: "Received 65536 welcome emails in one row." (Cal AI 1★, Sep 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Wanted reminders: "the daily reminders are a nice nudge if you ask me" (HealthifyMe 5★, Jan 2025) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366); Lose It's free tier praised because it "is perfectly willing to leave you alone and not notify y[ou]" (HN, 2022) — [HN](https://news.ycombinator.com/item?id=32595183)

**AI phone calls (the specific STEADY idea)**
- Desire: "I would be totally fine if I could trigger a 'call' from the app and talk to an AI on the phone for 30s and it could log my meal, give me some advice" (HN, Jun 2025). Note that the user wants to *trigger* the call themselves — [HN](https://news.ycombinator.com/item?id=44227000)
- CallCoach, an AI life coach that phones you twice a day (only 2 ratings, 4.0★): "Morning call forces me to decide what I'm doing that day, evening call makes me admit if I slacked... Already snoozing less" (Nov 2025); "the earliest call you can schedule is 6am, but I start my day at 4am" and wants "more coach personalities" and a free trial (Dec 2025) — [CallCoach App Store](https://apps.apple.com/us/app/callcoach-honest-life-coach/id6752913700)

### Inferences
- An AI that phones you to log food should be **user-scheduled and user-triggered**, **short (about 30 seconds)**, **easy to snooze or skip without guilt**, and **never sales-adjacent**. In India, the HealthifyMe precedent means an unexpected call from a health app reads as a sales pitch.
- An AI coach needs **"stop mentioning X" memory**, should **stay quiet on trivia**, and must **never silently mis-log food**. Mis-logging is what turned Google Health users against its coach.

### Gaps
- No user research on *outbound* AI meal-logging calls specifically, and no Indian user reactions to AI (as opposed to human) calls. The CallCoach evidence is n=2.

---

## 9. Widgets: do users use calorie/fitness widgets?

### Takeaway
Evidence is sparse but consistently positive. Users want **"calories left at a glance"** and a **one-tap "+" quick-add** on the home or lock screen. Cal AI's lock-screen live activity is singled out as "a huge feature". Long-standing widget requests went unanswered at Cronometer.

### Cited Findings
- "the live activity tracker that displays how many calories you have left right on your lock screen or Apple Watch is a huge feature" (Cal AI 4★, Jan 2026) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- Cronometer forum (2018 to 2021, older): the original request wants a "quick glance at my home screen to know how I'm doing or to quick add foods", a small widget showing calories consumed with a macro pie border. "Even just a widget that's a big + that takes me straight to the add food screen would be great." (5 reactions). "I would be happy with repurposing the charts at the top of the diary page as the widget." Frustration at the lack of follow-through: "responses like 'oh that's a brilliant idea' then it's crickets for years" — [Cronometer forum](https://forums.cronometer.com/discussion/897/android-widget)
- Apple Watch sync is a purchase driver: "The only big issue I have is that it doesn't sync to my Apple health or Apple Watch" (Cal AI 4★, May 2025) — [Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)

### Inferences
- A STEADY widget should do two things only: show **ring progress and calories or protein left**, and offer **one-tap entry into voice or text logging**. The second part doubles as the low-friction voice entry point.

### Gaps
- No quantitative widget adoption data was found for any calorie app, and no Android-specific evidence beyond the old Cronometer thread.

---

## 10. Redesign backlash in fitness apps (MyFitnessPal 2025–26, Fitbit 2023, Google Health 2026)

### Takeaway
Every major redesign in this category drew loud backlash with the same pattern: **more taps for core logging**, the **day-at-a-glance diary hidden**, **removed power-user shortcuts** (copy food, swipe between days), **no opt-out**, and **features moved behind paywalls**. Companies held firm (MFP) or published public roadmaps (Google). For STEADY's existing users, the lesson is to **protect the core loop** (log, glance at the day, re-log) and its tap count.

### Cited Findings
- MFP's "Today" tab replaced the Diary (early test Oct 2025; broad rollout v26.16.0, ~21 Apr 2026). Users say simple tasks need more taps, the diary is behind "View All", per-meal macros are harder to find, and logging a full day takes more effort — [PiunikaWeb, 24 Apr 2026](https://piunikaweb.com/2026/04/24/myfitnesspal-new-update-complaints/)
- "has been ruined by being converted to a list of gigantic, space-consuming cards" (Reddit r/MyFitnessPal, via PiunikaWeb) — [PiunikaWeb](https://piunikaweb.com/2026/04/24/myfitnesspal-new-update-complaints/)
- Some users canceled subscriptions or moved to Cronometer, and users urged 1★ review campaigns. MFP said the Today interface is "our path forward" with no legacy mode — [PiunikaWeb](https://piunikaweb.com/2026/04/24/myfitnesspal-new-update-complaints/); [MFP help article](https://support.myfitnesspal.com/hc/en-us/articles/39985611667341-Introducing-the-brand-new-Today-tab); follow-up: [PiunikaWeb, 5 May 2026](https://piunikaweb.com/2026/05/05/myfitnesspal-new-design-update-is-here-to-stay/)
- A single, unverified source reports the rating fell from 3.24 to 1.54 after the update. Other reports say copying individual foods was removed, swiping between days was lost, and macro percentages moved behind Premium — [mwm.ai](https://mwm.ai/articles/app-updates/myfitnesspal-v26-16-0-replaces-diary-with-new-ui-sparking-rating-drop-in-april-2026), [Consumer Rights Wiki](https://consumerrights.wiki/w/MyFitnessPal_regressive_upgrade)
- Fitbit (Sep 2023): criticism on Reddit and Twitter of cluttered UI, complicated navigation, less customization, and "inadequate food tracking" — [Gadgets & Wearables, 30 Sep 2023](https://gadgetsandwearables.com/2023/09/30/fitbit-app-redesign-criticism/); Fitbit promised fixes, including restoring streaks (search snippet) — [TechRadar](https://www.techradar.com/health-fitness/fitbit-responds-to-furious-fans-with-five-much-needed-app-fixes); a user thread: [Fitbit Community](https://community.fitbit.com/t5/Other-Versa-Smartwatches/Not-happy-with-the-new-Fitbit-app/td-p/5507715)
- Google Health (May 2026): a forced migration, Reddit "ruined" and "slop" posts, Play Store review-bombing, and a public fix roadmap — [9to5Google](https://9to5google.com/2026/05/27/google-health-roadmap-fitbit-backlash/)
- Smaller-scale MacroFactor example: "The ability to drag and drop food on the timeline was recently taken away... I don't get why" (5★, ~Jan 2023) — [MacroFactor App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471)
- Counterexample, a welcomed redesign: "the new interface on Healthify is such a big improvement! It's clean, simple" (HealthifyMe 5★, Jan 2025) — [HealthifyMe App Store (IN)](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)

### Inferences
- Before shipping the redesign, STEADY should **benchmark taps-to-log and taps-to-see-the-full-day** against the current app and keep them equal or lower. It should also keep copy and re-log shortcuts and avoid paywalling anything that is free today.
- A redesign that **adds** speed (one-tap voice, widget) while **preserving** the at-a-glance day reads as an upgrade. Hiding the day view behind cards is what MFP users revolted against.

### Gaps
- We could not read the MFP Community thread comments (the page rendered without them), so we have no sentiment ratio. The mwm.ai rating-drop figure is single-source and unverified.
