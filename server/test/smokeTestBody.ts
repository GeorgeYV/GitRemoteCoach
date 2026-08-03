import { createTestPool } from './setupDb.js';
import { createFakeStripe } from './fakeStripe.js';
import { seedFixtures } from './seed.js';
import { setPoolForTesting } from '../src/lib/db.js';
import { setStripeClientForTesting } from '../src/lib/stripe.js';
import { buildApp } from '../src/app.js';
import { runExpireBookingsJob } from '../src/jobs/expireBookings.js';
import { findTournamentsReadyForSettlement } from '../src/services/settlementService.js';

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label} — esperado ${JSON.stringify(expected)}, obtuvo ${JSON.stringify(actual)}`);
  }
}

function assertTrue(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

const testPool = createTestPool();
setPoolForTesting(testPool);

const { stripe: fakeStripe, state: stripeState } = createFakeStripe();
setStripeClientForTesting(fakeStripe);

const fixtures = await seedFixtures(testPool);
const app = buildApp();

function inFuture(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

async function requestBooking(coachId: string, matchDatetime: string, agreedRate = 1000) {
  return app.inject({
    method: 'POST',
    url: '/bookings',
    payload: { playerId: fixtures.playerId, coachId, tournamentId: fixtures.tournamentId, matchDatetime, agreedRate },
  });
}

console.log('\n=== Escenario 1: flujo feliz (solicitud → aceptación → pago → completado) ===');
{
  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(2));
  assertEqual(reqRes.statusCode, 201, 'POST /bookings devuelve 201');
  const booking1 = reqRes.json();
  assertEqual(booking1.status, 'requested', 'estado inicial = requested');

  const acceptRes = await app.inject({ method: 'POST', url: `/bookings/${booking1.id}/accept` });
  assertEqual(acceptRes.statusCode, 200, 'accept devuelve 200');
  assertEqual(acceptRes.json().status, 'accepted', 'estado tras aceptar = accepted');

  stripeState.nextChargeOutcome = 'succeed';
  const payRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking1.id}/pay`,
    payload: { paymentMethodId: 'pm_test_ok' },
  });
  assertEqual(payRes.statusCode, 200, 'pay devuelve 200');
  const paid = payRes.json().booking;
  assertEqual(paid.status, 'paid', 'estado tras pagar = paid');
  assertEqual(Number(paid.totalAmountPaid), 1000, 'total_amount_paid = 1000 (tarifa completa, sin recargo visible)');
  assertEqual(Number(paid.platformCommissionAmount), 150, 'platform_commission_amount = 15% de 1000');
  assertEqual(Number(paid.clubCommissionAmount), 100, 'club_commission_amount = 10% de 1000');
  assertEqual(Number(paid.coachNetAmount), 750, 'coach_net_amount = 1000 - 150 - 100');

  const completeRes = await app.inject({ method: 'POST', url: `/bookings/${booking1.id}/complete` });
  assertEqual(completeRes.statusCode, 200, 'complete devuelve 200');
  assertEqual(completeRes.json().status, 'completed', 'estado final = completed');

  (globalThis as any).__booking1Id = booking1.id;
  (globalThis as any).__booking1MatchDatetime = booking1.matchDatetime;
}

console.log('\n=== Escenario 2: cancelación tardía del padre (<24h) sobre reserva pagada ===');
{
  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(10));
  const booking2 = reqRes.json();
  await app.inject({ method: 'POST', url: `/bookings/${booking2.id}/accept` });
  stripeState.nextChargeOutcome = 'succeed';
  await app.inject({ method: 'POST', url: `/bookings/${booking2.id}/pay`, payload: { paymentMethodId: 'pm_test_ok' } });

  const cancelRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking2.id}/cancel`,
    payload: { actor: 'parent', actorUserId: fixtures.parentUserId, reason: 'Cambio de planes' },
  });
  assertEqual(cancelRes.statusCode, 200, 'cancel devuelve 200');
  const cancelled = cancelRes.json();
  assertEqual(cancelled.status, 'cancelled', 'estado = cancelled');
  assertEqual(Number(cancelled.refundAmount), 500, 'reembolso parcial = 50% de 1000 (cancelación <24h)');
  assertEqual(Number(cancelled.coachCompensationAmount), 425, 'compensación al coach = 500 * (1 - 15%)');
  assertEqual(cancelled.flaggedForCoachPenalty, false, 'sin flag de penalización (canceló el padre)');
}

console.log('\n=== Escenario 3: cancelación del entrenador sobre reserva pagada ===');
{
  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(48));
  const booking3 = reqRes.json();
  await app.inject({ method: 'POST', url: `/bookings/${booking3.id}/accept` });
  stripeState.nextChargeOutcome = 'succeed';
  await app.inject({ method: 'POST', url: `/bookings/${booking3.id}/pay`, payload: { paymentMethodId: 'pm_test_ok' } });

  const cancelRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking3.id}/cancel`,
    payload: { actor: 'coach', actorUserId: fixtures.coachAUserId, reason: 'Lesión' },
  });
  const cancelled = cancelRes.json();
  assertEqual(Number(cancelled.refundAmount), 1000, 'reembolso completo cuando cancela el entrenador');
  assertEqual(Number(cancelled.coachCompensationAmount), 0, 'sin compensación al propio entrenador que canceló');
  assertEqual(cancelled.flaggedForCoachPenalty, true, 'queda marcada para posible penalización');
}

