import { createTestPool } from './setupDb.js';
import { createFakeStripe } from './fakeStripe.js';
import { createFakePushSender } from './fakePush.js';
import { seedFixtures } from './seed.js';
import { setPoolForTesting } from '../src/lib/db.js';
import { setStripeClientForTesting } from '../src/lib/stripe.js';
import { setPushSenderForTesting } from '../src/lib/pushNotifications.js';
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

const { sender: fakePushSender, state: pushState } = createFakePushSender();
setPushSenderForTesting(fakePushSender);

const fixtures = await seedFixtures(testPool);
const app = buildApp();
// app.jwt no queda decorado hasta que el plugin @fastify/jwt termina de registrarse — app.inject()
// espera esto internamente, pero app.jwt.sign() llamado directo (como abajo) no.
await app.ready();

// Sin pasar por /auth/login — se firman los JWT directo, mismo mecanismo que routes/auth.ts.
// Reutilizados en casi todos los escenarios ahora que las rutas de bookings exigen sesión.
const parentToken = app.jwt.sign({ sub: fixtures.parentUserId, role: 'parent' });
const coachAToken = app.jwt.sign({ sub: fixtures.coachAUserId, role: 'coach' });
const coachBToken = app.jwt.sign({ sub: fixtures.coachBUserId, role: 'coach' });
const clubAdminToken = app.jwt.sign({ sub: fixtures.clubAdminUserId, role: 'club_admin' });

function inFuture(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

async function requestBooking(coachId: string, matchDatetime: string, agreedRate = 1000) {
  return app.inject({
    method: 'POST',
    url: '/bookings',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { playerId: fixtures.playerId, coachId, tournamentId: fixtures.tournamentId, matchDatetime, agreedRate },
  });
}

console.log('\n=== Escenario 1: flujo feliz (solicitud → aceptación → pago → completado) ===');
{
  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(2));
  assertEqual(reqRes.statusCode, 201, 'POST /bookings devuelve 201');
  const booking1 = reqRes.json();
  assertEqual(booking1.status, 'requested', 'estado inicial = requested');

  const acceptRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking1.id}/accept`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(acceptRes.statusCode, 200, 'accept devuelve 200');
  assertEqual(acceptRes.json().status, 'accepted', 'estado tras aceptar = accepted');

  stripeState.nextChargeOutcome = 'succeed';
  const payRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking1.id}/pay`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { paymentMethodId: 'pm_test_ok' },
  });
  assertEqual(payRes.statusCode, 200, 'pay devuelve 200');
  const paid = payRes.json().booking;
  assertEqual(paid.status, 'paid', 'estado tras pagar = paid');
  assertEqual(Number(paid.totalAmountPaid), 1000, 'total_amount_paid = 1000 (tarifa completa, sin recargo visible)');
  assertEqual(Number(paid.platformCommissionAmount), 150, 'platform_commission_amount = 15% de 1000');
  assertEqual(Number(paid.clubCommissionAmount), 100, 'club_commission_amount = 10% de 1000');
  assertEqual(Number(paid.coachNetAmount), 750, 'coach_net_amount = 1000 - 150 - 100');

  const unauthCompleteRes = await app.inject({ method: 'POST', url: `/bookings/${booking1.id}/complete` });
  assertEqual(unauthCompleteRes.statusCode, 401, 'complete sin Bearer token devuelve 401');

  const wrongActorCompleteRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking1.id}/complete`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(wrongActorCompleteRes.statusCode, 403, 'completar con el token de otro entrenador devuelve 403');

  const completeRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking1.id}/complete`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(completeRes.statusCode, 200, 'complete (con el propio entrenador) devuelve 200');
  assertEqual(completeRes.json().status, 'completed', 'estado final = completed');

  (globalThis as any).__booking1Id = booking1.id;
  (globalThis as any).__booking1MatchDatetime = booking1.matchDatetime;
}

