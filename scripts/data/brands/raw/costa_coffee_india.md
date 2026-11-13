# Costa Coffee India (Devyani International franchise): no data collected

## Sources checked
- **www.costacoffee.in:** the official India site. Web search shows it exists, with pages /menu/drinks, /freshly-brewed and /whole-bean. But we could not reach it from this environment:
  - curl over HTTP/2 failed with "INTERNAL_ERROR".
  - curl over HTTP/1.1 and IPv4 timed out.
  - WebFetch timed out after 60 s on both / and /menu/drinks.
  - The host is served from Akamai with a costa.co.uk platform certificate, so this is probably bot protection or geo-blocking.
  - We could not use the browser extension either (not connected).
- **Web searches:** found no Costa India nutrition PDF or booklet, and nothing from costacoffee.in or Devyani showing kcal. Results only covered the UK, US and Hungary.
- We did **not** use Costa UK or Costa US nutrition guides. They are not India recipes; for example, UK drinks use semi-skimmed milk and UK sizes.

## Row count
**0 rows.** costa_coffee_india.csv has the header only.

## Gaps
Everything. The next step is to open https://www.costacoffee.in/menu/drinks in a normal browser from India and check whether product pages show kcal or link a nutrition PDF. FSSAI requires calorie display for chains with 10 or more outlets, so an official India source probably exists, either there or in the app.