console.log('\n=== Escenario 4: reserva duplicada (mismo entrenador/horario) ===');
{
  const dupRes = await requestBooking(fixtures.coachAUserId, (globalThis as any).__booking1MatchDatetime);
  assertEqual(dupRes.statusCode, 409, 'segunda solicitud para mismo coach+horario devuelve 409');
  assertEqual(dupRes.json().error, 'duplicate_booking', 'código de error = duplicate_booking');
}

console.log('\n=== Escenario 5: pago rechazado por la pasarela, luego reintento exitoso ===');
{
  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(72));
  const booking5 = reqRes.json();
  await app.inject({ method: 'POST', url: `/bookings/${booking5.id}/accept` });

  stripeState.nextChargeOutcome = 'decline';
  const declineRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking5.id}/pay`,
    payload: { paymentMethodId: 'pm_test_decline' },
  });
  assertEqual(declineRes.statusCode, 409, 'pago rechazado devuelve 409');
  assertEqual(declineRes.json().error, 'payment_declined', 'código de error = payment_declined');

  const afterDecline = await app.inject({ method: 'GET', url: `/bookings/${booking5.id}` });
  assertEqual(afterDecline.json().status, 'payment_failed', 'estado tras rechazo = payment_failed');

  stripeState.nextChargeOutcome = 'succeed';
  const retryRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking5.id}/pay`,
    payload: { paymentMethodId: 'pm_test_ok' },
  });
  assertEqual(retryRes.statusCode, 200, 'reintento de pago exitoso devuelve 200');
  assertEqual(retryRes.json().booking.status, 'paid', 'estado tras reintento = paid');
}

console.log('\n=== Escenario 6: expiración por vencimiento de ventana (sin respuesta / sin pago) ===');
{
  const reqA = await requestBooking(fixtures.coachBUserId, inFuture(5));
  const bookingA = reqA.json();
  await testPool.query(`UPDATE bookings SET response_deadline = now() - interval '1 minute' WHERE id = $1`, [bookingA.id]);

  const reqB = await requestBooking(fixtures.coachBUserId, inFuture(6));
  const bookingB = reqB.json();
  await app.inject({ method: 'POST', url: `/bookings/${bookingB.id}/accept` });
  await testPool.query(`UPDATE bookings SET payment_deadline = now() - interval '1 minute' WHERE id = $1`, [bookingB.id]);

  const jobResult = await runExpireBookingsJob();
  assertTrue(jobResult.expiredRequests.includes(bookingA.id), 'job expira solicitud sin respuesta del entrenador');
  assertTrue(jobResult.expiredPayments.includes(bookingB.id), 'job expira aceptación sin pago del padre');

  const alternatives = await (await app.inject({ method: 'GET', url: `/bookings/${bookingA.id}/alternatives` })).json();
  assertTrue(Array.isArray(alternatives) && alternatives.some((a: any) => a.coachId === fixtures.coachAUserId), 'sugiere al otro entrenador etiquetado en el torneo como alternativa');
}

console.log('\n=== Escenario 7: condición de carrera — cancelar una reserva ya completada ===');
{
  const raceRes = await app.inject({
    method: 'POST',
    url: `/bookings/${(globalThis as any).__booking1Id}/cancel`,
    payload: { actor: 'parent', actorUserId: fixtures.parentUserId },
  });
  assertEqual(raceRes.statusCode, 409, 'cancelar reserva completada devuelve 409');
  assertEqual(raceRes.json().error, 'already_completed', 'código de error = already_completed');
}