console.log('\n=== Escenario 2: cancelación tardía del padre (<24h) sobre reserva pagada ===');
{
  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(10));
  const booking2 = reqRes.json();
  await app.inject({
    method: 'POST',
    url: `/bookings/${booking2.id}/accept`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  stripeState.nextChargeOutcome = 'succeed';
  await app.inject({
    method: 'POST',
    url: `/bookings/${booking2.id}/pay`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { paymentMethodId: 'pm_test_ok' },
  });

  const cancelRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking2.id}/cancel`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { reason: 'Cambio de planes' },
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
  await app.inject({
    method: 'POST',
    url: `/bookings/${booking3.id}/accept`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  stripeState.nextChargeOutcome = 'succeed';
  await app.inject({
    method: 'POST',
    url: `/bookings/${booking3.id}/pay`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { paymentMethodId: 'pm_test_ok' },
  });

  const cancelRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking3.id}/cancel`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { reason: 'Lesión' },
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
  await app.inject({
    method: 'POST',
    url: `/bookings/${booking5.id}/accept`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });

  stripeState.nextChargeOutcome = 'decline';
  const declineRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking5.id}/pay`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { paymentMethodId: 'pm_test_decline' },
  });
  assertEqual(declineRes.statusCode, 409, 'pago rechazado devuelve 409');
  assertEqual(declineRes.json().error, 'payment_declined', 'código de error = payment_declined');

  const afterDecline = await app.inject({
    method: 'GET',
    url: `/bookings/${booking5.id}`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(afterDecline.json().status, 'payment_failed', 'estado tras rechazo = payment_failed');

  stripeState.nextChargeOutcome = 'succeed';
  const retryRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking5.id}/pay`,
    headers: { authorization: `Bearer ${parentToken}` },
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
  await app.inject({
    method: 'POST',
    url: `/bookings/${bookingB.id}/accept`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  await testPool.query(`UPDATE bookings SET payment_deadline = now() - interval '1 minute' WHERE id = $1`, [bookingB.id]);

  const jobResult = await runExpireBookingsJob();
  assertTrue(jobResult.expiredRequests.includes(bookingA.id), 'job expira solicitud sin respuesta del entrenador');
  assertTrue(jobResult.expiredPayments.includes(bookingB.id), 'job expira aceptación sin pago del padre');

  const alternatives = await (
    await app.inject({
      method: 'GET',
      url: `/bookings/${bookingA.id}/alternatives`,
      headers: { authorization: `Bearer ${parentToken}` },
    })
  ).json();
  assertTrue(Array.isArray(alternatives) && alternatives.some((a: any) => a.coachId === fixtures.coachAUserId), 'sugiere al otro entrenador etiquetado en el torneo como alternativa');
}

console.log('\n=== Escenario 7: condición de carrera — cancelar una reserva ya completada ===');
{
  const raceRes = await app.inject({
    method: 'POST',
    url: `/bookings/${(globalThis as any).__booking1Id}/cancel`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(raceRes.statusCode, 409, 'cancelar reserva completada devuelve 409');
  assertEqual(raceRes.json().error, 'already_completed', 'código de error = already_completed');
}

console.log('\n=== Escenario 8: liquidación batch a clubes ===');
{
  const readyBefore = await findTournamentsReadyForSettlement();
  assertTrue(readyBefore.includes(fixtures.tournamentId), 'torneo aparece listo para liquidar (tiene comisión generated y end_date pasado)');

  const noAuthSettleRes = await app.inject({ method: 'POST', url: `/tournaments/${fixtures.tournamentId}/settle` });
  assertEqual(noAuthSettleRes.statusCode, 401, 'settle sin Bearer token devuelve 401');

  const wrongUserSettleRes = await app.inject({
    method: 'POST',
    url: `/tournaments/${fixtures.tournamentId}/settle`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(wrongUserSettleRes.statusCode, 403, 'settle con el token de alguien que no administra el club devuelve 403');

  const settleRes = await app.inject({
    method: 'POST',
    url: `/tournaments/${fixtures.tournamentId}/settle`,
    headers: { authorization: `Bearer ${clubAdminToken}` },
  });
  assertEqual(settleRes.statusCode, 201, 'settle devuelve 201');
  const settlement = settleRes.json();
  assertEqual(Number(settlement.totalCommissionAmount), 100, 'total liquidado = comisión del único booking completado (escenario 1)');
  assertEqual(settlement.status, 'paid', 'liquidación queda marcada paid (simulada, sin transferencia real)');

  const booking1After = await (
    await app.inject({
      method: 'GET',
      url: `/bookings/${(globalThis as any).__booking1Id}`,
      headers: { authorization: `Bearer ${parentToken}` },
    })
  ).json();
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
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { rating: 5, comment: 'Excelente entrenador, muy puntual.' },
  });
  assertEqual(reviewRes.statusCode, 201, 'POST review devuelve 201');
  const review = reviewRes.json();
  assertEqual(review.coachId, fixtures.coachAUserId, 'la reseña queda ligada al coach de la reserva (no al del payload)');
  assertEqual(review.rating, 5, 'rating = 5');

  const coachAfter = await (await app.inject({ method: 'GET', url: `/coaches/${fixtures.coachAUserId}` })).json();
  assertEqual(Number(coachAfter.profile.ratingAvg), 5, 'rating_avg del coach se recalcula a 5');
  assertEqual(coachAfter.profile.ratingCount, 1, 'rating_count del coach pasa a 1');
  assertEqual(coachAfter.profile.fullName, 'Carlos Medina', 'GET /coaches/:id trae el nombre real (JOIN con users)');

  const listRes = await (await app.inject({ method: 'GET', url: `/coaches/${fixtures.coachAUserId}/reviews` })).json();
  assertTrue(
    Array.isArray(listRes) && listRes.length === 1 && listRes[0].bookingId === (globalThis as any).__booking1Id,
    'GET /coaches/:id/reviews devuelve la reseña recién creada',
  );
  assertEqual(listRes[0].parentName, 'María Guardián', 'la reseña trae el nombre del padre (JOIN con users)');

  const dupRes = await app.inject({
    method: 'POST',
    url: `/bookings/${(globalThis as any).__booking1Id}/review`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { rating: 4 },
  });
  assertEqual(dupRes.statusCode, 409, 'segunda reseña sobre la misma reserva devuelve 409');
  assertEqual(dupRes.json().error, 'review_already_exists', 'código de error = review_already_exists');

  const reqRes = await requestBooking(fixtures.coachBUserId, inFuture(96));
  const bookingNotCompleted = reqRes.json();
  await app.inject({
    method: 'POST',
    url: `/bookings/${bookingNotCompleted.id}/accept`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  const tooEarlyRes = await app.inject({
    method: 'POST',
    url: `/bookings/${bookingNotCompleted.id}/review`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { rating: 3 },
  });
  assertEqual(tooEarlyRes.statusCode, 409, 'reseñar una reserva no completada devuelve 409');
  assertEqual(tooEarlyRes.json().error, 'booking_not_completed', 'código de error = booking_not_completed');
}

console.log('\n=== Escenario 10: listado de reservas de un coach (CoachHomeScreen, etc.) ===');
{
  const listRes = await app.inject({
    method: 'GET',
    url: `/coaches/${fixtures.coachAUserId}/bookings`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(listRes.statusCode, 200, 'GET /coaches/:id/bookings devuelve 200');
  const bookings = listRes.json();
  assertTrue(Array.isArray(bookings) && bookings.length > 0, 'devuelve al menos una reserva del coach A');
  assertTrue(
    bookings.every((b: any) => b.coachId === fixtures.coachAUserId),
    'todas las reservas devueltas son del coach solicitado',
  );
  const booking1Row = bookings.find((b: any) => b.id === (globalThis as any).__booking1Id);
  assertTrue(!!booking1Row, 'incluye la reserva completada del escenario 1');
  assertEqual(booking1Row.playerName, 'Valentina Guardián', 'trae el nombre del jugador (JOIN con players)');
  assertEqual(booking1Row.parentName, 'María Guardián', 'trae el nombre del padre (JOIN con players → users)');
  assertEqual(booking1Row.tournamentName, 'Copa Nacional Juvenil', 'trae el nombre del torneo (JOIN con tournaments)');

  const fakeCoachId = `${fixtures.coachAUserId.slice(0, -1)}9`;
  const fakeCoachToken = app.jwt.sign({ sub: fakeCoachId, role: 'coach' });
  const emptyRes = await app.inject({
    method: 'GET',
    url: `/coaches/${fakeCoachId}/bookings`,
    headers: { authorization: `Bearer ${fakeCoachToken}` },
  });
  assertTrue(Array.isArray(emptyRes.json()), 'un coach sin reservas devuelve un arreglo (vacío), no un error');
}

console.log('\n=== Escenario 11: invitación de club (CoachClubInvitationScreen) ===');
{
  const unauthInviteRes = await app.inject({
    method: 'POST',
    url: '/club-invitations',
    payload: {
      clubId: fixtures.clubId,
      tournamentId: fixtures.tournamentId,
      coachId: fixtures.coachBUserId,
      message: 'Nos gustaría que fueras entrenador oficial.',
    },
  });
  assertEqual(unauthInviteRes.statusCode, 401, 'POST /club-invitations sin token devuelve 401');

  const wrongActorInviteRes = await app.inject({
    method: 'POST',
    url: '/club-invitations',
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: {
      clubId: fixtures.clubId,
      tournamentId: fixtures.tournamentId,
      coachId: fixtures.coachBUserId,
      message: 'Nos gustaría que fueras entrenador oficial.',
    },
  });
  assertEqual(wrongActorInviteRes.statusCode, 403, 'un coach (no admin del club) no puede invitar → 403');

  const inviteRes = await app.inject({
    method: 'POST',
    url: '/club-invitations',
    headers: { authorization: `Bearer ${clubAdminToken}` },
    payload: {
      clubId: fixtures.clubId,
      tournamentId: fixtures.tournamentId,
      coachId: fixtures.coachBUserId,
      message: 'Nos gustaría que fueras entrenador oficial.',
    },
  });
  assertEqual(inviteRes.statusCode, 201, 'POST /club-invitations (admin del club) devuelve 201');
  const invitation = inviteRes.json();

  const wrongCoachListRes = await app.inject({
    method: 'GET',
    url: `/coaches/${fixtures.coachBUserId}/club-invitations`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(wrongCoachListRes.statusCode, 403, 'un coach no puede ver las invitaciones de otro coach → 403');

  const listRes = await (
    await app.inject({
      method: 'GET',
      url: `/coaches/${fixtures.coachBUserId}/club-invitations`,
      headers: { authorization: `Bearer ${coachBToken}` },
    })
  ).json();
  assertTrue(
    Array.isArray(listRes) && listRes.some((i: any) => i.id === invitation.id),
    'GET /coaches/:id/club-invitations devuelve la invitación recién creada',
  );
  const listed = listRes.find((i: any) => i.id === invitation.id);
  assertEqual(listed.clubName, 'Club Deportivo Bosques', 'trae el nombre del club (JOIN con clubs)');
  assertEqual(listed.tournamentName, 'Copa Nacional Juvenil', 'trae el nombre del torneo (JOIN con tournaments)');

  const wrongCoachRespondRes = await app.inject({
    method: 'POST',
    url: `/club-invitations/${invitation.id}/respond`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { decision: 'accepted' },
  });
  assertEqual(wrongCoachRespondRes.statusCode, 403, 'un coach no puede responder la invitación de otro coach → 403');

  const respondRes = await app.inject({
    method: 'POST',
    url: `/club-invitations/${invitation.id}/respond`,
    headers: { authorization: `Bearer ${coachBToken}` },
    payload: { decision: 'accepted' },
  });
  assertEqual(respondRes.statusCode, 200, 'respond devuelve 200');
  assertEqual(respondRes.json().status, 'accepted', 'la invitación queda accepted');

  const listAfter = await (
    await app.inject({
      method: 'GET',
      url: `/coaches/${fixtures.coachBUserId}/club-invitations`,
      headers: { authorization: `Bearer ${coachBToken}` },
    })
  ).json();
  assertTrue(
    !listAfter.some((i: any) => i.id === invitation.id),
    'la invitación ya respondida deja de aparecer en el listado de pendientes',
  );
}

console.log('\n=== Escenario 11b: disponibilidad y tarifa de torneo (CoachAvailabilityScreen) ===');
{
  const availabilityPayload = {
    days: [{ slotDate: '2026-09-10', morning: true, afternoon: false }],
  };
  const ratePayload = { rateMode: 'per_day', amount: 45 };

  const unauthAvailRes = await app.inject({
    method: 'PUT',
    url: `/coaches/${fixtures.coachAUserId}/tournaments/${fixtures.tournamentId}/availability`,
    payload: availabilityPayload,
  });
  assertEqual(unauthAvailRes.statusCode, 401, 'PUT availability sin token devuelve 401');

  const wrongCoachAvailRes = await app.inject({
    method: 'PUT',
    url: `/coaches/${fixtures.coachAUserId}/tournaments/${fixtures.tournamentId}/availability`,
    headers: { authorization: `Bearer ${coachBToken}` },
    payload: availabilityPayload,
  });
  assertEqual(wrongCoachAvailRes.statusCode, 403, 'un coach no puede fijar la disponibilidad de otro coach → 403');

  const availRes = await app.inject({
    method: 'PUT',
    url: `/coaches/${fixtures.coachAUserId}/tournaments/${fixtures.tournamentId}/availability`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: availabilityPayload,
  });
  assertEqual(availRes.statusCode, 200, 'el propio coach puede fijar su disponibilidad → 200');

  const wrongCoachRateRes = await app.inject({
    method: 'PUT',
    url: `/coaches/${fixtures.coachAUserId}/tournaments/${fixtures.tournamentId}/rate`,
    headers: { authorization: `Bearer ${coachBToken}` },
    payload: ratePayload,
  });
  assertEqual(wrongCoachRateRes.statusCode, 403, 'un coach no puede fijar la tarifa de otro coach → 403');

  const rateRes = await app.inject({
    method: 'PUT',
    url: `/coaches/${fixtures.coachAUserId}/tournaments/${fixtures.tournamentId}/rate`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: ratePayload,
  });
  assertEqual(rateRes.statusCode, 200, 'el propio coach puede fijar su tarifa → 200');

  const getRes = await app.inject({
    method: 'GET',
    url: `/coaches/${fixtures.coachAUserId}/tournaments/${fixtures.tournamentId}/availability`,
  });
  assertEqual(getRes.statusCode, 200, 'GET availability sigue siendo público (sin token) → 200');
  const availabilityAndRate = getRes.json();
  assertTrue(
    Array.isArray(availabilityAndRate.availability) &&
      availabilityAndRate.availability.some((d: any) => String(d.slotDate).startsWith('2026-09-10')),
    'la disponibilidad guardada aparece en la lectura pública',
  );
  assertEqual(availabilityAndRate.rate?.rateMode, 'per_day', 'la tarifa guardada aparece en la lectura pública');
}

console.log('\n=== Escenario 12: captura en vivo de un partido (matches / match_point_events) ===');
{
  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(120));
  const booking12 = reqRes.json();

  const matchPayload = {
    bookingId: booking12.id,
    player2Label: 'Rival de práctica',
    bestOf: '3',
    noAd: false,
    initialServer: 'player1',
    captureMode: 'rapida',
  };
  const noAuthCreateRes = await app.inject({ method: 'POST', url: '/matches', payload: matchPayload });
  assertEqual(noAuthCreateRes.statusCode, 401, 'POST /matches sin Bearer token devuelve 401');

  const wrongCoachCreateRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${coachBToken}` },
    payload: matchPayload,
  });
  assertEqual(wrongCoachCreateRes.statusCode, 403, 'POST /matches con el token de otro entrenador devuelve 403');

  const createRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: matchPayload,
  });
  assertEqual(createRes.statusCode, 201, 'POST /matches devuelve 201');
  const match = createRes.json();
  assertEqual(match.player1Id, fixtures.playerId, 'player1_id se deriva de la reserva, no del payload del cliente');
  assertEqual(match.status, 'in_progress', 'estado inicial = in_progress');

  const createAgainRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: matchPayload,
  });
  assertEqual(createAgainRes.json().id, match.id, 'POST /matches es idempotente por bookingId (booking_id es UNIQUE)');

  const wrongCoachPointRes = await app.inject({
    method: 'POST',
    url: `/matches/${match.id}/points`,
    headers: { authorization: `Bearer ${coachBToken}` },
    payload: { sequenceNumber: 1, wonBy: 'player1', detail: 'ace', firstServeIn: true },
  });
  assertEqual(wrongCoachPointRes.statusCode, 403, 'anotar un punto con el token de otro entrenador devuelve 403');

  const point1Res = await app.inject({
    method: 'POST',
    url: `/matches/${match.id}/points`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { sequenceNumber: 1, wonBy: 'player1', detail: 'ace', firstServeIn: true },
  });
  assertEqual(point1Res.statusCode, 201, 'POST points devuelve 201');
  const point1 = point1Res.json();

  const point2Res = await app.inject({
    method: 'POST',
    url: `/matches/${match.id}/points`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { sequenceNumber: 2, wonBy: 'player2', detail: null, firstServeIn: true },
  });
  const point2 = point2Res.json();

  const undoRes = await app.inject({
    method: 'DELETE',
    url: `/matches/${match.id}/points/2`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(undoRes.statusCode, 204, 'DELETE points/:sequenceNumber (undo) devuelve 204');

  const bulkRes = await app.inject({
    method: 'POST',
    url: `/matches/${match.id}/points/bulk`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: {
      points: [
        { sequenceNumber: 1, wonBy: 'player1', detail: 'ace', firstServeIn: true },
        { sequenceNumber: 2, wonBy: 'player2', detail: null, firstServeIn: true },
      ],
    },
  });
  const bulkPoints = bulkRes.json();
  assertEqual(bulkPoints.length, 2, 'points/bulk devuelve los 2 puntos');
  assertEqual(bulkPoints[0].id, point1.id, 'bulk es idempotente para un punto ya sincronizado (mismo id, no lo duplica)');
  assertTrue(bulkPoints[1].id !== point2.id, 'bulk recrea el punto 2 tras el undo (id distinto al borrado)');

  const completeRes = await app.inject({
    method: 'PATCH',
    url: `/matches/${match.id}/status`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { status: 'completed' },
  });
  assertEqual(completeRes.json().status, 'completed', 'PATCH status = completed');
  assertTrue(!!completeRes.json().completedAt, 'completed_at queda fijado al completar');

  const obsRes = await app.inject({
    method: 'PATCH',
    url: `/matches/${match.id}/observations`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { coachObservations: 'Buen segundo saque, mejorar la volea.' },
  });
  assertEqual(
    obsRes.json().coachObservations,
    'Buen segundo saque, mejorar la volea.',
    'PATCH observations guarda las observaciones del entrenador',
  );

  const modeRes = await app.inject({
    method: 'PATCH',
    url: `/matches/${match.id}/capture-mode`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { captureMode: 'detallada' },
  });
  assertEqual(modeRes.json().captureMode, 'detallada', 'PATCH capture-mode cambia el modo de captura');

  const wrongCoachRestartRes = await app.inject({
    method: 'POST',
    url: `/matches/${match.id}/restart`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(wrongCoachRestartRes.statusCode, 403, 'restart con el token de otro entrenador devuelve 403');

  const restartRes = await app.inject({
    method: 'POST',
    url: `/matches/${match.id}/restart`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(restartRes.statusCode, 200, 'POST restart ("Nuevo partido") devuelve 200');
  assertEqual(restartRes.json().status, 'in_progress', 'restart vuelve el estado a in_progress');

  const afterRestartBulk = await (
    await app.inject({
      method: 'POST',
      url: `/matches/${match.id}/points/bulk`,
      headers: { authorization: `Bearer ${coachAToken}` },
      payload: {
        points: [{ sequenceNumber: 1, wonBy: 'player1', detail: 'ace', firstServeIn: true }],
      },
    })
  ).json();
  assertTrue(
    afterRestartBulk[0].id !== point1.id,
    'restart borró los puntos anteriores del mismo partido (el punto 1 se recrea con id nuevo)',
  );
}

console.log('\n=== Escenario 13: auth (registro / login / sesión) ===');
{
  const registerPayload = {
    email: 'nueva.mama@example.com',
    password: 'super-secreta-123',
    fullName: 'Nueva Mamá',
    primaryRole: 'parent',
  };
  const registerRes = await app.inject({ method: 'POST', url: '/auth/register', payload: registerPayload });
  assertEqual(registerRes.statusCode, 201, 'POST /auth/register devuelve 201');
  const registered = registerRes.json();
  assertEqual(registered.user.email, registerPayload.email, 'el usuario creado trae el email registrado');
  assertTrue(typeof registered.token === 'string' && registered.token.length > 0, 'devuelve un token');
  assertTrue(!('passwordHash' in registered.user), 'la respuesta no expone el hash de la contraseña');

  const dupRes = await app.inject({ method: 'POST', url: '/auth/register', payload: registerPayload });
  assertEqual(dupRes.statusCode, 409, 'registrar el mismo email de nuevo devuelve 409');

  const adminRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { ...registerPayload, email: 'admin@example.com', primaryRole: 'platform_admin' },
  });
  assertEqual(adminRes.statusCode, 422, 'no se puede auto-registrar como platform_admin');

  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: registerPayload.email, password: registerPayload.password },
  });
  assertEqual(loginRes.statusCode, 200, 'POST /auth/login devuelve 200');
  const { token } = loginRes.json();

  const badLoginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: registerPayload.email, password: 'contraseña-incorrecta' },
  });
  assertEqual(badLoginRes.statusCode, 401, 'login con contraseña incorrecta devuelve 401');

  const meRes = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
  assertEqual(meRes.statusCode, 200, 'GET /auth/me con token válido devuelve 200');
  assertEqual(meRes.json().email, registerPayload.email, '/auth/me devuelve el usuario de la sesión');

  const meNoTokenRes = await app.inject({ method: 'GET', url: '/auth/me' });
  assertEqual(meNoTokenRes.statusCode, 401, 'GET /auth/me sin token devuelve 401');
}

console.log('\n=== Escenario 14: push notifications (accept/reject de reserva avisan al padre) ===');
{
  const deviceToken = 'ExponentPushToken[smoke-test-device]';

  const noAuthRes = await app.inject({ method: 'POST', url: '/push-tokens', payload: { token: deviceToken } });
  assertEqual(noAuthRes.statusCode, 401, 'POST /push-tokens sin Bearer token devuelve 401');

  const registerRes = await app.inject({
    method: 'POST',
    url: '/push-tokens',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { token: deviceToken },
  });
  assertEqual(registerRes.statusCode, 204, 'POST /push-tokens con sesión devuelve 204');

  const acceptReq = await requestBooking(fixtures.coachBUserId, inFuture(50));
  const bookingToAccept = acceptReq.json();
  pushState.sent.length = 0; // limpia cualquier push de escenarios anteriores antes de medir
  await app.inject({
    method: 'POST',
    url: `/bookings/${bookingToAccept.id}/accept`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(pushState.sent.length, 1, 'aceptar la reserva dispara exactamente un push');
  assertEqual(pushState.sent[0]?.to, deviceToken, 'el push va al device token del padre');
  assertEqual(pushState.sent[0]?.title, 'Reserva confirmada', 'el título del push de aceptación es el esperado');

  const rejectReq = await requestBooking(fixtures.coachBUserId, inFuture(55));
  const bookingToReject = rejectReq.json();
  pushState.sent.length = 0;
  await app.inject({
    method: 'POST',
    url: `/bookings/${bookingToReject.id}/reject`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(pushState.sent.length, 1, 'rechazar la reserva también dispara un push');
  assertEqual(pushState.sent[0]?.title, 'Solicitud rechazada', 'el título del push de rechazo es el esperado');

  const deleteRes = await app.inject({
    method: 'DELETE',
    url: `/push-tokens/${deviceToken}`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(deleteRes.statusCode, 204, 'DELETE /push-tokens/:token devuelve 204');

  const rejectAfterUnregisterReq = await requestBooking(fixtures.coachBUserId, inFuture(60));
  const bookingAfterUnregister = rejectAfterUnregisterReq.json();
  pushState.sent.length = 0;
  await app.inject({
    method: 'POST',
    url: `/bookings/${bookingAfterUnregister.id}/reject`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(pushState.sent.length, 0, 'sin token registrado, aceptar/rechazar ya no dispara push (y no falla)');
}

console.log('\n=== Escenario 15: resolver el club de un club_admin logueado ===');
{
  const okRes = await app.inject({ method: 'GET', url: `/club-admins/${fixtures.clubAdminUserId}/club` });
  assertEqual(okRes.statusCode, 200, 'GET /club-admins/:userId/club del admin sembrado devuelve 200');
  assertEqual(okRes.json().id, fixtures.clubId, 'devuelve el club real que administra ese usuario');

  const notAdminRes = await app.inject({ method: 'GET', url: `/club-admins/${fixtures.parentUserId}/club` });
  assertEqual(notAdminRes.statusCode, 404, 'un usuario que no administra ningún club devuelve 404');
}

console.log('\n=== Escenario 16: onboarding de coach (POST /coaches) ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'nuevo.coach@example.com',
      password: 'super-secreta-123',
      fullName: 'Nuevo Coach',
      primaryRole: 'coach',
    },
  });
  const { token: newCoachToken, user: newCoach } = registerRes.json();

  const noAuthRes = await app.inject({
    method: 'POST',
    url: '/coaches',
    payload: { city: 'CDMX', yearsExperience: 5, hourlyRate: 30, ageCategories: ['U12'], levels: ['competitivo'] },
  });
  assertEqual(noAuthRes.statusCode, 401, 'POST /coaches sin Bearer token devuelve 401');

  const createRes = await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${newCoachToken}` },
    payload: {
      city: 'CDMX',
      region: 'CDMX',
      yearsExperience: 5,
      specialty: 'Saque y volea',
      hourlyRate: 30,
      ageCategories: ['U12', 'U14'],
      levels: ['competitivo'],
    },
  });
  assertEqual(createRes.statusCode, 201, 'POST /coaches con datos válidos devuelve 201');
  const created = createRes.json();
  assertEqual(created.profile.userId, newCoach.id, 'el perfil creado pertenece al usuario de la sesión, no a uno del body');
  assertEqual(created.profile.verificationStatus, 'pending', 'un coach recién registrado queda en pending');
  assertEqual(created.ageCategories, ['U12', 'U14'], 'guarda las categorías de edad enviadas');

  const duplicateRes = await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${newCoachToken}` },
    payload: { city: 'CDMX', yearsExperience: 5, hourlyRate: 30, ageCategories: [], levels: [] },
  });
  assertEqual(duplicateRes.statusCode, 409, 'un segundo POST /coaches para el mismo usuario devuelve 409');

  const getRes = await app.inject({ method: 'GET', url: `/coaches/${newCoach.id}` });
  assertEqual(getRes.json().profile.city, 'CDMX', 'GET /coaches/:id ya refleja el perfil recién creado');

  const trainingPayload = { ageCategories: ['U16'], levels: ['alto_rendimiento'] };

  const unauthTrainingRes = await app.inject({
    method: 'PUT',
    url: `/coaches/${newCoach.id}/training`,
    payload: trainingPayload,
  });
  assertEqual(unauthTrainingRes.statusCode, 401, 'PUT /coaches/:id/training sin Bearer token devuelve 401');

  const wrongActorTrainingRes = await app.inject({
    method: 'PUT',
    url: `/coaches/${newCoach.id}/training`,
    headers: { authorization: `Bearer ${coachBToken}` },
    payload: trainingPayload,
  });
  assertEqual(wrongActorTrainingRes.statusCode, 403, 'PUT /coaches/:id/training con el token de otro entrenador devuelve 403');

  const trainingRes = await app.inject({
    method: 'PUT',
    url: `/coaches/${newCoach.id}/training`,
    headers: { authorization: `Bearer ${newCoachToken}` },
    payload: trainingPayload,
  });
  assertEqual(trainingRes.statusCode, 200, 'PUT /coaches/:id/training (el propio entrenador) devuelve 200');
  assertEqual(trainingRes.json().ageCategories, ['U16'], 'guarda las nuevas categorías de edad enviadas');
}

console.log('\n=== Escenario 17: hijos/as del padre (GET/POST /players) ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'nuevo.padre@example.com',
      password: 'super-secreta-123',
      fullName: 'Nuevo Padre',
      primaryRole: 'parent',
    },
  });
  const { token: newParentToken } = registerRes.json();

  const noAuthGetRes = await app.inject({ method: 'GET', url: '/players' });
  assertEqual(noAuthGetRes.statusCode, 401, 'GET /players sin Bearer token devuelve 401');

  const noAuthPostRes = await app.inject({
    method: 'POST',
    url: '/players',
    payload: { fullName: 'Hija', birthDate: '2014-05-01', ageCategory: 'U12' },
  });
  assertEqual(noAuthPostRes.statusCode, 401, 'POST /players sin Bearer token devuelve 401');

  const emptyListRes = await app.inject({
    method: 'GET',
    url: '/players',
    headers: { authorization: `Bearer ${newParentToken}` },
  });
  assertEqual(emptyListRes.json(), [], 'un padre recién registrado todavía no tiene hijos/as');

  const createRes = await app.inject({
    method: 'POST',
    url: '/players',
    headers: { authorization: `Bearer ${newParentToken}` },
    payload: { fullName: 'Camila Nuevo', birthDate: '2014-05-01', ageCategory: 'U12' },
  });
  assertEqual(createRes.statusCode, 201, 'POST /players con datos válidos devuelve 201');
  const created = createRes.json();
  assertEqual(created.fullName, 'Camila Nuevo', 'devuelve el nombre del hijo/a recién creado');
  assertEqual(created.birthDate, '2014-05-01', 'devuelve la fecha de nacimiento sin desplazamiento de zona horaria');

  const listRes = await app.inject({
    method: 'GET',
    url: '/players',
    headers: { authorization: `Bearer ${newParentToken}` },
  });
  const listed = listRes.json();
  assertEqual(listed.length, 1, 'GET /players ya refleja el hijo/a recién creado');
  assertEqual(listed[0].id, created.id, 'el hijo/a listado es el mismo que se creó');
}

console.log('\n=== Escenario 18: listado de reservas de un padre (BookingHistoryScreen) ===');
{
  const listRes = await app.inject({
    method: 'GET',
    url: `/parents/${fixtures.parentUserId}/bookings`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(listRes.statusCode, 200, 'GET /parents/:id/bookings devuelve 200');
  const bookings = listRes.json();

  const booking1 = bookings.find((b: any) => b.id === (globalThis as any).__booking1Id);
  assertTrue(!!booking1, 'incluye la reserva completada del escenario 1/9');
  assertEqual(booking1.coachName, 'Carlos Medina', 'trae el nombre del entrenador (JOIN con users)');
  assertEqual(booking1.tournamentName, 'Copa Nacional Juvenil', 'trae el nombre del torneo (JOIN con tournaments)');
  assertEqual(booking1.reviewed, true, 'una reserva ya reseñada marca reviewed = true');

  const notCompleted = bookings.find((b: any) => b.status === 'accepted' && b.coachName === 'Ana Beltrán');
  assertTrue(!!notCompleted, 'incluye la reserva "accepted" sin completar del escenario 9');
  assertEqual(notCompleted.reviewed, false, 'una reserva sin reseña marca reviewed = false');

  const fakeParentId = '00000000-0000-0000-0000-000000000099';
  const fakeParentToken = app.jwt.sign({ sub: fakeParentId, role: 'parent' });
  const otherParentRes = await app.inject({
    method: 'GET',
    url: `/parents/${fakeParentId}/bookings`,
    headers: { authorization: `Bearer ${fakeParentToken}` },
  });
  assertEqual(otherParentRes.json(), [], 'un padre sin reservas devuelve lista vacía');
}

console.log('\n=== Escenario 19: chat de una reserva (GET/POST /bookings/:id/messages) ===');
{
  const bookingId = (globalThis as any).__booking1Id as string;

  const noAuthGetRes = await app.inject({ method: 'GET', url: `/bookings/${bookingId}/messages` });
  assertEqual(noAuthGetRes.statusCode, 401, 'GET /bookings/:id/messages sin Bearer token devuelve 401');

  const noAuthPostRes = await app.inject({
    method: 'POST',
    url: `/bookings/${bookingId}/messages`,
    payload: { body: 'Hola' },
  });
  assertEqual(noAuthPostRes.statusCode, 401, 'POST /bookings/:id/messages sin Bearer token devuelve 401');

  const parentMsgRes = await app.inject({
    method: 'POST',
    url: `/bookings/${bookingId}/messages`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { body: '¿A qué hora llegamos?' },
  });
  assertEqual(parentMsgRes.statusCode, 201, 'POST como el padre de la reserva devuelve 201');
  const parentMsg = parentMsgRes.json();
  assertEqual(parentMsg.senderType, 'parent', 'senderType se deriva de la sesión, no del body');
  assertEqual(parentMsg.senderId, fixtures.parentUserId, 'senderId se deriva de la sesión, no del body');

  const coachMsgRes = await app.inject({
    method: 'POST',
    url: `/bookings/${bookingId}/messages`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { body: 'Nos vemos en la cancha 3' },
  });
  assertEqual(coachMsgRes.statusCode, 201, 'POST como el entrenador de la reserva devuelve 201');
  assertEqual(coachMsgRes.json().senderType, 'coach', 'senderType = coach cuando el entrenador escribe');

  const getRes = await app.inject({
    method: 'GET',
    url: `/bookings/${bookingId}/messages`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  const messages = getRes.json();
  assertTrue(
    Array.isArray(messages) && messages.length >= 2,
    'GET devuelve los mensajes recién enviados por ambos participantes',
  );

  const strangerPostRes = await app.inject({
    method: 'POST',
    url: `/bookings/${bookingId}/messages`,
    headers: { authorization: `Bearer ${coachBToken}` },
    payload: { body: 'Intento de un entrenador ajeno' },
  });
  assertEqual(strangerPostRes.statusCode, 403, 'POST de alguien ajeno a la reserva devuelve 403');

  const strangerGetRes = await app.inject({
    method: 'GET',
    url: `/bookings/${bookingId}/messages`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(strangerGetRes.statusCode, 403, 'GET de alguien ajeno a la reserva devuelve 403');
}

console.log('\n=== Escenario 20: autorización cruzada — nadie puede actuar por otro usuario ===');
{
  const intruderRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'intruso@example.com',
      password: 'super-secreta-123',
      fullName: 'Padre Intruso',
      primaryRole: 'parent',
    },
  });
  const { token: intruderToken } = intruderRes.json();

  // requestBooking() siempre usa parentToken (el padre real, dueño de fixtures.playerId) — esta
  // es la reserva legítima que las siguientes comprobaciones intentan atacar con otros tokens.
  const legitBookingRes = await requestBooking(fixtures.coachAUserId, inFuture(200));
  assertTrue(legitBookingRes.statusCode === 201, 'sanity check: el propio padre sí puede reservar con su hijo/a');
  const legitBookingId = legitBookingRes.json().id;

  const bookForbiddenRes = await app.inject({
    method: 'POST',
    url: '/bookings',
    headers: { authorization: `Bearer ${intruderToken}` },
    payload: {
      playerId: fixtures.playerId,
      coachId: fixtures.coachAUserId,
      tournamentId: fixtures.tournamentId,
      matchDatetime: inFuture(201),
      agreedRate: 1000,
    },
  });
  assertEqual(bookForbiddenRes.statusCode, 403, 'reservar con el hijo/a de otro padre devuelve 403');

  const acceptWrongCoachRes = await app.inject({
    method: 'POST',
    url: `/bookings/${legitBookingId}/accept`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(acceptWrongCoachRes.statusCode, 403, 'aceptar con el token de otro entrenador devuelve 403');

  const cancelWrongParentRes = await app.inject({
    method: 'POST',
    url: `/bookings/${legitBookingId}/cancel`,
    headers: { authorization: `Bearer ${intruderToken}` },
  });
  assertEqual(cancelWrongParentRes.statusCode, 403, 'cancelar sin ser parte de la reserva devuelve 403');

  const reviewWrongParentRes = await app.inject({
    method: 'POST',
    url: `/bookings/${(globalThis as any).__booking1Id}/review`,
    headers: { authorization: `Bearer ${intruderToken}` },
    payload: { rating: 5 },
  });
  assertEqual(reviewWrongParentRes.statusCode, 403, 'reseñar sin ser el padre de la reserva devuelve 403');

  const coachBookingsWrongCoachRes = await app.inject({
    method: 'GET',
    url: `/coaches/${fixtures.coachAUserId}/bookings`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(coachBookingsWrongCoachRes.statusCode, 403, 'ver las reservas de otro entrenador devuelve 403');

  const parentBookingsWrongParentRes = await app.inject({
    method: 'GET',
    url: `/parents/${fixtures.parentUserId}/bookings`,
    headers: { authorization: `Bearer ${intruderToken}` },
  });
  assertEqual(parentBookingsWrongParentRes.statusCode, 403, 'ver las reservas de otro padre devuelve 403');
}

console.log(`\n=== Resultado: ${passed} pasaron, ${failed} fallaron ===`);
await app.close();
process.exit(failed > 0 ? 1 : 0);
