export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'payment_failed'
  | 'paid'
  | 'completed'
  | 'cancelled';

export type ClubCommissionStatus = 'generated' | 'settled';

export type PaymentTransactionType = 'charge' | 'refund' | 'transfer' | 'charge_failed';
export type PaymentTransactionStatus = 'succeeded' | 'failed' | 'pending';

export interface Booking {
  id: string;
  playerId: string;
  coachId: string;
  tournamentId: string;
  matchDatetime: string;
  agreedRate: string;
  status: BookingStatus;
  responseDeadline: string;
  paymentDeadline: string | null;
  totalAmountPaid: string | null;
  coachNetAmount: string | null;
  platformCommissionAmount: string | null;
  clubCommissionAmount: string | null;
  clubCommissionStatus: ClubCommissionStatus;
  settlementId: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  refundAmount: string | null;
  coachCompensationAmount: string | null;
  flaggedForCoachPenalty: boolean;
  paymentReference: string | null;
  requestedAt: string;
  decidedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface PaymentTransaction {
  id: string;
  bookingId: string;
  type: PaymentTransactionType;
  status: PaymentTransactionStatus;
  amount: string;
  stripeObjectId: string | null;
  rawResponse: unknown;
  createdAt: string;
}

export interface ClubSettlement {
  id: string;
  clubId: string;
  tournamentId: string;
  periodStart: string;
  periodEnd: string;
  totalCommissionAmount: string;
  status: 'pending' | 'paid';
  paymentReference: string | null;
  createdAt: string;
  paidAt: string | null;
}

export type CancelActor = 'parent' | 'coach';
