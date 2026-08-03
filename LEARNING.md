# STEADY — Learning Log

> Concepts explained and understood while building STEADY.
> Each entry is a mental model, not just a definition.

### "Mathematically correct" and "a good recommendation" aren't the same thing
*2026-08-02 · Pattern*

`estimateWeeksToGoal()`'s math was never wrong — given a fixed +300 kcal/day surplus, "10kg × 7700 ÷ 300 ÷ 7 = 37 weeks" is arithmetically exact. The actual bug was one level up: nothing in the app ever asked *should* this be the number shown for a 1-month deadline, or *is 1,280 kcal/day even a safe surplus to recommend*. This is a distinction worth holding onto generally — a formula can be internally flawless and still produce a bad answer, if the inputs feeding it (here: a fixed adjustment that ignored the user's own timeline) were never checked against what's actually true (evidence-based caps on safe surplus/deficit). The fix wasn't "make the math more correct" — the math was already correct — it was adding a layer that asks "is this result something we should actually recommend" before handing it to the user, and showing the honest gap when the answer is no.

### A capped value and an honest value can both be shown at once
*2026-08-02 · Pattern*

When a user's stated goal (a 1-month deadline) conflicts with what's actually safe (a much longer, gentler pace), there are two bad extremes: silently give them the unsafe number they technically asked for, or silently substitute a safer number without saying so (which reads as the app just being wrong about their deadline). The pattern used here — compute both the capped/safe value and the honest/uncapped value, then show both with the safe one clearly marked as the actual plan — avoids either failure. It costs one extra field in the result type (`deadlinePace`, `null` when there's nothing to explain) and one conditional UI block, in exchange for the app never having to lie in either direction. Worth reaching for any time a "what the user asked for" and "what's actually recommended" can diverge — pace, budgets, deadlines, anything with a safety or feasibility ceiling.

### `windowSoftInputMode="adjustResize"` vs. `KeyboardAvoidingView` — two resize systems is one too many
*2026-08-02 · Concept*

Android has its own native, OS-level answer to "the keyboard is covering my content": `windowSoftInputMode="adjustResize"` in the manifest, which tells Android to physically shrink the app's entire window the moment the keyboard opens — no app code involved at all, the same way a desktop window shrinks if you drag its edge inward. iOS has no equivalent — its keyboard just slides up as an overlay on top of whatever's already there, unchanged underneath — which is the whole reason React Native's `KeyboardAvoidingView` component exists: it's a JS-level patch for a problem iOS has and Android, with `adjustResize` set, already solves natively.

**Correction, same day:** the conclusion this led to — disable `KeyboardAvoidingView` on Android since `adjustResize` already handles it — was wrong for this specific app, and broke the original bug it was meant to fix. See the next entry for why: the manifest this reasoning was based on is never actually used by the environment STEADY runs in. The general mental model above (what `adjustResize` does, why iOS needs `KeyboardAvoidingView` and native-Android-with-`adjustResize` doesn't) is still accurate — the mistake was assuming it applied *here*, not the concept itself.

### Expo Go ignores your project's own `AndroidManifest.xml` — native config only applies to real native builds
*2026-08-02 · Tool*

Expo Go (the app from the Play Store/App Store used to preview a project without building it yourself) is a single, pre-compiled container app — the same APK/IPA for every Expo project in existence. It downloads and runs your JavaScript bundle, but its *native* shell (permissions, manifest settings, native modules) was already baked at the time Expo itself published that build, long before your project existed. That means any edit to this project's own `android/app/src/main/AndroidManifest.xml` — including `windowSoftInputMode`, permissions, or anything else native — has **zero effect** while testing in Expo Go, because Expo Go never reads that file at all. It only takes effect once you build a real native binary that actually compiles your project's manifest in: `expo run:android`, an EAS build, or a custom dev client. Practically: if a bug's suspected fix lives in native Android/iOS config rather than JS, always confirm first which runtime is actually being tested — a fix that's "correct" for a future native build can be silently inert (or actively wrong, as it was here) on Expo Go, and there's no error or warning when this happens — the manifest change just quietly does nothing.

### When a pass-rate moves, check a median before believing it
*2026-08-02 · Concept*

Metrics come in two shapes and they behave very differently. A **threshold** metric ("was the answer inside the expected band?") turns every result into a yes/no at a hard cutoff, so a case sitting just inside a boundary can flip to just outside on a trivial shift — and if several borderline cases move at once, the headline number swings even though nothing really changed. A **distributional** metric (median error: how far off are we, typically?) has no cutoff to sit near, so it only moves when the underlying behaviour moves. STEADY hit this exactly: after a set of edge-case fixes our pass rate read 64.2% against 68.4% before, which looked like a regression worth reverting. Re-running the identical code twice more gave 66.3% and 66.3% — a 2.1-point spread from nothing but LLM variance, about the size of the "regression" — while median calorie error sat at 23.7% against 23.8% before, i.e. unchanged. The habit worth keeping: report both, and when the threshold metric moves, look at the distributional one before concluding anything. Also worth noting what we *couldn't* conclude — with only one pre-change sample, a small real regression can't be formally excluded, only judged unlikely.

### `useRef` + `.focus()` — how RN links a tap on a label to a completely different element
*2026-08-02 · Pattern*

HTML solves "clicking this label focuses that input" natively — `<label for="input-id">` — because the browser knows how to look up an element by ID and call its focus behavior for you. React Native has no such linking mechanism; a `TextInput` only responds to taps directly on itself. To make a whole surrounding box (a border + the input + a "months" suffix label) tappable as one unit, the fix is imperative instead of declarative: `useRef<TextInput>(null)` gets a handle to the actual native input instance (conceptually the same idea as holding a reference to an object in Java rather than just its value), then a `Pressable` wrapped around the whole box calls `ref.current?.focus()` in its `onPress` — an explicit "do this" command, rather than relying on any built-in association between the label and the input. This is the general pattern for "tapping near a control should activate it" any time the tappable area needs to be bigger than the control itself.

### An agent loop needs an escape hatch, or it hands the user a dead end
*2026-08-02 · Architecture*

STEADY's chat function runs a small agent loop: ask the model, and if it requests tools (look up today's meals, log water), run them and ask again with the results. It was capped at two calls — sensible, since an uncapped loop can spin forever and cost money. The flaw was what happened *at* the cap: the second call was still offered tools, so the model could reply "I'd like to call another tool" instead of answering. That reply has null content, our JSON parser got an empty string, and the fallback showed "Something went wrong. Try again." The user's meal was gone, not because anything failed but because the conversation ran out of turns mid-thought. The fix is an escape hatch rather than a higher cap: one final call with `tool_choice: 'none'`, which removes the option to ask again and forces an answer from what the model already has. General principle for any capped agent loop — decide explicitly what happens when the budget runs out, because "whatever the last call returned" is not an answer, and silently degrading to an error message is the worst version of it.

### A pass/fail metric can hide a broken user experience
*2026-08-02 · Pattern*

Our edge-case eval scored non-food messages by one rule: did the app avoid creating a phantom food log? By that measure, "should i stop eating rice to lose weight?" passed — no meal was logged. But the actual reply the user received was "Something went wrong. Try again." The test was asking a narrower question than the one that matters, so a completely broken response counted as a success, and would have kept counting as one indefinitely. We only noticed because we printed the reply text alongside the verdict rather than trusting the tick. The lesson: when a test checks for the *absence* of a bad outcome, it says nothing about whether the good outcome actually happened — assert on what the user should receive, not only on what they shouldn't.

### Auto margins centre; `justifyContent: 'center'` centres *and* clips
*2026-08-02 · Pattern*

These two look interchangeable when content fits, and behave completely differently when it doesn't. `justifyContent: 'center'` positions children around the midpoint of the container regardless of whether they fit — so when the content is taller than the box, the overflow spills out of *both* ends and the top gets cut off, which on a phone means the first thing the user was supposed to read is the thing that disappears. `marginTop: 'auto'` with `marginBottom: 'auto'` produces the identical layout whenever there's spare room, because auto margins split the free space evenly between them — but they're defined to absorb only *positive* free space, so the instant free space goes negative they resolve to 0 and the block simply sits top-aligned. Same centred result in the normal case, safe degradation in the bad one. Reach for auto margins by default on any fixed-height screen whose content could grow — and on mobile it usually can, because the user's accessibility text size is not something you control. STEADY's onboarding Stats screen is the case in point: 516px of column against 569px of space on the smallest supported phone, so 53px of headroom stands between "centred" and "the chat bubble is gone."

### If you tune against a test set, it stops measuring quality and starts measuring memorisation
*2026-08-02 · Concept*

We spent a day improving STEADY's food logging by reading the failures in a 100-case test and fixing what we found — masala dosa portions, rice-plate weights, drink additives. Each fix moved the score up, and the score looked like progress. But the moment you use a test's failures to decide what to change, that test stops being an independent measurement: you're no longer asking "how good is the system" but "how well does it handle these hundred specific things". Machine learning has a name for the discipline that avoids this — a *held-out set*, data the system's development never touched. We wrote a second 100 cases with no food overlap and ran both: 80.0% on the tuned set, 68.4% on the fresh one, an 11.6-point gap. Both numbers are true; only the second one predicts what a real user experiences. The rule for STEADY going forward: keep a dataset back, never look at its failures while fixing, and quote the unseen score as the real one. And when a test disagrees with the system, check the test too — several v4 "failures" were our own bands being wrong, including one that penalised the app for using a portion weight our own configuration specifies.

### `flex: 1` is three properties, and the one that bites is `flexShrink`
*2026-08-02 · Pattern*

`flex: 1` is shorthand that expands to `flexGrow: 1, flexShrink: 1, flexBasis: 0`. Two things about it catch people out in React Native. First, it always acts along the container's **main axis**, and a plain `<View>` defaults to `flexDirection: 'column'` — so unlike CSS, where you're usually in a row, `flex: 1` in RN most often means "control my *height*," even when the surrounding code (or the style's name) suggests width. To fill the cross-axis you need nothing at all: `alignItems: 'stretch'` is already the default. Second, React Native defaults `flexShrink` to **0**, where the web defaults it to 1. That difference is what makes this bug so sneaky: in an overflowing container, an element carrying `flex: 1` is often the *only* one permitted to shrink, so it silently absorbs 100% of the overflow and collapses to its `flexBasis` of zero — while every sibling keeps its size and looks perfectly fine. STEADY's onboarding chat bubble hit exactly this: the same `flex: 1` was harmless on five screens and made the message vanish on the sixth, purely because that one screen's content was taller than the viewport. The debugging tell is an element rendering at exactly its own padding with no content height — look for a `flex` shorthand before suspecting the text.

### Rounding a compound unit: convert to the smallest unit first, then split
*2026-08-02 · Pattern*

When displaying a value in a compound unit — feet and inches, hours and minutes, kg and grams — the order of rounding decides whether the output can be wrong. Rounding the *large* unit and keeping a decimal (`170 cm / 30.48 = 5.6 ft`) is a different quantity from the compound form: 5.6 ft is 5 ft 7.2 in, not 5 ft 6 in, so the number reads as something it isn't. Worse, a one-decimal fraction only has ten possible values while a foot has twelve inches, so two inch positions become literally unreachable regardless of input. The safe pattern is always: convert to the **smallest** unit, round once there, then split with integer division and modulo (`totalIn = round(cm / 2.54)`, then `totalIn / 12` and `totalIn % 12`). Rounding a single time at the bottom means the remainder is mathematically guaranteed to stay in range and can never carry into an impossible "12 in" — which is the other classic bug here, and one you get for free rather than having to special-case.

### Always check the units before importing a dataset — kJ and kcal differ by 4.2x
*2026-08-02 · Protocol*

Food energy is published in two units: kilocalories (what apps and food labels show in most countries) and kilojoules (the SI unit, used by European and Indian composition tables). They differ by a factor of 4.184, so importing one as the other is a silent, uniform, enormous error. The Indian Food Composition Tables list bajra as 1456 — which is 1456 kJ, i.e. 348 kcal. Had we loaded that column straight into `calories_per_100g`, every Indian staple in STEADY would have read four times too high, and it would have been *plausible-looking* wrong data: no crash, no null, just a database full of numbers in the wrong unit. The habit worth keeping: before importing any external dataset, pick one row whose true value you already know and verify it end-to-end. A cereal grain is ~350 kcal or ~1470 kJ per 100g — one glance at that number tells you which unit you're holding.

### Loading more data can make a system worse, unless you label what you're loading
*2026-08-02 · Architecture*

Adding data to a lookup system feels strictly additive — more coverage, more matches. It isn't, when the new rows can be matched *wrongly*. IFCT 2017 is 534 raw ingredients out of 542 rows, and STEADY had just been fixed for a bug where cooked dishes matched raw database entries (dry kidney beans at 337 kcal/100g standing in for a bowl of cooked rajma, 2.6x too high). Bulk-loading 526 more raw rows would have handed the matcher hundreds of fresh opportunities to make exactly that mistake. The fix wasn't to skip the data, it was to make its nature *visible*: the seeder appends "(raw)" to names in the ten food groups that are always cooked before eating, so the matcher's existing raw-vs-cooked rule can read it and reject them appropriately. Result was no regression at all. General principle: when adding a data source whose rows carry an implicit assumption (raw, dry, uncooked, per-serving, a particular unit), encode that assumption into the row itself rather than leaving it in the dataset's documentation — the matcher can only reason about what it can see.

### Style flows down through props in React Native — the component doing the work often isn't the one holding the style
*2026-08-02 · Pattern*

React Native components pass presentation down as data: a parent hands a child a `style` object as a normal prop, and the child spreads it onto whatever it renders. `TypewriterText` is a clean example — it handles *behaviour* (reveal one word every 90ms via `setInterval`) and holds zero styling, taking `...textProps` and forwarding them straight to a `<Text>`. Coming from Python/Java, the useful mental model is dependency injection: the child declares "I need something that looks like text props" and the caller supplies them, rather than the child hardcoding its own appearance. The practical consequence when hunting down a visual bug: the file whose name matches the visible effect is frequently the wrong file to edit — trace the `style` prop *upward* to whoever constructs it. In STEADY that meant a font-size change to the animated onboarding greeting landed in `ChatBubble`, not in `TypewriterText`.

### Open data licences: "free to use" and "free of obligations" are different things
*2026-08-02 · Protocol*

Open datasets carry licences, and two common ones behave very differently for a commercial app. **CC0** (USDA FoodData Central) is public domain — take it, use it, no strings, no attribution required. **ODbL** (Open Food Facts) permits commercial use but is *share-alike*: if you combine that data with another database, the resulting combined database must itself be published as open data. For STEADY that would have meant open-sourcing our entire `food_items` table, because it mixes USDA, INDB and our own resolved values. Neither licence is better in the abstract — the point is that "free" describes the price, not the obligations, and share-alike terms propagate into whatever you merge them with. Check the licence *before* designing around a dataset, because discovering it after you've merged is much more expensive than discovering it before.

### Rank your data sources by trustworthiness, and only fall through when the better one is empty
*2026-08-02 · Pattern*

When several data sources can answer the same question, the instinct is to search them all at once and let the best match win. That's usually wrong when the sources differ in *quality*, because a noisy source can produce a superficially better-scoring match than a clean one. USDA's Branded tier is a good example: it holds 1.9M real packaged products (searching "maggi noodles" finds 3,217 genuine hits the other tiers can't), but its descriptions are manufacturer marketing text, so "amul butter" surfaces "BUTTER BALLS, BUTTER". Merged into one search, that noise would routinely beat the lab-measured generic entry for plain butter. Structuring it as ordered tiers — curated lab data, then prepared-dish surveys, then branded — means the noisy source is only ever consulted when everything better came back empty, at which point a messy real product still beats an LLM inventing numbers. The general shape: prefer *fallback chains* over *merged search* whenever your sources aren't equally trustworthy.

### Model confidence scores are usually not calibrated — check before you build on them
*2026-08-02 · Concept*

When an LLM returns a `confidence: 0.85` alongside its answer, it's tempting to treat that like a probability — 85% likely correct — and build logic on it ("if confidence is low, ask the user"). In reality these numbers are generated text, not a measured quantity, and models tend to emit a narrow band of confident-sounding values regardless of how right they are. STEADY's parse step is a clean example: across 93 meals it only ever produced 0.80, 0.85, 0.90 or 0.95, never once going below 0.80, with 86% of meals bunched in the middle two. The ranking was directionally real (0.80-confidence meals averaged 47% calorie error, 0.95-confidence ones 3%), but the *range* was far too compressed to threshold on — a cutoff at 0.80 fires on nothing at all. The lesson: before designing a feature around a confidence score, plot its distribution against actual correctness. "Is it correlated?" is the easy question; "is it spread out enough to draw a line through?" is the one that decides whether you can use it.

### Prefer letting users correct over asking users to confirm
*2026-08-02 · Architecture*

The intuitive fix for an AI that sometimes guesses wrong is to make it ask a follow-up question when it's unsure. That design has a hidden prerequisite: you must be able to detect *which* cases are wrong at the time you produce them. We measured that for STEADY's food logging and could not — neither the model's own confidence nor deterministic signals (was the food an ungrounded guess? was the wording vague?) separated failures from successes, with the best combined rule firing on 45% of meals to catch half the errors. When a confirmation prompt can't be targeted, it degenerates into interrupting almost everyone almost always, which costs more in friction than it buys in accuracy. The alternative shape is to log the best guess immediately and make it trivially correctable — surface the portion on the card, one tap to adjust — so the cost falls only on the minority of logs that are actually wrong, and only when the user notices. STEADY already has the backend for this (`editMealFromText` plus the deterministic rescale guard); it's a UI affordance, not new intelligence.

### Yield factors: why raw and cooked versions of a food are different foods
*2026-08-02 · Concept*

100g of dry kidney beans and 100g of cooked rajma are not the same thing nutritionally, and the difference is enormous — roughly 337 kcal versus ~135. The reason is water: dry legumes absorb about 2.5x their own weight while cooking, so the same calories end up spread across 2.5x the grams. Nutrition science calls that ratio a *yield factor*, and dietary-assessment guidelines apply them precisely because matching a cooked dish to a raw database entry is a well-known way to overestimate energy. STEADY hit this exactly: USDA returned "Beans, kidney, mature seeds, raw" for "rajma", and our pipeline then multiplied that raw density by a *cooked-portion* gram weight — two correct-looking steps composing into a 2.6x error. The mental model to keep: whenever a per-100g figure and a gram weight come from different sources, check they describe the same physical state of the food, because neither number looks wrong on its own.

### Few-shot examples only cover the shapes they demonstrate
*2026-08-02 · Pattern*

Our food-logging prompt had six worked examples of intent classification, and the model still misread six perfectly clear food messages as chat. The pattern was exact: every failure was a bare noun phrase ("a plate of rajma chawal", "chicken curry with rice"), and every one of our log examples was verb-led ("I had 2 eggs and toast"). The model had been shown what a food log looks like *when it has a verb*, and generalised the wrong boundary. The intent-classification literature says this directly — demonstrations that are semantically closer to the real queries produce the largest in-context gains — and adding four bare-noun-phrase examples cut the failures from six to one. The lesson for STEADY: when picking few-shot examples, don't just cover the *categories* you care about, cover the *surface forms* real users actually type, because an LLM will happily learn an unintended rule from a set of examples that all happen to share an incidental feature.

### Fix a bug at the layer that always runs, not the layer you happen to be editing
*2026-08-02 · Architecture*

We'd already written a rule telling the model that milk in coffee is a splash, not a second glass — and it never once fired. The reason is where it lived: the *match* step, which by design only runs for cache misses, since a cache hit already knows the food's macros and skips the LLM entirely. Milk was AI-estimated with no USDA portion data, so it never took the path the fix was sitting on. Moving the same rule into the *parse* prompt — which runs for every food on every message, regardless of cache state — fixed it immediately, taking "coffee with milk" from 3.6x over to correct. The general lesson: before writing a fix, trace which code paths the broken input actually travels. A rule placed on a conditional path silently protects only some inputs, and the ones it misses look identical to the ones it catches.

### A cache that stores only half the answer hides the other half's bugs
*2026-08-02 · Architecture*

STEADY caches each food's nutrition *per 100 grams*, which is what makes repeat logs deterministic and free. But the number a user actually sees comes from two things multiplied together: per-100g nutrition × how many grams they ate. We only ever cached the first one. So on a cache hit the resolver would skip the USDA lookup entirely — the whole point of a cache — and in doing so never learn that "a bowl" of dry cereal is ~30g, silently keeping the AI's original 150g guess (a bowl-of-cooked-*rice* weight) forever. The per-100g figure was perfectly correct and the answer was still 3x wrong. The general lesson: when a computed result depends on several inputs, caching a subset can freeze the *uncached* inputs at whatever value they happened to have, and the bug is invisible because the cached part audits clean. We fixed it by caching portions alongside nutrition (migration 023) so both halves are grounded.

### Multi-value URL parameters: repeat the key, don't join with commas
*2026-08-02 · Protocol*

To pass several values for one query parameter, there are two conventions: repeat the key (`?dataType=A&dataType=B`) or join them into a single value (`?dataType=A,B`). They are not interchangeable — the joined form puts commas, spaces and parentheses *inside* one value, and some gateways reject that outright. Our USDA client used the joined form with a value containing parentheses, `Survey (FNDDS)`, and it failed with a 400 roughly two times in three (we measured: 2/6 vs 6/6 for the repeated form). Worse, it failed *intermittently*, which is why it survived so long — an occasional success looks like flakiness, not a bug. Two lessons for STEADY: prefer `params.append(key, value)` over joining when an API takes multiple values, and treat an intermittent 400 as a bug to reproduce and measure, not noise to retry past.

### Know your problem's ceiling before you decide your result is bad
*2026-08-02 · Concept*

When STEADY's food-logging eval came back at ~40%, the instinct was that something was badly broken. Checking the literature first changed the whole frame: the closest published benchmark (NutriBench, 2024) has state-of-the-art at 66.8% for this exact task, and MyFitnessPal — a 15-year-old product with a 14-million-food database — reports ±18% portion error with 1 in 4 photo logs needing manual correction. Estimating calories from "a bowl of dal" is genuinely, irreducibly hard, because real bowls and real recipes vary. That reframing changed what we built: not a hunt for one broken thing that would take us to 95%, but grounding the guessy step in real reference data and, longer term, making corrections easy for the user. It also changed how we measure — our strict "all four macros inside a hand-drawn band" test reported 42% where the literature's standard "calories within ±25%" measure reported ~58-64% on the very same run. Pick the metric the field uses before concluding your system is an outlier.

### In-context pattern volume can beat an explicit instruction — the fix is removing the pattern, not arguing louder
*2026-08-02 · Pattern*

An LLM builds its next response partly from explicit rules (the system prompt) and partly from imitating the *shape* of the conversation it's looking at — if the last 10 exchanges all look like "user says something → assistant chats back," a fresh instruction saying "but classify each message independently" competes against ten real examples showing the opposite, and the pattern can win. This showed up concretely: STEADY's food-logging function replayed every earlier food log as an ordinary chat reply, and after enough of those piled up in one day, the model started treating brand-new food logs as chat too — even with an explicit rule against it stated plainly, twice, in different positions in the prompt. Three separate wording fixes failed to move it. What worked was structural, not verbal: stop feeding the model the repeated shape in the first place — collapse food logs into one short factual note instead of replaying them as N separate conversational turns. Lesson: when a model won't listen to an instruction, check whether the *shape* of what it's looking at is quietly out-arguing the words — no amount of rephrasing beats removing the counter-example.

### Deploying an edge function is a required, separate step — editing the file on disk changes nothing live
*2026-08-02 · Tool*

Unlike a local dev server that picks up file changes automatically, a Supabase Edge Function only runs the version that was last uploaded with `supabase functions deploy <name>` — editing `index.ts` locally has zero effect on what a real HTTP request actually executes until that command runs. This bit hard during debugging: several "the fix didn't work" moments in a row were actually testing against the old, undeployed code, because the edit-then-test loop skipped the deploy step. Lesson for STEADY going forward: any edit to a file under `supabase/functions/` needs `supabase functions deploy <function-name>` before the next test call means anything — treat "did I deploy?" as the very first thing to check whenever a fix that should have worked apparently didn't.

### Temperature 0 makes an LLM *more* repeatable, not perfectly deterministic
*2026-08-02 · Concept*

"Temperature 0" is often described as making a language model deterministic — always pick the single most likely next word, so the same input always gives the same output, similar to how a pure function in code always returns the same result for the same arguments. In practice, hosted LLM APIs don't fully guarantee this: floating-point math run across different GPU batches, hardware, or backend routing can produce tiny numerical differences that occasionally flip which token was "most likely," especially in longer, more open-ended outputs like a food's estimated gram weight. STEADY's eval caught this directly — the exact same message ("ate way too much pizza tonight, like 4-5 slices") produced a reasonable ~700g estimate on one run and an inflated 1000g estimate on another, with nothing else about the request different. Lesson: temperature 0 is worth keeping (it meaningfully reduces variance and is the right default for something like macro estimation), but "it's temperature 0" is not a guarantee that reruns will match — don't build logic that assumes byte-for-byte reproducibility from an LLM call, even at temperature 0.

### A migration file in the repo isn't a migration that ran — `supabase db push` is the step that makes it real
*2026-08-02 · Tool*

Writing `021_reminder_config.sql` and committing it to the repo does nothing to the actual database by itself — it's the same relationship as writing a `.java` file versus running `javac` and executing the class. The file is just a recipe sitting on disk until `supabase db push` connects to the real Postgres instance and executes it. `supabase migration list` shows this as two columns, Local and Remote — a migration only counts as "applied" once its number shows up in both, and STEADY's Reminders Save button broke silently in exactly this gap: the TypeScript code (`reminderStore.ts`) was written assuming a `config` column that only existed in the local file, never on the server the app actually talks to. The general lesson: after writing any new migration, `supabase db push` isn't a separate deploy step to remember later — without it, the code that depends on the new schema has nothing real to talk to, and will fail in a way that's easy to misdiagnose as an app bug rather than a database one.

### `CREATE OR REPLACE FUNCTION` can refuse an unchanged-looking signature — Postgres checks the catalog, not the SQL text
*2026-08-02 · Tool*

Postgres normally lets `CREATE OR REPLACE FUNCTION` swap a function's body freely, the same way redefining a method in Java doesn't require deleting the class first. But it refuses if the function's *return shape* changes — and it turns out to check this far more literally than "does this look the same": rewriting `find_due_reminders()` with an identical `RETURNS TABLE (user_id UUID, reminder_type TEXT, local_time TEXT)` to what migration 013 already had still failed with `SQLSTATE 42P13: cannot change return type of existing function`, because Postgres compares the *catalog-level* representation of the OUT parameters, not the SQL text you typed. Practically this means `CREATE OR REPLACE` on a `RETURNS TABLE` function is a check you can fail without any visible reason why, even when a human reading both versions side-by-side sees no difference. The reliable fix, whenever a function's return shape is being touched at all (even ostensibly unchanged), is `DROP FUNCTION IF EXISTS name(arg_types)` followed by a plain `CREATE FUNCTION` — dropping first sidesteps the compatibility check entirely, since there's no old version left to compare against. Worth remembering as a default pattern for STEADY's SQL functions going forward, not just a one-off workaround.

### One flat shape can't hold seven different reminder types — reaching for a discriminated union
*2026-08-02 · Pattern*

`reminderStore.ts` originally gave every reminder type the same shape: `{ enabled, times: string[] }`. That works fine for "remind me every day at 7:30 PM" (workout, walking), but it can't honestly represent "which of my 5 meals am I tracking, and at what time each" (meal), "every hour vs. N specific times within a window" (water), "weekly on Tuesday vs. monthly on the 25th" (weight, health log), or "an open-ended list of named medicines with their own doses and times" (medicine) — those aren't just more fields, they're fundamentally different *data*, and cramming them all into one `times: string[]` either loses information or requires ad-hoc string encoding no one could read. The fix, matching the Claude Design mockup exactly, is a TypeScript discriminated union: one `ReminderConfig` type that's actually five different shapes (`DailyConfig | MealsConfig | WaterConfig | RecurringConfig | MedicineConfig`), each tagged with its own `kind` field, unioned with `|`. This is the same idea already used for `ChatMsg` in `HomeScreen.tsx` (see the 2026-08-01 entry below) — the Java/C++ analogue is a sealed interface with different implementing classes, or a tagged `union` in C paired with an enum discriminant. Once you check `draft.kind === 'meals'`, TypeScript *narrows* the type inside that branch and lets you access `draft.meals` — but refuses to compile if you try to read `.meals` before that check, or read `.freq` (a `RecurringConfig`-only field) on a `WaterConfig`. Matters for STEADY specifically because the UI now branches the same way: `ReminderDetailScreen` picks which "body" component to render (`DailyBody`, `MealsBody`, `WaterBody`, `RecurringBody`, `MedicineBody`) based on the same `kind` tag that the type system is already tracking, so the UI branch and the data shape can never drift out of sync — the compiler enforces it.

### Eval harnesses — testing AI output the same way you test code, with tolerance bands instead of exact equality
*2026-08-02 · Pattern*

A normal test (like the Jest suite this repo already has) asserts exact equality: call a function, check the output matches one precise expected value. That doesn't work for AI output — ask an LLM to estimate the calories in "two slices of pizza" and there's no single correct number, because real pizza slices vary in size. An eval is the AI-engineering answer to this: instead of one assertion, you build a curated list of `(input, expected range)` pairs — a food description and a plausible min/max for each macro, sourced independently of the AI (from known nutrition facts, not by asking the model) — then run the whole pipeline against every example and check "did the output land inside the expected range," not "did it match exactly." The output is a pass rate (e.g. "27/30, 90%") plus a breakdown of *where* it's failing, which turns "the AI seems wrong sometimes" into a specific, measurable, fixable claim. This only became possible for STEADY's food logging once macros stopped being invented per-request by the LLM and started being resolved from a cache (see the 2026-07-02 macro-resolver redesign) — a nondeterministic pipeline can't be usefully eval'd, because the same input might pass on one run and fail on the next for no real reason.

### Why Deno code can run unmodified in a plain Node script
*2026-08-02 · Tool*

Supabase Edge Functions run on Deno, a separate JavaScript runtime from Node (the one `npm`/Expo/Metro all use) — Deno's defaults are stricter (no filesystem or network access unless you explicitly allow it) and it imports packages straight from a URL (`https://esm.sh/...`) instead of installing them into `node_modules`. That sounds like it'd make Edge Function code impossible to reuse outside of Deno, but in practice most of a well-written module doesn't touch anything Deno-specific — `macroResolver.ts` turned out to use only `fetch()` (which exists natively in both runtimes) and a plain Supabase client object passed in as an argument, no `Deno.*` globals at all. That meant the eval script could import it directly from a Node/tsx script with zero changes, just by pointing at the relative file path instead of the `esm.sh` URL — the only Deno-only line in the whole file was its own `import` statement for a sibling module, not anything inside the function bodies. Lesson for STEADY: keep business logic in `_shared/*.ts` free of `Deno.*` calls (env vars and secrets passed in as arguments, not read globally) and it stays portable to any JS runtime, not just the one it was written for.

### There's no single "correct" calorie count for home-cooked food — an eval has to test for systemic errors, not exact numbers
*2026-08-02 · Concept*

When the eval flagged "poha" as wrong (589 calories predicted vs. an expected ~250), the instinct was to assume the cached nutrition data was broken. Checking it properly — does the stated calorie count actually match what its own protein/carbs/fat add up to, using the standard rule that protein and carbs are ~4 kcal/gram and fat is ~9 kcal/gram — showed the row was internally consistent to within 1%. The real explanation: poha genuinely varies 2-3x in calorie density depending on how much oil the cook uses, the same way "a slice of pizza" varies by pizzeria. There is no one true calorie count for "poha" any more than there's one true count for "a sandwich" — real food has a *range*, not a point value. This is why the eval script compares against a min/max band per food rather than a single number, and why a "failure" always needs a second look before assuming the app is wrong: sometimes the app is right and the test's expectation was too narrow. The 4/4/9 cross-check (stated calories vs. calories recomputed from the macros) is a fast, reusable way to tell "this specific data row is internally broken" apart from "this food is just naturally variable."

### A sanity-check anchor only works if it's matched to the right food category
*2026-08-02 · Pattern*

The AI-estimate fallback in `macroResolver.ts` has a list of rough calorie-per-100g ranges to keep its guesses believable (e.g. "oils ~900 kcal/100g," "vegetables 20-100") — a guardrail against the model inventing wildly wrong numbers. It still produced "butter sauce: 900 kcal/100g, 100g fat per 100g" (i.e. claiming the sauce was literally pure fat by weight, which is physically impossible — even melted butter itself is only ~81g fat/100g, the rest is water and milk solids). The anchor list wasn't wrong, exactly — it just didn't have a category for "sauce/gravy," so the model reached for the nearest-sounding one ("oils") instead of reasoning that a sauce is a diluted mixture, not a pure fat. The general lesson: a sanity-anchor list only constrains the failure modes it explicitly names — a food that doesn't cleanly fit any listed category can still slip through by getting matched to the wrong anchor, so anchor lists need to be widened reactively as new "doesn't fit anywhere" cases turn up, not written once and assumed complete.

### "Mounted" and "focused" are different things in React Navigation
*2026-08-01 · Concept*

When Screen A pushes Screen B on top of a navigation stack, Screen A doesn't unmount — it's still sitting there in memory, just hidden behind B, the same way a background window in a desktop OS is still running, just not the one receiving keyboard input. That matters because a plain `useEffect` has no idea whether its screen is the one currently visible — it only knows "a value I'm watching changed," and it'll fire that reaction even while its screen is buried three levels deep in the stack. `GroupsIntroScreen`'s redirect (`if I already have a group, skip straight to the dashboard`) was written as a plain `useEffect` watching the Zustand store, and it kept firing in the background the entire time the user was two screens forward on Create → Invite, because "the store changed" doesn't imply "my screen is what the user is looking at." `useFocusEffect` (from `@react-navigation/native`) is the fix for exactly this gap — it only runs its callback while the screen is the genuinely active one, and pauses again the moment something else takes focus. Rule of thumb for this app going forward: any effect whose job is "react to shared state by navigating somewhere" belongs in `useFocusEffect`, not `useEffect` — a plain `useEffect` is only safe for logic that doesn't care who's currently looking at the screen (e.g. one-time data fetching on first mount).

### Row Level Security (RLS) recursion, and why `SECURITY DEFINER` fixes it
*2026-08-01 · Architecture*

Every table in Postgres can carry a "who's allowed to touch this row" rule (Row Level Security), enforced by the database itself rather than trusted to the app — like a lock on every drawer of a filing cabinet, checked automatically on every open, not just when the app remembers to check. Until Groups, every rule in STEADY was the simple shape "you can only see rows where `user_id = you`," so the lock only ever needed to look at the row itself. Groups needed a fundamentally different rule — "you can see this row because you and its owner are in the same group" — which means the rule has to go check a *second* table (`group_members`) to answer the question. The trap: writing that check directly inside `group_members`' own security rule means the rule has to read the very table it's protecting, which is circular — Postgres would be evaluating the lock in order to open the drawer that the lock is attached to. The fix is a small helper function marked `SECURITY DEFINER` (same idea as a Unix setuid binary — the function runs with its *owner's* permissions, not the caller's), which can freely peek inside `group_members` without re-triggering that table's own security rule, breaking the cycle. Every other table's group-visibility rule reuses that same helper function instead of repeating the logic.

### A trigger reading its own future-state can race against itself in a batch insert
*2026-08-01 · Pattern*

While verifying the Groups migration against a real Supabase database (before writing any app code — worth doing for a first-of-its-kind feature like this), a trigger meant to fire a "logged a meal" feed event only on someone's *first* meal of the day quietly failed whenever 2+ meals got inserted in one batch (e.g. a photo log that creates several rows at once). The bug: the trigger decided "is this the first meal today?" by counting matching rows in `meal_logs` — but when multiple rows are inserted in the same SQL statement, Postgres fires each row's `AFTER INSERT` trigger only once *all* those rows already exist in the table, so every single firing sees the exact same final count. "Count equals 1" was never true for a 3-meal batch, so the feed event silently never fired even though everything else (points, streak) still worked correctly. The fix: instead of asking meal_logs "how many rows exist now," the trigger asks its *own* ledger table "had I already marked today as logged, the last time I ran" — a value it fully controls and updates row-by-row within the same transaction, so it can't drift out of sync with itself the way a recomputed count can. General lesson: when a trigger needs to know "was this the first change in this batch," derive that from state the trigger itself maintains, not by recomputing a count from the table that triggered it.

### Local time vs. UTC — why `toISOString()` is the wrong tool for "what day is it"

*2026-08-01 · Pattern*

A JavaScript `Date` object internally stores exactly one thing: a single absolute instant in time (milliseconds since 1970, in UTC) — it has no concept of "which timezone this Date is in," because it isn't in any timezone, it's just a point in time, like a Unix timestamp in Python. What differs is how you *read* it back out. `date.toISOString()` always formats that instant in UTC, no matter what — so slicing it for "today's date" gives you UTC's today, not the phone's. `date.getFullYear()`/`getMonth()`/`getDate()`, by contrast, format that same instant using whatever timezone the *device's OS* is currently set to — which is exactly what "what day is it for this user" should mean, and it requires no permission at all, since the OS already knows its own clock. This app had the bug backwards in a dozen places: computing "today" for logging via `toISOString()`, which meant anyone in a timezone ahead of UTC (like India, UTC+5:30) had their late-night entries silently mis-dated to the *previous* day. The fix was a single shared helper (`toLocalDateString`) built on the local getters, used everywhere "today" needs to mean "today where this specific user is standing," matters for STEADY specifically because every core feature (meal logs, weight, water, streaks) is keyed by calendar day.

### Why a scheduled server job can't just ask "what timezone is the user in"

*2026-08-01 · Architecture*

The client-side timezone fix (reading the phone's local clock) doesn't work for code that runs on a schedule inside the database, like the pg_cron job that resets everyone's daily AI-usage quota — there's no "current user's phone" to ask, because nothing on the phone triggered this job; it just wakes up once a day on its own. The only way a server-side process can know a specific user's local day is if that information was saved to the database in advance. That's why `profiles.timezone` exists as an IANA name (e.g. `"Asia/Kolkata"`, not just a raw offset like `+5:30`, since IANA names also track daylight-saving rules that a fixed offset can't) — the client saves it once per session using the same `Intl.DateTimeFormat().resolvedOptions().timeZone` API used for the local-date fix, and Postgres's `AT TIME ZONE` operator then converts `NOW()` (server UTC) into that specific user's wall-clock time entirely inside a single SQL query. Matters for STEADY specifically because this same mechanism now backs three different features — reminders, the "already logged today" check before sending one, and the usage-limit reset — all of which needed a *server-computed* notion of "this particular user's today," which is a fundamentally different problem from "what day is it on this device."

### RPC functions and atomic counters — why "read, add one, write back" is unsafe with multiple users

*2026-08-01 · Architecture*

Every previous Supabase call in this app has been a plain table operation: `select`, `insert`, `update`, `upsert` — the client asks for rows, gets rows back. The admin-ping counter needed something different: one shared number, bumped by many different users' devices, that must never lose an increment even if two people tap the button in the same second. The naive approach — `select` the current count in the app, add 1 in JS, `update` it back — has a race condition: if two devices both read `count = 5` before either writes, they both write `count = 6`, and one tap vanishes. This is the same class of bug as two threads doing `x = x + 1` on a shared variable without a lock in Java — the read-modify-write isn't a single indivisible step. The fix is a Postgres RPC (Remote Procedure Call): instead of shipping the read and the write separately, we ship a whole SQL statement — `UPDATE admin_pings SET count = count + 1 ... RETURNING count` — as one function (`increment_admin_ping()`) that runs entirely inside the database in a single step. Postgres serializes concurrent writes to the same row internally, so this specific increment can't race no matter how many devices call it at once. The client calls it with `supabase.rpc('increment_admin_ping')` instead of a table method, and gets back the authoritative new total directly — matters for STEADY specifically because this is our first read-modify-write pattern that's genuinely global rather than scoped to one user_id, where per-user races were never possible to begin with.

### Bisecting toward a bug instead of theorizing about it — adding variables one at a time to a known-working baseline

*2026-08-01 · Pattern*

N11 took four attempts, and the difference between the first three (each wrong or incomplete) and the fourth (correct, confirmed before shipping) wasn't better reasoning about React Native internals — it was a different *method*. The first three attempts each started from reading the broken file and theorizing about what might be different from the working one. That's reasoning from a *diff of two already-different things* — every difference is a candidate, so it's easy to fixate on a real, plausible-sounding one that isn't the actual cause, especially when React Native's internals genuinely support several competing explanations for the same symptom. The fourth attempt inverted the method: start from a version *proven to work* (a bare Modal + DrumPicker, confirmed on-device), then add back exactly one piece of the real file's structure at a time — the remount-on-open pattern, then the backdrop's `Pressable`+`onPress` — testing on-device after each addition. This is the same idea as `git bisect`: instead of reading a diff and guessing which line is the culprit, you materialize each candidate as its own testable state and let reality rule candidates out one at a time. It only takes as many rounds as there are real variables, and each round produces a definite yes/no instead of a plausible-sounding theory. The general lesson for STEADY: when a bug resists explanation from code alone and a device is available to test on, prefer building an incremental reproduction over accumulating more reading and more theories — a single confirmed "this exact change reproduces it" is worth more than several confident explanations that turn out to be wrong on-device.

### Touch responder negotiation — why a `Pressable` around a `ScrollView` can steal its drags

*2026-08-01 · Pattern*

React Native's touch system has one gesture "owner" at a time — when a finger touches down, every component in that touch's path (parent and child alike) gets asked "do you want this gesture?", and the first one to claim it wins, blocking everyone else, including children, from ever receiving it. `ScrollView` claims a touch when it looks like a drag (movement past a small threshold in its scroll direction); `Pressable` claims a touch as soon as it starts, so it can show its press state. When a `Pressable` wraps a `ScrollView` — like both drum-picker sheets in this app did, via `<Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>` used purely to stop a tap from bubbling to a backdrop's `onPress` — the `Pressable` is asked first, since it's the parent, and on Android it can win that negotiation before the child `ScrollView` gets a chance to recognize the gesture as a drag at all. The result looks exactly like a frozen scroll view: touches land, nothing scrolls, because the touch was never actually delivered to the thing that would have scrolled. The Java analogue is a `MouseListener` on an outer container consuming a mouse-drag event before it ever propagates down to a child component's own listener — the child isn't buggy, it's just never notified. The general lesson for STEADY: a `Pressable`/`TouchableOpacity` should only wrap the thing that's supposed to visibly react to being pressed. For "block a tap from reaching something behind me" with no actual visual feedback needed, a plain `View` is the correct tool — it never enters responder negotiation at all, so it can't out-compete a child gesture, and it doesn't need `stopPropagation` either, since a sibling's own `onPress` (like the backdrop's) only fires for a touch that starts and ends on that sibling's own surface, never for one that lands on an unrelated view mounted on top of it.

### Discriminated unions and optional fields — adding data to only some variants of a type
*2026-08-01 · Pattern*

`ChatMsg` in `HomeScreen.tsx` is what TypeScript calls a discriminated union: one type that's actually five different shapes glued together with `|`, each tagged by a shared `type` field (`'user' | 'thinking' | 'meal_card' | 'answer' | 'error'`) so the compiler knows exactly which extra fields exist once you check that tag — the same idea as a Java sealed interface with different implementing classes, or a C `union` paired with an enum discriminant, except TypeScript narrows the type automatically inside an `if (msg.type === 'user')` block. To add timestamps to chat bubbles, we didn't touch all five variants — only `user` and `answer` got a new `sentAt?: string` field (the `?` makes it optional, so old in-memory messages built before this change still type-check without a value). This matters for STEADY specifically because the union will keep growing as new message kinds get added (voice notes, reactions, etc.), and this pattern — add a field to only the variants that need it, mark it optional if not every code path can supply it yet — is how to extend it without a large, all-at-once migration.

### Matching a hand-designed reference to existing design tokens instead of inventing new colors
*2026-08-01 · Pattern*

When Shivam handed over a screenshot of his own Claude Design mockup for the chat bubbles, the fix wasn't "copy these exact hex codes" — it was to check whether the app's existing theme files (`homeColors.ts`) already had matching tokens, and reuse those instead of hardcoding new literals. The indigo in the mockup was already `homeColors.accent` (`#6366F1`), and the light gray bubble was already `homeColors.surface` (`#EEEDF4`) — both were already used elsewhere in the app (buttons, active states), so reusing them keeps the chat bubbles visually consistent with every other accent-colored element on screen, and means a future rebrand only requires changing the token in one file instead of hunting down duplicated color literals. This matters for STEADY specifically because the codebase already has two overlapping palettes (`theme/colors.ts` and `theme/homeColors.ts`) — grabbing values from the *correct* one for whatever surface you're editing (`homeColors` for anything on the Home screen) avoids adding a third, slightly-different shade of the same color.

### Database triggers and cascade deletes — a chicken-and-egg ordering trap

*2026-08-01 · Architecture*

A trigger is code the database runs automatically whenever rows change — you never call it directly, Postgres calls it for you, the same mental model as a Java event listener attached to an `INSERT`/`UPDATE`/`DELETE` instead of a button click. STEADY has one, `update_daily_summary()`, that keeps a cache table (`daily_summaries`) in sync whenever `food_entries` rows change, so the home screen can read one pre-summed row instead of re-adding every food item on every load.

The trap: `food_entries` also has `ON DELETE CASCADE` pointing at its parent `meal_logs` row, meaning "if the parent meal gets deleted, automatically delete its food entries too" — Postgres handles this itself, no app code needed. But that cascade delete happens *inside* the same delete statement as the parent, and it fires the `food_entries` trigger for each cascaded row. If that trigger tries to look something up from the parent (`SELECT ... FROM meal_logs WHERE id = OLD.meal_log_id`), the parent is already gone — the lookup returns nothing, and anything built from that `NULL` (here, an insert requiring a `NOT NULL` column) throws an error that aborts the *whole* transaction, undoing the delete that started it all. This matters for STEADY specifically because any future trigger that reads from a parent table via a foreign key needs to handle "the parent might already be gone" as a real, expected case whenever `ON DELETE CASCADE` is in play — not an edge case, the normal path for exactly this kind of delete.

### `useNativeDriver` — handing scroll math to the native thread instead of JS

*2026-08-01 · Architecture*

React Native's `Animated` API can run an animation two ways: on the JS thread (recalculating positions every frame in JavaScript, then pushing each frame to the native view) or on the native thread (`useNativeDriver: true`, where the animation's math — for supported properties like `opacity` and `transform` — is handed off once to iOS/Android's own rendering layer, which then runs it independently). The Java analogue is the difference between a UI updated by a `Timer` callback recomputing and re-painting each frame on your app's own thread, versus handing a canned animation curve to the OS's compositor and letting it run outside your process's scheduling entirely — the second is immune to your thread being briefly busy. `DrumPicker.tsx` uses the native-driver approach for its row fade/scale effect, which is why it stays smooth under load; a second, separate component (`SimpleDrum`, now removed) was built to do everything in plain JS instead, based on an unverified theory that the native-driven version broke inside React Native `Modal`s on Android. It didn't reuse `DrumPicker` — it duplicated the whole widget from scratch. That is why STEADY briefly had two drum pickers with the same job.

### Declarative initial props vs. imperative "wait for it to actually be ready" — React Native `contentOffset` inside a `Modal`

*2026-08-01 · Pattern*

`DrumPicker`'s `contentOffset={{ y: selectedIndex * ITEM_HEIGHT }}` prop looks like it should reliably position the scroll view before the user ever sees it, but it's a *fire-once* prop — React Native applies it the moment the native view is first created, and never again. That's fine when the component mounts inside a normal screen, because by the time React gets around to mounting a child component, the screen around it has already finished laying out. It's not fine inside a React Native `Modal`, because on Android a `Modal`'s content is rendered into a genuinely separate native window with its own independent layout pass — so a component can finish mounting on the JS side before that window has confirmed its own size and position, and the `contentOffset` prop can fire into a view that isn't ready to receive it yet, silently doing nothing. The fix is the same idea as a Java `Future`/callback instead of assuming a resource is ready synchronously: use the `onLayout` event, which React Native fires only once the native view has actually reported back its real, measured frame, and do the positioning imperatively at that point via a ref's `.scrollTo()`. The general lesson: any *initial-value* prop on a component that lives inside a `Modal`, `Portal`, or anything else that renders into its own native layout tree is a candidate for this bug — prefer a "confirmed ready" callback over a "hopefully ready by now" prop whenever the two might disagree.

### `Animated.ScrollView`'s ref can be two different shapes — check the type, don't cast past it

*2026-08-01 · Tool*

Wiring a `ref` onto `<Animated.ScrollView>` to call an imperative method like `.scrollTo()` isn't as simple as it is on a plain `<ScrollView>`, because `Animated.createAnimatedComponent` wraps the real component, and its TypeScript types (`TAugmentRef` in `react-native`'s own `Animated.d.ts`) say the ref can resolve to *either* the real underlying `ScrollView` instance *or* a legacy wrapper shaped like `{ getNode(): ScrollView }`, depending on which internal code path React Native takes. Typing the ref as `useRef<ScrollView>(null)` and reaching for `.scrollTo` directly will make TypeScript correctly refuse to compile, because that type doesn't account for the wrapper case — and forcing it through with `as unknown as SomeShape` throws away exactly the safety check that would've caught it if the assumption were wrong. The correct fix is to type the ref as the real union (`ScrollView | Animated.LegacyRef<ScrollView>`) and branch on it explicitly — check `'getNode' in node` and unwrap when present, otherwise use the ref directly — which is the Java equivalent of checking `instanceof` before a cast instead of blindly casting and hoping. This matters for STEADY specifically because it's a pattern that will resurface anywhere else an imperative method is needed on an `Animated`-wrapped native component, not just in `DrumPicker`.

### A symptom report tells you *what's* broken, not *which* explanation is right — don't let it retire a theory you haven't actually re-checked

*2026-08-01 · Pattern*

This one took two passes to get right, and the first pass drew the wrong conclusion for a subtly bad reason. `ChangeDateTimeSheet.tsx` carried a comment explaining why `SimpleDrum` existed instead of reusing `DrumPicker`: "DrumPicker's Animated approach fails inside Modals on Android because the native thread hasn't fully laid out when contentOffset fires." Shivam then reported, on-device, that `DrumPicker` works fine (onboarding) and `SimpleDrum` is the one that's frozen (reminders, date/time sheets) — the *reverse* of what the comment would predict if you assumed "the thing described as broken must be the thing that's still broken." So the first pass deleted `SimpleDrum` outright and swapped in `DrumPicker` everywhere, reasoning that the comment's premise was simply wrong. It wasn't fully wrong — `SimpleDrum` was *also* broken as its own component (that part of Shivam's report was correct), but the comment's underlying mechanism (`contentOffset` losing a layout race inside an Android `Modal`) was real too, and swapping in bare `DrumPicker` walked straight into it, so the drums stayed frozen after the "fix." The distinction that got missed: a symptom report ("X doesn't work") tells you a component is broken, but it doesn't by itself tell you *why*, and it doesn't retire a specific, mechanistic claim in a comment just because the reporter's overall conclusion pointed the opposite direction. The comment named an exact mechanism — a specific prop (`contentOffset`), a specific timing window (native view mid-layout), a specific context (inside a `Modal`). That kind of claim can only be retired by checking the mechanism itself against the code, not by a report that something else in the vicinity is also broken. The eventual fix kept `DrumPicker` as the single shared component (so the report's "the two are inconsistent" observation was still correctly acted on) but added back the exact protection `SimpleDrum` had — waiting for confirmed layout via `onLayout` before positioning — instead of assuming the native-driven approach was safe everywhere just because it worked in the one context (a plain screen, no `Modal`) that had actually been tested.

### Application logs vs. observability logs — "what happened" and "why it broke" are different tables
*2026-07-31 · Architecture*

`chat_messages` and the new `ai_logs` look similar — both are Postgres tables that get a new row every time the AI is called — but they answer different questions on purpose. `chat_messages` is application data: it's part of the product, the user's own conversation history, protected by RLS so each user can only see their own rows, and the app reads it back to render the chat screen. `ai_logs` is observability data: it exists purely so a developer can debug and spot patterns, it's never read by the app itself, and it's locked to `service_role` only — no user, including its own owner, can query it through the app. The Java/Python analogue is the difference between your application's business-logic output (what you'd show in an audit trail or a user-facing history page) and your application's *log4j/logging* output (stack traces, request IDs, timing) — same event, two different tables, because they have different audiences, different retention needs, and different access rules. Conflating them (e.g. cramming raw prompts and token counts into `chat_messages`) would leak internal mechanics into a table users can read, and RLS-protect a debugging tool that's supposed to be developer-only.

### RLS enabled with zero policies = deny-all, except for service_role
*2026-07-31 · Pattern*

Every other table in STEADY's schema has Row Level Security turned on *and* at least one policy like `USING (auth.uid() = user_id)` that explicitly grants access back. For `ai_logs` we did something different: turned RLS on and added no policies at all. In Postgres, that's not "no restrictions" — it's the opposite. RLS being enabled means "deny by default unless a policy says otherwise," so zero policies means the `anon` and `authenticated` roles (what the app uses via the public API) get zero rows back, full stop, even for a plain `SELECT *`. The one role that's exempt is `service_role` — Supabase grants it `BYPASSRLS`, meaning Postgres skips the RLS check for it entirely, which is exactly why our Edge Functions (which authenticate to Supabase using the service role key) can still insert freely. This is a genuinely different lockdown pattern from "policy that only lets you see your own stuff," and it's the right one whenever a table should be invisible to the app itself, not just scoped per-user.

### A swallowed error can hide a bug indefinitely — "success: true" doesn't mean everything succeeded
*2026-07-31 · Pattern*

`saveChatTurn()` in `log-food-from-text/index.ts` had a real bug — `created_at: loggedAt` referenced a variable that plain doesn't exist, a `ReferenceError` on every call — but it was invisible from the app's side because the function wraps its own body in `try { ... } catch (err) { console.error(...) }` and returns nothing on failure. The caller (`Deno.serve`'s main handler) does `await saveChatTurn(...)` without checking a return value or re-throwing, so the outer response still says `{ success: true }` regardless of whether the chat row was actually saved. This is the JS/TS equivalent of a Java method declared `void` that catches its own checked exceptions and logs them instead of propagating — perfectly legal, but it means nothing upstream can ever know it failed short of reading server logs. The general lesson: a `try/catch` that only logs is appropriate for genuinely non-critical side effects (the codebase does this correctly elsewhere, e.g. analytics calls), but for anything the rest of the system depends on being true — like "chat history was saved" — swallowing the error is exactly what let this bug survive silently in production instead of surfacing on the very first test.

### A boolean loading flag needs three states, not two, if "hasn't started" and "finished" both look like `false`
*2026-07-31 · Pattern*

`isFetchingDate` in `foodLogStore.ts` was meant to answer one question for `HomeScreen`: "is it safe to build the on-screen message list yet, or is the meals data still in flight?" The bug was that its initial value, `false`, was the *same* value it had after a fetch legitimately completed — so on the very first render (before `fetchEntriesForDate()` had even had a chance to flip it to `true`), the merge effect read `false` and concluded "nothing's loading, go ahead," building the message list from an empty `meals` array and permanently marking itself done. The real state space here has three cases — "not started," "in flight," "finished" — but a plain boolean can only distinguish two, so "not started" and "finished" silently collapsed into the same value. Fixed by starting the flag `true` (a lie in the literal sense — nothing has been called yet — but the correct lie, since "assume a fetch is about to happen" is safer than "assume nothing is happening"). The general lesson: any time a boolean loading/ready flag gates behavior that only makes sense *after* an async call resolves, check what its value is *before that call has even started* — if that starting value is indistinguishable from "done," there's a race window on first render.

### Zustand stores are module-level singletons, not component state — nothing clears them for you
*2026-07-31 · Architecture*

A `useState` value inside a component is like a local variable on the stack of a function call — when the component unmounts (the "function returns," roughly), that value is gone, and mounting fresh gives you a clean slate automatically. A Zustand store created with `create(...)` (like `useFoodLogStore` in `foodLogStore.ts`) is nothing like that — it's created once, at module load time, and lives for as long as the JS process runs, much closer to a `static` field in Java than to a local variable. Every component that calls `useFoodLogStore()` is just subscribing to that one shared object; unmounting `HomeScreen` on logout doesn't touch it at all. That's exactly why `reset()` exists as an explicit action, called manually from `authStore`'s `signOut` — nothing does this automatically, so if a new field gets added to the store's state, it has to be added to `reset()` too, or it'll silently leak stale values into the next user's session. This bit us directly: fixing `isFetchingDate`'s initial value wasn't enough on its own, because `reset()` had its own separate list of fields to restore and didn't yet include it.

### Derive dependent values from one source instead of hand-syncing coordinates
*2026-07-31 · Pattern*

`WelcomeScreen.tsx`'s bowl illustration is really three things layered together — a bowl image, six SVG arrows, and six text labels — and they only look like one coherent picture because the arrows are *derived* from the bowl's center (via a `polarPoint()` helper that converts a compass angle into x/y coordinates), not stored as their own independent numbers. That's why moving the bowl's center automatically dragged the arrows along with it, correctly, with zero extra code. The labels weren't wired the same way — their positions were separately hand-picked coordinates — so those had to be manually shifted by the same amount to keep the group visually together. The general lesson: whenever two pieces of UI must always move in lockstep, calculate one from the other (or both from a shared variable) instead of maintaining two lists of numbers that happen to agree today and silently drift the next time someone edits one but not the other.

### "Sort by created_at" is only correct if every row's timestamp is stamped at the same logical moment
*2026-07-28 · Pattern*

When you sort rows by a `created_at` column, you're implicitly trusting that the timestamp on each row means "this is when this thing happened" — but if different rows in the same logical transaction get their timestamps from different places (one from a DB default fired mid-request, another from `new Date()` called at the very end of the request), the sort order can end up backwards even though the two events happened in the "right" order from the user's point of view. This is exactly what happened in `log-food-from-text`: the `meal_logs` row got its `created_at` from Postgres's `now()` default when it was inserted (early in the function), but the user's own chat message got stamped by `saveChatTurn()` calling `new Date()` at the *end* of the same function — after several more steps (food-entry resolution, AI coaching-note generation) had already taken real wall-clock time. The fix is a general one, not specific to this bug: capture a single timestamp once, as early as possible in the request, and reuse it for anything that needs to represent "when the user's action started" — never let two rows that are logically part of the same event race the clock independently.

### State updater functions must be pure — no calling other setState along the way
*2026-07-28 · Pattern*

`useState`'s setter accepts either a plain value (`setCount(5)`) or a function of the previous value (`setCount(prev => prev + 1)`) — the function form exists so you can safely update state based on its own last value even if several updates are queued up in the same tick, without racing against stale closures (this is the same idea as an atomic compare-and-swap in Java/C++ concurrency: "update based on the current value, not a value I read earlier and might be wrong by now"). The rule that comes with it: that updater function should be pure — compute and return the next state, nothing else. `TypewriterText` broke this by calling a passed-in `onDone()` callback from inside its own updater, and that callback happened to call a *different* component's `setState`. React detected one component's state transition triggering another's mid-flight and threw the "Cannot update a component while rendering a different component" warning. The fix is always the same shape: move any side effect (calling a callback, an API call, logging) out of the updater and into a `useEffect` that watches the state it depends on — updaters compute values, effects react to them.

### Expo tunnel mode: a relay so your phone can reach a dev server on a different network
*2026-07-28 · Tool*

Normally Metro (Expo's bundler) only listens on your laptop's local network — your phone has to be on the same WiFi to reach `http://<laptop-ip>:8081`. `--tunnel` solves this by running an embedded ngrok client (the npm package `@expo/ngrok`, distinct from any system-installed `ngrok`) that opens an outbound connection to ngrok's relay servers, which hand back a public `https://*.ngrok-free.app` URL forwarding straight to your local Metro. It's the same idea as SSH port-forwarding to expose a local service publicly — useful when phone and laptop can't share a LAN (different WiFi, corporate network, VPN). Because it's a separate npm-managed client with its own release cycle, it can drift out of sync with ngrok's server-side protocol and start failing with cryptic errors like "remote gone away" — worth knowing this is a tooling/network issue, not something in STEADY's own code, whenever `--tunnel` breaks.

### Next.js Server Components: code that runs on the server, not shipped to the browser
*2026-07-28 · Architecture*

React Native has no equivalent of this at all — every line of a screen's code runs on the phone, full stop. Next.js's App Router splits components into two kinds: a Server Component (the default) runs only on the server, its output is plain HTML sent to the browser, and none of its source code — including any secret it touches, like a service-role key — ever reaches the client. A Client Component (marked `'use client'` at the top of the file) is the familiar kind: it ships as JS to the browser and can use hooks like `useState`, because it needs to actually re-render interactively there. The admin dashboard's pages (Users, Templates, Send, Logs) are Server Components that query Supabase directly with the service-role key; the small interactive bits inside them (a button with a loading spinner, a form) are separate Client Components nested inside. This split is exactly why the service-role key is safe here in a way it never could be in STEADY's own React Native code — there's no "server" a mobile app's code runs on, so it has nowhere safe to keep a secret like that.

### Server Actions: a function call that's secretly a network request
*2026-07-28 · Pattern*

A file starting with `'use server'` (like `ting`'s `templates/actions.ts`) exports functions that look, from the calling component's side, like an ordinary async function call — `await toggleTemplateActive(id, true)`. Under the hood, Next.js turns that into an HTTP POST to a server endpoint it generates automatically; the function's actual body never ships to the browser as JS. This replaces what would otherwise be "write an API route, then fetch() it from the client" with something that reads like a normal function call — useful for the Templates page's toggle/delete/create buttons, which need to run privileged Supabase writes (service-role key) triggered by a plain button click.

### Snapshotting: freeze a result instead of re-deriving it
*2026-07-28 · Pattern*

Saved Entries needed to answer: when the user re-logs a saved meal, do we re-run the whole macro-resolution pipeline (cache → USDA → AI estimate) again, or reuse what we already figured out last time? The answer is a general pattern worth knowing: if a value was expensive (or non-deterministic, like an LLM call) to compute once, and the *inputs* aren't going to change, copy the *result* forward instead of recomputing it. That's what `saved_entries.entries` (a JSONB blob) does — it's a frozen copy of already-resolved `calories/protein_g/carbs_g/...` values, not a reference that triggers fresh resolution. This is the same idea as memoization in normal programming (cache a function's return value keyed on its inputs) or a compiled build artifact (you don't recompile from source every time you deploy) — the win here is that re-logging a saved meal is a plain database insert, with zero OpenAI/USDA calls, because nothing new needs to be figured out.

### JSONB column vs. a child table: pick based on access pattern, not "more normalized is better"
*2026-07-28 · Pattern*

A `saved_entries` row can hold multiple food items (e.g. "eggs" + "toast" in one saved meal). The classic relational-database instinct (especially coming from years of SQL) is to normalize: make a `saved_entry_items` child table with a foreign key back to `saved_entries`, one row per item. STEADY didn't do that here — `entries` is a single JSONB column holding the whole array as one JSON blob. The deciding question isn't "which is more normalized," it's "how is this data ever read or written?" A saved entry is always fetched as a whole and always re-logged as a whole — no query ever needs "give me just the third item across all saved entries." When every read/write treats a group of fields as one atomic unit, a JSONB blob is simpler than a join with no real benefit, and it's the same reasoning already used for `dietary_restrictions` and a few other array-shaped fields elsewhere in the schema.

### Why a real OS dialog can't be "just restyled"
*2026-07-28 · Concept*

`Alert.alert(title, message, buttons)` isn't a React component rendering inside your app's view tree — it's a thin bridge call that hands off to the phone's actual native alert system (UIAlertController on iOS, an AlertDialog on Android). That's exactly why it always looks like a generic system popup no matter what your app's design is: it's drawn by the OS, not by React Native, so no StyleSheet touches it. The only way to get an in-brand confirmation dialog is to stop asking the OS for one and build the UI yourself — a `Modal` with your own backdrop, card, and buttons (`ConfirmSheet.tsx`), which is a real component in the tree and can be styled like anything else. The tradeoff: you also take on everything the OS gave you for free — backdrop dismissal, button layout, accessibility — which is why `ConfirmSheet` deliberately copies the exact backdrop-press-to-close pattern already proven out in `ChangeDateTimeSheet`, rather than inventing a new interaction model.

### Two Claude Code sessions on one working tree: git state can move under you
*2026-07-28 · Tool*

Two active sessions writing to the same repo checkout at once can each trigger git operations (in this case, most likely `git stash`) that touch the *other* session's uncommitted work without either side asking for it — from either session's point of view, files silently revert, or new files appear that were "never mentioned." The tell was `git status` returning a completely different file list than what the conversation's own edit history implied. A stash is recoverable (`git stash list` / `git stash pop`), but only if you stop and check before assuming the tree matches your last read of it. The fix isn't a git command — it's treating "the working tree changed in a way I can't explain" as a hard stop: verify with `git status`/`git stash list`/`git reflog`, confirm with the user whether something else is touching the repo, and re-read every file you're about to edit fresh rather than trusting state from earlier in the conversation.

### Let Postgres do timezone math, not JavaScript
*2026-07-28 · Pattern*

"Is it 8 AM for this user right now" sounds like a simple comparison, but a user's "8:00" reminder time is meaningless without also knowing their timezone, and naive UTC-offset arithmetic in JS (`utcHour + offsetHours`) breaks the moment a timezone has a fractional offset (India is UTC+5:30, not a whole number of hours) or observes daylight saving. Postgres ships the entire IANA timezone database and a built-in `timestamp AT TIME ZONE 'zone_name'` operator that converts correctly for any zone, DST included — so `find_due_reminders()` in migration 013 does the whole "convert now() to this user's local wall-clock time and compare to their stored HH:mm" check as one SQL query, instead of pulling every user's row into an Edge Function and hand-computing offsets. Whenever a scheduling/timezone problem shows up in a system with a real Postgres database underneath it, push the conversion into SQL rather than reinventing a smaller, buggier version of a timezone library in application code.

### pg_cron + pg_net: how a database can run its own scheduled HTTP calls
*2026-07-28 · Tool*

Normally "run this every 5 minutes" needs a separate always-on process (a cron daemon, a serverless scheduler) sitting outside your database. `pg_cron` is a Postgres extension that lets the database schedule its own SQL jobs on a cron-like syntax, and `pg_net` is a companion extension that lets a SQL statement make an outbound HTTP call. Combined, `cron.schedule(...)` calling `net.http_post(...)` means Postgres itself pings a Supabase Edge Function every 5 minutes — no separate server to deploy or keep alive. This is why the Reminders backend needed no new infrastructure beyond migrations and Edge Functions: the "always-on scheduler" lives inside the same database STEADY already has.

### Optimistic update with rollback: assume success, undo on failure
*2026-07-28 · Pattern*

`reminderStore.ts`'s `toggleReminder`/`setReminderTimes` update the local Zustand state immediately, fire the Supabase write in the background, and only revert the local state back to its previous value if that write actually fails. This is the same idea as a database transaction rollback (assume the operation succeeds, undo it if it doesn't) applied to UI state instead of rows — it's what makes a network-backed toggle still feel as instant as the old local-only version did, at the cost of a rare visible "flicker back" on the unlucky case where the write genuinely fails.

### Store canonical, convert at the edges
*2026-07-28 · Pattern*

When a value can be shown in more than one unit (weight in kg or lbs, height in cm or ft+in), the temptation is to store whatever unit the user picked. That's a trap — every downstream consumer (the TDEE formula, other screens, the database) would then need to know and check which unit is currently active before doing math. STEADY's fix, used consistently across Weight/Water/BodyMeasurements and now onboarding: pick one canonical unit to store (metric — kg, cm), and only convert at the two edges where a human actually reads or types a number. The conversion math (`kg × 2.20462 = lbs`) lives in the display layer, gets run twice at most (render, and once more on save), and every other piece of code — TDEE math, Supabase rows, other screens — only ever sees the one true kg/cm value. This is the same principle as always storing timestamps in UTC and only converting to a local timezone for display.

### Nested vertical ScrollViews on Android: the outer one always wins the gesture
*2026-07-28 · Pattern*

React Native's touch system decides which component "claims" a gesture through a responder negotiation, and on Android, two `ScrollView`s stacked on the same axis (both vertical, one inside the other) routinely resolve in favor of the outer one — the inner one never gets a chance to move, even with `nestedScrollEnabled` set. It looks indistinguishable from "the inner component is just broken." The fix isn't a prop flag; it's structural: don't nest scrollers on the same axis at all. If the inner content (here: a calendar grid + a time-picker row) has a bounded, known-small height, drop the outer `ScrollView` for a plain `View` — there's nothing to scroll, so there's nothing to conflict over. Horizontal-inside-vertical (e.g. a month-picker strip inside a vertical sheet) is a different, safe case, since the two scrollers don't compete for the same swipe direction.

### StatusBar is a global overlay, not a component in your tree
*2026-07-28 · Concept*

In most UI frameworks, styling a screen means styling something that only exists while that screen is mounted. `<StatusBar>` breaks that assumption: it doesn't render pixels inside your component tree at all — it's a thin JS bridge to a single OS-level overlay that always exists, system-wide. Whichever screen's `<StatusBar>` (or `StatusBar.setBarStyle(...)`) call ran most recently "wins" and stays in effect until another screen calls it, even after the calling screen unmounts. That's why STEADY had screens with wrong-colored status bar icons — most screens never called it at all, so they were silently inheriting whatever the *previous* screen last set. The fix is for every screen to declare its own bar style on mount (a `useEffect` with no cleanup needed, since the next screen's mount will simply overwrite it) — which is exactly what the new `useScreenChrome` hook centralizes.

### Zustand store as a public interface, not just a data bag
*2026-07-28 · Architecture*

A Zustand store like `reminderStore.ts` is easiest to think of as a Java-style singleton that holds shared state and automatically notifies every "observer" (React component) reading from it when that state changes — no manual `notifyObservers()` wiring needed, `set()` does it. The useful trick when a downstream decision (here: local notifications vs. a full push-notification backend) isn't made yet is to design the store's *action signatures* — `toggleReminder(type)`, `setReminderTimes(type, times)` — as if they were already talking to a real backend, but implement their insides as plain local state updates for now. Every screen that calls those actions doesn't know or care whether the inside eventually adds a Supabase write or an `expo-notifications` schedule call — that swap becomes a change to a handful of functions in one file, not a rewrite of the UI that calls them.

### EWMA (exponentially weighted moving average): a low-pass filter for noisy body-weight data
*2026-07-28 · Pattern*

Body weight swings 1-2kg day to day from water, sodium, and food mass alone, even when the real underlying trend hasn't moved at all — the classic "the scale says +1kg but I know I didn't gain fat overnight" problem. An EWMA fixes this the same way a low-pass filter smooths a noisy sensor reading in signal processing: instead of jumping straight to each new value, the trend line only moves a fraction (`alpha`) of the way toward it — `trend = trend + alpha * (new_reading - trend)`. The wrinkle for STEADY specifically: weigh-ins aren't guaranteed daily, so we scale `alpha` up for bigger gaps (`1 - (1-alpha)^daysElapsed`) — otherwise someone who logs weight once a week would see a trend line that looks frozen even after a real change, since a fixed small `alpha` assumes regular daily sampling.

### TDEE estimation: inferring metabolism from energy balance instead of guessing from a formula
*2026-07-28 · Concept*

Most calorie apps estimate your daily calorie burn (TDEE) once, up front, from a formula based on height/weight/age/activity level — and then never update it, even though real metabolism drifts as you actually lose or gain weight. The alternative (MacroFactor's approach, which we copied): treat the body as an energy-balance equation and solve backwards. If you know how many calories someone actually ate (from logged food) and how much their weight actually changed (from the trend line, not raw weigh-ins), you can back out their true maintenance calories using the ~7700 kcal-per-kg approximation — the same way you'd infer a car's real fuel economy from miles driven vs. fuel-gauge drop rather than trusting the window sticker. This only works with *trend* weight as the input, not raw — raw weight's water-weight noise would otherwise swamp the estimate, which is exactly why the EWMA trend line had to exist first.

### Pre-aggregated tables: paying the aggregation cost once at write-time instead of every read
*2026-07-28 · Pattern*

STEADY logs food as many small rows (`meal_logs` → `food_entries`, one row per food item per meal), but the Progress screen needs a single "how many calories today" number for each of seven days at once. Instead of summing `food_entries` live on every screen visit — a `GROUP BY` join across two tables, times seven days, every time the screen opens — there's a `daily_summaries` table with exactly one row per user per day already holding the totals (presumably kept up to date by a database trigger whenever a food entry changes). This is the same idea as a materialized view or a denormalized read-model in a typical backend: you pay a small write-time cost once (updating one summary row) to make every future read cheap and simple, instead of paying a bigger read-time cost (the full join + aggregation) every single time someone looks. It's why the new weekly-report query in `progressStore.ts` is a plain `.gte/.lte` range select on one table — no joins — even though the underlying data (individual foods) is much more granular than that.

### EAS environment variables: server-side secrets instead of file-based ones
*2026-07-13 · Tool*

`eas.json` is a config file checked into git, so anything written literally inside it — like `"EXPO_PUBLIC_SUPABASE_URL": "https://..."` — is public the moment it's pushed, same as hardcoding a password in a `.java` file instead of reading it from an environment variable. EAS (Expo Application Services) has its own secret store per project, set with `eas env:create --environment production --name X --value Y`, scoped separately per build profile (production, preview, etc). At build time, EAS injects any stored variable whose name matches what the build script expects — so `eas.json` no longer needs an `env` block at all for these two values; the cloud build machine pulls them itself. Same mental model as GitHub Actions secrets or a Kubernetes Secret object: the value lives in the platform's vault, and the config file just references it implicitly by name.

### `--legacy-peer-deps`: npm's escape hatch for React Native's tangled peer-dependency graph
*2026-07-13 · Tool*

npm normally refuses to install if two packages declare incompatible peer-dependency version ranges for the same library (e.g. one wants `react@19.1.0`, another insists on `react@^19.2.3`). In a typical backend Python/Java project this kind of conflict is rare because dependency graphs are shallower; React Native's ecosystem is deep and fast-moving enough that devDependencies (like the test runner `jest-expo`) routinely publish peer-dep ranges slightly ahead of what the actual Expo SDK version supports, purely because of publishing-schedule lag, not a real incompatibility. `--legacy-peer-deps` tells npm "install anyway, resolve each package's own dependencies independently, don't cross-check peer ranges strictly" — npm's pre-v7 default behavior. It's not a hack specific to this project; it's the standard, expected flag for Expo/RN projects whenever this exact class of conflict shows up, and it's safe here because the conflicting package (`jest-expo`) never ships inside the actual app bundle.

### Hoisting: why a package can be "installed" but still unreachable by `require()`
*2026-07-13 · Concept*

npm normally "hoists" every dependency to the top level of `node_modules/` so any file in the project can `require()` it directly — like a single shared classpath. But if two different packages need conflicting versions of the same dependency, npm nests the second copy inside the dependent package's own `node_modules/` folder instead (e.g. `node_modules/expo/node_modules/expo-modules-core`) so both versions can coexist without clashing. Node's module resolution only walks *up* the directory tree from the requiring file, so a top-level test setup script has no way to see a copy buried inside another package's private folder. The fix here wasn't really "install harder" — it was declaring `expo-modules-core` as a direct dependency of the project itself (`package.json`, not just relying on `expo` pulling it in transitively), which forces npm to place a single shared copy at the top level where everything can find it.

### Stale test fixtures: a test that "always passes" isn't the same as a test that's always correct
*2026-07-13 · Pattern*

A test failed the day after it was written, with zero code changes to the thing it was testing — the fixture data had hardcoded `logged_date: '2026-07-12'` standing in for "today's" row from the database, but the store code being tested computes the real `today` fresh every time via `new Date()`. The day the calendar rolled over, the fixture's fake "today" and the code's real "today" stopped matching, and a filter that depends on that comparison silently broke. The lesson generalizes: any test fixture representing "the current date" needs to be *computed the same way the code under test computes it* (same `new Date()` call, same format), never typed in as a literal string — otherwise the test is quietly coupled to the day it was written, not to the behavior it claims to verify.

### `.npmrc`: making an install flag a property of the repo, not a fact you have to remember
*2026-07-13 · Tool*

Running `npm install --legacy-peer-deps` locally fixes the install on your own machine, but that flag lives only in your shell history — it doesn't travel with the code. EAS's cloud build servers clone the repo fresh and run their own plain `npm install`, with no idea you typed a flag on your laptop yesterday, so the same peer-dependency conflict that broke locally broke the cloud build the exact same way. `.npmrc` is npm's project-level config file (same idea as a `pip.conf` or a Maven `settings.xml`, but repo-scoped) — anything you'd normally pass as a CLI flag can be written there instead as a persistent default that every environment reads automatically, including EAS's build machine, a teammate's laptop, or a future CI pipeline. The general principle: if a command needs a special flag to work correctly on *this* project, that flag belongs in a config file checked into the repo, not in personal muscle memory.

### Node polyfills: why React Native sometimes needs a package for things Python/Node take for granted
*2026-07-13 · Concept*

In Python, `import base64` just works everywhere — CPython ships a full standard library no matter where the script runs. Node.js is similar: `Buffer`, `fs`, `path` are all built in. React Native's JavaScript runtime is neither of those — it's a from-scratch JS engine (Hermes) embedded in a mobile app, with no filesystem, no OS process, none of Node's built-in modules, because a phone app isn't a server or a CLI tool. When a library written with Node habits (like `react-native-svg`, which needs `Buffer` to decode `data:` URIs) gets used in React Native, Metro (the bundler) needs an actual npm package — here, literally the `buffer` package, a pure-JS reimplementation of Node's `Buffer` API — installed so the `import` has something real to resolve to. This is a very common category of RN error: "Unable to resolve module X" where X is a Node built-in, and the fix is almost always "install the userland polyfill package with that exact name."

### Local export vs. EAS cloud build: same JS bundling step, different native toolchain underneath
*2026-07-13 · Tool*

`npx expo export --platform android` runs the exact same Metro JavaScript-bundling step that EAS Build runs in its "Bundle JavaScript" phase — which made it possible to reproduce and fix the `buffer` polyfill error locally in seconds instead of waiting through a 10+ minute cloud build just to see the same error again. But `expo export` stops after bundling the JS; it doesn't go on to compile the native Android app the way a full EAS build does (that needs the Android SDK, NDK, and Gradle, none of which are set up on this dev machine, by design — that's the whole point of using EAS Build instead of a local Android Studio setup). So `expo export` is a genuinely useful fast feedback loop for catching JS-bundling bugs early, but it can't validate the later native-compile steps — those still need a real EAS build (or a full local Android toolchain) to verify.

### Expo config plugins: patching generated native code so the patch survives regeneration
*2026-07-13 · Architecture*

STEADY has no `android/` folder in git — it's fully regenerated from scratch by `expo prebuild` on every EAS build, which is exactly what makes managed Expo convenient (no native project to keep in sync by hand) but also means you can never just hand-edit a generated file like `android/app/build.gradle` to fix a bug in it; the next build wipes it and starts over. Expo's answer is a **config plugin**: a small Node.js function, referenced in `app.json`'s `plugins` array, that Expo calls automatically during every `prebuild` and hands the generated native project to, so it can programmatically edit files right after they're created and before the native compiler ever sees them. `@expo/config-plugins` ships helpers like `withAppBuildGradle` that hand you the generated Gradle file's text as a string to regex-replace. It's the same idea as a Terraform provisioner or a post-generation codemod — you don't fight the code generator, you let it run and then patch its output, every time, automatically, as a permanent part of the build pipeline instead of a one-off manual fix that silently stops applying the moment someone re-runs prebuild.

### `patch-package`: making a `node_modules` edit survive the next `npm install`
*2026-07-13 · Tool*

Config plugins fix bugs in files Expo *generates* fresh each build (like `android/app/build.gradle`), but some bugs live directly inside a third-party package's own source under `node_modules` — and `node_modules` is never committed to git and gets deleted/rebuilt on every install, so a manual edit there vanishes the moment anyone runs `npm install` again, including on EAS's cloud build machine. `patch-package` solves this the same way a `.patch`/`.diff` file solves it for source code in Python or C projects: after hand-editing the broken file inside `node_modules`, `npx patch-package <name>` diffs your edit against the clean, unmodified package and saves that diff as a small file under `patches/` — which *is* committed to git. Adding a `"postinstall": "patch-package"` script to `package.json` means npm automatically re-applies every saved patch immediately after every future install, anywhere, turning a one-off local hack into a durable, versioned fix that travels with the repo. It's the standard tool in the React Native/Expo ecosystem for exactly this situation: a real bug in a third-party package, no newer version published yet to fix it, and a hard deadline that can't wait for upstream. (Worth noting the flip side too — a patch pinned against one dependency version can become *wrong* the moment that dependency's peers change underneath it, as happened later this same session.)

### `expo doctor` / `expo install --fix`: checking the forest, not just the tree that's currently on fire
*2026-07-13 · Tool*

Four separate build failures this session — a broken Hermes lookup, then a Kotlin type mismatch — turned out to be two symptoms of one underlying cause: `expo` had been upgraded to SDK 57 without ever upgrading the ~20 other packages (React Native itself, every `expo-*` native module, TypeScript) that need to move in lockstep with it. Chasing each symptom individually (a config plugin here, a source patch there) worked, technically, but both fixes turned out to target a stale intermediate state rather than the actual disease — and both had to be thrown away once the real fix landed. `expo doctor` is Expo's own project-health linter: it checks every installed package's version against what the currently-installed `expo` version actually expects, and `expo install --fix` (or `--check` to preview first) auto-corrects the whole set in one pass using Expo's own compatibility table, rather than guessing at each individual error message. The lesson generalizes past this one framework: when a dependency-driven build starts failing in ways that don't fully make sense on their own, checking "are all my related packages actually still in sync with each other" is worth doing *before* debugging the symptom directly in front of you — it's a five-second check that can save hours of patching the wrong layer.

---

### EAS Build: why a managed Expo app can't just run `gradlew bundleRelease`
*2026-07-13 · Architecture*

A normal Android Studio project has a checked-in `android/` folder holding the real Gradle project — you'd build a release `.aab` by running Gradle locally. STEADY is an Expo *managed* app instead: there's no `android/` folder in the repo at all, because Expo generates the native project on demand via a step called "prebuild." That means the actual Gradle compile has to happen somewhere that can run prebuild first — and that's what EAS Build is: Expo's cloud service that runs `expo prebuild` + Gradle (for Android) or Xcode (for iOS) on a remote machine, then hands back a signed build artifact. It's the same tradeoff as a managed PaaS (like Heroku) versus owning your own server: less control over the native project, but zero local Android SDK/Gradle setup needed, and it's why the whole release process for STEADY goes through `eas build`/`eas submit` commands instead of Android Studio.

### Why Google Play wants an `.aab`, not an `.apk`
*2026-07-13 · Concept*

An `.apk` is a single, fully-built installer containing every resource for every device variant (all screen densities, all CPU architectures). An `.aab` (Android App Bundle) is closer to a *source package* that Google Play's own servers slice into a minimal, device-specific `.apk` at install time — smaller downloads for users, same app for you to build. STEADY's `eas.json` already has `"buildType": "app-bundle"` set under the `production` profile, which is required — Play Store rejects raw APK uploads for new apps.

### An always-mounted, animation-toggled component isn't "not there" — but tools can act like it is
*2026-07-13 · Pattern*

The obvious way to show/hide a component in React is a plain conditional — `{visible && <Thing />}` — which really does add or remove it from the tree. But animating something open/closed usually rules that out: you can't animate a height transition on something that doesn't exist yet, so the standard pattern (this app's `DatePickerSheet.tsx` included) is to keep the component permanently mounted and drive an `Animated.View`'s `maxHeight` (or similar) between 0 and its real height instead. Visually this looks identical to "hidden = not rendered" — closed, you can't see it or tap through it — but structurally it's a different claim: the component's full content, including all its text, genuinely exists in the tree at all times, just visually clipped. We hit a case where this distinction mattered to a tool, not just a human: `assertVisible: "July"` against the calendar's month-nav title failed after an 18-second retry, even though a screenshot taken at that exact moment showed the calendar fully open with "July 2026" plainly on screen. The month name wasn't wrong and the calendar wasn't actually closed — something about how Maestro's accessibility walk interacts with text inside an always-mounted, `Animated.View`-wrapped component specifically doesn't behave the same as a plain conditionally-rendered element (a shorter, differently-structured piece of text in the same open calendar — a month abbreviation pill — matched instantly). The practical rule: if a component uses the "always mounted, animate the size" pattern for its open/close behavior, treat matching text inside it as a suspect first, not a last resort, when an assertion inexplicably fails against something a screenshot proves is genuinely visible.

### Mixing literal text and `{a variable}` in one `<Text>` isn't guaranteed to be one string either
*2026-07-13 · Pattern*

Writing `<Text>Calories: {value}</Text>` looks like a single string with a value spliced in — and it renders that way to a human eye, no different from Python's `f"Calories: {value}"`. But JSX compiles literal text and an interpolated `{expression}` into *separate children* of the `<Text>` element, and React Native doesn't always merge them back into one flat string at the accessibility-tree level the way a browser's DOM text node would. We hit this as a second, distinct instance of the same underlying problem as nested `<Text>` tags (see the "kcal" entry) — except this time there was no visible JSX nesting to blame: `Calories: {Math.round(e.calories ?? 0)}` in `MealCard.tsx` is one `<Text>`, written as one line, no child `<Text>` anywhere — and a `visible: "Calories:"` assertion still failed to find it, even with the real number plainly rendered in the failure screenshot. The mental model that actually holds up: RN's `<Text>` is a container that *can* end up with multiple internal text-node children any time its content isn't a single unbroken literal string — whether that break comes from nested `<Text>` tags, an interpolated expression, or (per the earlier entry) an always-mounted animated wrapper. The reliable target for any UI-automation tool is a `<Text>` whose entire content is one literal string with nothing else inside it — the moment a number, a variable, or another element gets spliced in, treat text-matching against it as unreliable and pick something else to assert on instead (a nearby loading indicator, a different flat label, or a screenshot for human review).

### Nested `<Text>` in React Native isn't always one string to the outside world
*2026-07-13 · Pattern*

In HTML/CSS, `<span>0<span>  / 2,000 kcal</span></span>` visually renders as one continuous string, and most tools treat it that way. React Native's `<Text>` mostly behaves the same for a human eye — but UI-automation tools that walk the accessibility/view hierarchy (Maestro, in our case) don't always see it that way. Our `HomeScreen.tsx` calorie summary is built as a parent `<Text>` holding the number, with a *nested* child `<Text>` holding `"  /  2,000 kcal"` — visually one line, but structurally two separate text nodes, parent and child. Maestro's `visible: "kcal"` selector, which matches against a single node's own text content, never found a node whose text was exactly that — even though the merged, rendered string plainly contained it and a human looking at the screen would say "yes, obviously, it says kcal right there." We proved the difference empirically: a sibling screen's `"kcal / day"` text, sitting in one flat, non-nested `<Text>`, matched instantly every time. The lesson generalizes past Maestro: any tool that inspects a UI tree by walking nodes (accessibility scanners, some testing libraries, screen readers in certain modes) can disagree with your eyes about where text "lives" the moment you nest `<Text>` inside `<Text>` — treat a flat single-node string as the reliable selector target, and nested/multi-part text as something to verify by other means (checking the parts separately, or a screenshot-based check) rather than a single substring match.

### `launchApp` finishing doesn't mean the app is actually ready for input yet
*2026-07-13 · Pattern*

There's a gap between "the OS says this process is running and in the foreground" and "this process has finished its own startup work and is ready to react to a user." Maestro's `launchApp` command reports COMPLETED once Android has the app's activity in the foreground — but React Native apps have a second, independent startup phase after that: the JS bundle has to finish loading, the root component tree has to mount, and event handlers (like a hamburger-menu button's `onPress`) have to actually get wired up before a tap means anything. We hit this directly: `login.yaml`'s very first action was a tap fired a measured 6 milliseconds after `launchApp` reported done — and the log showed the physical touch gesture succeeded (Maestro touched the exact right pixel), but the app hadn't finished mounting enough to have a listener there yet, so nothing happened. It's the mobile-app version of a server process starting (`systemctl start` returns immediately) versus the server actually being ready to accept connections (health check endpoint returns 200) — two different "ready" signals that are easy to conflate. The general fix pattern: after any cold `launchApp`, wait for something concrete and expected to be visible — not a fixed sleep, which is either too short under load or wastefully long normally — before the first interaction, rather than trusting the launch command's own completion as proof of readiness.

### Getting a physical Android phone visible inside WSL2 — the usbipd bridge
*2026-07-12 · Tool*

WSL2 is a lightweight Linux VM inside Windows, and by default it has no USB stack at all — Windows owns every physical USB port, so a phone plugged in via cable is invisible to any Linux tool (`adb`, in our case) running inside WSL2, even though the exact same `adb` binary works fine talking to an emulator. The fix is `usbipd-win`, a Windows-side tool that implements the USB/IP network protocol: it takes a specific USB device Windows currently owns and forwards it *as a virtual USB device* over to a WSL2 distribution, at which point Linux's normal USB subsystem sees it exactly as if it were plugged in natively. The full chain we set up: `usbipd list` (find the phone's bus ID from Windows) → `usbipd bind` (register it as shareable, one-time) → `usbipd attach --wsl` (forward it into WSL2, needed again after every unplug/reboot) → from there it behaves like a normal Linux USB device. Two more steps were needed on top of that, both standard Android/adb setup regardless of WSL2: a udev rule granting the `plugdev` group read/write access to Android's USB vendor IDs (without it, `adb devices` shows `no permissions`), and authorizing this specific machine's RSA debugging key from the phone's own screen (without it, `adb devices` shows `unauthorized` — this is Android's security model refusing arbitrary computers debug access to a device until a human explicitly approves the fingerprint).

### Never trust an agent's self-report without an independent check
*2026-07-12 · Pattern*

When you delegate work to an AI agent, its final summary describes what it *believes* it did, not necessarily what actually happened — the same way a junior engineer's status update can be sincere and wrong at once. We saw this directly: an agent writing screen tests hit a real environment quirk, misdiagnosed it as an unfixable dependency conflict, and then — trying to justify that conclusion — cited a debug file as prior evidence for the pattern. That file did not exist anywhere in the repository. A second, independent agent whose only job was to *distrust* the first one's report caught it by doing the boring, mechanical thing: actually running the tests, actually searching the filesystem for the cited file, actually running a neighboring test the first agent claimed also failed. All three checks came back different from what was claimed. The general lesson: for anything that matters, "an agent said it's done" is a claim, not a fact, and the cheap way to convert a claim into a fact is to have a second, differently-motivated party — human or agent — check it against the actual system state rather than the first party's description of it.

### The testing pyramid — why we don't just automate the manual checklist
*2026-07-12 · Pattern*

Automated tests split into layers by how much of the real system they involve, and each layer trades speed for realism. **Unit tests** (Jest, what we just built) call one function directly with fixed inputs and check the output — no app, no network, milliseconds to run; think of it like calling a static method in a Java unit test with JUnit. **Component tests** render one screen in a simulated environment with the backend faked out, checking things like "does tapping Save call the right function." **E2E tests** (planned: Maestro) drive the real installed app end-to-end, exactly like a human tester tapping through `TESTING.md` — the most realistic, but also the slowest and most fragile, since a flaky animation or slow network can fail the test for reasons that have nothing to do with a real bug. The standard shape is a pyramid: many fast unit tests at the bottom, fewer component tests in the middle, a handful of E2E tests at the top covering only the journeys that matter most (signup, core logging, account deletion) — testing everything at the E2E layer would make the suite take 20+ minutes and fail constantly on flakiness rather than real bugs.

### Module-scope code runs on import, whether you asked for it or not
*2026-07-12 · Pattern*

In Python, `import numpy` mostly just makes names available — top-level code in a module runs once, but most modules don't *do* much at import time. TypeScript/JavaScript modules are more eager: any code sitting outside a function body at the top level of a file runs immediately the first time that file is imported, even transitively. We hit this directly: our test file imported `foodLogStore.ts` just to reach two tiny pure functions (`sumTotals`, `todayDate`), but that file's very first line is `import { supabase } from '../api/supabase'` — and `supabase.ts` calls `createClient(url, key)` at module scope (not inside a function), so constructing the Supabase client, and its immediate validation of the URL string, happened automatically just from importing the file, with no test ever calling it on purpose. The fix was giving that module-scope code what it needs to succeed harmlessly (fake env vars in `jest.setup.ts`) rather than trying to avoid triggering it — in a evented, import-eager language like JS, you generally can't import "only part of" a file.

### Signed URLs — a valet ticket instead of a public parking lot
*2026-07-03 · Architecture*

A public Storage bucket is a parking lot with no gate: anyone who knows where a car is parked (the URL) can walk up to it, forever, and URLs leak constantly — screenshots, chat logs, server access logs. A private bucket plus **signed URLs** works like a valet ticket: the database stores only the storage *path* (`{user_id}/{uuid}.jpg`), and when the app needs to display a photo it asks Supabase to mint a temporary, cryptographically signed link — "this exact file, readable for 24 hours" — which expires on its own. Performance-wise the trick is batching: one `createSignedUrls(paths, ttl)` call signs the whole feed's photos at once instead of one round trip per image, and the Edge Function that uploads a photo returns a ready signed URL in its *response* so the just-logged card renders instantly while the DB keeps only the path.

### Deep links are the mobile replacement for redirect URLs
*2026-07-03 · Protocol*

Web auth flows end with "redirect the browser to your site" — but an app has no site to redirect to, so the OS provides custom URL schemes instead: our app registers `steady://` at install time (via `scheme` in app.json), and any URL starting with that prefix opens STEADY, the same way `mailto:` opens an email client. A password-reset email link therefore ends its journey at `steady://reset-password#access_token=…`, and the app must catch it through two separate doors: `Linking.getInitialURL()` when the link *launched* the app cold, and `Linking.addEventListener('url', …)` when the app was already running — miss either one and the flow breaks in exactly one of those two states, which is the kind of bug that passes casual testing. The second trap is that a recovery link creates a *real signed-in session*, so navigation gated only on "is there a session?" would skip the set-new-password screen entirely — we added a `passwordRecovery` flag to the auth store that takes priority over the normal gates, a small state machine distinguishing *why* you're signed in, not just *whether*.

### Two keys, two trust levels — why account deletion must be server-side
*2026-07-03 · Architecture*

Supabase hands out two credentials: the **anon key** (ships in the app, safe because Row-Level Security restricts every query to the signed-in user's own rows) and the **service-role key** (bypasses RLS entirely — a root password for the whole database). Deleting a user from the auth system is an admin operation that only the service-role key can do, and since anyone can unzip an APK and read every string inside it, that key can never ship to phones — so the operation lives in an Edge Function, like a protected admin endpoint in a Spring backend. The critical security habit: the function derives *who* to delete from the verified JWT in the Authorization header (`auth.getUser(jwt)`), never from a user id in the request body — the same reason a `DELETE /users/{id}` REST endpoint with no ownership check would be a textbook vulnerability. Deletion order also matters: Storage files first (they're outside the FK graph, so the SQL cascade can't clean them up), then the auth user, whose deletion cascades through `profiles` into all eleven user-data tables in one transaction.

### Removing a tab means touching three layers, not one file
*2026-07-03 · Architecture*

React Navigation in this app is nested two levels deep: `AppNavigator.tsx` defines a `Tab.Navigator` (the bottom bar — Home/Me) sitting inside a `Stack.Navigator` (full-screen pushes like Weight or Settings), similar to how a Java Swing app might nest a `JTabbedPane` inside a `CardLayout`. Deleting the Journal tab meant editing three separate things that all had to agree with each other: the component file itself, the `<Tab.Screen>` registration plus its entry in the `TAB_ICONS` lookup map in `AppNavigator.tsx`, and the `Journal: undefined` line in `AppTabParamList` inside `types.ts`. That last one is a TypeScript type, not a runtime value — it exists purely so that any call like `navigation.navigate('Journal')` elsewhere in the codebase gets flagged at compile time as an error the instant the string `'Journal'` no longer matches a known screen name. That's the payoff of typing your navigation: removing a screen turns "did I forget a reference somewhere?" from a runtime crash you discover by tapping around, into a `tsc` error you see immediately.

### Spreading an object into an upsert only writes the keys that exist
*2026-07-02 · Pattern*

`bodyMeasurementsStore.addEntry` builds a `values` object by looping over the 7 possible fields and only ever doing `values[field] = ...` for the ones the user actually typed something into — a blank field is just `continue`d past, so its key never gets added to the object at all (not set to `null`, genuinely absent, like a Python dict that never got that key assigned). Then `{ user_id, logged_date: today, ...values }` spreads that partial object into the upsert payload. Supabase's `upsert` translates to Postgres's `INSERT ... ON CONFLICT DO UPDATE SET waist_cm = EXCLUDED.waist_cm, ...` — but only for the columns present in the payload; columns you never mentioned simply keep whatever value they already had in that row. This is why logging just today's neck measurement doesn't wipe out a waist measurement logged earlier the same day — the two writes touch different columns of the same day's row instead of overwriting the whole row each time.

### Native driver vs. JS driver — why some animations can't dodge the JS thread
*2026-07-02 · Pattern*

React Native's `Animated` API can run an animation two ways. With `useNativeDriver: true`, all the frame-by-frame math (interpolating a value 60 times a second) is handed to the native UI thread up front — it runs smoothly no matter how busy your JS thread is, similar to how a video plays smoothly even while your Python script is doing unrelated CPU work in another process. But it only works for `transform` and `opacity`, because those are pure paint-time effects that don't change where anything sits on screen. Anything that changes actual layout — `height`, `maxHeight`, `width`, `padding` — has to be recalculated by React Native's layout engine on every frame, and that engine lives on the JS thread, so `useNativeDriver: false` is forced and every frame pays a JS-thread cost. If something else is running on that same thread at that moment (a data fetch callback, a state update elsewhere in the app), animation frames get delayed and you see stutter. The practical fix isn't always "switch to native driver" — sometimes the animation genuinely needs to affect layout (like our calendar sheet pushing the calorie card down as it opens) — so instead you minimize the *work per frame* (animate to a measured real height instead of an oversized guess) and offload whatever part of the transition you can (we still fade opacity on the native driver for the content inside).

### Negative margins pull toward whatever sibling is actually there, not what you had in mind
*2026-07-02 · Pattern*

A negative `marginTop` in React Native/CSS doesn't know what it's "supposed" to be closing a gap with — it just pulls the element up by that many pixels, overlapping whatever its previous sibling happens to render as at that moment. We used `marginTop: -20` on the calorie card to tuck it snugly under the nav bar, but the calendar sheet (`DatePickerSheet`) is a sibling that sits between them in the layout and normally renders at near-zero height when closed. Open the calendar and it expands to real height — now the same `-20` drags the calorie card up into the calendar's bottom edge instead. The fix is conditional styling: pass a second style object (`pickerOpen && styles.summaryCardBelowPicker`) that overrides `marginTop` back to `0` only while the calendar is open, similar to how a Python function might branch on a boolean flag to pick different formatting — except here it's swapping which array of style objects React Native flattens onto the component.

### Server-side writes are invisible to the client until something says so
*2026-07-02 · Architecture*

When the AI edge function calls `log_water`, it inserts directly into Postgres using its own service-role Supabase connection — completely separate from the app's client-side connection that `waterStore` reads from. Think of it like two people editing the same shared spreadsheet from different windows: person B's edit is real and saved the moment they make it, but person A's window doesn't repaint itself just because the underlying data changed — A only sees it after they refresh. Our Zustand `waterStore` is the same: it holds a snapshot in memory, and that snapshot only updates when something explicitly calls `fetchToday()`. A chat-triggered insert has no automatic channel back to the UI unless we build one — either the server tells the client "this changed" (what we did: added a `water_logged` flag to the response, and the client refetches on seeing it), or you use Supabase's realtime subscriptions (`supabase.channel(...).on('postgres_changes', ...)`) to have the client listen for database changes directly. We chose the flag approach here because it's simpler and the "something changed" event only has one possible trigger point (this one chat handler) — realtime subscriptions earn their complexity when several independent write paths need to converge on the same UI.

### `node_modules` is a cache, not a save file
*2026-07-02 · Tool*

We spent an hour patching files inside `node_modules/@expo/ngrok` to work around a bug, got it working, then had to undo everything by running `npm install` again — and it really did undo everything, instantly. That's because `node_modules` isn't part of your project; it's a reproducible build artifact that `npm install` regenerates from `package.json` + `package-lock.json` every time, like a `.pyc` cache folder in Python or a `target/` build directory in Java/Maven. Editing files there works for a quick experiment in the current session, but it's invisible to git (it's `.gitignore`d) and vanishes the moment anyone reinstalls — so it's never a real fix, only a scratchpad. If a third-party package genuinely needs a patch, the real tool for that is `patch-package`, which snapshots your `node_modules` edit into a diff file that *does* get committed and gets reapplied automatically after every future `npm install`.

### Why a tunnel needs its own server on the internet
*2026-07-02 · Protocol*

`expo start --tunnel` and plain `expo start` (LAN mode) solve the same problem — letting your phone reach a dev server running on your laptop — but from opposite directions. LAN mode assumes your phone and laptop share a network, so the phone just dials your laptop's local IP directly, like calling a coworker's desk extension. A tunnel (ngrok) is for when that's not true: it rents a public address on the internet that always exists, and your laptop opens an *outbound* connection to that address and holds it open; when your phone hits the public URL, ngrok's server relays the traffic back down that same connection. This is why tunnel mode needs an account/authtoken (someone has to own that public address) and why it can fail for reasons LAN mode never would — the failure isn't your network, it's a third party's relay service having version requirements, outages, or rate limits.

### One Zustand store, many consumers — why the home card and full screen never disagree
*2026-07-02 · Pattern*

`WaterHomeCard` (on the Home feed) and `WaterScreen` (the full-screen drawer destination) both call `useWaterStore()` — the same hook, the same singleton. Think of it like two windows on the same file: when the home card's `+` button calls `addEntry()`, it writes to the one shared `entries` array inside the store, and Zustand re-renders *every* component subscribed to that array — including `WaterScreen` if it happens to be mounted. Neither component owns the data; they're both just views onto it. This is the payoff of putting Supabase calls in the store instead of each screen: add the feature in one place, and every UI surface that reads it stays in sync for free, no manual "refresh the other screen" plumbing required.

### Applying a migration: file vs. live database are two different things
*2026-07-02 · Tool*

Writing a `.sql` file in `supabase/migrations/` only records *intent* — it doesn't change anything until you run `supabase db push`, which connects to the actual linked Postgres database and executes it. This is a genuinely different kind of action from editing app code: a schema change is remote, shared, and not easily undone once other clients (a live app, other developers) start reading/writing against the new shape. After pushing, the TypeScript types in `src/types/database.ts` also go stale until you regenerate them with `supabase gen types typescript --linked` — the file is a snapshot of the database's shape at generation time, not a live reflection of it, so skipping that step means `tsc` would happily compile code that references a column the *type system* doesn't know exists yet.

### Upsert vs. insert — one row per day vs. many rows per day
*2026-07-02 · Pattern*

Weight and Water look like siblings (both "log a number, see a trend") but their data shape is opposite. You weigh yourself once a day, so `weightStore` uses an *upsert* — insert-or-update in one call, keyed on `(user_id, logged_date)` — so logging twice today overwrites, not duplicates. You drink water many times a day, so `waterStore` does a plain *insert* every time, with no unique constraint, and the "daily total" is a derived sum computed over all of today's rows rather than a single stored field. Same store/screen architecture, different write strategy — the shape of the real-world behavior (once-daily vs. many-times-daily) decides which one you need.

### SVG stroke-dashoffset — how a progress ring is actually drawn
*2026-07-02 · Pattern*

A circular progress indicator isn't a special shape — it's a full `<Circle>` outline with `strokeDasharray` set to its own circumference (making the dash pattern exactly one dash the length of the whole circle, so it looks solid), then `strokeDashoffset` shifts that dash backwards to reveal only a fraction of it. Offset 0 shows the full ring; offset = circumference hides it entirely. Water's ring computes `offset = circumference * (1 - progress)`, so as `progress` goes from 0 to 1 the visible arc grows from nothing to a full circle — no image assets, no animation library, just circle geometry (`2 * PI * radius`) and one CSS-like property.

### Transparent borders as layout placeholders
*2026-07-02 · Pattern*

In React Native, `borderWidth` takes up physical space whether or not the border is visible — a box with `borderWidth: 1` is always 2px bigger than the same box with no border, regardless of `borderColor`. If only *some* cells in a grid have a border (like our calendar's logged-date cells), those cells would be a different size than their neighbors and the grid would visibly jitter. The fix: give every cell the same `borderWidth: 1` baseline with `borderColor: 'transparent'`, so all cells reserve identical space — then flip `borderColor` to a real color only where you want it to show. Same trick used on the web (`border: 1px solid transparent`), just less obvious in RN since there's no CSS box model intuition to lean on.

---

### JS `Set` — O(1) membership checks for a repeated "is this in the list?" question
*2026-07-02 · Pattern*

A JS `Set` is the equivalent of a Java `HashSet` or Python `set()` — an unordered collection with `.has(x)` lookups that cost roughly the same no matter how large the set gets, unlike an array's `.includes(x)`, which has to walk every element. We used one for the calendar's `loggedDates`: the month grid re-checks "does this date have a log?" for every one of its ~30-42 cells on each render, so a `Set` keeps that cheap even as a user's logging history grows into the thousands of days, while an array would get slower over time for no benefit.

### RAG (Retrieval-Augmented Generation) — and why AI should select, not compute
*2026-07-02 · Architecture*

RAG means the AI doesn't answer from training memory: you first retrieve facts from a trusted store (`docs = db.search(q)`), then let the AI use them (`ai.ask(q, context=docs)`). For numeric data there's one refinement — classic RAG still lets the AI *write* the final answer, and it can fumble arithmetic or round differently run to run. So in STEADY's macro resolver the AI only parses language and picks which database candidate matches ("soaked almonds" → "Almonds, raw"); the actual macros are computed by ordinary TypeScript (`grams × per-100g ÷ 100`). AI does language, code does math, the database does facts.

### LLM Temperature — the randomness dial
*2026-07-02 · Concept*

An LLM picks each next token from a probability distribution; `temperature` controls how adventurous that pick is. At temperature 0 the model always takes the most likely token, making output (nearly) deterministic for identical input — which is exactly what a parser inside a pipeline needs. Our old food-logging calls never set it, so every log sampled a fresh plausible-sounding calorie count; that was the whole "265 cal vs 220 cal for the same milk" bug. Rule of thumb: creative writing wants temperature ~0.7–1.0, structured extraction wants 0.

### Read-Through Cache with Per-100g Canonicalization
*2026-07-02 · Pattern*

A read-through cache checks local storage first and only calls the expensive source (USDA API / LLM) on a miss, writing the result back so the next reader hits. Two details make ours work: values are stored *per 100g* (a canonical unit, like a unit price, so one row serves any portion size), and rows are keyed by a `normalized_name` with a unique index — Postgres `upsert(onConflict)` then guarantees one canonical row per food even under concurrent logs. This flips the cost curve: the more people log, the fewer external calls per log.

### Food Composition Databases — INDB, IFCT, USDA
*2026-07-02 · Reference*

Government food composition tables are the ground truth of nutrition apps: foods measured in labs, published per 100g. USDA FoodData Central (free API) covers generic/Western foods; India's ICMR-NIN IFCT 2017 measured 542 Indian foods across six regions; and the INDB (Indian Nutrient Databank) builds on IFCT to publish per-100g values for 1,014 common Indian *recipes* — open access, no API, so we imported it straight into our own cache. Lookup order in STEADY: our cache (INDB pre-seeded) → USDA → one-time AI estimate.

### Merging Two Async Data Sources into One Sorted List
*2026-06-29 · Pattern*

When a UI needs to display items from two independent data sources in time order (here: MealCards from the food log store and chat bubbles from `chat_messages`), the pattern is: wait for both to finish loading, attach a timestamp to each item, concatenate the two arrays, sort by timestamp, then strip the timestamp and set state once. Doing it in two separate steps (seed meals first, then add chat rows) causes a visible flash and can produce incorrect ordering. In STEADY's HomeScreen, `loadAndMergeHistory()` waits for `isFetchingDate` to be false (meals ready), then fetches chat rows, merges both arrays by `created_at`, sorts with `localeCompare` (which works correctly on ISO strings), and sets `messages` in one `setMessages` call.

### AI Tool-Calling — How Agents Actually Work
*2026-06-25 · Architecture*

Tool-calling (also called "function calling") is the mechanism that turns a chatbot into an agent. Instead of answering only from its training data, the AI can declare "I need to call `get_food_logs('2026-06-25')`" — your code executes that Supabase query, returns the result, and the AI uses it to form a real answer. In STEADY this means the AI only fetches what it needs for each specific question: simple food logs use 1 API call with zero tool invocations; "was my breakfast healthy?" uses 2 calls (one to decide which tools to call, one to synthesise the results into an answer). The key insight is that tool-calling is MORE token-efficient than context injection because you pay for data only when it's actually needed.

### Bottom Sheet vs Full Screen — choosing the right navigation pattern
*2026-06-25 · Architecture*

Not every user action needs a full push screen — some interactions are compact enough that a Modal bottom sheet is a better fit. The rule of thumb: if the user needs to see or edit more than ~3 things, push a screen (like `AdjustMacrosScreen`); if it's a single focused choice (like picking a date + time), a bottom sheet keeps the user in context and feels lighter. In STEADY we used this distinction deliberately — `AdjustMacros` is a screen because it has one card per food item, while `ChangeDateTimeSheet` is a Modal because it only asks two questions.

### Exporting inner components for reuse
*2026-06-25 · Pattern*

A React component file can export multiple things — a default export (the main component) and named exports (helper components or functions). We added `export` to `MonthGrid` inside `DatePickerSheet.tsx` so `ChangeDateTimeSheet` could import and reuse the exact same calendar grid without duplicating 100+ lines of code. This is the equivalent of making a private inner class public in Java — you expose a previously internal building block when a second caller needs it.

### useNavigation hook — accessing the navigator from inside a component
*2026-06-25 · Pattern*

In React Navigation, screens receive `navigation` as a prop automatically. But components that sit *inside* a screen (like `MealCard`) don't get that prop — they're too deep in the tree. The `useNavigation()` hook solves this: it reaches up the React context tree and finds the nearest navigator, returning the same `navigation` object a screen would have. In STEADY we use it in `MealCard` to call `navigation.navigate('AdjustMacros', { ... })` when the user taps "Adjust Calories & Macros" — no prop drilling required.

### Route params — passing data between screens
*2026-06-25 · Pattern*

When you navigate to a new screen, you can attach a params object as the second argument: `navigation.navigate('AdjustMacros', { mealId, entries })`. The destination screen reads this via `route.params`. Think of it like function arguments for a screen — the caller decides what data the callee starts with. In TypeScript we define the param shape in `AppStackParamList` so both the caller and the callee are checked at compile time and you can never pass the wrong shape.

### Controlled TextInput with numeric string state
*2026-06-25 · Pattern*

React TextInput works best when its `value` is always a string (even for numbers), because the user might type "1", then "12", then clear to "" — and `""` can't be stored as a number. The pattern is: store the draft as a string, parse it to a number only when saving. In `AdjustMacrosScreen` each macro field keeps its value as a string in state, and `parseMacro()` converts it to a number only when building the Supabase payload — this prevents the input from freezing or jumping while the user is mid-type.

### Stateless AI and Conversation Replay
*2026-06-25 · Architecture*

LLMs like GPT-4o have no memory between API calls — every call starts blank. The way every chat app (ChatGPT, Claude, etc.) gives the AI "memory" is by replaying the full conversation history in every request: `[system, user_msg_1, ai_reply_1, user_msg_2, ai_reply_2, ..., new_user_msg]`. For STEADY this means we save every turn to `chat_messages` in Supabase, then load today's rows and inject them into the OpenRouter call before the new message — the AI then "remembers" what was said earlier that day.

### useEffect with Empty Dependency Array — The Component Mount Hook
*2026-06-25 · Pattern*

In React, `useEffect(() => { ... }, [])` runs exactly once when a component first appears on screen — it's the equivalent of a constructor or `__init__` in Python/Java. The empty array `[]` is the dependency list: React only re-runs the effect when values in that list change; an empty list means "never re-run after mount." In STEADY's chat screen we use this to fetch today's persisted messages from Supabase the moment the screen opens, so history is loaded without the user doing anything.

### measureLayout — scrolling to a specific element inside a ScrollView
*2026-06-25 · Pattern*

React Native's `View` has a `measureLayout(relativeToRef, successCb, errorCb)` method that tells you the `x, y, width, height` of that view **relative to another view** (the ScrollView's inner container). This is the right way to scroll to a specific item: get its `y` offset within the scroll container, then call `scrollTo({ y })` on the ScrollView ref. Using `scrollToEnd` instead is a common mistake — it always jumps to the bottom, which is wrong for items in the middle of a feed. For STEADY, we store card refs in a `Map<id, View>` so we can look up the right ref by meal id when the edit button is tapped.

---

### Stale snapshot bug — local state copying from a shared store
*2026-06-25 · Pattern*

In React, when you copy data from a global store (like Zustand) into a local `useState` array, that copy is frozen at the moment it was made — future store updates don't automatically flow into it. This is like taking a `List<T>` snapshot in Java: the snapshot and the source diverge the moment either changes. The pattern to fix it is a `useEffect` that watches the store slice and merges updates back into the local copy, being careful to only replace matching items (by id) and leave unrelated items (like chat reply messages) untouched. For STEADY, the home screen `messages` array mixes meal cards and AI replies in one list, so the sync has to be a targeted map-over-id rather than a full replacement.

---

### Ngrok tunneling — how Expo reaches your phone over WSL2
*2026-06-24 · Tool*

WSL2 (Windows Subsystem for Linux) runs inside a virtual network adapter — your phone and your dev machine are on different "networks" and can't find each other directly. Ngrok solves this by opening a persistent TCP connection from inside WSL2 out to Ngrok's public servers, which then assign a public HTTPS URL (e.g. `https://abc123.ngrok.io`) that your phone can reach over the internet. Expo's `--tunnel` flag delegates this entirely to Ngrok, so Metro bundler stays local while the QR code points to the public URL. Ngrok v2 was shut down and must be replaced with v3, which additionally requires a free authtoken from dashboard.ngrok.com before any tunnel will open.

---

### Stack navigator wrapping a Tab navigator — the standard "push screens" pattern
*2026-06-24 · Architecture*

In React Navigation, navigators nest like containers: a Stack can hold a Tab as its first screen, and any screen pushed onto the Stack slides on top of the entire Tab navigator (including its tab bar). This is the standard pattern for "secondary" screens that don't belong in the tab bar — think Settings, Weight, or any detail page. The alternative (rendering overlays manually inside a tab screen) works but is brittle: you hand-write animations, gesture handlers, and back-button logic that the navigator gives you for free. For STEADY, every new drawer screen now just needs one `Stack.Screen` entry in `AppNavigator` and a `navigation.navigate('ScreenName')` call — nothing else.

---

### Product Analytics — PostHog events, identity, and funnels
*2026-06-23 · Tool*

PostHog is a fire-and-forget analytics layer: you call `posthog.capture('event', { props })` anywhere in the app, and the SDK batches and uploads those events in the background without blocking the UI — exactly like a Python `logging` call. The key distinction between anonymous and identified users: before `posthog.identify(userId)`, every event is tied to a random device ID; after `identify`, all past and future events on that device are merged under the real user ID, which is what makes per-user funnels and retention charts possible. For STEADY, the most important event is `meal_logged` — if we see that number plateau or drop, it tells us the core habit loop is breaking down before we even need to talk to users.

---

### SVG charts without a library — react-native-svg path math
*2026-06-22 · Library*

`react-native-svg` lets you draw anything using the same SVG primitives as the web (`Path`, `Circle`, `LinearGradient`) — it's bundled in Expo Go so no native build needed. A line chart is just math: map each data value to an (x, y) pixel coordinate on a fixed canvas, then describe a smooth curve through those points using SVG's cubic bezier command (`C`). The gradient fill underneath is a `LinearGradient` that goes from accent colour at 22% opacity (top) to fully transparent (bottom) — this single trick is what makes charts look premium vs. flat.

---

### Safe Area Insets + KeyboardAvoidingView: the double-padding trap
*2026-06-22 · Pattern*

Mobile phones have a "safe area" at the bottom — on Android it's the software navigation bar (~48dp), on iOS it's the home indicator notch (~34pt). `useSafeAreaInsets().bottom` gives you that height so you can pad UI elements into it. `KeyboardAvoidingView` with `behavior='padding'` separately pushes content up when the keyboard appears. The trap: the keyboard itself already occupies the full height from screen bottom to its top edge, which includes the safe area — so if you also apply `insets.bottom` padding while the keyboard is visible, it stacks on top and creates a visible empty gap. The fix is to listen to `Keyboard.addListener('keyboardDidShow/Hide')` and apply `insets.bottom` only when the keyboard is hidden.

---

### Edit-in-Place vs. Re-Create (INSERT vs. rewrite children)
*2026-06-22 · Architecture*

To edit a logged meal we had a choice: delete the old card and create a fresh one, or rewrite the existing row's contents in place. We chose rewrite-in-place — the Edge Function, when given an existing `meal_log_id`, keeps that parent row (so the card keeps its id, feed position, and timestamp) and only swaps its children: delete the old `food_entries`, insert the re-parsed ones. The `ON DELETE CASCADE` FK plus the `daily_summaries` trigger means the day's totals self-correct on the delete+insert without any manual math. For STEADY the lesson is that *identity* (the meal_log id) and *contents* (its entries) are separate concerns — editing should preserve identity and replace only contents, which is also why the UI card doesn't jump around after an edit.

### Local Component State vs. Global Store State
*2026-06-22 · Pattern*

Not all state belongs in Zustand. "Which card is currently being edited", the in-progress draft text, and "is this card saving" are throwaway UI concerns that only one card cares about — so they live in the card via `useState`, not in the global store. The *data* the edit produces (the parsed foods) is shared and belongs in the store. The rule of thumb for STEADY: if state would be meaningless to any other screen and should reset when the component unmounts, keep it local; if other parts of the app read or derive from it, lift it to the store.

---

### Draft State vs. Store State in a Settings Form
*2026-06-22 · Pattern*

When a form has many fields and a Save button, copy the store values into local `useState` variables when the sheet opens, let the user edit those drafts freely, and only write to the store (and the DB) when they tap Save. This is different from a single toggle that should take effect immediately — if you wrote to the store on every keystroke, a half-typed number would instantly hit Supabase. For STEADY's Settings screen: `name`, `heightCm`, `calorieGoal` etc. are all local draft strings; `updateProfile()` is only called on Save. The rule of thumb: local state for in-progress editing, store state for committed data.

---

### Optimistic / Local-First UI vs. Awaiting the Network
*2026-06-22 · Pattern*

When a user action (like sign-out) both changes local state *and* needs to tell a server, you have a choice: await the server before updating the UI, or update the UI immediately and let the server call settle in the background. Awaiting the network means the UI literally pauses for the round-trip — which is exactly the "freeze" Shivam saw on sign-out. The local-first pattern flips local state synchronously (instant UI) and fires the network call without `await`, treating its failure as a logged warning rather than a blocker. For STEADY this matters anywhere we touch Supabase from a user gesture: sign-out, and later things like deleting a logged meal — the screen should respond to the tap, not to the wire.

---

### React Native Spacing Doesn't Collapse Like CSS
*2026-06-22 · Pattern*

On the web, two stacked elements' vertical margins *collapse* — the gap is the larger of the two, not the sum. In React Native there is no margin collapse: every element's `margin` and `padding` add up, so a gap you want to shrink is often the sum of several spacers from different elements. We hit this tightening the meal card — the space above the first food name was `inputText.marginBottom` + `body.paddingTop` + the row's `paddingVertical` stacked together. The lesson for STEADY: when a gap looks too big, trace *every* element contributing margin/padding at that boundary and trim each, rather than hunting for one magic value.

---

### Cross-Store Cleanup on Sign-Out
*2026-06-22 · Pattern*

One Zustand store can call another imperatively with `useOtherStore.getState().someAction()` — no React hook, works anywhere. We use this so `authStore.signOut()` resets `foodLogStore`, guaranteeing the next user can't see the previous user's in-memory data. The lesson for STEADY: put cross-cutting cleanup in the *action* that owns the event (sign-out), not in each UI caller, so it can never be forgotten. (Direction matters for imports: `foodLogStore` doesn't import `authStore`, so this stays one-way and avoids a circular import.)

### Generated DB Types Export `Tables<>`, Not Named Aliases
*2026-06-22 · Tool*

Supabase's type generator emits a generic `Tables<'table_name'>` helper rather than per-table names like `Profile`. So `import { Profile }` silently never existed and broke the build; the fix is `type Profile = Tables<'profiles'>`. For STEADY, whenever you want a row type, reach for `Tables<'...'>` (or `TablesInsert<>`/`TablesUpdate<>`) — don't assume a named export.

---

### Animated Slide-Out Overlay vs. a Navigation Drawer
*2026-06-22 · Pattern*

A drawer can be a real navigation route (`@react-navigation/drawer`) or just a UI overlay you render inside a screen. We chose the overlay: an absolutely-positioned layer (backdrop + left panel) mounted at the root of HomeScreen, with one `Animated.Value` (0→1) interpolated into the panel's `translateX` and the backdrop's `opacity`, run on the native thread via `useNativeDriver: true`. For STEADY this avoids adding a native-module dependency that could mismatch Expo Go's bundled set — the same reason we prefer core `Animated` over Reanimated for new UI.

### Mounting Through a Close Animation
*2026-06-22 · Pattern*

If a component returns `null` the instant you close it, the exit animation never plays — it vanishes. The fix is a separate `visible` state: open sets `visible=true` then animates in; close animates out and only flips `visible=false` in the animation's completion callback. The parent owns the `open` boolean; a `useEffect` watching it triggers the right direction. This "stay mounted until the animation finishes" pattern is how the profile drawer slides *out* smoothly instead of blinking away.

### Connected vs. Presentational Components
*2026-06-22 · Architecture*

We split the drawer into two kinds of components. Presentational ones (`MenuRow`, `StatStrip`) take everything via props and hold no state — pure functions of their inputs, trivially reusable. Connected ones (`ProfileHeaderCard`) reach into the Zustand store themselves with `useAuthStore(s => s.profile)`, so they re-render automatically when that slice changes. For STEADY the rule of thumb: keep leaf UI presentational, and let a few container components do the store wiring — it keeps most files dumb and testable while data flows from one obvious place.

---

### Database UNIQUE Constraints Shape Your Data Model
*2026-06-22 · Architecture*

A Postgres `UNIQUE (user_id, logged_date, meal_type)` constraint physically forbids more than one row per (user, day, meal-type) — which is why every "Lunch" message merged into a single meal_logs row via the Edge Function's `upsert ... onConflict`. To get "one card per logged message," we had to **drop the constraint** (migration 004) and switch the Edge Function from `upsert` to a plain `insert`. The lesson for STEADY: card grouping behaviour wasn't a UI choice, it was baked into the schema — change the data shape first, and the UI simplifies for free (the store's merge logic collapsed into a one-line append).

### Threading a New Column End-to-End (Migration → Types → Function → Store → UI)
*2026-06-22 · Pattern*

To show "Bread (2 slices)" we had to carry a new `quantity_label` through every layer: a SQL migration adds the column, `database.ts` mirrors it in the TS types, the Edge Function writes it on insert, the store reads it onto `MealCard`, and the component renders it (falling back to grams when null). For STEADY this is the canonical "add a field" checklist — skip any layer and the data silently never reaches the screen.

---

### Conditional Rendering — JSX `null` Renders Nothing
*2026-06-22 · Pattern*

In React Native, `{condition ? <Thing/> : null}` lets you include or omit a piece of UI based on data — and `null`/`false` in JSX renders literally nothing, leaving no empty slot behind (unlike hiding with CSS, the element never enters the tree). We used this so the meal card shows an `<Image>` only when `photo_url` exists, and when it doesn't, flexbox lets the neighbouring text expand into the freed space. For STEADY this is the clean way to make UI reflect *real* data rather than faking a placeholder.

### Threading a Field Through the Data Flow
*2026-06-22 · Architecture*

A React component can only display data that's handed to it, so to make the card show a real photo we had to carry `photo_url` through every layer it passes: DB column → store type (`MealCard`) → store mappers that build the objects → the component. Making the type field *required* (not optional) is a feature, not a chore — TypeScript then forces every place that builds a `MealCard` (including the fake welcome card) to supply the field, so nothing is silently forgotten. For STEADY this "let the type checker find the gaps" habit is how we keep data and UI in sync as the app grows.

---

### Android adjustResize + KeyboardAvoidingView — Don't Fight the OS
*2026-06-22 · Architecture*

Android's default keyboard mode (`adjustResize`) automatically shrinks the app window when the software keyboard opens, so the layout reflows and the bottom of the screen is always the top of the keyboard. React Native's `KeyboardAvoidingView` with `behavior='height'` does the same shrink *again* — so the layout double-shrinks and leaves a blank gap equal to one keyboard height below the composer. The fix: pass `behavior={undefined}` on Android and let the OS handle it; only use `behavior='padding'` on iOS, which doesn't resize its window and genuinely needs the KAV to push content up. For STEADY this means each platform gets its own keyboard strategy rather than a single cross-platform shortcut.

### SafeAreaView edges — Opt-In, Not Opt-Out
*2026-06-22 · Pattern*

`SafeAreaView` from `react-native-safe-area-context` takes an `edges` prop that controls which screen edges it pads (top, bottom, left, right). Passing `['top']` only pads the status bar — the bottom nav bar is ignored and any content you put there will render behind the system buttons. On Android where the nav bar is a fixed ~48dp strip, this means your composer can overlap the buttons unless you either include `'bottom'` in `edges` (and let SafeAreaView handle it) or manually add `insets.bottom` to the composer's padding. STEADY now uses `edges=['top','bottom']` on Android and manages the bottom inset manually on iOS, giving each platform the cleanest layout.

---

### Supabase Edge Functions — Tiny Servers That Live Next to Your Database
*2026-06-20 · Architecture*

A Supabase Edge Function is a small TypeScript program that runs on Supabase's servers (not on the phone, not on a separate hosting service). It's written in Deno — think of it as TypeScript without npm, where you import packages directly from URLs instead of installing them. For STEADY, every call to an external AI API (OpenRouter, OpenAI) goes through an Edge Function so the API key never touches the app binary; the function holds the secret, the app only holds the Supabase URL and anon key which are safe to expose.

### OpenRouter — One API Key for Every AI Model
*2026-06-20 · Tool*

OpenRouter is a routing layer that sits in front of every major AI provider (OpenAI, Anthropic, Google, Meta, etc.) and gives you a single OpenAI-compatible API endpoint. You send a request to `openrouter.ai/api/v1/chat/completions` with a model name like `openai/gpt-4o-mini` or `anthropic/claude-haiku`, and OpenRouter forwards it to the right provider and bills you a unified credit. For STEADY this means we can swap AI models by changing one string — no code rewrites, no new API integrations.

### JSON Mode in LLMs — Guaranteed Parseable Output
*2026-06-20 · Pattern*

When you call an LLM normally, it replies with free-form text — sometimes it wraps JSON in markdown code fences, sometimes it adds explanations, and your parser breaks. JSON mode (`response_format: { type: "json_object" }`) tells the model to constrain its output to valid JSON only, guaranteed. For STEADY's food extraction, this is critical — we immediately call `JSON.parse()` on the response, and a single stray character would crash the whole logging flow.

### The Upsert Pattern — Insert or Update in One Query
*2026-06-20 · Pattern*

An upsert (INSERT ... ON CONFLICT DO UPDATE) is a database operation that either inserts a new row if it doesn't exist, or updates the existing row if it does — in a single atomic query. In STEADY's `meal_logs` table, there's a unique constraint on `(user_id, logged_date, meal_type)`, meaning you can only have one breakfast per day. The upsert lets us call the Edge Function multiple times without creating duplicate meal containers — if breakfast already exists, we get back its existing ID; if not, we create it.

### The Reanimated Babel Plugin — Why Worklets Need a Build Step
*2026-06-20 · Tool*

JavaScript has no syntax for "run this function on a different thread," so Reanimated relies on a Babel plugin — a build-time code transformer (Babel is to JS what a C preprocessor is to C) — to find worklet functions and inject the glue that registers them with the native worklets runtime. In Reanimated 4 that plugin moved to the separate `react-native-worklets` package, so `babel.config.js` must list `react-native-worklets/plugin` (and it must be **last**, since Babel runs plugins in order and the transform needs the final code). If the config is missing or the plugin isn't listed, anything using Reanimated fails at startup. STEADY needs this plugin because `victory-native` (our charts) depends on Reanimated — even though our `DrumPicker` ended up using core `Animated` instead. (Note: a missing plugin and a native-version *mismatch* produce a similar-looking `NativeWorklets` / `installTurboModule` crash but are different root causes — see the Expo Go version-matching entry.) One gotcha: Metro caches Babel output per file, so after changing babel config you must restart with `expo start --clear` or the stale transforms keep running.

---

### Native-Thread Animation Without Reanimated — `useNativeDriver`
*2026-06-20 · Pattern*

React Native has two threads: the JS thread (runs your React logic) and the UI thread (draws frames). A naive animation computes each frame in JS and ships it over — so if the JS thread is busy (e.g. re-rendering 221 picker rows), frames drop and you see jank. RN's **built-in** `Animated` API solves this with `useNativeDriver: true`: you declare the animation once and RN serializes it to the native side, which runs it with no further JS. We bind each `DrumPicker` row's opacity/scale to the scroll offset via `Animated.event([...], { useNativeDriver: true })` + `interpolate`, so the fade tracks your finger at 60fps entirely on the UI thread. We chose this over Reanimated (which can also do native-thread work via worklets) because the core API ships *inside* React Native — no native module — so it runs in Expo Go. One rule: only `opacity` and `transform` are native-driver-safe; layout props like `top`/`height` are not, so the row's `top` is a static style, not animated.

### Native Modules & Expo Go — Why Versions Must Match
*2026-06-20 · Architecture*

Expo Go is a *pre-built* app binary that ships a fixed set of native modules at fixed versions. If a JS library expects a newer native interface than the one compiled into Expo Go, you get a startup crash like `installTurboModule called with 1 arguments (expected 0)` — and no JS/Babel change can fix it, because you can't recompile Expo Go. STEADY hit this when `react-native-worklets` resolved to 0.8.3 (pulled in transitively by Reanimated) while Expo Go for SDK 54 bundles 0.5.1. The fix was to pin the library back to the bundled version with `expo install react-native-worklets` (which knows the SDK-matched version). The general lesson: anything with a native module must match what Expo Go ships, or you graduate to a custom dev build. `expo install --check` won't always catch transitive deps, so check the actual resolved version against `expo/bundledNativeModules.json`.

### List Windowing — Rendering Only What's Visible
*2026-06-20 · Pattern*

Our old `DrumPicker` mounted every value as a live row — 221 `<Text>` nodes for the weight wheel even though only 3 are on screen. "Windowing" means rendering just the slice of items near the current position (we keep ±8 rows = ~17 nodes) while padding the scroll canvas to the full `N × itemHeight` height so scrolling and snap math are unchanged. This is the same idea `FlatList` uses internally, but we hand-rolled it with an `Animated.ScrollView` — which sidesteps the old "VirtualizedList nested in ScrollView" warning we hit before, since a ScrollView isn't a VirtualizedList. We get virtualization's performance without the nesting conflict.

---

### Design-to-Code Workflow: Claude Design + Claude Code
*2026-06-19 · Tool*

Claude Design lives at claude.ai and lets you build visual UI mockups with AI — the output is JSX/HTML describing layout, colors, components, and interactions. Claude Code can connect directly to a Design project via DesignSync, read the design files, and translate them into native React Native code using the actual project's theme tokens (like `colors.accent` instead of hardcoded hex). The key insight is that Claude Design uses web primitives (`div`, CSS flex) while React Native uses its own primitives (`View`, `StyleSheet`) — so the translation is not a copy-paste but a semantic mapping: a CSS `border-radius: 18px` becomes `borderRadius: 18` in a StyleSheet, and a `flex: 1` `div` becomes a `View` with `style={{ flex: 1 }}`.

---

### `.single()` vs `.maybeSingle()` in Supabase
*2026-06-19 · Library*

Supabase's PostgREST client has two ways to expect a single row back from a query: `.single()` throws an error if zero OR more-than-one rows are returned, while `.maybeSingle()` returns `null` for zero rows and only throws for more than one. Use `.single()` only when a row is guaranteed to exist (e.g., reading a row you just inserted in the same transaction); use `.maybeSingle()` any time the row might not be there yet — like fetching a profile right after signup when a DB trigger is still creating it.

---

### Async Race Condition in Auth State
*2026-06-19 · Pattern*

When `onAuthStateChange` fires after login, it delivers the session synchronously but any follow-up async work (like fetching a user profile from the database) takes extra time. If your UI reads both `session` and `profile` to decide what to render, there's a window where `session` is set but `profile` is still `null` — causing the navigator to render nothing at all. The fix is to gate rendering with an `isLoading` flag that stays `true` for the entire duration of the async follow-up, so the app shows a spinner instead of a blank screen during that window.

---

### VirtualizedList Nesting Restriction in React Native
*2026-06-20 · Pattern*

React Native's `FlatList` and `SectionList` are both backed by `VirtualizedList`, which uses a windowing algorithm to only render the items visible on screen — like a Python generator that yields rows lazily instead of loading them all into memory at once. When you nest a `FlatList` inside a `ScrollView` with the same scroll direction, the two windowing systems conflict: the outer `ScrollView` measures total content height eagerly, but the inner `VirtualizedList` hides rows it hasn't rendered yet, causing layout miscalculations and the warning. The fix for our `DrumPicker` was to replace the internal `FlatList` with a plain `ScrollView` — we lose virtualization, but picker lists are small enough that it doesn't matter.

---

### Drum-Roll Picker (FlatList Scroll Snap)
*2026-06-19 · Pattern*

A drum-roll picker is a fixed-height viewport over a vertically scrollable list of numbers — the same "slot machine" wheel you see in iOS's date picker or any health app asking for weight/height. In React Native, we build it with `FlatList` and two key props: `snapToInterval` (forces the list to stop only at multiples of the item height) and `onMomentumScrollEnd` (fires after the scroll animation finishes, letting us read the offset and calculate which item is centered). We used this instead of a plain `TextInput` because it's tactile and prevents invalid entries — the user physically rolls to their value, which feels native on both iOS and Android.

---

### React `useState` — Reactive Variables
*2026-06-19 · Pattern*

In Python, `x = 5` is just a variable — changing it does nothing to the UI. In React, `const [value, setValue] = useState(5)` creates a reactive variable: whenever you call `setValue(newVal)`, React automatically re-renders the component with the new value. This is the core mechanism behind every interactive UI element in STEADY's onboarding — tapping a goal card calls `setSelected('lose_weight')`, React re-renders, the card sees `isSelected === true`, and applies the accent style. The state lives inside the component and resets when the component unmounts (unlike Zustand, which persists globally).

---

### React Native `Animated` API — Count-Up Effect
*2026-06-19 · Pattern*

`Animated.Value` is React Native's built-in animation primitive — think of it as a number that changes over time and automatically triggers UI updates as it does. `Animated.timing(animValue, { toValue: 1850, duration: 1200 })` smoothly interpolates from 0 to 1850 over 1.2 seconds. We use a `.addListener()` callback to convert the animated float into an integer and store it in state, which drives the displayed calorie number — creating the satisfying count-up reveal on the final onboarding screen. `useNativeDriver: false` is required because we're animating a JS-side state value, not a native transform.

---

### Declarative Navigation — Why Screen 6 Needs No `navigate()` Call
*2026-06-19 · Architecture*

React Navigation uses declarative rendering: `RootNavigator` doesn't imperatively jump between stacks — it reads state and renders whichever navigator the state says should be visible. When `OnboardingRevealScreen` calls `updateProfile({ onboarding_complete: true })`, Zustand updates, `RootNavigator` re-renders, its condition `showApp = session && profile?.onboarding_complete` becomes true, and it automatically swaps `OnboardingNavigator` for `AppNavigator`. No `navigation.navigate()` call is needed — the screen just disappears and the home tab bar appears. This pattern keeps navigation logic centralised in one place instead of scattered across every screen.

---

### SVG in React Native — Why You Need `react-native-svg`
*2026-06-18 · Library*

Browsers understand SVG natively — you can drop `<svg>` tags right into HTML and they render. React Native has no browser engine; it renders using native iOS/Android drawing APIs, which don't speak SVG. `react-native-svg` solves this by providing React Native components (`<Svg>`, `<Path>`, `<Circle>`, etc.) that map to native drawing calls under the hood. For STEADY this matters every time we want crisp, scalable vector icons — like the Apple and Google logos — without shipping bitmap images at multiple resolutions.

---

### StatusBar `translucent` — Full-Bleed Screen on Android
*2026-06-18 · Pattern*

On Android, the status bar (showing time, battery, signal) by default sits on its own opaque background, which pushes your app content below it. Setting `translucent={true}` and `backgroundColor="transparent"` on React Native's `<StatusBar>` tells Android to render the app *under* the status bar instead — the content fills the full screen height. iOS does this by default. In STEADY we use this on the Welcome screen so the food hero image extends to the very top edge, giving that immersive, edge-to-edge look premium apps use.

---

### Zustand — Global Reactive State Store
*2026-06-18 · Pattern*

Zustand is a state management library — think of it as a global singleton object (like a Python module-level dict) where any React component can subscribe to specific fields and automatically re-renders when those fields change. Unlike React's built-in `useState` which is local to one component, Zustand state is shared across the entire app. In STEADY, `authStore.ts` holds the logged-in user's session and profile so every screen — Home, AI chat, Profile — can read the same data without prop-drilling.

---

### Database Migrations — Versioned Schema Changes
*2026-06-18 · Tool*

A migration is a SQL script that modifies your database schema — adds tables, columns, or constraints. They're numbered (`001_`, `002_`, `003_`) so they always run in the same order, meaning any developer can recreate the exact same database from scratch. For STEADY, we have 3 migrations: initial schema (all 12 tables), RLS policies (data security), and triggers/functions (auto-create profile on signup, auto-update daily summaries when food is logged).

---

### Row Level Security (RLS) — Per-User Data Isolation
*2026-06-18 · Architecture*

RLS is a PostgreSQL feature that makes every database query automatically filter by the currently logged-in user's ID. Instead of writing `WHERE user_id = current_user` in every query, you define a policy once (`USING (auth.uid() = user_id)`) and the database enforces it on every SELECT/INSERT/UPDATE/DELETE automatically. For STEADY this means even if someone tried to query another user's food logs directly, Supabase would return zero rows — the security is at the database level, not the app level.

---

### React Navigation — Screen Stacks vs Tab Navigators
*2026-06-18 · Library*

React Navigation is the routing system for React Native — like React Router for web but for mobile screens. A **stack navigator** works like a call stack: pushing a new screen puts it on top, going back pops it off. A **tab navigator** renders multiple screens simultaneously and lets you switch between them instantly (no push/pop). STEADY uses three separate stack navigators (Auth, Onboarding, App) inside a root navigator that decides which one to show based on auth state — a pattern called "navigator switching" that replaces the concept of route guards in web apps.

---

### App Binary & Reverse Engineering
*2026-06-17 · Architecture*

When a React Native app is compiled and submitted to the App Store or Play Store, it becomes a binary file (`.ipa` on iOS, `.apk` on Android). This binary is downloadable by anyone — tools like `strings`, `jadx`, and `apktool` can extract all hardcoded text from it in seconds, including API keys. This is why STEADY never puts `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` anywhere in the app code: those secrets live only in Supabase Edge Function environment variables on the server, where no binary extraction can reach them.

---

### Supabase Edge Functions as a Secure API Proxy
*2026-06-17 · Architecture*

A Supabase Edge Function is a small serverless function (written in TypeScript, runs on Deno) that lives on Supabase's servers — not on the user's phone. The app calls the function's URL; the function uses secret environment variables to call third-party APIs (OpenAI, Anthropic) and returns the result. This proxy pattern means the app binary only ever contains the Supabase URL and anon key (both safe to expose), never the AI keys. It also means all AI calls happen server-side, so we can add rate limiting, logging, and validation in one place without shipping an app update.

---

### Why Supabase Edge Functions Over Alternatives
*2026-06-17 · Architecture*

The alternatives to Supabase Edge Functions are: Vercel Functions (Node.js serverless, great DX but splits infra across two services), AWS Lambda (industry standard, powerful but complex to set up), Cloudflare Workers (extremely fast globally, similar Deno-like constraints), Railway/Render (always-on server, feels like normal programming but costs money when idle), or a self-managed VPS (full control, cheapest at scale, but you manage uptime and security). For STEADY at MVP scale, Supabase Edge Functions win because the AI functions live right next to the database — a function can query today's food logs and call Claude in the same request without an extra network hop to a separate service.

---

### Supabase Anon Key vs. Secret Key
*2026-06-17 · Architecture*

Supabase gives every project two keys: the `anon` key (safe to ship in the app) and the `service_role` key (never leave the server). The anon key is safe to expose because Supabase's Row Level Security (RLS) enforces that a logged-in user can only read and write their own rows — `auth.uid() = user_id`. Even if an attacker extracts the anon key from the binary, they can only access data belonging to the account they're logged in as. The service_role key bypasses RLS entirely and must stay in Edge Function secrets only.

---

### Two AI Models — Why Not One
*2026-06-17 · Architecture*

STEADY uses GPT-4o for food photo analysis and Claude claude-sonnet-4-6 for the nutritionist chat because these are fundamentally different tasks that each model handles best. GPT-4o Vision is best-in-class at identifying food in real photos and estimating portion sizes, returning structured JSON — it's what CalAI and similar apps use. Claude claude-sonnet-4-6 has a 200K token context window and genuinely strong conversational reasoning, meaning it can hold the user's entire day of food logs, goals, dietary restrictions, and chat history in a single call and give personalized, contextual advice. Using the right model for each job produces a better user experience than forcing one model to do both.

---

### React Native + Expo: What They Are
*2026-06-17 · Tool*

React Native is a framework that lets you write UI in TypeScript/JavaScript and compiles it into real native iOS and Android views — not a web browser wrapped in an app, but genuine native components. Expo is a toolchain on top of React Native that removes all the setup pain: no Xcode, no Android Studio, no native build chains. You write code, scan a QR code with the Expo Go app on your phone, and the app appears. STEADY uses Expo's managed workflow, which means we never touch raw Objective-C or Kotlin — Expo handles all native compilation through its cloud build service (EAS).

---

### npx expo install vs. npm install
*2026-06-17 · Tool*

Plain `npm install` grabs the latest version of a package, which can silently break React Native apps because many packages contain native C/Objective-C/Kotlin code that must be compiled against a specific SDK version. `npx expo install` is smarter: it looks up the exact version that Expo has tested and verified against your current SDK (Expo 56 in our case) and installs those pinned versions. The rule for STEADY: use `npx expo install` for anything that touches device APIs (camera, storage, haptics, navigation), and plain `npm install` for pure JavaScript libraries (Zustand, date-fns, Zod).

---

### Expo Config Plugins
*2026-06-17 · Tool*

Some Expo packages need to modify native iOS/Android project files when the app is built — for example, `expo-camera` needs to add a camera permission entry to `Info.plist` on iOS. In Expo's managed workflow, you never edit those files manually. Instead, the package ships a "config plugin" — a function that runs at build time and injects the right native config automatically. You declare which plugins to run in `app.json` under the `"plugins"` array. Expo added these automatically when we ran `npx expo install` for `expo-secure-store`, `expo-font`, `expo-splash-screen`, and `expo-web-browser`.

---

### Expo Tunnel Mode + ngrok: Getting Past WSL2 Networking
*2026-06-18 · Tool*

WSL2 runs inside a private virtual network — your phone on the same WiFi can't directly reach the Metro Bundler dev server because it's behind two layers of NAT (WSL's internal IP, then Windows's IP). `expo start --tunnel` solves this by connecting to ngrok, a third-party relay service that creates a public `https://` URL pointing at your local server — the phone connects to the internet URL, ngrok forwards it through the tunnel to WSL2. This requires `@expo/ngrok` installed as a dev dependency; without it, the tunnel flag silently fails.

---

### The Theme System: Single Source of Truth for UI Values
*2026-06-17 · Pattern*

STEADY's `src/theme/` folder contains three files — `colors.ts`, `spacing.ts`, `typography.ts` — that define every visual constant in the app. No color, font size, or spacing value is ever hardcoded directly in a component; everything imports from these files. This is the TypeScript equivalent of a C header file of constants: define once, use everywhere, change in one place and it propagates to every screen. The `as const` TypeScript modifier makes the values immutable and gives precise types (e.g., `colors.accent` is typed as `'#C8703A'`, not just `string`).

---

### OAuth Flow in Mobile Apps — The Browser Round-Trip
*2026-06-18 · Protocol*

OAuth in a mobile app works via a "browser round-trip": the app opens an in-app browser to the provider's login page (Google/Apple's servers), the user authenticates there, and the provider redirects back to the app via a deep link URL (`steady://auth/callback`). The app receives tokens in that redirect URL, passes them to Supabase, and a session is created. The key insight is that your app *never sees the user's password* — you only receive a cryptographically signed "voucher" from Google/Apple saying they verified the user.

---

### Deep Links — How Browsers Hand Control Back to Your App
*2026-06-18 · Protocol*

A deep link is a URL that the operating system routes into a specific app instead of a web browser. In STEADY, we register the scheme `steady://` in `app.json` so that when any browser on the device navigates to `steady://auth/callback`, iOS/Android immediately close the browser and open STEADY with that URL as a payload. This is how OAuth redirect works on mobile — without a registered scheme, the browser would have no way to return control to your app after the user logs in with Google or Apple.

---

### Apple Sign In — Native Auth vs. Browser Auth
*2026-06-18 · Architecture*

Apple Sign In uses the OS's native authentication sheet (the "Sign in with Apple" prompt with Face ID / Touch ID) rather than opening a web browser — this is fundamentally different from Google OAuth, which goes through a browser. Apple mandates that any iOS app offering third-party social login must also offer Sign in with Apple; failing to do so results in App Store rejection. In STEADY, `expo-apple-authentication` wraps Apple's native `ASAuthorizationController` API; we check `Platform.OS === 'ios'` before rendering the button since the native module doesn't exist on Android at all.

---

---

### SVG in React Native via react-native-svg
*2026-06-20 · Library*

React Native has no built-in SVG renderer — the web's `<svg>` tag doesn't exist on mobile. `react-native-svg` provides native SVG primitives (`Svg`, `Circle`, `Path`, `LinearGradient`, etc.) that render through the platform's native graphics layer (Core Graphics on iOS, Canvas on Android). We use it for `CalorieRing` because drawing a circular arc with a gradient is trivial in SVG but would require complex math with React Native's standard `View`/`Animated` API.

---

### Animated.createAnimatedComponent — animating non-RN components
*2026-06-20 · Pattern*

`Animated.createAnimatedComponent(Component)` is a React Native utility that wraps any component so it can accept `Animated.Value` objects directly as props instead of plain numbers. This is how we animate the `strokeDashoffset` on the SVG `Circle` — we create `AnimatedCircle = Animated.createAnimatedComponent(Circle)` and pass the animated value in. The key constraint: SVG/layout properties can't use `useNativeDriver: true` (that's only for transform/opacity), so we set `useNativeDriver: false` and accept that the animation runs on the JS thread.

---

### strokeDasharray / strokeDashoffset — how SVG arc progress works
*2026-06-20 · Pattern*

`strokeDasharray` sets the total length of the dashes pattern on an SVG stroke. If you set it equal to the circle's circumference (`2πr`), you get one single dash that spans the whole circle. `strokeDashoffset` then shifts that dash backward — setting it to `circumference` hides it entirely (empty), setting it to `0` shows it fully (100%). Animating `strokeDashoffset` from `circumference` down to `circumference * (1 - percentage)` creates the "filling up" ring effect used in CalorieRing.

---

### Single-call intent routing
*2026-06-21 · Pattern*

Instead of one AI call to classify a message ("food or question?") and a second to act on it, you write a system prompt that makes the model do both in one call — returning a tagged JSON object like `{intent:"log",...}` or `{intent:"answer",...}` — and your code branches on that tag. It halves token cost versus classify-then-answer and is more robust (the model decides intent with full context, not a brittle keyword rule). For STEADY this is what lets the home chat both log food and answer nutrition questions affordably on a single gpt-4o-mini request.

### Discriminated unions for "this OR that" return types
*2026-06-21 · Pattern*

A discriminated (tagged) union is a TypeScript type that's "one of several shapes, told apart by a shared literal field" — e.g. `{type:'log', meal} | {type:'answer', reply}`. It's the TS equivalent of a tagged enum in Rust/C++ or a sealed class in Java. When you check `if (result.type === 'answer')`, the compiler *narrows* the type and only lets you access `.reply` inside that branch — so the two outcomes of our chat call can never be confused or accessed wrongly. We used it for `LogResult` so every caller must consciously handle both the food-log and the answer case.

### Edge Function as the secure AI/data boundary
*2026-06-21 · Architecture*

A Supabase Edge Function is server-side code (Deno runtime) that sits between the mobile app and external services — think of it as a Flask route handler that runs in the cloud. We route AI calls through it (not directly from the app) for two reasons: the OpenRouter API key must never ship inside the app binary where anyone could extract it, and the function can use the service-role DB key to read the user's profile/totals for personalised answers. The app only ever calls one endpoint via `supabase.functions.invoke()`; all the secret-handling, AI calling, and DB writing happen safely server-side.

### Deriving display state from data vs. storing it separately
*2026-06-22 · Pattern*

The edit draft for a meal card is pre-filled with `buildFoodSummary(meal.entries)` — a string like "Bread (2 slices), Tomato (42 g)" computed on the fly from the entries array already in state. We don't store this string in the DB or the Zustand store; we derive it when needed. This is a key React principle: if a value can be computed from existing state, compute it instead of duplicating it — fewer places to keep in sync, fewer bugs. The raw user input (`input_text`) and the AI-parsed entries both live in the store; the display string is just a view over those entries.

### Inline action buttons: row layout with flex:1 input
*2026-06-22 · Pattern*

To place ✓/✕ buttons to the right of a TextInput inside a card (rather than in a separate footer row), wrap them in a `View` with `flexDirection:'row'`. Give the TextInput `flex:1` so it expands to fill all available horizontal space, and give each icon button a fixed width (e.g. 32). This is the standard RN pattern for "input + trailing buttons" — the same pattern used in search bars with a clear button, or chat composers with a send button. In STEADY we use `alignItems:'flex-start'` on the row so the icons align to the top of the multiline input rather than the vertical center.

### Modal as a bottom sheet (no extra package needed)
*2026-06-22 · Pattern*

React Native's built-in `Modal` component renders its children in a layer that floats above everything else on screen — think of it like a `position:fixed` overlay in web. By setting `transparent={true}` and `animationType="slide"`, and then putting the actual panel in a `View` with `justifyContent:'flex-end'` inside a full-screen backdrop `Pressable`, you get a standard bottom sheet with zero dependencies. The `Pressable` backdrop dismisses the sheet on tap; a nested `Pressable` on the panel itself stops that tap from propagating so the sheet doesn't close when you tap on a menu item. For STEADY this is the right call at this stage — a third-party bottom sheet library adds complexity we don't need yet.

### ON DELETE CASCADE — letting the DB clean up for you
*2026-06-22 · Architecture*

When we defined the `food_entries` table in Supabase, we set `meal_log_id REFERENCES meal_logs(id) ON DELETE CASCADE`. This means deleting one `meal_logs` row automatically deletes every `food_entries` row that belongs to it — the database engine handles it atomically in a single transaction. In the `deleteMeal` store action we only need to delete from `meal_logs`; we never have to touch `food_entries` ourselves. This is a key database design principle: push referential integrity into the schema so application code stays simple and can't accidentally leave orphaned rows.

### PanResponder — React Native's touch gesture system
*2026-06-24 · Library*

`PanResponder` is React Native's built-in API for recognising multi-touch gestures like swipes, drags, and pinches. You create one with `PanResponder.create({...})`, give it callbacks (`onMoveShouldSetPanResponder` to decide whether to claim a gesture, `onPanResponderRelease` to act when the finger lifts), and spread its `.panHandlers` onto any `View` or `ScrollView`. Think of it like a `MouseListener` in Java — it intercepts touch events at the component level and gives you `dx`/`dy` (how far the finger moved) to work with.

### Stale closure problem in useRef — why refs beat state in gesture handlers
*2026-06-24 · Pattern*

`PanResponder.create()` runs once inside `useRef`, so any variable it closes over (like `selectedDate`) is frozen at its initial value forever — this is called a stale closure. If you read `selectedDate` directly inside the gesture handler, you'll always get the value from when the component first mounted, not the current one. The fix: keep a separate `useRef` (e.g. `selectedDateRef`) that you update via `useEffect` every time the value changes, then read from the ref inside the gesture handler. Refs are mutable boxes — unlike state, reading `.current` always gives you the latest value without needing a re-render.

### Optimistic UI clear — snap to empty before the data arrives
*2026-06-24 · Pattern*

When switching between dates, we immediately set `meals: []` in the Zustand store *before* the Supabase fetch completes. This is called an "optimistic state update" — you update local state to reflect the user's intent right away, rather than waiting for server confirmation. The alternative (leaving stale data visible while the fetch runs) makes the app feel broken: the user sees the old day's food for 500ms, then a sudden jump to the new day. The optimistic clear removes that flicker entirely — the screen responds instantly to the tap, and data fills in as soon as it arrives.

### Parallel fetch + animation — don't serialize what can run together
*2026-06-24 · Pattern*

The original code ran `setTimeout(() => setSelectedDate(date), 260)` so the network call wouldn't start until the collapse animation finished. That's sequential: animation → fetch → render. We changed it to fire the fetch and the animation simultaneously. Think of it like two threads starting at the same moment: by the time the 240ms animation ends, the ~300ms network round-trip is already 240ms complete. This "parallel execution" pattern is the key mental model for making UIs feel fast — never wait for visual work to finish before starting data work.

### Pre-aggregated tables + DB triggers — read fast, write once
*2026-06-24 · Architecture*

Instead of computing calorie totals by summing every food entry on every read, STEADY uses a `daily_summaries` table where each row holds the pre-computed total for one user-day. A PostgreSQL trigger fires automatically after every `INSERT`, `UPDATE`, or `DELETE` on `food_entries` and updates the corresponding `daily_summaries` row instantly — the DB does the math, not the app. This means reading the day's totals is a single-row lookup (no joins, no aggregation) instead of a potentially large scan, making the calorie ring update nearly instant regardless of how many entries are logged.

### Splitting one slow query into two parallel queries of different speeds
*2026-06-24 · Pattern*

When a UI has sections that load at different speeds, fire separate queries for each section rather than waiting for the slowest one before showing anything. In STEADY, the calorie ring needs only one row from `daily_summaries` (~50ms), while the meal cards need a joined `meal_logs + food_entries` query (~200–300ms). By firing both simultaneously (like two parallel threads), the ring updates almost immediately and the cards fill in after — instead of everything waiting for the slowest query. This is the "waterfall vs parallel" principle: a waterfall loads A then B (total: A+B time); parallel loads both at once (total: max(A,B) time).

### getSession() vs getUser() — disk vs memory
*2026-06-24 · Architecture*

`supabase.auth.getSession()` reads the JWT token from AsyncStorage, which is the phone's local key-value store (backed by disk I/O). `supabase.auth.getUser()` uses the token already held in memory by the Supabase JS client — no disk read required. In a hot path like `fetchEntriesForDate` (called on every date tap), that disk read adds 10–50ms of latency before the network call even starts. For STEADY, always prefer `getUser()` in data-fetching code; `getSession()` is only needed when you specifically need the full session object (e.g. to read the refresh token).

### Expo Go is a fixed native binary, not your app
*2026-07-22 · Architecture*

Expo Go is a pre-built app you download from the App/Play Store — it ships with a fixed set of native modules compiled in at whatever SDK version Expo released it at. When you run `expo start` and scan the QR code, only your JavaScript gets sent over; Expo Go runs that JS inside its own already-compiled native shell. If your project's JS expects native APIs from a newer or older SDK than what your specific Expo Go install has, it fails to load — think of it like trying to run a Python script against a C extension module compiled for a different Python ABI version: the interpreter (Expo Go) is fixed, and your code has to match what it was built with. This is why "the app doesn't load in Expo Go" is almost always a version-matching problem, not a code bug — and why the whole SDK (Expo, React, React Native, and every `expo-*`/native peer package) has to move together as one matched set, never individually.

### Config plugins vs. runtime packages — two different jobs, same import path
*2026-07-22 · Pattern*

Some `expo-*` packages export two unrelated things under one name: a runtime API (a component or function you `import` and use in your JS, like `<StatusBar />`) and, separately, a config plugin (a function that mutates native project files during `expo prebuild`, only relevant for `app.json`'s `plugins` array). `expo-splash-screen` ships both. `expo-status-bar` only ships the runtime API — it has no `plugin/` folder at all — so listing it under `plugins` in `app.json` is a category error: like passing a plain function where a decorator was expected. Different Expo SDK versions handle that mistake differently (some warn and skip it, others throw), which is exactly why this one-line mistake sat unnoticed through an entire SDK upgrade before a stricter version caught it. Rule of thumb: only add an entry to `plugins` if the package's own docs specifically say it needs prebuild-time native configuration — importing and rendering it in JS never requires a `plugins` entry.

### Bisection — cutting a silent failure in half until it can't hide
*2026-07-22 · Pattern*

When a command fails with zero error output — no stack trace, no stderr, just a bad exit code — the fastest way to find the cause usually isn't reading minified library source line by line. It's the same idea as `git bisect`: take the set of things that could be responsible (here, six entries in `app.json`'s `plugins` array), cut it in half, test each half in isolation, and keep halving whichever side still fails until exactly one culprit is left. Six candidates became zero (nothing), then three, then confirmed to one specific package in four rounds — far faster than tracing through Expo's CLI internals hoping to spot where an exception gets silently swallowed.

### Independent async steps run one-after-another by default — Promise.all is opt-in, not automatic
*2026-07-28 · Pattern*

Writing `await stepA(); await stepB();` in a function reads perfectly naturally and gives no visual signal that anything's wrong — but unless B's code actually needs A's result, this forces B to wait for A even when they could run at the same time. JavaScript doesn't warn you about this; two unrelated awaited steps in sequence look identical to two dependent ones. The fix is always the same shape — kick both off first (as promises, or async IIFEs if either has multiple internal steps), then `await Promise.all([a, b])` once, right before the point where you actually need both results. The `analyze-food-photo` function had exactly this: uploading the photo to storage and calling the vision API don't depend on each other at all, but were written as two back-to-back awaits, quietly adding the full duration of one step onto the other for no reason.

### A batched insert isn't just faster — it's a different call, not a faster loop
*2026-07-28 · Pattern*

`for (const row of rows) { await supabase.from('t').insert(row) }` and `await supabase.from('t').insert(rows)` look like they should cost about the same and differ only in convenience, but they're not the same operation at all — the first makes N separate network round trips to the database, one per row, each with its own latency; the second makes exactly one round trip carrying every row in a single request. This is a case where "loop with an await inside" is a code smell worth specifically scanning for whenever a fix touches a data-insertion path — the fact that each iteration's logic is simple doesn't mean the iteration itself is free.

### An input reaching the model isn't the same as the model being told what to do with it
*2026-07-28 · Pattern*

The user's caption text genuinely was in the API request, sitting right next to the image in the same message — nothing was dropped or misrouted in the wiring. The bug was entirely in the system prompt: it told the model how to estimate quantity from the image and how to read it off a label, but never said the accompanying text could specify or override that quantity at all. A model can't infer a priority rule that was never stated, no matter how obviously "I ate 90 grams" ought to matter — it will just follow the instructions it was actually given. When multimodal input isn't being used the way you'd expect, check whether the missing piece is data not reaching the model (a wiring bug) or an instruction never being given (a prompt bug) — they look identical from the outside but need completely different fixes.

### Prompting an AI to "not change X" is a request, not a guarantee — enforce invariants in code
*2026-07-28 · Pattern*

Adding a system-prompt instruction like "if this food is unchanged, don't re-derive its nutrition facts" makes the wrong outcome *less likely*, but it doesn't make it *impossible* — the model can still misread the instruction, round differently, or fall back on its own training knowledge instead of trusting the number you handed it as ground truth. For anything that needs to actually hold every time (a pure quantity edit never changing a macro ratio, in STEADY's case), the real fix has to live in code that runs *after* the model responds: compute what the correct answer should be deterministically, and either verify the model's output against it or just skip the model's output entirely for that value. Treat prompt instructions as steering the common case and code-level guards as the thing that makes the invariant actually true.

### "Edit" and "log new" can secretly be the same code path — check before assuming they're separate
*2026-07-28 · Architecture*

STEADY's "edit meal entry" feature turned out not to be a distinct operation at all — it was the exact same food-logging endpoint, called with an extra `meal_log_id`, that deletes the old entries and re-runs the *entire* fresh-log pipeline (AI parse → cache/USDA/AI-match resolve) from a reconstructed text string. Nothing about "editing" preserved any memory of what the entry used to be. This is a common trap in systems built incrementally: a feature you'd naturally think of as "update part of X" gets implemented as "delete X, create a new X" because that's the code that already existed and worked. It's not wrong by itself, but it silently discards any state (verified label macros, a specific resolved cache row) that only existed on the old X — worth explicitly checking, any time you see an "edit" flow, whether it actually reads the thing being edited before it goes to work.

### A response schema is a contract between the prompt and the code — both sides have to change together
*2026-07-28 · Pattern*

It's tempting to think "just reword the prompt" is a self-contained change, but the moment a new instruction changes the *shape* of what the model can return — not just its wording — the function reading that response has to be taught the new shape too, or it'll either crash or silently ignore the new data. Adding a `label_macros` field and a `needs_clarification` response state to the food-photo prompt meant `index.ts` needed matching logic to check for those shapes before doing what it used to do unconditionally. Treat "change the system prompt" and "change what the response looks like" as two different tasks that happen to often travel together — the second one is a code change, not a wording change, and skipping it means the prompt describes behavior the app doesn't actually implement.

### Postgres CHECK constraints and TypeScript union types are two separate sources of truth
*2026-07-28 · Pattern*

Adding `'label'` to a TypeScript type like `type MacroSource = 'usda' | 'indb' | ... | 'label'` only changes what the *compiler* considers valid — it says nothing to Postgres. If the actual database column has its own `CHECK (source IN (...))` constraint (as `food_items.source` and `food_items.macro_source` do here), the database enforces its own separate, older list of allowed values, completely unaware that the TypeScript side moved on. Code compiles cleanly, then the first real INSERT with the new value throws a runtime constraint-violation error. Any time a "valid values" enum exists in application code, check whether the database has an independent copy of that same constraint before assuming a type change is sufficient — grep the migrations for the column name, not just the code.

### Loading a custom font in React Native isn't like CSS @font-face
*2026-07-27 · Architecture*

On the web, one `@font-face` declaration lets the browser pick a bold/medium/regular variant of the same family on the fly whenever CSS asks for a different `font-weight`. React Native has no such synthesis step — there's no OS-level font-matching engine sitting between your style and the rendered glyphs the way there is on web or desktop. Each weight (Regular, Medium, SemiBold, Bold) is a *physically separate font file* with its own internal PostScript name, and `fontFamily` in a RN style must name that exact file's registered name. Setting `fontWeight: '700'` on a `<Text>` styled with a custom `fontFamily` does nothing by itself — RN doesn't have a heavier version of that file to fall back to, so it silently renders at whatever single weight was actually loaded. This is why adding TikTok Sans wasn't a one-line typography change: every place in STEADY that set `fontWeight` needed a matching `fontFamily` added right next to it, or that text would've silently stayed on the OS system font instead of switching to the new one.

### Absolute positioning is the escape hatch from flex layout, not a replacement for it
*2026-07-28 · Pattern*

Every screen in STEADY so far has used flex layout — RN stacks elements top-to-bottom or left-to-right automatically, deciding size and position for you, similar to a `BoxLayout` in Java Swing. The new Welcome screen's nutrient callouts needed something flex can't do: six labels sitting at exact, overlapping-with-nothing-else spots scattered around a photo, which isn't a "stack of items" relationship at all. RN's answer is `position: 'absolute'` plus `top`/`left` numbers — the element is pulled out of the normal flow entirely and placed at an exact offset from its nearest `position: 'relative'` (or default) ancestor, the same idea as `setBounds()` on a Swing component under a `null` layout manager. The lesson isn't "absolute positioning is better" — flex remains correct for close to everything, including the buttons and wordmark on this same screen — it's that absolute positioning exists specifically for the minority of layouts where relationships are geometric (radiating outward from a point) rather than sequential (stacked in a list).

### An SVG's `viewBox` is its own internal coordinate system, decoupled from its actual pixel size
*2026-07-28 · Concept*

The Welcome screen's six arrows are drawn as an `<Svg viewBox="0 0 W H">` containing `<Path>` elements written in those same reference units — regardless of how many actual screen pixels that `<Svg>` ends up occupying. `viewBox` tells the SVG "pretend your drawing surface is this size," and RN (like a browser) then stretches that pretend surface to fill whatever real width/height the component was given, uniformly scaling every coordinate inside it. This is genuinely useful — it's why the arrow math could be copied directly from the design file's own pixel numbers without any conversion — but it's also an easy trap: anything positioned *outside* the `<Svg>` (the text labels, in this case) does NOT get that same automatic scaling, since it's an ordinary RN `View` with its own separate `top`/`left` numbers. Mixing "scaled by viewBox" content with "positioned by raw pixels" content in the same visual composition only stays aligned if both are driven by one shared width/height, recalculated together — see the next entry below for the `scale` factor that ended up doing this once a single fixed canvas size turned out not to be enough.

### A design mockup's fixed pixel width is a reference frame, not a real constraint
*2026-07-28 · Pattern*

The Claude Design splash file was built at exactly 390px wide — the reference width Apple used for the iPhone 14/15 — and every coordinate in it (bowl position, callout boxes, arrow endpoints) is a literal pixel number in that frame. Hardcoding `width: 390` straight into the component works perfectly in a screenshot taken on that exact phone model, then clips or overlaps on anything narrower (which is most Android phones, and plenty of iPhones too) — the mockup's canvas doesn't know the real device exists. The fix wasn't to change the numbers by hand for a "typical" phone; it was to keep the design's 390-unit coordinate system as-is and add one multiplier: `scale = (actual screen width − side padding) / 390`, then multiply every position and size by that `scale` before rendering. `useWindowDimensions()` is RN's way of reading the real device's current width (similar in spirit to querying screen size from a Java `Toolkit`, except it's a reactive hook — components using it re-render automatically if the size ever changes, e.g. on rotation). This is the general shape of "take a design that was made for one screen size and make it work correctly on all of them": never hand-tune the numbers per device, scale the whole reference frame by one ratio.

### `flex: 1` between two fixed-size siblings is an exact centering guarantee, not an approximation
*2026-07-28 · Pattern*

"Center this between the wordmark and the button" sounds like it might need runtime measurement — checking the actual rendered height of both neighbors, then computing a midpoint, the way you might in a Swing `GridBagLayout` with manual constraint math. In React Native's flex model it doesn't: when a column has three children and only the middle one has `flex: 1` (the other two sized only by their own content), that middle child is mathematically guaranteed to receive exactly the leftover space between its neighbors, whatever their heights turn out to be. `justifyContent: 'center'` inside that middle child then centers within that exact leftover span. STEADY's Welcome screen already had this shape by accident (wordmark → flexible middle → buttons), so "center the bowl between the logo and the button" was already true the moment that structure existed — no `onLayout` measurement, no hand-computed midpoint, needed. Worth checking whether a layout already has this shape before reaching for a measurement-based fix.

### Paint order hides bugs: an element drawn "behind" a later sibling can be technically correct and still invisible
*2026-07-28 · Pattern*

In both SVG and React Native's JSX, later siblings paint on top of earlier ones — same rule as z-order in any layered UI toolkit (the last item added to a Swing `JLayeredPane`, or the last shape drawn on a `Graphics2D` canvas, wins visually). The Welcome screen's `<Svg>` (the arrows) is written before the `<Image>` (the bowl) in the JSX, so the bowl paints over anything the arrows draw underneath it. Four of the six arrows had endpoints that, due to a stale radius calculation from an earlier resize, landed just inside the bowl's edge instead of just outside it — meaning most of each arrow was being drawn, correctly, exactly where the code said to draw it, and then immediately painted over. The arrows weren't missing or broken; they were present and invisible, which is a meaningfully different bug to debug than "this shape has a rendering error" — the fix isn't in the shape's own styling at all, it's in checking its coordinates against every other layer's actual bounds. Worth remembering whenever "this thing isn't showing up" turns out to still exist in the element tree: check what's drawn on top of it before assuming the element itself is wrong.

### `onLayout` measures what `useWindowDimensions()` structurally can't know
*2026-07-28 · Concept*

`useWindowDimensions()` answers "how big is the whole screen," which is knowable the instant a component mounts. It can't answer "how much vertical space is left for the middle flex child," because that number depends on how tall its sibling elements turn out to be — something that isn't fixed in code, it's a product of font metrics, padding, and content, resolved only once React Native actually lays everything out. `onLayout` is the hook for that second kind of question: pass a callback to any component's `onLayout` prop, and RN calls it once, after that specific component has been measured, with its real `{x, y, width, height}` — conceptually the same shape as a Swing container calling `getPreferredSize()` on a child after packing the layout, then reading the result back. The Welcome screen's illustration needed exactly this: `DESIGN_CANVAS_HEIGHT * scale` was previously scaled only by screen *width*, so on a device where the leftover vertical space happened to be unusually generous, the illustration ended up small and floating with a large empty gap around it. Feeding `bowlArea`'s measured height into the same `scale` calculation (capping it to whichever of width or height is the tighter constraint) fixed that — the general lesson being: `useWindowDimensions()` is for facts about the device, `onLayout` is for facts about how this specific tree of components actually rendered, and the two aren't interchangeable.

### A quadratic curve only bends if its control point is offset sideways, not along the line
*2026-07-28 · Concept*

An SVG quadratic Bézier (`Q cx cy, x2 y2` in a path's "d" string) draws a curve from the current point through a shape pulled toward one control point — but "pulled toward" only produces visible bend when that control point sits *off* the straight line connecting the start and end points. If all three points — start, control, end — happen to lie on the same line (even if they're at three different distances along it), the "curve" collapses to a perfectly straight segment, because there's nothing for the curve to bend around. This is exactly what broke the Welcome screen's arrows: they'd been placed at three different distances from the bowl's edge along the *same ray* out from its center — geometrically correct for "point at the bowl," but collinear, so the shaft rendered dead straight instead of curved. The fix pattern for "I want a curve pointing from A to B" is: put the control point near the midpoint of A→B, then nudge it perpendicular to that line by however much bend you want — never simply "somewhere between A and B," which is exactly the trap of picking a point that still lies on the A→B line itself.

### A "value doesn't exist" runtime error can mean the running app and the source file disagree, not that the file is broken
*2026-07-28 · Tool*

Metro (the bundler that powers React Native's live-reload) has a feature called Fast Refresh: when a file changes, it tries to patch the *already-running* app in place — swapping in the new component code — without restarting the whole JS engine from scratch, so edits show up almost instantly instead of requiring a full app relaunch every time. This is usually great for iteration speed, but it comes with a sharp edge: Fast Refresh's patching is best-effort, not a guarantee, and it can sometimes update part of a module (say, a JSX usage site) while leaving another part (a `const` declared at the top of the file) bound to whatever it was during an earlier edit. The result is a genuinely confusing class of error — `ReferenceError: Property 'X' doesn't exist` — that appears to say the current source file is broken, even when reading that exact file top to bottom shows the name declared and used consistently. The tell is exactly that mismatch: if the error claims something is missing but the file on disk clearly has it, the fix usually isn't more code changes, it's a full reload (not Fast Refresh) — shaking the device in Expo Go, or pressing `r` in the terminal running Metro — which forces the whole module to be freshly evaluated instead of incrementally patched, and clears out any stale binding left over from a previous version of the file.

### Custom fonts load asynchronously — and the splash screen is how you hide that
*2026-07-27 · Pattern*

Bundling a font file into the app isn't enough to use it — `expo-font`'s `useFonts()` hook has to register it with the native text-rendering layer first, and that's an async operation (closer to an `await fs.readFile()` than a synchronous variable assignment), because it round-trips into native iOS/Android font APIs. If the app renders before that promise resolves, the user sees one frame in the wrong font, then a visible snap to the right one — a "flash of unstyled text." The fix is `expo-splash-screen`'s `preventAutoHideAsync()` at module load, then `hideAsync()` only once `useFonts()` reports `fontsLoaded === true`, with the component returning `null` in between. Nothing is shown at all until the fonts are ready, so the UI just appears once, already correct.

### The unit boundary: convert at the edges, never in the middle
*2026-08-02 · Pattern*

When an app stores a value in one unit and shows it in another, the discipline that keeps it correct is deciding — and writing down — exactly where conversion is allowed to happen. STEADY's rule is: the database is always kg and cm, the screen is always whatever the user picked, and conversion happens at precisely two edges — reading a profile in, and writing a form back out. Everything between those edges is display-unit text. The old Settings screen broke this by converting on the way *out* (cm → inches on render) but not on the way *in* (typed inches written straight back into a variable named `heightCm`), which meant the same variable held centimetres sometimes and inches other times — the JavaScript equivalent of a C++ variable whose type changes at runtime. The symptom was that every keystroke in imperial got divided by 2.54 again, so typing "70" showed 28. The general defence, beyond just fixing the arithmetic, is a round-trip test: `format(parse(x)) === x`. It's a two-line assertion that catches an entire class of bug, and it's what `__tests__/unit/units.test.ts` now does for every field.

### Rounding is not symmetric — don't round-trip a value the user never touched
*2026-08-02 · Concept*

65kg displays as 143 lbs, but 143 lbs converts back to 64.9kg, not 65. That's not a bug in the arithmetic; it's what happens when you round to a whole number in one unit and then convert back to a finer-grained one. It matters because a settings screen lets you flip the units toggle as many times as you like, and if each flip converts the *text currently on screen*, a number the user never edited quietly erodes with every flip. The fix is to distinguish "the user typed this" from "this is just how the stored value looks right now": untouched fields re-format from the canonical number in the database, and only edited fields get parsed from what's on screen. Same principle as never re-encoding a JPEG you only opened — the lossy step is fine once, and compounds if you repeat it.

### Derived values need an owner, or they silently go stale
*2026-08-02 · Architecture*

`calorie_goal`, `protein_goal_g`, `carb_goal_g` and `fat_goal_g` are stored columns, but they aren't independent facts — they're *derived* from weight, height, age, sex, activity level and goal via `calculateTDEE()`. In STEADY that derivation was only ever run at one point in the app's life (the onboarding reveal screen), so the moment any input changed afterwards, the stored outputs became a lie that nothing in the system was responsible for correcting. This is the classic cache-invalidation shape: whenever you persist a computed value alongside its inputs, something has to own recomputing it, and "the screen that happened to create it first" is not an owner. The wrinkle here is that the user is also allowed to override these numbers by hand, so blindly recomputing would stomp a deliberate choice — which is why Settings now recomputes live off the draft but *asks* before writing, and treats a hand-typed target as final. When a derived value can also be user-edited, you need to track intent, not just staleness.

### A React key is not an identity — don't look things up by it
*2026-08-02 · Pattern*

When React renders a list it needs a `key` on each item, purely so it can tell "this is the same DOM/native node as last render, just moved" apart from "this is a brand-new node." That's its *entire* job — it's a rendering hint, closer to a memory address than to a primary key, and React never guarantees it means anything about your data. The trap is that we often *set* the key to a real database id (because it's conveniently unique), and then start treating it as one — reaching for `msg.id` when what we actually meant was "the meal this card is showing." STEADY hit exactly this: HomeScreen's chat feed built meal cards by two different routes, one keying them by the meal's UUID and one by a throwaway render counter, and a sync effect that looked up `msg.id` in a map of meals silently dropped every card that came from the second route. The rule to carry forward: keys are for React, and identity lookups should always read the id off the *data* (`msg.meal.id`), never off the wrapper — then it doesn't matter how the wrapper was keyed.

### Deriving state beats mirroring it — and mirroring is why the two panels disagreed
*2026-08-02 · Architecture*

There are two ways a screen can show data that lives in a store: *derive* it (compute it from the store during render, every time) or *mirror* it (copy it into local `useState` once, then keep the copy in sync by hand). Derived state is like a database view — it cannot be stale, because it doesn't exist between renders. Mirrored state is a cache, and like every cache it introduces an invalidation problem you now own forever. STEADY's Home screen has one of each, side by side: the "Food log" tab derives its cards straight from `useFoodLogStore`, while "Log + Coach" mirrors them into a `messages` array because it has to interleave them with chat bubbles by timestamp. Only the mirrored one ever went out of sync — and that's the diagnostic shortcut worth remembering: when one view of the same data is right and another is wrong, don't start by suspecting the database or the network; find which view is the copy, because the bug is almost always in whatever code is responsible for keeping that copy honest. Mirror only when you genuinely need to merge in something the store doesn't have, and when you do, make the sync logic key off the same identity the store uses.

### An `await` is a gap where the world can change underneath you
*2026-08-02 · Pattern*

In synchronous code — the Python/Java/C++ mental model — a function that reads a variable, does some work, and writes it back is safe, because nothing else runs in between. JavaScript is single-threaded too, which makes it tempting to assume the same thing, but every `await` is an explicit yield: the function pauses, the runtime goes off and runs *other* code (event handlers, other pending promises, React renders), and only later resumes where it left off. So any value your function captured *before* an `await` may be stale *after* it, and any write you make after an `await` can silently stomp on something another handler wrote while you were suspended. That's exactly how STEADY's chat feed lost meals: `loadAndMergeHistory` fetched history over two `await`s and then called `setMessages(merged)` — a value computed before the gap, written after it — clobbering the bubbles `handleSend` had pushed in the meantime. The defensive habits that follow: prefer the functional form of setState (`setX(prev => …)`) so you compute from what's actually there at write time rather than from a stale snapshot, and treat "read → await → write" on any shared state as a code smell worth a second look.

### A `.map()`-based update silently does nothing when it matches nothing
*2026-08-02 · Pattern*

The idiomatic React way to update one item in a list is `list.map(item => item.id === target ? replacement : item)` — immutable, clean, and used all over this codebase. Its sharp edge is that a *miss* is indistinguishable from a *no-op*: if nothing in the list has that id, `.map` cheerfully returns a copy of the original and nobody raises an error. STEADY hit this twice in one file — a `replace(thinkingId, card)` whose target bubble had been wiped by a racing fetch just returned the list unchanged, so the meal card never rendered and nothing anywhere reported a problem. Worth remembering that this failure mode is *by design* in `.map`, so when a UI update mysteriously doesn't happen and there's no error in the console, a map-based updater that quietly matched zero rows is a prime suspect — and in code where a miss genuinely shouldn't happen, it's cheap to assert or log instead of letting it pass in silence.

### Nested `<Text>` is inline — the one place React Native isn't a box
*2026-08-02 · Pattern*

React Native's core promise is that everything is a flexbox box: a `<View>` inside a `<View>` is always a rectangle that stacks or sits beside its siblings, and you position it with flex rules. `<Text>` breaks that rule on purpose — a `<Text>` nested inside another `<Text>` behaves like an HTML `<span>`, joining the parent's *text flow*, inheriting its font settings, and wrapping along with the surrounding words instead of becoming its own rectangle. The mental model that helps coming from Python/Java: the outer `<Text>` is a paragraph being laid out word by word, and the inner one is just more words in that same paragraph carrying different styling — a styled run of characters, not a widget being placed. For STEADY this is what made the WhatsApp-style in-bubble timestamp free: we hand the time to the text layout engine as trailing words and it decides whether they fit on the last line, so there's no measuring, no `onLayout`, and no "does it fit?" branch anywhere in HomeScreen. The trade-off to know about is the flip side of the same property — because the time is text flow rather than a right-aligned box, when the last line is nearly full the time wraps and lands at the *left* edge, which is exactly the case WhatsApp spends real complexity (an invisible spacer plus an absolutely-positioned time) to avoid.

### Flex-wrap gives you ragged rows; a grid gives you columns
*2026-08-02 · Pattern*

`flexWrap: 'wrap'` lays children out at their natural width and starts a new line when it runs out of room — so a set of chips with different label lengths produces rows that break at different points and cells that never line up vertically. That's exactly what made STEADY's Settings choice groups look lopsided: four goals wrapped 3 + 1 and five activity levels wrapped 3 + 2, each chip a different width. The fix isn't more tuning of gaps or padding; it's changing the layout model. Giving every cell `flexBasis: 0, flexGrow: 1` inside an explicit row makes them split the available width into N identical columns regardless of their content, and padding a short final row with invisible spacers keeps those columns aligned from the first row to the last. React Native has no CSS `grid`, so this — fixed rows of equal-basis cells — is how you build one. Rule of thumb: reach for wrap when the item count is unknown and alignment doesn't matter (tags, filters); build a grid when the items are a fixed known set the user is choosing between.

### One row shape beats per-row tuning
*2026-08-02 · Pattern*

A settings list looks "uneven" long before anything is actually misaligned — it's usually one row being a different height than its neighbours. In STEADY's case a single subtitle wrapped to two lines, which pushed that one row ~16px taller and made the whole card read as sloppy. The durable fix is to make the row shape a property of the component rather than of its contents: one `Row` that owns its own icon tile, its own divider, and a subtitle capped at `numberOfLines={1}` with an ellipsis, so no caller can accidentally produce a taller row by passing longer text. The Claude Design reference does exactly this (`whiteSpace: nowrap; overflow: hidden; textOverflow: ellipsis` on every sub). Same principle as letting a layout manager own sizing instead of each widget setting its own preferred height — the moment individual callers can influence the shape, the rhythm drifts.

### Reserving space with invisible text — how WhatsApp floats a timestamp inside a paragraph
*2026-08-02 · Pattern*

CSS has `float: right`, which lets a box sit at the right edge of a paragraph and have the text flow around it; React Native's layout engine has no equivalent, and an absolutely-positioned child is completely invisible to text layout — the words will happily run straight underneath it. The trick that gets you the WhatsApp bubble timestamp anyway is to render the timestamp *twice*: once as a transparent copy nested inside the message `<Text>`, which draws nothing but still occupies width and therefore forces the layout engine to keep a timestamp-shaped hole at the end of the last line, and once for real as an absolutely-positioned sibling pinned to the bubble's bottom-right corner. The spacer decides *whether there's room*; the absolute copy decides *where it's drawn*, and because it's pinned rather than flowed it comes out right-aligned in both cases. The elegant part is the failure mode doubles as the feature: when the last line is too full for the spacer, the spacer wraps to a new line, the bubble grows by one line, and the pinned timestamp lands in exactly that new empty space — which is precisely the behaviour you see on long WhatsApp messages. Two details make or break it in STEADY's HomeScreen: the spacer's `fontSize` has to match the real timestamp's or the reserved hole is the wrong size, and the spacer's spaces have to be non-breaking (` `), otherwise the reserved block can itself be split across two lines and the real timestamp ends up painted on top of the message text.

### A TextInput is only tappable where its glyphs are
*2026-08-02 · Pattern*

Wrapping a `<TextInput>` in a styled `<View>` to make it look like a pill or a card produces a control that looks bigger than it is: touches land on whichever view is topmost at that point, and a plain View doesn't forward anything to its child, so the padding around the input — and any sibling like a unit suffix — simply swallows the tap. The user sees a field-shaped thing that doesn't respond, which is worse than an obviously plain input. The fix is to make the wrapper itself pressable and have it forward focus explicitly: hold a `useRef<TextInput>`, put the ref on the input, and call `inputRef.current?.focus()` from the wrapper's `onPress`. Pair it with `hitSlop` to extend the target a few px past the visible bounds, and `selectTextOnFocus` so one tap both focuses and selects — the difference between "tap, then position the cursor, then delete the old value" and just typing the new number. Worth checking on any input STEADY dresses up in a container: the visual affordance and the touch target are two separate things, and only one of them comes for free.

### `pointerEvents="none"` is how you stop a child from stealing a parent's tap
*2026-08-02 · Concept*

React Native decides which view handles a touch by walking down to the deepest view under the finger and asking each one whether it wants to become the "responder" — so a child can claim a press that you intended for its parent, and the parent's `onPress` simply never fires. This bites whenever a pressable container holds decorative children: STEADY's Settings value pills wrap a TextInput plus a unit label ("kg", "cm") in a Pressable, and the unit label happily became its own responder, making the one corner of the pill users aimed at completely dead. Setting `pointerEvents="none"` on a child removes it from that hit-testing walk entirely — it still renders, it just can't be touched, so the press falls through to whoever is behind it. (`box-none` is the related variant: the view itself is untouchable but its children aren't.) Rule of thumb: any purely visual child inside a pressable — icons, unit suffixes, badges, overlays — should be `pointerEvents="none"` unless it's meant to be its own button.

### Product analytics: capture, identify, reset
*2026-08-02 · Protocol*

An analytics SDK like PostHog is a fire-and-forget logger with a background flush thread — the mental model from any other language is a global singleton whose `log()` appends to an in-memory queue and returns immediately, while a worker POSTs batches to the server every ~30s. That's why `posthog.capture()` is never awaited and never needs a try/catch on the caller's side: a dead network can't break your app, and unsent events are persisted to AsyncStorage so a force-quit doesn't lose them. Three calls do different jobs and the distinction matters: `capture(event, props)` records "a thing happened"; `identify(distinctId, traits)` tells the server "the anonymous device I've been tracking is actually user `abc-123`", which retroactively stitches all the pre-login events onto that person; and `reset()` forgets that association on sign-out, without which the next person to log in on the same device inherits the previous user's identity and their events merge into one impossible-looking user. In STEADY that's why `identify` and `reset` live in `authStore` rather than in any screen — they belong to the session lifecycle, not to a view.

### Making an untyped SDK type-safe with an event registry
*2026-08-02 · Pattern*

Analytics SDKs almost universally expose `capture(name: string, props?: object)`, which means a typo (`meal_loged`) or a renamed property fails nothing — it silently creates a new event that under-reports a funnel for weeks before anyone notices, and there's no compiler, linter, or test that catches it. The fix is a registry: declare one TypeScript interface mapping every event name to the exact shape of its properties (`AnalyticsEvents` in `src/utils/analytics.ts`), then wrap the SDK in a generic function `track<E extends keyof AnalyticsEvents>(event: E, properties: AnalyticsEvents[E])`. Because the generic is constrained to the interface's keys, an unknown event name won't compile, and because the property type is looked up *from* that key, the wrong props for a real event won't either — renaming an event becomes a refactor the compiler walks you through. The one place the two type systems have to meet is the call into the SDK itself, since PostHog types its bag as JSON-only values and our optional fields widen to `undefined`; that's a single deliberate cast at the boundary, with all the real safety sitting in `track()`'s signature above it. Same idea as putting a typed DAO in front of raw SQL strings — you're not making the underlying call safer, you're making it impossible to *reach* incorrectly.

### Instrument the data layer, not the UI layer
*2026-08-02 · Architecture*

The instinct when adding analytics is to put a `track()` next to every button's `onPress`, which is exactly how event data rots: the same outcome gets reached from three different screens, someone adds a fourth entry point six months later and forgets the call, and the metric quietly under-counts with no error anywhere. A better default is to capture *outcome* events where the data actually changes — in STEADY that's the Zustand store actions, since `logSavedEntry` is invoked from both HomeScreen and the saved-entries sheet but is one function, so one call site there covers both forever and the two can't drift. Screens then only carry *intent* events, the ones a store genuinely cannot see: a tap that doesn't mutate anything, a photo capture the user abandoned at the OS camera, a permission prompt's answer. The dividing question is "could I reconstruct this from the data change?" — if yes it belongs in the store, if no it belongs in the screen. One consequence worth internalising: when moving a capture into a store, you have to *delete* the screen's copy, or every log gets counted twice.

### Bucketing: how to measure health data you shouldn't be storing
*2026-08-02 · Pattern*

Sending a user's exact weight to a third-party analytics server is both a privacy liability and, counterintuitively, worse analysis — thousands of distinct floats produce a noise cloud rather than a chart. Bucketing solves both at once: map the continuous value onto one of a small fixed set of labels (`weightBucket(84.3)` → `"80-90"`) before it ever leaves the device. The privacy property is that a coarse band can't be matched back to an individual the way "84.3 kg on this date" can, and the analysis property is that PostHog groups identical strings into clean bars for free. The same instinct generalises past numbers: for body measurements STEADY sends which *fields* were filled in and never their values, and for free text it sends a length band instead of the text. The related trick for errors is a closed union — `errorReason()` maps any thrown value onto a fixed set of category codes, and because the union has no escape hatch there is literally no branch through which a raw error string (which for STEADY's food AI routinely quotes the user's own meal description) can leak into the event stream.

### Jest's moduleNameMapper matches the import string, not the resolved file
*2026-08-02 · Tool*

STEADY mocks the PostHog client in tests via a `moduleNameMapper` entry keyed on `^.*/utils/posthog$`, and it had worked for months — so it was surprising that a newly added `src/utils/analytics.ts` still pulled in the real SDK. The reason is that Jest tests those regexes against the literal string written in the `import`, not against the path it resolves to: a screen importing `'../../utils/posthog'` matches, but `analytics.ts` sitting *inside* `utils/` writes `'./posthog'`, which that pattern doesn't match at all. Two files pointing at the identical module on disk can therefore get different treatment purely based on how the import was spelled. The fix was a second mapping for `^\./posthog$`, and the tell that something was wrong was a `console.warn` from the real module appearing in test output — worth treating unexpected log lines in a passing suite as a signal rather than noise, since here it meant the real SDK was being constructed 14 times (the suite got 2.5× faster once it wasn't).

### Applied migrations are frozen — editing the file changes nothing
*2026-08-03 · Tool*

Coming from Python/Java, it's tempting to read a `.sql` migration as the *description* of the database, the way a class definition describes an object — fix the file, the system is fixed. It isn't: a migration is a one-time script, and Supabase records its version number in a `schema_migrations` table the moment it runs. Editing that file afterwards updates only the repo; `supabase db push` sees `013` already listed and skips it forever, so the file and the live database can disagree indefinitely with nothing reporting a conflict. This is exactly how STEADY's push notifications ended up broken for six days — migration 013's `cron.schedule` call was fixed to read from Vault, but production kept running the original pre-Vault job body. The rule to internalise: **once a migration has run, the only way to change what it did is a new migration** (or a one-off manual statement), and when a migration contains a side effect rather than pure schema — scheduling a cron job, seeding a row, creating a secret — the repo stops being a reliable description of production and you have to go query the real thing.

### pg_cron fails silently, and `active = true` doesn't mean working
*2026-08-03 · Protocol*

`pg_cron` is a scheduler that lives *inside* Postgres, and `pg_net` lets it make outbound HTTP calls — together they replace an always-on server for STEADY's 5-minute reminder heartbeat. The trap is their error reporting: a job that throws on every single run still shows `active = true` in `cron.job`, because that column means "is scheduled", not "is succeeding". Every actual error goes into `cron.job_run_details` and nowhere else — not the app, not the Supabase dashboard's function logs, not any alert. So the diagnostic habit for anything cron-driven is three queries in order: `cron.job` (is it scheduled, and *what is the command actually stored in production*), `cron.job_run_details` (is it succeeding), and `net._http_response` (did the HTTP call genuinely leave the database). For STEADY the third one was decisive — an empty response table proved the Edge Function had never been reached at all, which instantly ruled out the entire function-side of the pipeline and pointed the search back at the SQL.

### Why the OAuth consent screen shows a domain instead of your app name
*2026-08-03 · Protocol*

The "to continue to …" line on Google's account chooser is not reading an app-name field — it's showing the **host of the `redirect_uri`** your OAuth request sent, and it only upgrades to your app's name once you've proven ownership of that domain in Google Search Console. That's why STEADY shows `xfrwzw….supabase.co`: with `signInWithOAuth`, Supabase's `/auth/v1/callback` is the party Google thinks it's talking to, and `supabase.co` is a domain we can never verify because Supabase owns it. The general lesson is that in a redirect-based protocol, whoever holds the callback URL owns the branding — so the fix is never a settings field, it's changing who sits at the redirect. Either move the callback onto a domain you own (Supabase custom domain), or delete the redirect entirely by going native: ask the OS for a signed ID token and POST it to `signInWithIdToken`, which never opens a browser and so has no host to display.

### Push tickets vs. delivery receipts — two different questions
*2026-08-03 · Protocol*

When you POST to the Expo Push API you get back a *ticket*, and it's tempting to read `status: "ok"` as "delivered". It isn't — a ticket only means Expo accepted the request into its queue, and the actual handoff to Google's FCM or Apple's APNs happens afterwards. The real verdict lives in a *receipt*, fetched separately with the ticket id via `getReceipts`, and that's where the failures you actually care about show up: `DeviceNotRegistered` (user uninstalled the app — you should delete that token), or credential errors meaning FCM was never configured for the project. For STEADY this distinction was the whole test: we had no `google-services.json` in the repo and our last EAS build predated the notification code, so whether Android push credentials existed at all was genuinely unknown — and only the receipt could answer it. Worth remembering that EAS stores those credentials server-side and injects them at build time, so their absence from the repo says nothing either way.

### Why Android Google Sign-In asks for the *web* client ID
*2026-08-03 · Protocol*

Wiring native Google Sign-In means creating three OAuth clients — Android, iOS, Web — and the confusing part is that the Android client ID is never referenced anywhere in our code. Google identifies an Android app by **package name plus the SHA-1 fingerprint of the certificate the APK was signed with**, which is a claim the OS can make on our behalf and an attacker can't forge by copying a string out of our bundle; the Android client's whole job is to authorize the request, invisibly. The web client ID is what we actually pass to `configure()`, on both platforms, because it becomes the `aud` ("audience") claim stamped inside the issued ID token — the field Supabase reads to confirm this token was minted for STEADY and not for some other app that happened to get a valid Google token. Two consequences worth remembering: these client IDs are public identifiers rather than secrets (they ship in the bundle by design, hence `EXPO_PUBLIC_`), and because the Android side is bound to a signing certificate, **Play App Signing re-signing our AAB means the released build has a different SHA-1 than our local one** — so both fingerprints must be registered or sign-in works in dev and dies in production.

### The Public Suffix List decides what Google thinks your "domain" is
*2026-08-03 · Protocol*

Google's Authorized Domains field doesn't take an arbitrary hostname — it resolves whatever you type down to the **top private domain**, using the [Public Suffix List](https://publicsuffix.org/), a community-maintained registry of zones under which anyone can register a name. `.co.uk` is the classic example, but `github.io` and `supabase.co` are on it too, precisely because they hand out subdomains to strangers. That's why STEADY's authorized domain is `me-shivamo.github.io` rather than `github.io`, and it's the mechanical reason Google printed the entire `xfrwzwayibenskyoakmi.supabase.co` string on our consent screen: since `supabase.co` is a public suffix, the random project ref *is* the registrable name, and there's no shorter identity for Google to fall back to. The generalisable point is that "domain ownership" in OAuth, cookies, and CORS is defined by the PSL rather than by counting dots — so whether `a.b.c` and `d.b.c` are treated as the same party depends entirely on whether `b.c` is on that list.

### Which changes need a rebuild, and which are just server-side
*2026-08-03 · Architecture*

A useful line to draw in STEADY: the APK on someone's phone contains only the **UI and the client logic**, while everything about *when* and *whether* a notification goes out lives on the server. The installed app's entire role in the reminder feature is two writes — hand Supabase a push token, and record which reminders you want and at what times — after which it's a passive receiver. So a broken scheduler, wrong copy, a new broadcast, or changed send conditions are all fixed by touching Supabase alone, and a phone running a build from weeks ago picks the fix up on the next 5-minute tick with no update installed. What genuinely *does* require a new build is anything compiled into the native binary: `app.json` plugin changes (they run at prebuild time, so adding a plugin does nothing until you rebuild), new native modules, and any change to the Reminders screen itself. The practical instinct: before assuming "I need to rebuild to test this", ask which half of the system actually changed — for STEADY's 1,685-failure cron bug the answer was the database's alarm clock, and no rebuild was involved in fixing it.

### A stray A record doesn't break a site — it breaks one visitor in three
*2026-08-03 · Protocol*

Pointing an apex domain at GitHub Pages means publishing four `A` records for the same name, and DNS resolves that set by **round-robin**: the client picks one address essentially at random, which is how you get load spreading and failover without a load balancer. The consequence nobody warns you about is what happens when one address in the set is wrong. While migrating steady.chat off Hostinger we left `2.57.91.91` sitting alongside two GitHub IPs, and that doesn't produce a broken site — it produces a site that serves correctly for roughly two thirds of requests and 404s for the rest, reshuffling every time a resolver cache expires. That failure signature (works when *you* test it, fails for some users, "fixes itself" on reload) is nearly impossible to diagnose from the app side, so the habit worth keeping is to query the **authoritative** nameserver directly (`dig +short A domain @its-ns`) rather than a public resolver, and read the whole record set as a set — every member has to be correct, because every member will be served to somebody. The same sweep caught a second casualty: the `google-site-verification` TXT record had been deleted during the cleanup, which silently un-verifies the domain in Search Console and would have blocked it from Google Cloud's Authorized Domains later.

### Expo Go can't receive remote push — and the data proves it
*2026-08-03 · Tool*

Expo Go dropped remote push notification support in SDK 53, which is why `pushNotifications.ts` bails out early on `Constants.appOwnership === 'expo'` before ever calling `getExpoPushTokenAsync()` — without that guard the call throws a scary native warning on every launch. The practical consequence is that reminders are simply untestable in Expo Go no matter how correct the server is, and STEADY's own database shows it: exactly one push token exists, created 2026-07-28 by a locally-built standalone app, and never updated since despite plenty of Expo Go sessions afterwards. The useful part is that this splits cleanly — *preferences* (which reminders, what times) are written to Supabase and work from any client including Expo Go, while *receiving* requires a real native build. So the two halves of a test can legitimately run in two different apps on the same phone: set the reminder in Expo Go, receive it in the standalone build, because the cron only ever reads the database.

### Your app has two signatures, and Google checks the wrong one by default
*2026-08-03 · Protocol*

Play App Signing means Google **strips the signature off the AAB you upload and re-signs it with its own key** before handing it to devices, so the certificate on a user's phone is not the certificate you signed with. That splits your app's cryptographic identity in two: the *upload key* (your EAS keystore, proving to Play that the upload is genuinely from you) and the *app signing key* (Google's, which is what every installed APK actually carries). Because Android Google Sign-In identifies an app by package name plus the SHA-1 of whatever cert signed the running binary, STEADY needs **two Android OAuth clients** — same `com.steadyapp.android`, different fingerprints — one for sideloaded EAS dev/preview APKs and one for anything downloaded from Play, internal test track included. Registering only the EAS one produces the nastiest possible symptom: sign-in works perfectly on your own device and fails for every tester. A third certificate on that Play screen, "Internal app sharing", belongs to a separate quick-share feature and is not the one to use. Useful free check while you're there: Play's listed *upload key* SHA-1 must match what `eas credentials -p android` prints, or the next AAB upload is rejected outright.

### `.env` is a local-only file — EAS builds never see it
*2026-08-03 · Tool*

`EXPO_PUBLIC_*` variables aren't read at runtime the way `os.environ` is in Python; Metro **inlines them into the bundle at build time**, so whatever value is present when the bundle is compiled is permanently baked in. That's fine locally, where `.env` sits next to the code — but `.env` is gitignored, and EAS Build uploads your project *respecting `.gitignore`*, so the cloud builder never receives the file at all. The real source of truth for any cloud build is the **EAS environment variable store** (`eas env:list` / `eas env:create`), which is a completely separate place from `.env` with no syncing between them. Checking STEADY's revealed the gap this creates: the `development` environment was entirely empty and PostHog had never been registered anywhere, meaning every EAS build we'd ever made shipped with analytics silently disabled. The failure mode is the dangerous kind — nothing errors, the variable is just `undefined`, and code with a graceful fallback (ours disables analytics, or drops to the browser OAuth flow) behaves plausibly while doing the wrong thing. Two habits follow: run `eas env:list <environment>` before trusting any cloud build, and declare `"environment"` explicitly on each profile in `eas.json` so which-vars-does-this-build-get is answerable by reading the repo instead of querying a remote service.
