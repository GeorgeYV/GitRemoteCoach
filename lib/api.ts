/** Cliente HTTP mínimo hacia server/ (ver server/src/routes). Sin auth todavía: los
 * IDs de padre/coach se pasan explícitamente hasta que exista sesión real. */
const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'network_error', 'No se pudo conectar con el servidor');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? 'unknown_error', body?.message ?? 'Error inesperado');
  }
  return body as T;
}

/** Espeja server/src/types.ts#Review — la reseña recién creada, sin el nombre del padre. */
export interface Review {
  id: string;
  bookingId: string;
  parentId: string;
  coachId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** Espeja server/src/types.ts#ReviewWithParent — lo que devuelve el listado por coach. */
export interface ReviewWithParent extends Review {
  parentName: string;
}

/** POST /bookings/:id/review — BookingReviewScreen. */
export function submitBookingReview(
  bookingId: string,
  params: { parentId: string; rating: number; comment?: string },
): Promise<Review> {
  return request(`/bookings/${bookingId}/review`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** GET /coaches/:id/reviews — TrainerProfileScreen. */
export function listCoachReviews(coachId: string): Promise<ReviewWithParent[]> {
  return request(`/coaches/${coachId}/reviews`);
}