console.log('\n=== Escenario 8: liquidación batch a clubes ===');
{
  const readyBefore = await findTournamentsReadyForSettlement();
  assertTrue(readyBefore.includes(fixtures.tournamentId), 'torneo aparece listo para liquidar (tiene comisión generated y end_date pasado)');

  const settleRes = await app.inject({ method: 'POST', url: `/tournaments/${fixtures.tournamentId}/settle` });
  assertEqual(settleRes.statusCode, 201, 'settle devuelve 201');
  const settlement = settleRes.json();
  assertEqual(Number(settlement.totalCommissionAmount), 100, 'total liquidado = comisión del único booking completado (escenario 1)');
  assertEqual(settlement.status, 'paid', 'liquidación queda marcada paid (simulada, sin transferencia real)');

  const booking1After = await (await app.inject({ method: 'GET', url: `/bookings/${(globalThis as any).__booking1Id}` })).json();
  assertEqual(booking1After.clubCommissionStatus, 'settled', 'comisión del booking pasa de generated a settled');
  assertEqual(booking1After.settlementId, settlement.id, 'booking queda enlazado al settlement creado');

  const readyAfter = await findTournamentsReadyForSettlement();
  assertTrue(!readyAfter.includes(fixtures.tournamentId), 'torneo ya no aparece pendiente tras liquidar');
}

console.log('\n=== Escenario 9: reseña del padre tras un partido completado ===');
{
  const reviewRes = await app.inject({
    method: 'POST',
    url: `/bookings/${(globalThis as any).__booking1Id}/review`,
    payload: { parentId: fixtures.parentUserId, rating: 5, comment: 'Excelente entrenador, muy puntual.' },
  });
  assertEqual(reviewRes.statusCode, 201, 'POST review devuelve 201');
  const review = reviewRes.json();
  assertEqual(review.coachId, fixtures.coachAUserId, 'la reseña queda ligada al coach de la reserva (no al del payload)');
  assertEqual(review.rating, 5, 'rating = 5');

  const coachAfter = await (await app.inject({ method: 'GET', url: `/coaches/${fixtures.coachAUserId}` })).json();
  assertEqual(Number(coachAfter.profile.ratingAvg), 5, 'rating_avg del coach se recalcula a 5');
  assertEqual(coachAfter.profile.ratingCount, 1, 'rating_count del coach pasa a 1');

  const listRes = await (await app.inject({ method: 'GET', url: `/coaches/${fixtures.coachAUserId}/reviews` })).json();
  assertTrue(
    Array.isArray(listRes) && listRes.length === 1 && listRes[0].bookingId === (globalThis as any).__booking1Id,
    'GET /coaches/:id/reviews devuelve la reseña recién creada',
  );
  assertEqual(listRes[0].parentName, 'María Guardián', 'la reseña trae el nombre del padre (JOIN con users)');

  const dupRes = await app.inject({
    method: 'POST',
    url: `/bookings/${(globalThis as any).__booking1Id}/review`,
    payload: { parentId: fixtures.parentUserId, rating: 4 },
  });
  assertEqual(dupRes.statusCode, 409, 'segunda reseña sobre la misma reserva devuelve 409');
  assertEqual(dupRes.json().error, 'review_already_exists', 'código de error = review_already_exists');

  const reqRes = await requestBooking(fixtures.coachBUserId, inFuture(96));
  const bookingNotCompleted = reqRes.json();
  await app.inject({ method: 'POST', url: `/bookings/${bookingNotCompleted.id}/accept` });
  const tooEarlyRes = await app.inject({
    method: 'POST',
    url: `/bookings/${bookingNotCompleted.id}/review`,
    payload: { parentId: fixtures.parentUserId, rating: 3 },
  });
  assertEqual(tooEarlyRes.statusCode, 409, 'reseñar una reserva no completada devuelve 409');
  assertEqual(tooEarlyRes.json().error, 'booking_not_completed', 'código de error = booking_not_completed');
}

console.log(`\n=== Resultado: ${passed} pasaron, ${failed} fallaron ===`);
await app.close();
process.exit(failed > 0 ? 1 : 0);
