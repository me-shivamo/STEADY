# Baskin Robbins India: no official nutrition data collected (0 rows)

## What was checked
- **https://baskinrobbinsindia.com/** (official site, a Shopify brochure run with Graviss Foods). It has no nutrition or allergen page and no PDF. It lists only "What's New" items such as Tiramisu Cheesecake, Classic with Mango Sauce Cheesecake, Blueberry Crumble Muffin, Choco Walnut Brownie, Saffron Gelato, Biscoff Cheesecake Gelato and Strawberry & Cream Gelato. `/products.json` returned HTTP 429 ("local_rate_limited") twice and was not retried.
- **https://baskinrobbins.dotpe.in/** is the official online ordering store, reached through the "Order Now" link on the brand site. It is a JavaScript single-page app. Its code requests the menu with `isNutritionRequire=true`, so nutrition probably appears per item once a store is selected. We could not read it:
  - The HTML has no data.
  - Calling the DotPe API directly was blocked by our permission policy.
  - The Chrome extension was not connected, so we could not render the page.
- **Web searches** for a "Baskin Robbins India nutrition / allergen PDF / Graviss" turned up only third-party listings (BigBasket, Zepto, Swiggy/Instamart, Open Food Facts, FatSecret). Those are not allowed as a number source, and none of them linked to an official document.

## Gap
- We found no official India nutrition document.
- The most likely official source is the per-item nutrition panel in the DotPe ordering store, which is the FSSAI menu-labelling display. To collect it, either open https://baskinrobbins.dotpe.in in a browser session (pick a store, open each item), or approve API access to that store.
- Packaged retail SKUs (tubs, cups, cones and sticks sold in grocery) carry FSSAI labels on pack. We found those numbers only on retailer pages, not on a brand page.
- Items with no data: all scoops (regular and premium), sundaes, shakes and thick shakes, ice-cream cakes, cheesecakes, gelatos and the packaged range.
