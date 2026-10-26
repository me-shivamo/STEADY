-- Rewrite the seven clock-reminder templates in the researched voice.
--
-- Migration 034 stripped the em-dashes out of three seeded lines, which fixed
-- the punctuation and left the real problem untouched. 'Stay hydrated. Log some
-- water.' still reads exactly like software issuing an instruction, because
-- that is what it is: two imperatives in a row with nothing human in them.
--
-- The research finding that reframed the whole catalogue applies just as much here:
-- the notifications people keep switched on OBSERVE rather than INSTRUCT.
-- Zomato's best line, 'Dinner plans? Let's be real, it's you and your couch
-- again', contains no call to action at all. It says something true about you
-- and lets you decide. Every one of the 25 templates seeded in migration 026
-- was an imperative, so all of them get replaced, not just the three with
-- dashes in.
--
-- Rules applied (same as .claude/plans/notifications.md):
--   * observe, don't instruct
--   * two beats: the title sets up, the body turns
--   * specific nouns beat categories (chai, not "a drink")
--   * title <= 35 chars, body <= 45, one meaningful emoji, no em-dashes
--
-- One deliberate omission: 'medicine' gets no rage-bait variant. Mocking
-- somebody about medical adherence is not edgy, it is just harmful, and the
-- same reasoning already keeps {{streak_days}} off medicine copy (migration
-- 026) -- streaks are for habit-building, not for medication.
--
-- Old rows are DEACTIVATED rather than deleted. notification_log.template_id
-- references this table ON DELETE SET NULL, so deleting them would erase the
-- record of which copy we sent for every notification already delivered.
-- pickTemplate() filters on active = TRUE, so deactivating is enough to retire
-- them while keeping the history intact.

UPDATE public.notification_templates
   SET active = FALSE
 WHERE event_key IS NULL AND active;

INSERT INTO public.notification_templates
  (reminder_type, title, variant_text, tone, channel, deep_link, is_ai_generated, active)
