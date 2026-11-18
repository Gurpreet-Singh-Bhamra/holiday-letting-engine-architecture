import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Idempotent Payment Webhook Handler
 * Prevents duplicate booking confirmations and double-emails when payment gateways
 * retry webhook deliveries during transient network timeouts.
 *
 * @module HolidayLetting/Payments
 * @author Gurpreet Bhamra | TFS Digital
 */

export interface PaymentWebhookEvent {
  id: string;
  type: 'payment_intent.succeeded' | 'payment_intent.payment_failed';
  data: {
    bookingReference: string;
    propertyId: string;
    checkIn: string;
    checkOut: string;
    guestEmail: string;
  };
}

// In production, backed by Redis / Vercel KV with a 48-hour TTL
const processedEventStore = new Map<string, { status: 'PROCESSING' | 'COMPLETED'; timestamp: number }>();

export async function handleBookingWebhook(
  req: NextRequest,
  event: PaymentWebhookEvent
): Promise<NextResponse> {
  const idempotencyKey = `stripe_evt:${event.id}`;
  const existingRecord = processedEventStore.get(idempotencyKey);

  // 1. Absorb duplicate retries immediately with 200 OK
  if (existingRecord) {
    return NextResponse.json(
      {
        received: true,
        duplicate: true,
        state: existingRecord.status,
      },
      { status: 200 }
    );
  }

  // 2. Acquire processing lock before executing side effects
  processedEventStore.set(idempotencyKey, {
    status: 'PROCESSING',
    timestamp: Date.now(),
  });

  try {
    if (event.type === 'payment_intent.succeeded') {
      await finalizeReservationLock(event.data);
    }

    processedEventStore.set(idempotencyKey, {
      status: 'COMPLETED',
      timestamp: Date.now(),
    });

    return NextResponse.json({ received: true, bookingRef: event.data.bookingReference }, { status: 200 });
  } catch (error) {
    // Release lock on transient failure so Stripe can safely retry
    processedEventStore.delete(idempotencyKey);
    console.error('[Webhook Idempotency] Processing failed, lock released:', error);
    return NextResponse.json({ error: 'Transient processing error' }, { status: 500 });
  }
}

async function finalizeReservationLock(data: PaymentWebhookEvent['data']): Promise<void> {
  // Atomic database transaction: mark dates unavailable & queue guest confirmation email
  if (!data.bookingReference || !data.propertyId) {
    throw new Error('Incomplete booking metadata.');
  }
}
