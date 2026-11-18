# Cross-Channel iCal Aggregation & Conflict Resolution

## Synchronization Architecture

To allow direct guest bookings alongside third-party Online Travel Agencies (Airbnb, VRBO, Booking.com) without channel manager overhead, the reservation engine runs a scheduled serverless sync worker every 5 minutes.

1. **Feed Ingestion:** Fetches remote `.ics` (RFC 5545) calendar feeds per property with conditional HTTP caching (`ETag` / `If-None-Match`) to minimize bandwidth and execution time.
2. **Date Normalization:** Parses `DTSTART` and `DTEND` blocks into UTC midnight boundaries (`YYYY-MM-DD`), accounting for half-day check-in/check-out turnover windows so departure dates remain available for incoming guests.
3. **Outbound Feed Export:** Exposes a signed, dynamic `/api/ical/[propertySlug].ics` endpoint so external OTAs automatically block dates booked directly on the portal.

---

## Double-Booking Prevention & Conflict Handling

| Scenario | Guardrail | Resolution Behavior |
| :--- | :--- | :--- |
| **Concurrent Direct & OTA Booking** | Pre-checkout live feed revalidation | Re-verifies remote `.ics` feeds immediately before creating a Stripe Payment Intent |
| **External OTA Feed Outage** | Stale-while-revalidate fallback | Retains last verified blocked-date matrix and logs an alert if a feed fails 3 consecutive polls |
| **Overlapping Date Range Query** | Half-open interval math `[start, end)` | Evaluates `(reqStart < existingEnd) && (reqEnd > existingStart)` to allow same-day check-out/check-in |