VALUES
  -- ── water ────────────────────────────────────────────────────────────────
  ('water', 'You are a houseplant 🪴',      'Currently under-watered 💧',        'funny',        'reminders', 'water', FALSE, TRUE),
  ('water', 'Water check 💧',               'You are behind for today ⚠️',       'serious',      'reminders', 'water', FALSE, TRUE),
  ('water', 'Easiest win of the day 💪',    'Two glasses and you are back 💧',   'motivational', 'reminders', 'water', FALSE, TRUE),
  ('water', 'Drink some water 😤',          'I am not going to ask twice 💧',    'cute-angry',   'reminders', 'water', FALSE, TRUE),
  ('water', 'Water break? 💧',              'Grab a glass while you think 👉',   'friendly',     'reminders', 'water', FALSE, TRUE),
  ('water', 'Chai is not water 👀',         'Nice try though ☕',                'rage-bait',    'reminders', 'water', FALSE, TRUE),
  ('water', 'hydration is a free win 💧',   'go drink. right now bro 💪',        'persona:gym-bro', 'reminders', 'water', FALSE, TRUE),

  -- ── meal ─────────────────────────────────────────────────────────────────
  ('meal', 'Your plate has a story 📸',     'Tell me before you forget 🍽️',      'funny',        'reminders', 'camera', FALSE, TRUE),
  ('meal', 'Meal not logged 🍽️',            'Takes about ten seconds 📸',        'serious',      'reminders', 'camera', FALSE, TRUE),
  ('meal', 'Log it while it is hot 💪',     'Keeps today honest 📸',             'motivational', 'reminders', 'camera', FALSE, TRUE),
  ('meal', 'You ate. I know you ate 👀',    'Show me the plate 📸',              'cute-angry',   'reminders', 'camera', FALSE, TRUE),
  ('meal', 'What is on the plate? 🍽️',      'Snap it, I will do the maths 📸',   'friendly',     'reminders', 'camera', FALSE, TRUE),
  ('meal', 'Bet you skip this one 👀',      'You usually do 🍽️',                 'rage-bait',    'reminders', 'camera', FALSE, TRUE),
  ('meal', 'Khaana khaya, beta? 👵',        'Show me what you ate 📸',           'persona:grandma', 'reminders', 'camera', FALSE, TRUE),

  -- ── workout ──────────────────────────────────────────────────────────────
  ('workout', 'Your gym kit is judging 👀', 'Folded since Tuesday 💪',           'funny',        'reminders', 'home', FALSE, TRUE),
  ('workout', 'Workout time ⏰',            'Your session is due now 💪',        'serious',      'reminders', 'home', FALSE, TRUE),
  ('workout', 'The door is the hard part 🚪','Everything after it is easy 💪',   'motivational', 'reminders', 'home', FALSE, TRUE),
  ('workout', 'It will not do itself 😤',   'Go on. Move 💪',                    'cute-angry',   'reminders', 'home', FALSE, TRUE),
  ('workout', 'Time to move 💪',            'Even twenty minutes counts 🙌',     'friendly',     'reminders', 'home', FALSE, TRUE),
  ('workout', 'Skipping again? 👀',         'That is twice this week 💪',        'rage-bait',    'reminders', 'home', FALSE, TRUE),
  ('workout', 'ON YOUR FEET 🫡',            'No excuses. MOVE 💪',               'persona:drill-sergeant', 'reminders', 'home', FALSE, TRUE),

  -- ── walking ──────────────────────────────────────────────────────────────
  ('walking', 'The sofa is winning 🛋️',     'Score is not close 🚶',             'funny',        'reminders', 'home', FALSE, TRUE),
  ('walking', 'Time for a walk 🚶',         'Ten minutes is enough ✅',          'serious',      'reminders', 'home', FALSE, TRUE),
  ('walking', 'Ten minutes outside 💪',     'Best thinking happens walking 🚶',  'motivational', 'reminders', 'home', FALSE, TRUE),
  ('walking', 'Step away from the screen 😤','Outside. Now. Go 🚶',              'cute-angry',   'reminders', 'home', FALSE, TRUE),
  ('walking', 'Fancy a walk? 🚶',           'Nicer out than you think 🌤️',       'friendly',     'reminders', 'home', FALSE, TRUE),
  ('walking', 'You said that yesterday 👀', 'And the day before 🚶',             'rage-bait',    'reminders', 'home', FALSE, TRUE),
  ('walking', 'The path is short 🧘',       'But it must be walked 🚶',          'persona:zen-monk', 'reminders', 'home', FALSE, TRUE),

  -- ── weight ───────────────────────────────────────────────────────────────
  ('weight', 'The scale misses you ⚖️',     'It is getting insecure 😅',         'funny',        'reminders', 'weight', FALSE, TRUE),
  ('weight', 'Weigh-in due ⚖️',             'One number keeps the trend real 📈','serious',      'reminders', 'weight', FALSE, TRUE),
  ('weight', 'Ten seconds, one number 💪',  'That is the whole trend ⚖️',        'motivational', 'reminders', 'weight', FALSE, TRUE),
  ('weight', 'Been dodging the scale 👀',   'It is data, not a verdict ⚖️',      'cute-angry',   'reminders', 'weight', FALSE, TRUE),
  ('weight', 'Quick weigh-in? ⚖️',          'Keeps your trend honest 📈',        'friendly',     'reminders', 'weight', FALSE, TRUE),
  ('weight', 'The scale will not bite 👀',  'Probably ⚖️',                       'rage-bait',    'reminders', 'weight', FALSE, TRUE),
  ('weight', 'The number is not the goal 🧘','Look, then let it go ⚖️',          'persona:zen-monk', 'reminders', 'weight', FALSE, TRUE),

  -- ── healthLog ────────────────────────────────────────────────────────────
  ('healthLog', 'How was today, honestly? 🤔','I will not tell anyone 📝',        'funny',        'reminders', 'home', FALSE, TRUE),
  ('healthLog', 'Health log due 📝',        'A minute to record today ✅',       'serious',      'reminders', 'home', FALSE, TRUE),
  ('healthLog', 'Patterns need notes 💪',   'Today is one data point 📝',        'motivational', 'reminders', 'home', FALSE, TRUE),
  ('healthLog', 'You skipped your log 😤',  'It is literally one minute 📝',     'cute-angry',   'reminders', 'home', FALSE, TRUE),
  ('healthLog', 'How are you feeling? 💭',  'Pop it in your log 📝',             'friendly',     'reminders', 'home', FALSE, TRUE),
  ('healthLog', 'Still not logging this? 👀','Two weeks running 📝',             'rage-bait',    'reminders', 'home', FALSE, TRUE),
  ('healthLog', 'How are you, beta? 👵',    'Write it down for me 📝',           'persona:grandma', 'reminders', 'home', FALSE, TRUE),

  -- ── medicine (no rage-bait, see header) ──────────────────────────────────
  ('medicine', 'Pill o clock 💊',           'The little one, then the big one ⏰','funny',        'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Time for your medicine 💊', 'Scheduled for right now ⏰',        'serious',      'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Small thing, big difference 💊','Take it and carry on 💪',       'motivational', 'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Take your medicine 😤',     'I am going to keep asking 💊',      'cute-angry',   'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Medicine time 💊',          'Quick one before you forget ⏰',    'friendly',     'reminders', 'home', FALSE, TRUE),
  ('medicine', 'Dawai le li? 👵',           'Do not skip it, beta 💊',           'persona:grandma', 'reminders', 'home', FALSE, TRUE);
