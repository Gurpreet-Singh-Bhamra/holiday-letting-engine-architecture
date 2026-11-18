/**
 * Cross-Channel iCal Calendar Aggregation Worker
 * Parses external OTA .ics feeds (Airbnb/VRBO) and evaluates half-open date range conflicts.
 *
 * @module HolidayLetting/CalendarSync
 * @author Gurpreet Bhamra | TFS Digital
 */

export interface BlockedDateRange {
  uid: string;
  start: string; // ISO YYYY-MM-DD (inclusive check-in)
  end: string;   // ISO YYYY-MM-DD (exclusive check-out)
  source: 'AIRBNB' | 'VRBO' | 'DIRECT';
}

/**
 * Extracts VEVENT blocks from raw RFC 5545 iCal text payloads.
 */
export function parseIcalFeed(
  rawIcs: string,
  source: BlockedDateRange['source']
): BlockedDateRange[] {
  const events: BlockedDateRange[] = [];
  const blocks = rawIcs.split('BEGIN:VEVENT').slice(1);

  for (const block of blocks) {
    const uidMatch = block.match(/UID:(.+)/);
    const startMatch = block.match(/DTSTART(?:;VALUE=DATE)?:(\d{8})/);
    const endMatch = block.match(/DTEND(?:;VALUE=DATE)?:(\d{8})/);

    if (uidMatch && startMatch && endMatch) {
      events.push({
        uid: uidMatch[1].trim(),
        start: formatCompactDate(startMatch[1]),
        end: formatCompactDate(endMatch[1]),
        source,
      });
    }
  }

  return events;
}

/**
 * Evaluates whether a requested stay conflicts with existing reservations.
 * Uses half-open intervals [start, end) so a guest checking out on day X
 * does not block a new guest checking in on day X.
 */
export function hasDateConflict(
  requestedStart: string,
  requestedEnd: string,
  blockedRanges: BlockedDateRange[]
): boolean {
  const reqStartMs = Date.parse(requestedStart);
  const reqEndMs = Date.parse(requestedEnd);

  if (Number.isNaN(reqStartMs) || Number.isNaN(reqEndMs) || reqStartMs >= reqEndMs) {
    throw new Error('Invalid reservation date range supplied.');
  }

  return blockedRanges.some((range) => {
    const existingStartMs = Date.parse(range.start);
    const existingEndMs = Date.parse(range.end);
    return reqStartMs < existingEndMs && reqEndMs > existingStartMs;
  });
}

function formatCompactDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
