# Domino's Pizza India — official nutrition data

CSV: `dominos.csv` — **477 rows, 104 distinct item names**, one row per item × crust × size.

## Source (official, India)
- Page: https://pizzaonline.dominos.co.in/jfl-discovery-ui/en/dt/nutritional-info ("Nutritional Info"). It is linked as "Nutritional Information" in the footer of Domino's India's own ordering site (pizzaonline.dominos.co.in).
- Content: 47 chart images, "Baking Goodness" series, served from
  `https://pizzaonline.dominos.co.in/jfl-discovery-ui/public/dist/default/images/global/nutrition/MNI-01.jpg` … `MNI-47.jpg`. MNI-01 to MNI-03 are brand and CSR text. MNI-04 to MNI-47 are nutrition tables.
- Version: every image has `Last-Modified: 2026-10-28`. We retrieved them on 2026-11-13. The charts carry no date or version label of their own.
- `page_or_section` in the CSV gives the exact image URL for each row.
- Not used: a 2022 India calorie-only chart hosted on a third-party site (carbon-v2.ipsator.com). It was used only to confirm that an India chart exists. None of its numbers are in the CSV.

## How the numbers were captured
- The charts exist only as images: there is no PDF and no text. We transcribed every value by hand from the images.
- Two checks were run on the transcription:
  - **Against the chart's own %RDA rows.** The energy, fat, saturated fat, trans fat, sodium and added sugar values were checked against them.
  - **Energy formula.** On these charts, kcal equals 4×protein + 4×carbs + 9×fat almost exactly. 451 of 477 rows match within 1.5 kcal. The rest come from integer rounding in the Large columns, plus two errors in the source itself (see below).
- An OCR pass on 4 image variants independently confirmed 3,025 of 3,069 multi-digit values. We cropped and re-read the unconfirmed cells, or checked them with the energy formula. That caught 2 transcription errors, which are fixed: Chicken Pepperoni Thin Regular is 475.4 kcal, and the second-listing Double Cheese Margherita Thin Regular is 435.4 kcal.
- Columns published: kcal, protein, carbs, total sugars, added sugars, total fat, saturated fat, trans fat, cholesterol, sodium.
  - **Dietary fibre is not published.** `fiber_g` is empty in every row.
  - Saturated fat, trans fat, added sugar and cholesterol are in `notes`.
- **No gram weights are published.** `serving_g` is empty. The serving is defined in slices.

## Serving definition (important)
Pizza values are **per serve**, not per whole pizza. The chart footnote reads: "No. of Slices/Serving (Serve Size) (Regular serves 1 person, Medium serves 2 people & Large serves 4 people)".
- Regular: 1 serve = 4 slices, which is the whole regular pizza.
- Medium: 1 serve = 3 slices, which is half the pizza.
- Large: 1 serve = 2 slices, which is a quarter of the pizza.

Sides, pastas, desserts and dips are "Single Serve". Beverages are 350 ml (fountain) or 300 ml.

## Ambiguities and source issues (values kept exactly as published)
- **Duplicate listings with different values:**
  - Double Cheese Margherita: MNI-04 and MNI-22.
  - Cheese & Tomato and Cheese & Corn: MNI-05 and MNI-23.
  - Veggies Paradise / Veggie Paradise: MNI-08 and MNI-24.
  - Peppy Paneer: MNI-08 and MNI-24.
  - Indi Tandoori Paneer and Kadai Paneer (multigrain): MNI-29 and MNI-30.

  The MNI-20 to MNI-24 pages also omit Pan Medium. They look like a separate recipe or range, possibly linked to the NONG (No Onion No Garlic) pages, but the charts don't say. Both versions are kept, and the second is flagged in `notes`.
- **Multigrain range (MNI-27 to MNI-31):** the page header says "Multigrain Pizza", the allergens include Oats, and the crust is labelled "Thin Crust". We labelled these rows "Thin Crust (multigrain range)".
  - The sodium %RDA row on MNI-28 to MNI-31 is shifted one column against the mg values. Each %RDA matches the previous item's mg value. We kept the mg values and flagged this in `notes`.
- **Values that look odd but are printed this way:**
  - Farmhouse: Medium per-serve values are higher than Regular for New Hand Tossed, Pan and Thin.
  - Peppy Paneer (MNI-08): Medium sodium is 3,920 to 4,532 mg.
  - Chicken Pepperoni: Medium is higher than Regular.
- **Source-internal inconsistencies:**
  - Caprese Large: 338.7 kcal, but protein 35.3 g and carbs 70.7 g give about 551 kcal.
  - Smoked Chicken Medium: 445.4 kcal against about 431.5 kcal from its macros.
- **Same values in two columns:** Cheese Dominator W/O Bake Sprinkle prints identical values for the Cheese Burst and New Hand Tossed columns.
- **Cells not published (left out, not guessed):**
  - New Hand Tossed Large for Kadai Paneer, both Pizza Pasta pizzas, and Pepper Barbeque Chicken & Onion.
  - Pan Medium on MNI-20 to MNI-24.
  - Cheese Burst Regular for Veggie Paradise on MNI-24.
  - Only Regular sizes for Creamy Tomato Chicken and Moroccan Chicken.
- **Dips:** the Cheesy Dip and Harissa Dip values are printed two rows below their labels. We read them in label order, and the %RDA values confirm that order. Dip and beverage values are whole numbers.
- **Missing values in the source:**
  - Beverages: fountain drinks show "-" for cholesterol, so `CH` is not given.
  - Fountain 7up: fat %RDA is "-".
- **Caffeine:** the beverage page says "Contains caffeine — applicable for Pepsi & Mountain Dew". No mg value is given.
- **Pizza Mania:** has no chart in this set.
- **veg_nonveg:** taken from the chart's green and brown symbols.

## On the official charts but not transcribed in this pass (gap)
MNI-34 to MNI-40 hold regional "South/East" pizzas, 2 per page and about 14 pizzas in all, with the same 9-column layout. From the page titles:
- Malabar Chicken
- Malabar Paneer
- Overloaded Chicken 65 (and a paneer counterpart)
- Coorg Chicken Pizza
- Coorg Paneer Pizza
- Kosha Veg
- Champaran Veg

The second pizza on each page was not identified. They were skipped to prioritise the core national menu. The same transcription and Atwater check workflow can finish them.

## On the menu but with no published nutrition in the charts
Pizza Mania range (except the paratha/multigrain items listed), Choco Lava (shown as "Chocolava Cake"), and burger pizza / new launches not shown in the charts. Combos and meals are not charted.
