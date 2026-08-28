import FormData_ from 'form-data';
import { createTestPool } from './setupDb.js';
import { createFakeStripe } from './fakeStripe.js';
import { createFakePushSender } from './fakePush.js';
import { createFakeEmailSender } from './fakeEmail.js';
import { createFakeGoogleAuthenticator } from './fakeGoogleAuth.js';
import { createFakeR2 } from './fakeR2.js';
import { seedFixtures } from './seed.js';
import { setPoolForTesting } from '../src/lib/db.js';
import { setStripeClientForTesting } from '../src/lib/stripe.js';
import { setPushSenderForTesting } from '../src/lib/pushNotifications.js';
import { setEmailSenderForTesting } from '../src/lib/emailClient.js';
import { setGoogleAuthenticatorForTesting } from '../src/lib/googleAuth.js';
import { setR2ClientForTesting } from '../src/lib/r2.js';
import { setTranscribeAudioForTesting } from '../src/lib/transcription.js';
import { buildApp } from '../src/app.js';
import { runExpireBookingsJob } from '../src/jobs/expireBookings.js';
import { MAX_TRANSCRIPTION_ATTEMPTS, runTranscribeVoiceNotesJob } from '../src/jobs/transcribeVoiceNotes.js';
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

const { sender: fakeEmailSender, state: emailState } = createFakeEmailSender();
setEmailSenderForTesting(fakeEmailSender);

const { authenticator: fakeGoogleAuthenticator, state: googleAuthState } = createFakeGoogleAuthenticator();
setGoogleAuthenticatorForTesting(fakeGoogleAuthenticator);

const { client: fakeR2Client, state: r2State } = createFakeR2();
setR2ClientForTesting(fakeR2Client);

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
const platformAdminToken = app.jwt.sign({ sub: fixtures.platformAdminUserId, role: 'platform_admin' });

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

console.log('\n=== Escenario 4: reserva duplicada (mismo jugador/entrenador/horario) vs. multi-alumno ===');
{
  const dupRes = await requestBooking(fixtures.coachAUserId, (globalThis as any).__booking1MatchDatetime);
  assertEqual(dupRes.statusCode, 409, 'segunda solicitud del mismo jugador para mismo coach+horario devuelve 409');
  assertEqual(dupRes.json().error, 'duplicate_booking', 'código de error = duplicate_booking');

  // Un coach ahora puede aceptar varios alumnos distintos el mismo día/horario (ver #196) — un
  // jugador DISTINTO reservando exactamente el mismo coach+horario ya no debe chocar.
  const otherParentRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'otro.padre.multi@example.com',
      password: 'super-secreta-123',
      fullName: 'Otro Padre Multi',
      primaryRole: 'parent',
    },
  });
  const { token: otherParentToken } = otherParentRes.json();
  const otherPlayerRes = await app.inject({
    method: 'POST',
    url: '/players',
    headers: { authorization: `Bearer ${otherParentToken}` },
    payload: { fullName: 'Otro Alumno Multi', birthDate: '2013-01-01', ageCategory: 'U14', country: 'EC' },
  });
  const otherPlayerId = otherPlayerRes.json().id;

  const multiRes = await app.inject({
    method: 'POST',
    url: '/bookings',
    headers: { authorization: `Bearer ${otherParentToken}` },
    payload: {
      playerId: otherPlayerId,
      coachId: fixtures.coachAUserId,
      tournamentId: fixtures.tournamentId,
      matchDatetime: (globalThis as any).__booking1MatchDatetime,
      agreedRate: 1000,
    },
  });
  assertEqual(multiRes.statusCode, 201, 'un jugador distinto sí puede reservar el mismo coach+horario');
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
  const suggestedCoachA = alternatives.find((a: any) => a.coachId === fixtures.coachAUserId);
  assertEqual(suggestedCoachA.name, 'Carlos Medina', 'la alternativa trae el nombre del entrenador (JOIN con users)');
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

console.log('\n=== Escenario 8b: pago manual (Deuna/Yape/Plin) — comprobante, rechazo y verificación ===');
let manualBookingAId: string;
{
  // coachB a propósito (no coachA): booking1 del Escenario 1 ya dejó a coachA con un net_amount
  // 'completed' en el mismo torneo — usar coachA acá contaminaría el total agregado del Escenario 8d.
  const reqRes = await requestBooking(fixtures.coachBUserId, inFuture(3), 2000);
  const booking = reqRes.json();
  await app.inject({
    method: 'POST',
    url: `/bookings/${booking.id}/accept`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });

  const noAuthQueueRes = await app.inject({ method: 'GET', url: '/bookings/payment-verification-queue' });
  assertEqual(noAuthQueueRes.statusCode, 401, 'cola de verificación sin Bearer token devuelve 401');

  const wrongRoleQueueRes = await app.inject({
    method: 'GET',
    url: '/bookings/payment-verification-queue',
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(wrongRoleQueueRes.statusCode, 403, 'cola de verificación con token de padre devuelve 403');

  const submitRes = await app.inject({
    method: 'POST',
    url: '/bookings/submit-payment-proof-batch',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { bookingIds: [booking.id], provider: 'deuna', referenceCode: 'REF-A-001' },
  });
  assertEqual(submitRes.statusCode, 200, 'submit-payment-proof-batch devuelve 200');
  assertEqual(submitRes.json()[0].status, 'payment_submitted', 'estado tras enviar comprobante = payment_submitted');

  const queueRes = await app.inject({
    method: 'GET',
    url: '/bookings/payment-verification-queue',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertTrue(
    queueRes.json().some((b: any) => b.id === booking.id),
    'reserva aparece en la cola de verificación',
  );

  const wrongRoleVerifyRes = await app.inject({
    method: 'PUT',
    url: '/bookings/verify-payment',
    headers: { authorization: `Bearer ${coachBToken}` },
    payload: { bookingIds: [booking.id], decision: 'verified' },
  });
  assertEqual(wrongRoleVerifyRes.statusCode, 403, 'verify-payment con token de entrenador devuelve 403');

  const rejectRes = await app.inject({
    method: 'PUT',
    url: '/bookings/verify-payment',
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { bookingIds: [booking.id], decision: 'rejected' },
  });
  assertEqual(rejectRes.statusCode, 200, 'verify-payment (rechazo) devuelve 200');
  const rejected = rejectRes.json()[0];
  assertEqual(rejected.status, 'accepted', 'rechazo vuelve la reserva a accepted');
  assertEqual(rejected.paymentProvider, null, 'rechazo limpia payment_provider');
  assertTrue(
    new Date(rejected.paymentDeadline).getTime() > Date.now(),
    'rechazo re-arma el plazo de pago para que el padre pueda reintentar',
  );

  await app.inject({
    method: 'POST',
    url: '/bookings/submit-payment-proof-batch',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { bookingIds: [booking.id], provider: 'deuna', referenceCode: 'REF-A-002' },
  });
  const verifyRes = await app.inject({
    method: 'PUT',
    url: '/bookings/verify-payment',
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { bookingIds: [booking.id], decision: 'verified' },
  });
  assertEqual(verifyRes.statusCode, 200, 'verify-payment (verificado) devuelve 200');
  const verified = verifyRes.json()[0];
  assertEqual(verified.status, 'paid', 'verificación pasa la reserva a paid');
  assertEqual(Number(verified.totalAmountPaid), 2000, 'total_amount_paid = tarifa completa');
  assertEqual(Number(verified.platformCommissionAmount), 300, 'platform_commission_amount = 15% de 2000');
  assertEqual(Number(verified.clubCommissionAmount), 200, 'club_commission_amount = 10% de 2000');
  assertEqual(Number(verified.coachNetAmount), 1500, 'coach_net_amount = 2000 - 300 - 200');
  assertEqual(verified.paymentProvider, 'deuna', 'payment_provider queda en deuna');
  assertEqual(verified.paymentVerifiedBy, fixtures.platformAdminUserId, 'payment_verified_by = admin que verificó');

  manualBookingAId = booking.id;
}

console.log('\n=== Escenario 8c: reembolso al cancelar una reserva pagada manualmente ===');
{
  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(48), 1000);
  const bookingId = reqRes.json().id;
  await app.inject({
    method: 'POST',
    url: `/bookings/${bookingId}/accept`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  await app.inject({
    method: 'POST',
    url: '/bookings/submit-payment-proof-batch',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { bookingIds: [bookingId], provider: 'yape', referenceCode: 'REF-B-001' },
  });
  await app.inject({
    method: 'PUT',
    url: '/bookings/verify-payment',
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { bookingIds: [bookingId], decision: 'verified' },
  });

  const noAuthRefundsRes = await app.inject({ method: 'GET', url: '/bookings/refunds' });
  assertEqual(noAuthRefundsRes.statusCode, 401, 'reporte de reembolsos sin Bearer token devuelve 401');

  const wrongRoleRefundsRes = await app.inject({
    method: 'GET',
    url: '/bookings/refunds',
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(wrongRoleRefundsRes.statusCode, 403, 'reporte de reembolsos con token de entrenador devuelve 403');

  // Cancelación del padre con más de 24h de anticipación (matchDatetime a 48h) → reembolso completo.
  const cancelRes = await app.inject({
    method: 'POST',
    url: `/bookings/${bookingId}/cancel`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { reason: 'Ya no puede asistir' },
  });
  assertEqual(cancelRes.statusCode, 200, 'cancel devuelve 200');
  const cancelled = cancelRes.json();
  assertEqual(cancelled.status, 'cancelled', 'estado tras cancelar = cancelled');
  assertEqual(Number(cancelled.refundAmount), 1000, 'reembolso completo (cancelación con más de 24h de anticipación)');

  const refundsRes = await app.inject({
    method: 'GET',
    url: '/bookings/refunds',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertEqual(refundsRes.statusCode, 200, 'reporte de reembolsos devuelve 200');
  const refundEntry = refundsRes.json().find((b: any) => b.id === bookingId);
  assertTrue(!!refundEntry, 'reserva cancelada con reembolso aparece en el reporte');
  assertEqual(Number(refundEntry.refundAmount), 1000, 'monto del reembolso en el reporte coincide');
  assertEqual(refundEntry.paymentProvider, 'yape', 'canal de devolución en el reporte coincide');
}

console.log('\n=== Escenario 8d: liquidación de pagos a entrenadores (settle-coach-payouts) ===');
{
  await app.inject({
    method: 'POST',
    url: `/bookings/${manualBookingAId}/complete`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });

  const noAuthReadyRes = await app.inject({ method: 'GET', url: '/tournaments/ready-for-coach-payout' });
  assertEqual(noAuthReadyRes.statusCode, 401, 'torneos listos para liquidar sin Bearer token devuelve 401');

  const wrongRoleReadyRes = await app.inject({
    method: 'GET',
    url: '/tournaments/ready-for-coach-payout',
    headers: { authorization: `Bearer ${clubAdminToken}` },
  });
  assertEqual(wrongRoleReadyRes.statusCode, 403, 'torneos listos para liquidar con token de club_admin devuelve 403');

  const readyRes = await app.inject({
    method: 'GET',
    url: '/tournaments/ready-for-coach-payout',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertTrue(
    readyRes.json().some((t: any) => t.id === fixtures.tournamentId),
    'torneo aparece listo para liquidar pagos a entrenadores',
  );

  const wrongRoleSettleRes = await app.inject({
    method: 'POST',
    url: `/tournaments/${fixtures.tournamentId}/settle-coach-payouts`,
    headers: { authorization: `Bearer ${clubAdminToken}` },
  });
  assertEqual(wrongRoleSettleRes.statusCode, 403, 'settle-coach-payouts con token de club_admin devuelve 403');

  const settleRes = await app.inject({
    method: 'POST',
    url: `/tournaments/${fixtures.tournamentId}/settle-coach-payouts`,
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertEqual(settleRes.statusCode, 201, 'settle-coach-payouts devuelve 201');
  const payoutForCoachB = settleRes.json().payouts.find((p: any) => p.coachId === fixtures.coachBUserId);
  assertTrue(!!payoutForCoachB, 'se generó un payout para el entrenador B');
  assertEqual(
    Number(payoutForCoachB.totalNetAmount),
    1500,
    'total del payout = coach_net_amount de la única reserva completada de coachB (Escenario 8b)',
  );
  assertEqual(payoutForCoachB.status, 'paid', 'payout queda marcado paid (simulado, sin transferencia real)');

  const payoutsListRes = await app.inject({
    method: 'GET',
    url: '/coaches/payouts',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertTrue(
    payoutsListRes.json().some((p: any) => p.id === payoutForCoachB.id),
    'payout recién creado aparece en el listado general de pagos a entrenadores',
  );

  const bookingAfter = await (
    await app.inject({
      method: 'GET',
      url: `/bookings/${manualBookingAId}`,
      headers: { authorization: `Bearer ${parentToken}` },
    })
  ).json();
  assertEqual(bookingAfter.coachPayoutId, payoutForCoachB.id, 'la reserva queda enlazada al payout creado');

  const readyAfterRes = await app.inject({
    method: 'GET',
    url: '/tournaments/ready-for-coach-payout',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertTrue(
    !readyAfterRes.json().some((t: any) => t.id === fixtures.tournamentId),
    'torneo ya no aparece pendiente tras liquidar pagos a entrenadores',
  );
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
    days: [{ slotDate: '2026-09-10', available: true }],
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
      availabilityAndRate.availability.some((d: any) => String(d.slotDate).startsWith('2026-09-10') && d.available === true),
    'la disponibilidad guardada (día completo, sin mañana/tarde) aparece en la lectura pública',
  );
  assertEqual(availabilityAndRate.rate?.rateMode, 'per_day', 'la tarifa guardada aparece en la lectura pública');
}

console.log('\n=== Escenario 11c: conteo de jugadores reservados por torneo (TrainerProfileScreen) ===');
{
  // Usa activeTournamentId (no fixtures.tournamentId) — ese ya tiene reservas de fixtures.playerId
  // en otros escenarios, y como el conteo es por jugador DISTINTO, una segunda reserva del mismo
  // jugador ahí no movería el número. activeTournamentId arranca limpio para este coach+jugador.
  const countUrl = `/coaches/${fixtures.coachAUserId}/tournaments/${fixtures.activeTournamentId}/booking-count`;

  const baselineRes = await app.inject({ method: 'GET', url: countUrl });
  assertEqual(baselineRes.statusCode, 200, 'GET booking-count es público (sin token) → 200');
  assertEqual(baselineRes.json().bookedPlayers, 0, 'sin reservas todavía, el conteo arranca en 0');

  const reqRes = await app.inject({
    method: 'POST',
    url: '/bookings',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: {
      playerId: fixtures.playerId,
      coachId: fixtures.coachAUserId,
      tournamentId: fixtures.activeTournamentId,
      matchDatetime: inFuture(300),
      agreedRate: 1000,
    },
  });
  const bookingCount = reqRes.json();

  const afterRequestRes = await app.inject({ method: 'GET', url: countUrl });
  assertEqual(
    afterRequestRes.json().bookedPlayers,
    1,
    'una solicitud "requested" cuenta como jugador reservado actualmente',
  );

  await app.inject({
    method: 'POST',
    url: `/bookings/${bookingCount.id}/reject`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  const afterRejectRes = await app.inject({ method: 'GET', url: countUrl });
  assertEqual(
    afterRejectRes.json().bookedPlayers,
    0,
    'una reserva rechazada deja de contar como reservada actualmente',
  );
}

console.log('\n=== Escenario 11d: nombres de jugadores reservados por torneo (TrainerListScreen) ===');
{
  // coachBUserId + activeTournamentId: sin reservas previas de otros escenarios, arranca limpio.
  const playersUrl = `/coaches/${fixtures.coachBUserId}/tournaments/${fixtures.activeTournamentId}/booked-players`;

  const baselineRes = await app.inject({ method: 'GET', url: playersUrl });
  assertEqual(baselineRes.statusCode, 200, 'GET booked-players es público (sin token) → 200');
  assertEqual(baselineRes.json().players, [], 'sin reservas todavía, la lista de jugadores arranca vacía');

  await app.inject({
    method: 'POST',
    url: '/bookings',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: {
      playerId: fixtures.playerId,
      coachId: fixtures.coachBUserId,
      tournamentId: fixtures.activeTournamentId,
      matchDatetime: inFuture(310),
      agreedRate: 1000,
    },
  });

  const afterRequestRes = await app.inject({ method: 'GET', url: playersUrl });
  const players = afterRequestRes.json().players;
  assertEqual(players.length, 1, 'la solicitud recién creada aparece en la lista de jugadores reservados');
  assertEqual(players[0].playerName, 'Valentina Guardián', 'trae el nombre real del jugador (JOIN con players)');
}

console.log('\n=== Escenario 12: captura en vivo de un partido (matches / match_point_events) ===');
{
  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(120));
  const booking12 = reqRes.json();

  const matchPayload = {
    bookingId: booking12.id,
    player2Label: 'Rival de práctica',
    format: 'best_of_3',
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
    payload: { sequenceNumber: 1, wonBy: 'player1', detail: 'ace', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
  });
  assertEqual(wrongCoachPointRes.statusCode, 403, 'anotar un punto con el token de otro entrenador devuelve 403');

  const point1Res = await app.inject({
    method: 'POST',
    url: `/matches/${match.id}/points`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { sequenceNumber: 1, wonBy: 'player1', detail: 'ace', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
  });
  assertEqual(point1Res.statusCode, 201, 'POST points devuelve 201');
  const point1 = point1Res.json();

  const point2Res = await app.inject({
    method: 'POST',
    url: `/matches/${match.id}/points`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { sequenceNumber: 2, wonBy: 'player2', detail: null, firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
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
        { sequenceNumber: 1, wonBy: 'player1', detail: 'ace', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 2, wonBy: 'player2', detail: null, firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
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
        points: [
          {
            sequenceNumber: 1,
            wonBy: 'player1',
            detail: 'ace',
            firstServeIn: true,
            serveDirection: null,
            errorDirection: null,
            rallyLength: null,
            netApproach: false,
            isReturnError: false,
          },
        ],
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

console.log('\n=== Escenario 13b: recuperación de contraseña (forgot/reset) ===');
{
  const forgotEmail = 'nueva.mama@example.com'; // registrado en el Escenario 13
  const forgotPassword = 'super-secreta-123';

  // emailState es compartido por todo el archivo — otros escenarios ya mandaron correos a
  // platform_admin (documentos/clubes/pagos pendientes de revisar, ver notificationService) antes
  // de llegar acá, así que hay que limpiar antes de medir "exactamente 1 envío" más abajo (mismo
  // criterio que pushState.sent.length = 0 en otros escenarios).
  emailState.sent.length = 0;

  const unknownRes = await app.inject({
    method: 'POST',
    url: '/auth/forgot-password',
    payload: { email: 'no-existe@example.com' },
  });
  assertEqual(unknownRes.statusCode, 200, 'forgot-password con correo desconocido igual devuelve 200');
  assertEqual(emailState.sent.length, 0, 'correo desconocido no dispara ningún envío');

  const forgotRes = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: forgotEmail } });
  assertEqual(forgotRes.statusCode, 200, 'POST /auth/forgot-password devuelve 200');
  assertEqual(emailState.sent.length, 1, 'correo registrado dispara exactamente un envío');
  assertEqual(emailState.sent[0].to, forgotEmail, 'el correo se envía al destinatario correcto');

  const codeMatch = emailState.sent[0].html.match(/\d{6}/);
  assertTrue(codeMatch !== null, 'el cuerpo del correo trae un código de 6 dígitos');
  const code = codeMatch![0];

  const wrongCodeRes = await app.inject({
    method: 'POST',
    url: '/auth/reset-password',
    payload: { email: forgotEmail, code: '000000', newPassword: 'otra-clave-nueva-1' },
  });
  assertEqual(wrongCodeRes.statusCode, 400, 'reset-password con código incorrecto devuelve 400');

  const resetRes = await app.inject({
    method: 'POST',
    url: '/auth/reset-password',
    payload: { email: forgotEmail, code, newPassword: 'otra-clave-nueva-1' },
  });
  assertEqual(resetRes.statusCode, 200, 'reset-password con código correcto devuelve 200');

  const oldPasswordLoginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: forgotEmail, password: forgotPassword },
  });
  assertEqual(oldPasswordLoginRes.statusCode, 401, 'la contraseña anterior ya no funciona tras el reset');

  const newPasswordLoginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: forgotEmail, password: 'otra-clave-nueva-1' },
  });
  assertEqual(newPasswordLoginRes.statusCode, 200, 'la contraseña nueva funciona tras el reset');

  emailState.sent.length = 0;
}

console.log('\n=== Escenario 14: push notifications (nueva solicitud avisa al coach, accept/reject avisan al padre) ===');
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

  const coachDeviceToken = 'ExponentPushToken[smoke-test-coach-device]';
  const coachRegisterRes = await app.inject({
    method: 'POST',
    url: '/push-tokens',
    headers: { authorization: `Bearer ${coachBToken}` },
    payload: { token: coachDeviceToken },
  });
  assertEqual(coachRegisterRes.statusCode, 204, 'POST /push-tokens del entrenador devuelve 204');

  pushState.sent.length = 0;
  const acceptReq = await requestBooking(fixtures.coachBUserId, inFuture(50));
  const bookingToAccept = acceptReq.json();
  assertEqual(pushState.sent.length, 1, 'solicitar una reserva dispara exactamente un push al entrenador');
  assertEqual(pushState.sent[0]?.to, coachDeviceToken, 'el push de nueva solicitud va al device token del entrenador');
  assertEqual(
    pushState.sent[0]?.title,
    'Nueva solicitud de reserva',
    'el título del push de nueva solicitud es el esperado',
  );

  pushState.sent.length = 0; // limpia antes de medir el push de aceptación
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
      country: 'EC',
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
    payload: { city: 'CDMX', country: 'EC', yearsExperience: 5, hourlyRate: 30, ageCategories: [], levels: [] },
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
    payload: { fullName: 'Camila Nuevo', birthDate: '2014-05-01', ageCategory: 'U12', country: 'EC' },
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
  assertEqual(booking1.ageCategory, 'U14', 'trae la categoría de edad del hijo/a (JOIN con players)');
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

console.log('\n=== Escenario 18b: badge de reservas del padre (ParentTabBar) ===');
{
  const badgeUrl = `/parents/${fixtures.parentUserId}/bookings/badge-summary`;

  const noAuthRes = await app.inject({ method: 'GET', url: badgeUrl });
  assertEqual(noAuthRes.statusCode, 401, 'GET badge-summary sin Bearer token devuelve 401');

  const wrongParentRes = await app.inject({
    method: 'GET',
    url: badgeUrl,
    headers: { authorization: `Bearer ${app.jwt.sign({ sub: '00000000-0000-0000-0000-000000000099', role: 'parent' })}` },
  });
  assertEqual(wrongParentRes.statusCode, 403, 'GET badge-summary con el token de otro padre devuelve 403');

  const baseline = (
    await (await app.inject({ method: 'GET', url: badgeUrl, headers: { authorization: `Bearer ${parentToken}` } })).json()
  );

  const reqRes = await requestBooking(fixtures.coachBUserId, inFuture(400));
  const badgeBooking = reqRes.json();
  const afterRequestRes = await app.inject({ method: 'GET', url: badgeUrl, headers: { authorization: `Bearer ${parentToken}` } });
  assertEqual(
    afterRequestRes.json().pending,
    baseline.pending + 1,
    'una solicitud "requested" nueva suma al conteo de "por confirmar"',
  );

  await app.inject({
    method: 'POST',
    url: `/bookings/${badgeBooking.id}/accept`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  const afterAcceptRes = await app.inject({ method: 'GET', url: badgeUrl, headers: { authorization: `Bearer ${parentToken}` } });
  assertEqual(afterAcceptRes.json().pending, baseline.pending, 'al aceptar, vuelve a bajar del conteo "por confirmar"');
  assertEqual(
    afterAcceptRes.json().decidedUnseen,
    baseline.decidedUnseen + 1,
    'al aceptar, sube el conteo de decididas-no-vistas',
  );

  const noAuthMarkRes = await app.inject({ method: 'POST', url: `/parents/${fixtures.parentUserId}/bookings/mark-decisions-seen` });
  assertEqual(noAuthMarkRes.statusCode, 401, 'POST mark-decisions-seen sin Bearer token devuelve 401');

  const markRes = await app.inject({
    method: 'POST',
    url: `/parents/${fixtures.parentUserId}/bookings/mark-decisions-seen`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(markRes.statusCode, 204, 'POST mark-decisions-seen devuelve 204');

  const afterMarkRes = await app.inject({ method: 'GET', url: badgeUrl, headers: { authorization: `Bearer ${parentToken}` } });
  assertEqual(afterMarkRes.json().decidedUnseen, 0, 'tras marcar como vistas, el conteo de decididas-no-vistas queda en 0');
  assertEqual(afterMarkRes.json().pending, baseline.pending, 'marcar como vistas no toca el conteo de "por confirmar"');
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

console.log('\n=== Escenario 19b: mensajes nuevos — push, hasUnreadMessages y mark-read ===');
{
  const parentDeviceToken = 'ExponentPushToken[smoke-test-parent-messages]';
  const coachDeviceToken = 'ExponentPushToken[smoke-test-coach-messages]';
  await app.inject({
    method: 'POST',
    url: '/push-tokens',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { token: parentDeviceToken },
  });
  await app.inject({
    method: 'POST',
    url: '/push-tokens',
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { token: coachDeviceToken },
  });

  const parentBookingsUrl = `/parents/${fixtures.parentUserId}/bookings`;
  const coachBookingsUrl = `/coaches/${fixtures.coachAUserId}/bookings`;
  const badgeUrl = `/parents/${fixtures.parentUserId}/bookings/badge-summary`;

  function findBooking(list: any[], id: string) {
    return list.find((b: any) => b.id === id);
  }

  // Antes de crear la reserva nueva — acceptBooking ya deja un mensaje de sistema ("Reserva
  // confirmada..."), y ese también cuenta como "no visto" para el padre (sender_type != 'parent'),
  // así que el baseline hay que tomarlo antes de aceptar, no después.
  const baseline = (
    await (await app.inject({ method: 'GET', url: badgeUrl, headers: { authorization: `Bearer ${parentToken}` } })).json()
  ).unreadMessages;

  const reqRes = await requestBooking(fixtures.coachAUserId, inFuture(500));
  const booking19b = reqRes.json();
  await app.inject({
    method: 'POST',
    url: `/bookings/${booking19b.id}/accept`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });

  // El coach escribe primero → debe avisarle al padre (push) y marcar la reserva como no-vista para el padre.
  pushState.sent.length = 0;
  await app.inject({
    method: 'POST',
    url: `/bookings/${booking19b.id}/messages`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { body: 'Hola, ¿confirmamos el punto de encuentro?' },
  });
  assertEqual(pushState.sent.length, 1, 'el mensaje del coach dispara exactamente un push');
  assertEqual(pushState.sent[0]?.to, parentDeviceToken, 'el push de nuevo mensaje va al device token del padre');
  assertEqual(pushState.sent[0]?.title, 'Nuevo mensaje', 'el título del push de nuevo mensaje es el esperado');

  const parentListAfterCoachMsg = await (
    await app.inject({ method: 'GET', url: parentBookingsUrl, headers: { authorization: `Bearer ${parentToken}` } })
  ).json();
  assertEqual(
    findBooking(parentListAfterCoachMsg, booking19b.id).hasUnreadMessages,
    true,
    'un mensaje del coach marca hasUnreadMessages = true del lado del padre',
  );

  const badgeAfterCoachMsg = await (
    await app.inject({ method: 'GET', url: badgeUrl, headers: { authorization: `Bearer ${parentToken}` } })
  ).json();
  assertEqual(
    badgeAfterCoachMsg.unreadMessages,
    baseline + 1,
    'el badge de "no leídos" del padre sube al recibir el mensaje del coach',
  );

  // El padre abre el chat (mark-read) → se limpia de su lado, sin tocar el lado del coach.
  const noAuthMarkReadRes = await app.inject({ method: 'POST', url: `/bookings/${booking19b.id}/messages/mark-read` });
  assertEqual(noAuthMarkReadRes.statusCode, 401, 'POST mark-read sin Bearer token devuelve 401');

  const strangerMarkReadRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking19b.id}/messages/mark-read`,
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(strangerMarkReadRes.statusCode, 403, 'POST mark-read de alguien ajeno a la reserva devuelve 403');

  const parentMarkReadRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking19b.id}/messages/mark-read`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(parentMarkReadRes.statusCode, 204, 'POST mark-read del padre devuelve 204');

  const parentListAfterMarkRead = await (
    await app.inject({ method: 'GET', url: parentBookingsUrl, headers: { authorization: `Bearer ${parentToken}` } })
  ).json();
  assertEqual(
    findBooking(parentListAfterMarkRead, booking19b.id).hasUnreadMessages,
    false,
    'tras mark-read, hasUnreadMessages vuelve a false del lado del padre',
  );

  const badgeAfterMarkRead = await (
    await app.inject({ method: 'GET', url: badgeUrl, headers: { authorization: `Bearer ${parentToken}` } })
  ).json();
  assertEqual(badgeAfterMarkRead.unreadMessages, baseline, 'el badge de "no leídos" del padre vuelve a bajar tras mark-read');

  // Ahora el padre escribe → debe avisarle al coach y marcar la reserva como no-vista para el coach.
  pushState.sent.length = 0;
  await app.inject({
    method: 'POST',
    url: `/bookings/${booking19b.id}/messages`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { body: 'Sí, nos vemos ahí' },
  });
  assertEqual(pushState.sent.length, 1, 'el mensaje del padre dispara exactamente un push');
  assertEqual(pushState.sent[0]?.to, coachDeviceToken, 'el push de nuevo mensaje va al device token del coach');

  const coachListAfterParentMsg = await (
    await app.inject({ method: 'GET', url: coachBookingsUrl, headers: { authorization: `Bearer ${coachAToken}` } })
  ).json();
  assertEqual(
    findBooking(coachListAfterParentMsg, booking19b.id).hasUnreadMessages,
    true,
    'un mensaje del padre marca hasUnreadMessages = true del lado del coach',
  );

  const coachMarkReadRes = await app.inject({
    method: 'POST',
    url: `/bookings/${booking19b.id}/messages/mark-read`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(coachMarkReadRes.statusCode, 204, 'POST mark-read del coach devuelve 204');

  const coachListAfterMarkRead = await (
    await app.inject({ method: 'GET', url: coachBookingsUrl, headers: { authorization: `Bearer ${coachAToken}` } })
  ).json();
  assertEqual(
    findBooking(coachListAfterMarkRead, booking19b.id).hasUnreadMessages,
    false,
    'tras mark-read, hasUnreadMessages vuelve a false del lado del coach',
  );
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

console.log('\n=== Escenario 21: descubrimiento de torneos (CoachTournamentSearchScreen) ===');
{
  const allRes = await app.inject({ method: 'GET', url: '/tournaments' });
  assertEqual(allRes.statusCode, 200, 'GET /tournaments sin query devuelve 200');
  const all = allRes.json();
  assertTrue(
    all.some((t: any) => t.id === fixtures.activeTournamentId),
    'incluye el torneo activo (scheduled, fechas futuras)',
  );
  assertTrue(
    !all.some((t: any) => t.id === fixtures.tournamentId),
    'excluye el torneo ya completado (status filter)',
  );

  const active = all.find((t: any) => t.id === fixtures.activeTournamentId);
  assertEqual(active.name, 'Abierto Regional Sub-16', 'trae el nombre del torneo');
  assertEqual(active.city, 'Guadalajara', 'trae la ciudad (JOIN con clubs)');

  const byNameRes = await app.inject({ method: 'GET', url: '/tournaments?search=Abierto' });
  const byName = byNameRes.json();
  assertTrue(
    byName.length === 1 && byName[0].id === fixtures.activeTournamentId,
    'la búsqueda por nombre filtra correctamente',
  );

  const byCityRes = await app.inject({ method: 'GET', url: '/tournaments?search=Guadalajara' });
  const byCity = byCityRes.json();
  assertTrue(
    byCity.length === 1 && byCity[0].id === fixtures.activeTournamentId,
    'la búsqueda por ciudad filtra correctamente',
  );

  const noMatchRes = await app.inject({ method: 'GET', url: '/tournaments?search=Inexistente123' });
  assertEqual(noMatchRes.json(), [], 'una búsqueda sin coincidencias devuelve lista vacía');
}

console.log('\n=== Escenario 22: insignias de "entrenador oficial" del propio coach (CoachAvailabilityScreen, etc.) ===');
{
  const taggedRes = await app.inject({ method: 'GET', url: `/coaches/${fixtures.coachAUserId}/club-tags` });
  assertEqual(taggedRes.statusCode, 200, 'GET /coaches/:id/club-tags devuelve 200');
  const tagged = taggedRes.json();
  assertTrue(
    tagged.length === 1 && tagged[0].tournamentId === fixtures.tournamentId,
    'trae la insignia del torneo donde el club etiquetó a este coach',
  );
  assertEqual(tagged[0].tournamentName, 'Copa Nacional Juvenil', 'trae el nombre del torneo (JOIN con tournaments)');
  assertEqual(tagged[0].clubName, 'Club Deportivo Bosques', 'trae el nombre del club (JOIN con clubs)');

  const untaggedRes = await app.inject({ method: 'GET', url: '/coaches/00000000-0000-0000-0000-000000000099/club-tags' });
  assertEqual(untaggedRes.json(), [], 'un coach sin insignias devuelve lista vacía');
}

console.log('\n=== Escenario 23: documentos de verificación de coach (CoachRegistrationScreen, CoachVerificationPendingScreen) ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.documentado@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach Documentado',
      primaryRole: 'coach',
    },
  });
  const { token: docCoachToken, user: docCoach } = registerRes.json();

  const createRes = await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${docCoachToken}` },
    payload: {
      city: 'CDMX',
      country: 'EC',
      yearsExperience: 3,
      hourlyRate: 25,
      ageCategories: ['U12'],
      levels: ['competitivo'],
      documents: [
        { docType: 'identity', fileUrl: 'placeholder://identity' },
        { docType: 'background_check', fileUrl: 'placeholder://background_check' },
      ],
    },
  });
  assertEqual(createRes.statusCode, 201, 'POST /coaches con documentos devuelve 201');
  assertEqual(createRes.json().profile.verificationStatus, 'pending', 'sigue en pending: los documentos recién creados están pending');

  const noAuthDocsRes = await app.inject({ method: 'GET', url: `/coaches/${docCoach.id}/verification-documents` });
  assertEqual(noAuthDocsRes.statusCode, 401, 'GET /coaches/:id/verification-documents sin Bearer token devuelve 401');

  const wrongActorDocsRes = await app.inject({
    method: 'GET',
    url: `/coaches/${docCoach.id}/verification-documents`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(wrongActorDocsRes.statusCode, 403, 'GET /coaches/:id/verification-documents con el token de otro entrenador devuelve 403');

  const docsRes = await app.inject({
    method: 'GET',
    url: `/coaches/${docCoach.id}/verification-documents`,
    headers: { authorization: `Bearer ${docCoachToken}` },
  });
  assertEqual(docsRes.statusCode, 200, 'GET /coaches/:id/verification-documents (el propio entrenador) devuelve 200');
  const docs = docsRes.json();
  assertTrue(
    docs.length === 2 && docs.every((d: any) => d.status === 'pending'),
    'los 2 documentos enviados quedan pending, esperando revisión',
  );
  const identityDoc = docs.find((d: any) => d.docType === 'identity');
  const backgroundDoc = docs.find((d: any) => d.docType === 'background_check');

  const noAuthPendingRes = await app.inject({ method: 'GET', url: '/coach-verification-documents/pending' });
  assertEqual(noAuthPendingRes.statusCode, 401, 'GET /coach-verification-documents/pending sin Bearer token devuelve 401');

  const wrongRolePendingRes = await app.inject({
    method: 'GET',
    url: '/coach-verification-documents/pending',
    headers: { authorization: `Bearer ${docCoachToken}` },
  });
  assertEqual(wrongRolePendingRes.statusCode, 403, 'GET .../pending con un rol que no es platform_admin devuelve 403');

  const pendingBeforeRes = await app.inject({
    method: 'GET',
    url: '/coach-verification-documents/pending',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertEqual(pendingBeforeRes.statusCode, 200, 'platform_admin puede ver la cola de revisión');
  const pendingBefore = pendingBeforeRes.json();
  assertTrue(
    pendingBefore.some((d: any) => d.id === identityDoc.id && d.coachName === 'Coach Documentado'),
    'la cola incluye el documento de identidad recién enviado, con el nombre del coach',
  );
  assertTrue(
    pendingBefore.some((d: any) => d.id === backgroundDoc.id),
    'la cola incluye el documento de antecedentes recién enviado',
  );

  const noAuthReviewRes = await app.inject({
    method: 'PUT',
    url: `/coach-verification-documents/${identityDoc.id}/review`,
    payload: { status: 'approved' },
  });
  assertEqual(noAuthReviewRes.statusCode, 401, 'PUT .../review sin Bearer token devuelve 401');

  const wrongRoleReviewRes = await app.inject({
    method: 'PUT',
    url: `/coach-verification-documents/${identityDoc.id}/review`,
    headers: { authorization: `Bearer ${clubAdminToken}` },
    payload: { status: 'approved' },
  });
  assertEqual(wrongRoleReviewRes.statusCode, 403, 'PUT .../review con un rol que no es platform_admin devuelve 403');

  const approveIdentityRes = await app.inject({
    method: 'PUT',
    url: `/coach-verification-documents/${identityDoc.id}/review`,
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { status: 'approved' },
  });
  assertEqual(approveIdentityRes.statusCode, 200, 'platform_admin aprueba el documento de identidad');
  assertEqual(approveIdentityRes.json().reviewedBy, fixtures.platformAdminUserId, 'reviewedBy queda en quien revisó');

  const pendingAfterRes = await app.inject({
    method: 'GET',
    url: '/coach-verification-documents/pending',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertTrue(
    !pendingAfterRes.json().some((d: any) => d.id === identityDoc.id),
    'el documento aprobado ya no aparece en la cola de pendientes',
  );

  // Ver decisión #43: 'identity' es el único documento obligatorio — aprobarlo solo (sin tocar
  // background_check) ya alcanza para 'approved'.
  const approvedAfterIdentityRes = await app.inject({ method: 'GET', url: `/coaches/${docCoach.id}` });
  assertEqual(
    approvedAfterIdentityRes.json().profile.verificationStatus,
    'approved',
    'con solo el documento obligatorio (identity) aprobado, el coach ya pasa a approved',
  );
  assertEqual(
    approvedAfterIdentityRes.json().verifiedBadges,
    { backgroundCheck: false, certification: false },
    'background_check todavía pending — el distintivo opcional del perfil público todavía no se prende',
  );

  const approveBackgroundRes = await app.inject({
    method: 'PUT',
    url: `/coach-verification-documents/${backgroundDoc.id}/review`,
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { status: 'approved' },
  });
  assertEqual(approveBackgroundRes.statusCode, 200, 'platform_admin aprueba el documento (opcional) de antecedentes');

  const withBadgeRes = await app.inject({ method: 'GET', url: `/coaches/${docCoach.id}` });
  assertEqual(
    withBadgeRes.json().profile.verificationStatus,
    'approved',
    'aprobar un documento opcional no cambia verificationStatus (ya estaba approved solo con identity)',
  );
  assertEqual(
    withBadgeRes.json().verifiedBadges,
    { backgroundCheck: true, certification: false },
    'background_check aprobado prende su distintivo en el perfil público — es un plus, no un requisito',
  );

  const rejectRes = await app.inject({
    method: 'PUT',
    url: `/coach-verification-documents/${identityDoc.id}/review`,
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { status: 'rejected' },
  });
  assertEqual(rejectRes.statusCode, 200, 'platform_admin puede rechazar un documento ya aprobado');

  const rejectedCoachRes = await app.inject({ method: 'GET', url: `/coaches/${docCoach.id}` });
  assertEqual(
    rejectedCoachRes.json().profile.verificationStatus,
    'rejected',
    'rechazar el documento obligatorio (identity) tumba al coach a rejected, aunque background_check siga approved',
  );
}

console.log('\n=== Escenario 24: onboarding de club_admin (POST /clubs) ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'nuevo.club@example.com',
      password: 'super-secreta-123',
      fullName: 'Nuevo Club Admin',
      primaryRole: 'club_admin',
    },
  });
  const { token: newAdminToken, user: newAdmin } = registerRes.json();

  const beforeRes = await app.inject({ method: 'GET', url: `/club-admins/${newAdmin.id}/club` });
  assertEqual(beforeRes.statusCode, 404, 'un club_admin recién registrado todavía no administra ningún club');

  const noAuthRes = await app.inject({
    method: 'POST',
    url: '/clubs',
    payload: { name: 'Academia Nueva', type: 'club', city: 'Monterrey' },
  });
  assertEqual(noAuthRes.statusCode, 401, 'POST /clubs sin Bearer token devuelve 401');

  const missingIdentityRes = await app.inject({
    method: 'POST',
    url: '/clubs',
    headers: { authorization: `Bearer ${newAdminToken}` },
    payload: { name: 'Academia Nueva', type: 'club', city: 'Monterrey', country: 'EC' },
  });
  assertEqual(missingIdentityRes.statusCode, 422, 'POST /clubs sin identityDocumentUrl devuelve 422 (decisión #43)');

  const createRes = await app.inject({
    method: 'POST',
    url: '/clubs',
    headers: { authorization: `Bearer ${newAdminToken}` },
    payload: {
      name: 'Academia Nueva',
      type: 'club',
      city: 'Monterrey',
      country: 'EC',
      contactEmail: 'contacto@academianueva.com',
      identityDocumentUrl: 'placeholder://identity',
    },
  });
  assertEqual(createRes.statusCode, 201, 'POST /clubs con datos válidos (incl. identityDocumentUrl) devuelve 201');
  const createdClub = createRes.json();
  assertEqual(createdClub.name, 'Academia Nueva', 'devuelve el club recién creado');
  assertEqual(createdClub.identityDocumentUrl, 'placeholder://identity', 'devuelve el identityDocumentUrl enviado');

  const afterRes = await app.inject({ method: 'GET', url: `/club-admins/${newAdmin.id}/club` });
  assertEqual(afterRes.statusCode, 200, 'GET /club-admins/:userId/club ya resuelve el club recién creado');
  assertEqual(afterRes.json().id, createdClub.id, 'queda vinculado como admin del club que acaba de crear');

  const duplicateRes = await app.inject({
    method: 'POST',
    url: '/clubs',
    headers: { authorization: `Bearer ${newAdminToken}` },
    payload: { name: 'Otra Academia', type: 'federation', city: 'CDMX', country: 'EC', identityDocumentUrl: 'placeholder://identity' },
  });
  assertEqual(duplicateRes.statusCode, 409, 'un segundo POST /clubs para el mismo usuario devuelve 409');

  assertEqual(createdClub.verificationStatus, 'pending', 'un club recién creado nace \'pending\' (decisión #41)');

  const publicClubRes = await app.inject({ method: 'GET', url: `/clubs/${createdClub.id}` });
  assertEqual(
    publicClubRes.json().identityDocumentUrl,
    null,
    'identityDocumentUrl nunca sale en GET /clubs/:id (público), aunque el club sí lo tenga',
  );

  const publicAdminLookupRes = await app.inject({ method: 'GET', url: `/club-admins/${newAdmin.id}/club` });
  assertEqual(
    publicAdminLookupRes.json().identityDocumentUrl,
    null,
    'identityDocumentUrl tampoco sale en GET /club-admins/:userId/club (también público)',
  );

  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  const missingCityRes = await app.inject({
    method: 'POST',
    url: `/clubs/${createdClub.id}/tournaments`,
    headers: { authorization: `Bearer ${newAdminToken}` },
    payload: { name: 'Copa Academia Nueva', venue: 'Cancha Central', ageCategories: ['U12'], startDate: inDays(30), endDate: inDays(33) },
  });
  assertEqual(missingCityRes.statusCode, 422, 'crear un torneo sin city devuelve 422 (decisión #45)');

  const missingAgeCategoriesRes = await app.inject({
    method: 'POST',
    url: `/clubs/${createdClub.id}/tournaments`,
    headers: { authorization: `Bearer ${newAdminToken}` },
    payload: { name: 'Copa Academia Nueva', venue: 'Cancha Central', city: 'Quito', ageCategories: [], startDate: inDays(30), endDate: inDays(33) },
  });
  assertEqual(missingAgeCategoriesRes.statusCode, 422, 'crear un torneo sin ninguna categoría de edad devuelve 422');

  const newClubTournamentRes = await app.inject({
    method: 'POST',
    url: `/clubs/${createdClub.id}/tournaments`,
    headers: { authorization: `Bearer ${newAdminToken}` },
    payload: {
      name: 'Copa Academia Nueva',
      venue: 'Cancha Central',
      city: 'Quito',
      ageCategories: ['U12'],
      startDate: inDays(30),
      endDate: inDays(33),
    },
  });
  assertEqual(newClubTournamentRes.statusCode, 201, 'el club recién creado igual puede armar su torneo');
  const newClubTournamentId = newClubTournamentRes.json().id;

  const beforeApprovalRes = await app.inject({ method: 'GET', url: '/tournaments?search=Academia Nueva' });
  assertEqual(
    beforeApprovalRes.json(),
    [],
    'el torneo de un club \'pending\' no aparece en el descubrimiento público',
  );

  const queueForbiddenRes = await app.inject({
    method: 'GET',
    url: '/clubs/pending-verification',
    headers: { authorization: `Bearer ${newAdminToken}` },
  });
  assertEqual(queueForbiddenRes.statusCode, 403, 'un club_admin no puede ver la cola de verificación');

  const queueRes = await app.inject({
    method: 'GET',
    url: '/clubs/pending-verification',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertEqual(queueRes.statusCode, 200, 'GET /clubs/pending-verification (platform_admin) devuelve 200');
  assertTrue(
    queueRes.json().some((c: any) => c.id === createdClub.id),
    'la cola incluye el club recién creado',
  );

  const reviewForbiddenRes = await app.inject({
    method: 'PUT',
    url: `/clubs/${createdClub.id}/review`,
    headers: { authorization: `Bearer ${newAdminToken}` },
    payload: { status: 'approved' },
  });
  assertEqual(reviewForbiddenRes.statusCode, 403, 'un club_admin no puede revisarse a sí mismo');

  const approveRes = await app.inject({
    method: 'PUT',
    url: `/clubs/${createdClub.id}/review`,
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { status: 'approved' },
  });
  assertEqual(approveRes.statusCode, 200, 'PUT /clubs/:id/review (platform_admin) devuelve 200');
  assertEqual(approveRes.json().verificationStatus, 'approved', 'el club queda \'approved\'');
  assertEqual(
    approveRes.json().verificationReviewedBy,
    fixtures.platformAdminUserId,
    'verificationReviewedBy queda en quien lo aprobó',
  );

  const afterApprovalRes = await app.inject({ method: 'GET', url: '/tournaments?search=Academia Nueva' });
  const foundTournament = afterApprovalRes.json().find((t: any) => t.id === newClubTournamentId);
  assertTrue(!!foundTournament, 'una vez aprobado el club, su torneo ya aparece en el descubrimiento público');

  // Decisión #45: la sede real del torneo ('Quito') gana sobre la ciudad registrada del club
  // ('Monterrey') — y trae las categorías de edad que se le asignaron al crear.
  assertEqual(foundTournament.city, 'Quito', 'el torneo muestra su propia ciudad, no la del club');
  assertEqual(foundTournament.ageCategories, ['U12'], 'el torneo trae las categorías de edad que se le asignaron');

  const matchingCategoryRes = await app.inject({ method: 'GET', url: '/tournaments?search=Academia Nueva&ageCategory=U12' });
  assertTrue(
    matchingCategoryRes.json().some((t: any) => t.id === newClubTournamentId),
    '?ageCategory=U12 incluye el torneo (coincide)',
  );

  const otherCategoryRes = await app.inject({ method: 'GET', url: '/tournaments?search=Academia Nueva&ageCategory=U16' });
  assertTrue(
    !otherCategoryRes.json().some((t: any) => t.id === newClubTournamentId),
    '?ageCategory=U16 no incluye el torneo (no coincide)',
  );

  const clubOwnListRes = await app.inject({
    method: 'GET',
    url: `/clubs/${createdClub.id}/tournaments`,
    headers: { authorization: `Bearer ${newAdminToken}` },
  });
  const ownTournament = clubOwnListRes.json().find((t: any) => t.id === newClubTournamentId);
  assertEqual(ownTournament.city, 'Quito', 'GET /clubs/:id/tournaments también muestra la ciudad propia del torneo');
  assertEqual(ownTournament.ageCategories, ['U12'], 'GET /clubs/:id/tournaments también trae las categorías de edad');
}

console.log('\n=== Escenario 25: estadísticas agregadas de partidos de un coach (GET /coaches/:id/report-summary) ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.stats.e2e@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach Stats E2E',
      primaryRole: 'coach',
    },
  });
  const { token: statsCoachToken, user: statsCoach } = registerRes.json();

  await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${statsCoachToken}` },
    payload: { city: 'CDMX', country: 'EC', yearsExperience: 4, hourlyRate: 30, ageCategories: ['U14'], levels: ['competitivo'] },
  });

  const noMatchesRes = await app.inject({ method: 'GET', url: `/coaches/${statsCoach.id}/report-summary` });
  assertEqual(noMatchesRes.statusCode, 200, 'GET .../report-summary devuelve 200 aunque el coach no tenga partidos');
  assertEqual(noMatchesRes.json(), null, 'sin partidos completados, devuelve null (no un ejemplo inventado)');

  const bookingRes = await requestBooking(statsCoach.id, inFuture(48));
  const statsBooking = bookingRes.json();

  const matchRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${statsCoachToken}` },
    payload: {
      bookingId: statsBooking.id,
      player2Label: 'Rival de práctica',
      format: 'single_set',
      noAd: true,
      initialServer: 'player1',
      captureMode: 'rapida',
    },
  });
  const statsMatch = matchRes.json();

  // Juego 1 (server: player1) — player1 gana su propio saque 4-1, sin quiebre.
  // Juego 2 (server: player2, alterna automáticamente) — player1 quiebra 4-1 como restador.
  await app.inject({
    method: 'POST',
    url: `/matches/${statsMatch.id}/points/bulk`,
    headers: { authorization: `Bearer ${statsCoachToken}` },
    payload: {
      points: [
        { sequenceNumber: 1, wonBy: 'player1', detail: 'ace', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 2, wonBy: 'player1', detail: 'winner_derecha', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 3, wonBy: 'player2', detail: 'error_no_forzado', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 4, wonBy: 'player1', detail: 'winner_reves', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 5, wonBy: 'player1', detail: 'winner_volea', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 6, wonBy: 'player2', detail: 'ace', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 7, wonBy: 'player1', detail: 'winner_derecha', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 8, wonBy: 'player1', detail: 'error_no_forzado', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 9, wonBy: 'player1', detail: 'winner_reves', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
        { sequenceNumber: 10, wonBy: 'player1', detail: 'winner_volea', firstServeIn: true, serveDirection: null, errorDirection: null, rallyLength: null, netApproach: false, isReturnError: false },
      ],
    },
  });

  await app.inject({
    method: 'PATCH',
    url: `/matches/${statsMatch.id}/status`,
    headers: { authorization: `Bearer ${statsCoachToken}` },
    payload: { status: 'completed' },
  });

  const summaryRes = await app.inject({ method: 'GET', url: `/coaches/${statsCoach.id}/report-summary` });
  assertEqual(summaryRes.statusCode, 200, 'GET .../report-summary (público, sin token) devuelve 200');
  const summary = summaryRes.json();
  assertEqual(summary.matchesCount, 1, 'cuenta 1 partido completado');
  assertEqual(summary.winners, 7, 'suma los 7 winners/aces de player1 a través de ambos juegos');
  assertEqual(summary.unforcedErrors, 1, 'solo el punto 3 fue un error no forzado cargado a player1');
  assertEqual(summary.firstServePct, 100, 'todos los puntos del propio saque de player1 fueron primer saque adentro');
  assertEqual(summary.breaksConverted, 1, 'player1 quebró el saque de player2 en el juego 2');
  assertEqual(summary.returnGamesPlayed, 1, 'player1 solo devolvió el saque en el juego 2');
}

console.log('\n=== Escenario 26: reporte enriquecido de partido (semáforo, presión, zonas de error, diagnóstico táctico) ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.report.e2e@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach Report E2E',
      primaryRole: 'coach',
    },
  });
  const { token: reportCoachToken, user: reportCoach } = registerRes.json();

  await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${reportCoachToken}` },
    payload: { city: 'CDMX', country: 'EC', yearsExperience: 4, hourlyRate: 30, ageCategories: ['U14'], levels: ['competitivo'] },
  });

  const bookingRes = await requestBooking(reportCoach.id, inFuture(48));
  const reportBooking = bookingRes.json();

  const matchRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${reportCoachToken}` },
    payload: {
      bookingId: reportBooking.id,
      player2Label: 'Rival de práctica',
      format: 'single_set',
      noAd: true,
      initialServer: 'player1',
      captureMode: 'detallada',
    },
  });
  const reportMatch = matchRes.json();

  const inProgressReportRes = await app.inject({
    method: 'GET',
    url: `/bookings/${reportBooking.id}/match`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(
    inProgressReportRes.json().report,
    undefined,
    'con el partido todavía in_progress, la respuesta no trae "report" (evita mostrar stats a medio partido)',
  );

  type PointPayload = {
    sequenceNumber: number;
    wonBy: 'player1' | 'player2';
    detail: string;
    firstServeIn: boolean;
    rallyLength?: 'corto' | 'medio' | 'largo';
    errorDirection?: 'red' | 'larga' | 'ancha';
  };

  // 9 juegos (server player1: G0,G2,G4,G6,G8 — server player2: G1,G3,G5,G7), terminan 6-3 para
  // player1. G0 y G4 son la misma remontada 0-3 → 4-3 (guarda 4 break points cada una) para
  // generar una muestra real de "primer saque bajo presión de quiebre" vs. "normal". G4 además
  // carga 3 errores no forzados con lado/dirección conocidos (para las zonas de error) dentro de
  // un intercambio "largo", más 1 punto "largo" ganado y otro "largo" perdido sin ser error, para
  // llegar a 5 puntos "largo" con una derrota del 80% (dispara el diagnóstico táctico). G6 es el
  // único juego de saque que player1 pierde (para que el set tenga sus 3 errores no forzados
  // concentrados en su único set, disparando la alerta roja del semáforo).
  const points: PointPayload[] = [
    // Juego 1 (sirve player1) — remontada 0-3 → 4-3.
    { sequenceNumber: 1, wonBy: 'player2', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 2, wonBy: 'player2', detail: 'winner', firstServeIn: true, rallyLength: 'largo' },
    { sequenceNumber: 3, wonBy: 'player2', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 4, wonBy: 'player1', detail: 'winner_derecha', firstServeIn: false },
    { sequenceNumber: 5, wonBy: 'player1', detail: 'winner_reves', firstServeIn: false },
    { sequenceNumber: 6, wonBy: 'player1', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 7, wonBy: 'player1', detail: 'winner_volea', firstServeIn: true },
    // Juego 2 (sirve player2, player2 sostiene su saque).
    { sequenceNumber: 8, wonBy: 'player2', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 9, wonBy: 'player2', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 10, wonBy: 'player2', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 11, wonBy: 'player2', detail: 'ace', firstServeIn: true },
    // Juego 3 (sirve player1, sencillo 4-0).
    { sequenceNumber: 12, wonBy: 'player1', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 13, wonBy: 'player1', detail: 'winner_derecha', firstServeIn: true },
    { sequenceNumber: 14, wonBy: 'player1', detail: 'ace', firstServeIn: false },
    { sequenceNumber: 15, wonBy: 'player1', detail: 'winner_reves', firstServeIn: true },
    // Juego 4 (sirve player2, player1 quiebra — break #1).
    { sequenceNumber: 16, wonBy: 'player1', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 17, wonBy: 'player1', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 18, wonBy: 'player1', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 19, wonBy: 'player1', detail: 'winner', firstServeIn: true },
    // Juego 5 (sirve player1) — remontada 0-3 → 4-3, con los 3 errores no forzados "largo".
    {
      sequenceNumber: 20,
      wonBy: 'player2',
      detail: 'error_no_forzado_derecha',
      firstServeIn: true,
      rallyLength: 'largo',
      errorDirection: 'red',
    },
    {
      sequenceNumber: 21,
      wonBy: 'player2',
      detail: 'error_no_forzado_reves',
      firstServeIn: true,
      rallyLength: 'largo',
      errorDirection: 'ancha',
    },
    {
      sequenceNumber: 22,
      wonBy: 'player2',
      detail: 'error_no_forzado_derecha',
      firstServeIn: true,
      rallyLength: 'largo',
      errorDirection: 'larga',
    },
    { sequenceNumber: 23, wonBy: 'player1', detail: 'winner_derecha', firstServeIn: true, rallyLength: 'largo' },
    { sequenceNumber: 24, wonBy: 'player1', detail: 'winner_reves', firstServeIn: true },
    { sequenceNumber: 25, wonBy: 'player1', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 26, wonBy: 'player1', detail: 'winner_volea', firstServeIn: true },
    // Juego 6 (sirve player2, player2 sostiene su saque).
    { sequenceNumber: 27, wonBy: 'player2', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 28, wonBy: 'player2', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 29, wonBy: 'player2', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 30, wonBy: 'player2', detail: 'ace', firstServeIn: true },
    // Juego 7 (sirve player1, player1 pierde su propio saque 0-4 — único quiebre en contra).
    { sequenceNumber: 31, wonBy: 'player2', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 32, wonBy: 'player2', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 33, wonBy: 'player2', detail: 'winner', firstServeIn: false },
    { sequenceNumber: 34, wonBy: 'player2', detail: 'winner', firstServeIn: true },
    // Juego 8 (sirve player2, player1 quiebra — break #2).
    { sequenceNumber: 35, wonBy: 'player1', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 36, wonBy: 'player1', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 37, wonBy: 'player1', detail: 'winner', firstServeIn: true },
    { sequenceNumber: 38, wonBy: 'player1', detail: 'winner', firstServeIn: true },
    // Juego 9 (sirve player1, sencillo 4-0 — cierra el set 6-3).
    { sequenceNumber: 39, wonBy: 'player1', detail: 'ace', firstServeIn: true },
    { sequenceNumber: 40, wonBy: 'player1', detail: 'winner_derecha', firstServeIn: true },
    { sequenceNumber: 41, wonBy: 'player1', detail: 'winner_reves', firstServeIn: false },
    { sequenceNumber: 42, wonBy: 'player1', detail: 'ace', firstServeIn: true },
  ];

  await app.inject({
    method: 'POST',
    url: `/matches/${reportMatch.id}/points/bulk`,
    headers: { authorization: `Bearer ${reportCoachToken}` },
    payload: {
      points: points.map((p) => ({
        sequenceNumber: p.sequenceNumber,
        wonBy: p.wonBy,
        detail: p.detail,
        firstServeIn: p.firstServeIn,
        serveDirection: null,
        errorDirection: p.errorDirection ?? null,
        rallyLength: p.rallyLength ?? null,
        netApproach: false,
        isReturnError: false,
      })),
    },
  });

  // 3 notas de voz etiquetadas a juegos ya jugados arriba, para probar "dato duro" (Etapa 4)
  // contra puntos conocidos: G0 (gana su saque, con highlights), G6 (pierde su saque, sin
  // highlights — solo "winner" genérico del rival) y G3 (quiebra el saque rival, sin highlights).
  function reportVoiceNoteForm(fields: Record<string, string>): FormData_ {
    const form = new FormData_();
    form.append('file', Buffer.from([9, 9, 9]), { filename: 'note.m4a', contentType: 'audio/m4a' });
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return form;
  }
  const g0NoteForm = reportVoiceNoteForm({
    sequenceNumber: '1',
    durationMs: '2000',
    scoreLabel: 'Juego 1 · Primer set',
    setIndex: '0',
    gameIndex: '0',
    isTiebreak: 'false',
  });
  await app.inject({
    method: 'POST',
    url: `/matches/${reportMatch.id}/voice-notes`,
    headers: { authorization: `Bearer ${reportCoachToken}`, ...g0NoteForm.getHeaders() },
    payload: g0NoteForm.getBuffer(),
  });
  const g6NoteForm = reportVoiceNoteForm({
    sequenceNumber: '2',
    durationMs: '1500',
    scoreLabel: 'Juego 7 · Primer set',
    setIndex: '0',
    gameIndex: '6',
    isTiebreak: 'false',
  });
  await app.inject({
    method: 'POST',
    url: `/matches/${reportMatch.id}/voice-notes`,
    headers: { authorization: `Bearer ${reportCoachToken}`, ...g6NoteForm.getHeaders() },
    payload: g6NoteForm.getBuffer(),
  });
  const g3NoteForm = reportVoiceNoteForm({
    sequenceNumber: '3',
    durationMs: '1800',
    scoreLabel: 'Juego 4 · Primer set',
    setIndex: '0',
    gameIndex: '3',
    isTiebreak: 'false',
  });
  await app.inject({
    method: 'POST',
    url: `/matches/${reportMatch.id}/voice-notes`,
    headers: { authorization: `Bearer ${reportCoachToken}`, ...g3NoteForm.getHeaders() },
    payload: g3NoteForm.getBuffer(),
  });

  await app.inject({
    method: 'PATCH',
    url: `/matches/${reportMatch.id}/status`,
    headers: { authorization: `Bearer ${reportCoachToken}` },
    payload: { status: 'completed' },
  });

  const reportRes = await app.inject({
    method: 'GET',
    url: `/bookings/${reportBooking.id}/match`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(reportRes.statusCode, 200, 'GET /bookings/:id/match (padre) devuelve 200');
  const { report, voiceNotes: reportVoiceNotes } = reportRes.json();
  assertTrue(!!report, 'con el partido completed, la respuesta trae "report"');

  assertEqual(reportVoiceNotes.length, 3, 'las 3 notas de voz llegan en el reporte');
  assertEqual(
    reportVoiceNotes[0].datoDuro,
    'Gana su saque con un ace, un winner de derecha, un winner de revés y una volea ganadora en la red.',
    'dato duro del juego 1 (G0): gana su saque de remontada, con sus 4 winners/ace',
  );
  assertEqual(
    reportVoiceNotes[1].datoDuro,
    'Pierde el juego.',
    'dato duro del juego 7 (G6): pierde su propio saque 0-4 sin ningún highlight capturado (solo "winner" genérico del rival)',
  );
  assertEqual(
    reportVoiceNotes[2].datoDuro,
    'Rompe el saque rival.',
    'dato duro del juego 4 (G3): quiebra el saque rival, sin highlights (solo "winner" genérico propio)',
  );

  assertEqual(report.sets, [{ setIndex: 0, won: true, score: '6-3', unforcedErrors: 3 }], 'un solo set, 6-3, con sus 3 errores no forzados');
  assertEqual(report.totalUnforcedErrors, 3, 'total de errores no forzados de player1 en el partido');
  assertEqual(report.winnerSlot, 'player1', 'player1 ganó el partido');

  assertEqual(
    report.pressureEfficiency.normal,
    { attempts: 17, firstServeIn: 14, pct: 82 },
    'primer saque en situación normal: 14/17 = 82%',
  );
  assertEqual(
    report.pressureEfficiency.breakPoint,
    { attempts: 9, firstServeIn: 7, pct: 78 },
    'primer saque bajo presión de quiebre: 7/9 = 78%',
  );

  assertEqual(
    report.errorZones,
    { red_derecha: 1, red_reves: 0, larga_derecha: 1, larga_reves: 0, ancha_derecha: 0, ancha_reves: 1 },
    'las 3 zonas de error caen exactamente donde se cargaron (red/larga/ancha × derecha/revés)',
  );

  assertEqual(report.rallyErrorBuckets.length, 1, 'solo el bucket "largo" tiene puntos jugados (corto/medio quedan filtrados)');
  assertEqual(
    report.rallyErrorBuckets[0],
    { rallyLength: 'largo', pointsPlayed: 5, pointsLost: 4, unforcedErrors: 3, pointsWon: 1, winPct: 20 },
    'rallies largos: pierde 4 de 5, 3 de esas pérdidas son error no forzado',
  );

  assertEqual(
    report.tacticalDiagnosis,
    'Pierde el 80% de los puntos (4/5) cuando el intercambio se estira a 9 golpes o más — la mayoría de esos errores son de derecha.',
    'diagnóstico táctico exacto sobre rallies largos, con el lado dominante de error',
  );

  assertEqual(report.semaforo.length, 3, 'el semáforo trae sus 3 bloques (fortaleza, zona de cuidado, alerta crítica)');
  assertEqual(
    report.semaforo[0],
    {
      tone: 'green',
      label: 'Fortaleza',
      text: 'Primer saque cuando no hay presión de quiebre: 82% adentro (14/17).',
    },
    'fortaleza = el % más alto entre las 3 métricas candidatas (saque normal 82% > saque general 81% > quiebres 50%)',
  );
  assertEqual(
    report.semaforo[1],
    { tone: 'amber', label: 'Zona de cuidado', text: 'Quiebres convertidos: 2 de 4.' },
    'zona de cuidado = el % más bajo del mismo grupo de candidatas',
  );
  assertEqual(
    report.semaforo[2],
    {
      tone: 'red',
      label: 'Alerta crítica',
      text: '3 de sus 3 errores no forzados pasaron en el 1º set (6-3) — el que ganó.',
    },
    'alerta crítica = concentración de errores no forzados en el único set del partido',
  );
}

console.log('\n=== Escenario 27: notas de voz (subida, borrado, "Nuevo partido") ===');
{
  // r2State es compartido por todo el archivo (Escenario 26 ya subió notas propias que nunca se
  // borran) — se compara contra este baseline en vez de un tamaño absoluto.
  const r2ObjectsBaseline = r2State.objects.size;

  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.voicenotes.e2e@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach Voice Notes E2E',
      primaryRole: 'coach',
    },
  });
  const { token: vnCoachToken, user: vnCoach } = registerRes.json();
  await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${vnCoachToken}` },
    payload: { city: 'CDMX', country: 'EC', yearsExperience: 4, hourlyRate: 30, ageCategories: ['U14'], levels: ['competitivo'] },
  });

  const bookingRes = await requestBooking(vnCoach.id, inFuture(48));
  const vnBooking = bookingRes.json();
  const matchRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${vnCoachToken}` },
    payload: {
      bookingId: vnBooking.id,
      player2Label: 'Rival de práctica',
      format: 'single_set',
      noAd: true,
      initialServer: 'player1',
      captureMode: 'detallada',
    },
  });
  const vnMatch = matchRes.json();

  function voiceNoteForm(fields: Record<string, string>, audioByte = 1): FormData_ {
    const form = new FormData_();
    form.append('file', Buffer.from([audioByte, audioByte, audioByte]), { filename: 'note.m4a', contentType: 'audio/m4a' });
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return form;
  }

  const note1Fields = {
    sequenceNumber: '1',
    durationMs: '2400',
    scoreLabel: 'Set 1 · 2-1',
    setIndex: '0',
    gameIndex: '2',
    isTiebreak: 'false',
  };
  const note1Form = voiceNoteForm(note1Fields, 11);

  const wrongCoachRes = await app.inject({
    method: 'POST',
    url: `/matches/${vnMatch.id}/voice-notes`,
    headers: { authorization: `Bearer ${coachBToken}`, ...note1Form.getHeaders() },
    payload: note1Form.getBuffer(),
  });
  assertEqual(wrongCoachRes.statusCode, 403, 'subir una nota con el token de otro entrenador devuelve 403');

  const note1Res = await app.inject({
    method: 'POST',
    url: `/matches/${vnMatch.id}/voice-notes`,
    headers: { authorization: `Bearer ${vnCoachToken}`, ...note1Form.getHeaders() },
    payload: note1Form.getBuffer(),
  });
  assertEqual(note1Res.statusCode, 201, 'POST voice-notes devuelve 201');
  const note1 = note1Res.json();
  assertEqual(note1.transcriptStatus, 'pending', 'una nota recién subida arranca en pending');
  assertEqual(note1.transcript, null, 'todavía sin transcripción');
  assertEqual(note1.setIndex, 0, 'guarda el setIndex enviado');
  assertEqual(note1.gameIndex, 2, 'guarda el gameIndex enviado');
  assertEqual(note1.isTiebreak, false, 'guarda isTiebreak enviado');
  assertEqual(note1.scoreLabel, 'Set 1 · 2-1', 'guarda el scoreLabel enviado');
  assertTrue(typeof note1.audioUrl === 'string' && note1.audioUrl.length > 0, 'devuelve una audioUrl real');
  assertEqual(r2State.objects.size, r2ObjectsBaseline + 1, 'el audio quedó "subido" en R2 (fake)');

  const note2Form = voiceNoteForm(
    { sequenceNumber: '2', durationMs: '1800', scoreLabel: 'Set 1 · 4-2', setIndex: '0', gameIndex: '6', isTiebreak: 'true' },
    22,
  );
  const note2Res = await app.inject({
    method: 'POST',
    url: `/matches/${vnMatch.id}/voice-notes`,
    headers: { authorization: `Bearer ${vnCoachToken}`, ...note2Form.getHeaders() },
    payload: note2Form.getBuffer(),
  });
  assertEqual(note2Res.statusCode, 201, 'segunda nota también devuelve 201');
  const note2 = note2Res.json();

  const noFileForm = new FormData_();
  noFileForm.append('sequenceNumber', '3');
  const noFileRes = await app.inject({
    method: 'POST',
    url: `/matches/${vnMatch.id}/voice-notes`,
    headers: { authorization: `Bearer ${vnCoachToken}`, ...noFileForm.getHeaders() },
    payload: noFileForm.getBuffer(),
  });
  assertEqual(noFileRes.statusCode, 422, 'subir sin archivo devuelve 422');

  const reportRes = await app.inject({
    method: 'GET',
    url: `/bookings/${vnBooking.id}/match`,
    headers: { authorization: `Bearer ${vnCoachToken}` },
  });
  const reportBody = reportRes.json();
  assertEqual(reportBody.voiceNotes.length, 2, 'GET /bookings/:id/match trae las 2 notas');
  assertEqual(
    reportBody.voiceNotes.map((n: { sequenceNumber: number }) => n.sequenceNumber),
    [1, 2],
    'en orden de sequenceNumber',
  );

  const deleteRes = await app.inject({
    method: 'DELETE',
    url: `/matches/${vnMatch.id}/voice-notes/1`,
    headers: { authorization: `Bearer ${vnCoachToken}` },
  });
  assertEqual(deleteRes.statusCode, 204, 'DELETE voice-notes/:sequenceNumber devuelve 204');
  assertEqual(r2State.deletedKeys.length, 1, 'borrar la nota también borra su audio en R2 (fake)');
  assertEqual(r2State.objects.size, r2ObjectsBaseline + 1, 'solo queda el audio de la nota 2 en R2 (fake)');

  const deleteAgainRes = await app.inject({
    method: 'DELETE',
    url: `/matches/${vnMatch.id}/voice-notes/1`,
    headers: { authorization: `Bearer ${vnCoachToken}` },
  });
  assertEqual(deleteAgainRes.statusCode, 204, 'borrar una nota ya borrada sigue devolviendo 204 (no es un error)');

  const afterDeleteRes = await app.inject({
    method: 'GET',
    url: `/bookings/${vnBooking.id}/match`,
    headers: { authorization: `Bearer ${vnCoachToken}` },
  });
  assertEqual(afterDeleteRes.json().voiceNotes.length, 1, 'la nota borrada ya no aparece en el reporte');
  assertEqual(afterDeleteRes.json().voiceNotes[0].id, note2.id, 'la que queda es la nota 2');

  await app.inject({
    method: 'POST',
    url: `/matches/${vnMatch.id}/restart`,
    headers: { authorization: `Bearer ${vnCoachToken}` },
  });
  assertEqual(r2State.deletedKeys.length, 2, '"Nuevo partido" también limpia el audio de las notas que quedaban');
  assertEqual(r2State.objects.size, r2ObjectsBaseline, 'no queda ningún audio de este partido en R2 (fake)');

  const afterRestartRes = await app.inject({
    method: 'GET',
    url: `/bookings/${vnBooking.id}/match`,
    headers: { authorization: `Bearer ${vnCoachToken}` },
  });
  assertEqual(afterRestartRes.json().voiceNotes.length, 0, '"Nuevo partido" borró todas las notas de voz');
}

console.log('\n=== Escenario 28: transcripción de notas de voz (job asíncrono, reintentos, borrado de R2) ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.transcribe.e2e@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach Transcribe E2E',
      primaryRole: 'coach',
    },
  });
  const { token: tCoachToken, user: tCoach } = registerRes.json();
  await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${tCoachToken}` },
    payload: { city: 'CDMX', country: 'EC', yearsExperience: 4, hourlyRate: 30, ageCategories: ['U14'], levels: ['competitivo'] },
  });

  const bookingRes = await requestBooking(tCoach.id, inFuture(48));
  const tBooking = bookingRes.json();
  const matchRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${tCoachToken}` },
    payload: {
      bookingId: tBooking.id,
      player2Label: 'Rival de práctica',
      format: 'single_set',
      noAd: true,
      initialServer: 'player1',
      captureMode: 'detallada',
    },
  });
  const tMatch = matchRes.json();

  function tVoiceNoteForm(fields: Record<string, string>, audioByte: number): FormData_ {
    const form = new FormData_();
    form.append('file', Buffer.from([audioByte]), { filename: 'note.m4a', contentType: 'audio/m4a' });
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return form;
  }
  const note1Form = tVoiceNoteForm(
    { sequenceNumber: '1', durationMs: '2000', scoreLabel: 'Set 1 · 1-0', setIndex: '0', gameIndex: '0', isTiebreak: 'false' },
    1,
  );
  const note1 = (
    await app.inject({
      method: 'POST',
      url: `/matches/${tMatch.id}/voice-notes`,
      headers: { authorization: `Bearer ${tCoachToken}`, ...note1Form.getHeaders() },
      payload: note1Form.getBuffer(),
    })
  ).json();
  const note2Form = tVoiceNoteForm(
    { sequenceNumber: '2', durationMs: '1500', scoreLabel: 'Set 1 · 2-0', setIndex: '0', gameIndex: '1', isTiebreak: 'false' },
    2,
  );
  const note2 = (
    await app.inject({
      method: 'POST',
      url: `/matches/${tMatch.id}/voice-notes`,
      headers: { authorization: `Bearer ${tCoachToken}`, ...note2Form.getHeaders() },
      payload: note2Form.getBuffer(),
    })
  ).json();

  const TRANSCRIPT_TEXT = 'Buen primer saque, atacó bien la red.';
  setTranscribeAudioForTesting(async (audioUrl: string) => {
    if (audioUrl.includes(`/${tMatch.id}/1.`)) return TRANSCRIPT_TEXT;
    if (audioUrl.includes(`/${tMatch.id}/2.`)) throw new Error('fake provider failure');
    throw new Error('audioUrl inesperada en el test: ' + audioUrl);
  });

  // El job procesa TODA la cola global de notas pending (no solo las de este partido) — otros
  // escenarios de este archivo ya dejaron notas propias sin transcribir, así que se chequea
  // "incluye" en vez de igualdad exacta de array.
  const run1 = await runTranscribeVoiceNotesJob();
  assertEqual(run1.skipped, false, 'con OPENAI_API_KEY fake configurada, el job no se salta');
  assertTrue(run1.completedIds.includes(note1.id), 'nota 1 (fake resuelve texto) queda completed en la 1º pasada');
  assertTrue(run1.retriedIds.includes(note2.id), 'nota 2 (fake rechaza) queda pending para reintentar');

  const afterRun1 = (
    await app.inject({ method: 'GET', url: `/bookings/${tBooking.id}/match`, headers: { authorization: `Bearer ${tCoachToken}` } })
  ).json();
  const [n1AfterRun1, n2AfterRun1] = afterRun1.voiceNotes;
  assertEqual(n1AfterRun1.transcriptStatus, 'completed', 'nota 1: transcript_status completed');
  assertEqual(n1AfterRun1.transcript, TRANSCRIPT_TEXT, 'nota 1: transcript exacto del fake');
  assertEqual(n1AfterRun1.audioUrl, null, 'nota 1: audio_url se limpia al completar');
  assertTrue(!!n1AfterRun1.transcribedAt, 'nota 1: transcribed_at queda fijado');
  assertEqual(n2AfterRun1.transcriptStatus, 'pending', 'nota 2: sigue pending tras 1 falla (le quedan reintentos)');
  assertEqual(n2AfterRun1.transcriptionAttempts, 1, 'nota 2: transcription_attempts = 1');
  assertTrue(!!n2AfterRun1.audioUrl, 'nota 2: audio_url todavía existe (no se agotaron los reintentos)');
  assertEqual(r2State.deletedKeys.includes(`voice-notes/${tMatch.id}/1.m4a`), true, 'nota 1: su audio se borró de R2 (fake)');
  assertEqual(r2State.objects.has(`voice-notes/${tMatch.id}/2.m4a`), true, 'nota 2: su audio sigue en R2 (fake) — todavía no se agotaron los reintentos');

  // 2º y 3º intento de la nota 2 — el 3º agota MAX_TRANSCRIPTION_ATTEMPTS.
  const run2 = await runTranscribeVoiceNotesJob();
  assertTrue(run2.retriedIds.includes(note2.id), 'nota 2: 2º intento también falla, todavía le queda 1 reintento');
  const run3 = await runTranscribeVoiceNotesJob();
  assertTrue(
    run3.failedIds.includes(note2.id),
    `nota 2: 3º intento agota MAX_TRANSCRIPTION_ATTEMPTS (${MAX_TRANSCRIPTION_ATTEMPTS}) y pasa a failed`,
  );

  const afterRun3 = (
    await app.inject({ method: 'GET', url: `/bookings/${tBooking.id}/match`, headers: { authorization: `Bearer ${tCoachToken}` } })
  ).json();
  const n2Final = afterRun3.voiceNotes[1];
  assertEqual(n2Final.transcriptStatus, 'failed', 'nota 2: transcript_status failed tras agotar reintentos');
  assertEqual(n2Final.transcript, null, 'nota 2: nunca llegó a tener transcript');
  assertEqual(n2Final.transcriptionAttempts, MAX_TRANSCRIPTION_ATTEMPTS, `nota 2: transcription_attempts = ${MAX_TRANSCRIPTION_ATTEMPTS}`);
  assertEqual(n2Final.audioUrl, null, 'nota 2: audio_url se limpia igual al agotar reintentos (no hay más intentos posibles)');
  assertEqual(r2State.objects.has(`voice-notes/${tMatch.id}/2.m4a`), false, 'nota 2: su audio también se terminó borrando de R2 (fake)');

  setTranscribeAudioForTesting(null);
}

console.log('\n=== Escenario 29: Google sign-in (cuenta nueva, re-login, vinculación, correo sin verificar) ===');
{
  const newIdentity = {
    googleId: 'google-sub-nueva-mama',
    email: 'nueva.por.google@example.com',
    emailVerified: true,
    name: 'Nueva Por Google',
  };
  googleAuthState.identities.set('fake-code-nueva', newIdentity);

  const firstRes = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { code: 'fake-code-nueva', redirectUri: 'http://localhost:8081', codeVerifier: 'verifier' },
  });
  assertEqual(firstRes.statusCode, 200, 'POST /auth/google con identidad nueva devuelve 200');
  const firstBody = firstRes.json();
  assertEqual(firstBody.pendingRegistration, true, 'identidad nueva responde pendingRegistration: true');
  assertEqual(firstBody.email, newIdentity.email, 'trae el correo de la cuenta de Google');

  const completeRes = await app.inject({
    method: 'POST',
    url: '/auth/google/complete-registration',
    payload: { pendingToken: firstBody.pendingToken, primaryRole: 'parent' },
  });
  assertEqual(completeRes.statusCode, 200, 'complete-registration con rol válido devuelve 200');
  const completed = completeRes.json();
  assertEqual(completed.user.email, newIdentity.email, 'la cuenta creada trae el correo de Google');
  assertEqual(completed.user.primaryRole, 'parent', 'la cuenta se crea con el rol elegido');
  assertTrue(typeof completed.token === 'string' && completed.token.length > 0, 'devuelve un token de sesión real');

  const passwordLoginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: newIdentity.email, password: 'cualquier-cosa-123' },
  });
  assertEqual(
    passwordLoginRes.statusCode,
    401,
    'una cuenta creada solo por Google no puede iniciar sesión con contraseña (no revienta con 500)',
  );

  const secondRes = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { code: 'fake-code-nueva', redirectUri: 'http://localhost:8081', codeVerifier: 'verifier' },
  });
  assertEqual(secondRes.statusCode, 200, 'POST /auth/google de nuevo con la misma identidad devuelve 200');
  const secondBody = secondRes.json();
  assertEqual(secondBody.user?.id, completed.user.id, 'la segunda vez entra directo a la misma cuenta (sin duplicar)');

  const unverifiedIdentity = {
    googleId: 'google-sub-sin-verificar',
    email: 'sin.verificar@example.com',
    emailVerified: false,
    name: 'Sin Verificar',
  };
  googleAuthState.identities.set('fake-code-sin-verificar', unverifiedIdentity);
  const unverifiedRes = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { code: 'fake-code-sin-verificar', redirectUri: 'http://localhost:8081', codeVerifier: 'verifier' },
  });
  assertEqual(unverifiedRes.statusCode, 400, 'identidad de Google con correo sin verificar devuelve 400');
  assertEqual(unverifiedRes.json().error, 'google_email_unverified', 'código de error correcto');
}

console.log('\n=== Escenario 30: terminar el partido completa la reserva sola (en cualquier orden con el pago) ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.autocomplete.e2e@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach Autocomplete E2E',
      primaryRole: 'coach',
    },
  });
  const { token: acCoachToken, user: acCoach } = registerRes.json();
  await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${acCoachToken}` },
    payload: { city: 'CDMX', country: 'EC', yearsExperience: 4, hourlyRate: 30, ageCategories: ['U14'], levels: ['competitivo'] },
  });

  // --- Caso A: paga primero (rail manual P2P, el activo en fase 1), el partido termina después ---
  const bookingARes = await requestBooking(acCoach.id, inFuture(48));
  const bookingA = bookingARes.json();
  await app.inject({ method: 'POST', url: `/bookings/${bookingA.id}/accept`, headers: { authorization: `Bearer ${acCoachToken}` } });
  await app.inject({
    method: 'POST',
    url: '/bookings/submit-payment-proof-batch',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { bookingIds: [bookingA.id], provider: 'deuna', referenceCode: 'AUTOCOMPLETE-A' },
  });
  await app.inject({
    method: 'PUT',
    url: '/bookings/verify-payment',
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { bookingIds: [bookingA.id], decision: 'verified' },
  });
  const paidARes = await app.inject({ method: 'GET', url: `/bookings/${bookingA.id}`, headers: { authorization: `Bearer ${acCoachToken}` } });
  assertEqual(paidARes.json().status, 'paid', 'caso A: la reserva queda "paid" antes de jugar');

  const matchARes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${acCoachToken}` },
    payload: { bookingId: bookingA.id, player2Label: 'Rival', format: 'single_set', noAd: true, initialServer: 'player1', captureMode: 'detallada' },
  });
  const matchA = matchARes.json();
  await app.inject({
    method: 'PATCH',
    url: `/matches/${matchA.id}/status`,
    headers: { authorization: `Bearer ${acCoachToken}` },
    payload: { status: 'completed' },
  });

  const bookingAAfter = (
    await app.inject({ method: 'GET', url: `/bookings/${bookingA.id}`, headers: { authorization: `Bearer ${acCoachToken}` } })
  ).json();
  assertEqual(bookingAAfter.status, 'completed', 'caso A: terminar el partido completa sola la reserva (ya estaba paid)');
  assertTrue(!!bookingAAfter.completedAt, 'caso A: completedAt queda fijado');
  assertTrue(
    pushState.sent.some((m) => m.data?.bookingId === bookingA.id && m.title === 'Tu reporte ya está listo'),
    'caso A: completar la reserva sola también avisa al padre por push que el reporte ya está listo',
  );

  // --- Caso B: el partido termina primero (pago manual todavía sin verificar), se verifica después ---
  const bookingBRes = await requestBooking(acCoach.id, inFuture(48));
  const bookingB = bookingBRes.json();
  await app.inject({ method: 'POST', url: `/bookings/${bookingB.id}/accept`, headers: { authorization: `Bearer ${acCoachToken}` } });
  await app.inject({
    method: 'POST',
    url: '/bookings/submit-payment-proof-batch',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { bookingIds: [bookingB.id], provider: 'deuna', referenceCode: 'AUTOCOMPLETE-B' },
  });

  const matchBRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${acCoachToken}` },
    payload: { bookingId: bookingB.id, player2Label: 'Rival', format: 'single_set', noAd: true, initialServer: 'player1', captureMode: 'detallada' },
  });
  const matchB = matchBRes.json();
  await app.inject({
    method: 'POST',
    url: `/matches/${matchB.id}/retire`,
    headers: { authorization: `Bearer ${acCoachToken}` },
    payload: { retiredBy: 'player1' },
  });

  const bookingBMidway = (
    await app.inject({ method: 'GET', url: `/bookings/${bookingB.id}`, headers: { authorization: `Bearer ${acCoachToken}` } })
  ).json();
  assertEqual(
    bookingBMidway.status,
    'payment_submitted',
    'caso B: el partido ya terminó pero el pago todavía no se verificó — la reserva NO se completa sola todavía',
  );

  await app.inject({
    method: 'PUT',
    url: '/bookings/verify-payment',
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { bookingIds: [bookingB.id], decision: 'verified' },
  });

  const bookingBAfter = (
    await app.inject({ method: 'GET', url: `/bookings/${bookingB.id}`, headers: { authorization: `Bearer ${acCoachToken}` } })
  ).json();
  assertEqual(
    bookingBAfter.status,
    'completed',
    'caso B: al verificar el pago de un partido ya terminado, la reserva se completa directo (salta "paid")',
  );
  assertTrue(!!bookingBAfter.completedAt, 'caso B: completedAt queda fijado');
}

console.log('\n=== Escenario 31: GET /coaches/:id/bookings expone matchStatus, incluso con el pago sin verificar ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.matchstatus.e2e@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach MatchStatus E2E',
      primaryRole: 'coach',
    },
  });
  const { token: msCoachToken, user: msCoach } = registerRes.json();
  await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${msCoachToken}` },
    payload: { city: 'CDMX', country: 'EC', yearsExperience: 4, hourlyRate: 30, ageCategories: ['U14'], levels: ['competitivo'] },
  });

  const bookingRes = await requestBooking(msCoach.id, inFuture(48));
  const booking = bookingRes.json();
  await app.inject({ method: 'POST', url: `/bookings/${booking.id}/accept`, headers: { authorization: `Bearer ${msCoachToken}` } });

  function findBooking(list: any[]): any {
    return list.find((b: any) => b.id === booking.id);
  }

  const beforeMatchList = (
    await app.inject({ method: 'GET', url: `/coaches/${msCoach.id}/bookings`, headers: { authorization: `Bearer ${msCoachToken}` } })
  ).json();
  assertEqual(findBooking(beforeMatchList).matchStatus, null, 'antes de capturar: matchStatus viene null');

  // Pago mandado pero NUNCA verificado — booking.status se queda en 'payment_submitted' para
  // siempre, así que "Iniciar partido" seguiría visible en CoachBookingDetailScreen (se guía por
  // status==='confirmed', que incluye payment_submitted) si no fuera por matchStatus.
  await app.inject({
    method: 'POST',
    url: '/bookings/submit-payment-proof-batch',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { bookingIds: [booking.id], provider: 'deuna', referenceCode: 'MATCHSTATUS-E2E' },
  });

  const matchRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${msCoachToken}` },
    payload: { bookingId: booking.id, player2Label: 'Rival', format: 'single_set', noAd: true, initialServer: 'player1', captureMode: 'detallada' },
  });
  const match = matchRes.json();

  await app.inject({
    method: 'POST',
    url: `/matches/${match.id}/retire`,
    headers: { authorization: `Bearer ${msCoachToken}` },
    payload: { retiredBy: 'player1' },
  });

  const afterRetireList = (
    await app.inject({ method: 'GET', url: `/coaches/${msCoach.id}/bookings`, headers: { authorization: `Bearer ${msCoachToken}` } })
  ).json();
  const bookingAfterRetire = findBooking(afterRetireList);
  assertEqual(
    bookingAfterRetire.status,
    'payment_submitted',
    'el pago nunca se verificó, así que booking.status se queda en payment_submitted',
  );
  assertEqual(
    bookingAfterRetire.matchStatus,
    'completed',
    'pero matchStatus sí refleja que el partido ya terminó por retiro, aunque el pago siga sin verificar',
  );
}

console.log('\n=== Escenario 32: modo de captura \'detallada\' — lado y shot_type ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.shottype.e2e@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach Shot Type E2E',
      primaryRole: 'coach',
    },
  });
  const { token: stCoachToken, user: stCoach } = registerRes.json();
  await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${stCoachToken}` },
    payload: { city: 'CDMX', country: 'EC', yearsExperience: 4, hourlyRate: 30, ageCategories: ['U14'], levels: ['competitivo'] },
  });

  const bookingRes = await requestBooking(stCoach.id, inFuture(48));
  const stBooking = bookingRes.json();
  await app.inject({ method: 'POST', url: `/bookings/${stBooking.id}/accept`, headers: { authorization: `Bearer ${stCoachToken}` } });

  const matchRes = await app.inject({
    method: 'POST',
    url: '/matches',
    headers: { authorization: `Bearer ${stCoachToken}` },
    payload: {
      bookingId: stBooking.id,
      player2Label: 'Rival',
      format: 'single_set',
      noAd: true,
      initialServer: 'player1',
      captureMode: 'detallada',
    },
  });
  const stMatch = matchRes.json();
  assertEqual(stMatch.captureMode, 'detallada', 'el partido queda creado con captureMode detallada');

  function postPoint(sequenceNumber: number, body: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/matches/${stMatch.id}/points`,
      headers: { authorization: `Bearer ${stCoachToken}` },
      payload: {
        sequenceNumber,
        firstServeIn: true,
        serveDirection: null,
        errorDirection: null,
        rallyLength: null,
        netApproach: false,
        isReturnError: false,
        lado: null,
        shotType: null,
        ...body,
      },
    });
  }

  // Ace — solo sirve/gana el saque, lado/shotType se quedan en null.
  const aceRes = await postPoint(1, { wonBy: 'player1', detail: 'ace', serveDirection: 'T', rallyLength: 'corto' });
  assertEqual(aceRes.statusCode, 201, 'ace con serveDirection devuelve 201');

  // "Rally en juego" · error no forzado de volea, con lado + shotType + dirección del error.
  const errorVoleaRes = await postPoint(2, {
    wonBy: 'player2',
    detail: 'error_no_forzado_volea',
    lado: 'reves',
    shotType: 'volea_alta',
    errorDirection: 'larga',
    netApproach: true,
    rallyLength: 'medio',
  });
  assertEqual(errorVoleaRes.statusCode, 201, 'error_no_forzado_volea con lado+shotType devuelve 201');

  // "Rally en juego" · winner, con lado + shotType (sin dirección del error — no aplica a winners).
  const winnerRes = await postPoint(3, {
    wonBy: 'player1',
    detail: 'winner',
    lado: 'derecha',
    shotType: 'passing_shot',
    netApproach: true,
    rallyLength: 'largo',
  });
  assertEqual(winnerRes.statusCode, 201, 'winner con lado+shotType devuelve 201');

  // shotType inválido — rechazado (no es parte de la lista de lib/shotTypes.ts).
  const badShotTypeRes = await postPoint(4, { wonBy: 'player1', detail: 'winner', shotType: 'globo_invertido' });
  assertEqual(badShotTypeRes.statusCode, 422, 'un shotType que no existe en la lista devuelve 422');

  const listRes = await app.inject({
    method: 'GET',
    url: `/bookings/${stBooking.id}/match`,
    headers: { authorization: `Bearer ${stCoachToken}` },
  });
  const points = listRes.json().points as any[];
  assertEqual(points.length, 3, 'quedaron los 3 puntos válidos guardados (el inválido nunca se insertó)');

  const stored = points.find((p) => p.sequenceNumber === 2);
  assertEqual(stored.detail, 'error_no_forzado_volea', 'el punto 2 vuelve con detail=error_no_forzado_volea');
  assertEqual(stored.lado, 'reves', 'el punto 2 vuelve con lado=reves');
  assertEqual(stored.shotType, 'volea_alta', 'el punto 2 vuelve con shotType=volea_alta');
  assertEqual(stored.errorDirection, 'larga', 'el punto 2 vuelve con errorDirection=larga');
  assertEqual(stored.netApproach, true, 'el punto 2 vuelve con netApproach=true');
}

console.log('\n=== Escenario 33: administrador de respaldo de un club (invitación por email) ===');
{
  const inviteEmail = 'backup.invitado@example.com';

  const noAdminInviteRes = await app.inject({
    method: 'POST',
    url: `/clubs/${fixtures.clubId}/admin-invitations`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { email: inviteEmail },
  });
  assertEqual(noAdminInviteRes.statusCode, 403, 'un usuario que no administra el club no puede invitar respaldo');

  const clubAdminToken = app.jwt.sign({ sub: fixtures.clubAdminUserId, role: 'club_admin' });
  const inviteRes = await app.inject({
    method: 'POST',
    url: `/clubs/${fixtures.clubId}/admin-invitations`,
    headers: { authorization: `Bearer ${clubAdminToken}` },
    payload: { email: inviteEmail },
  });
  assertEqual(inviteRes.statusCode, 201, 'POST /clubs/:id/admin-invitations (club_admin) devuelve 201');
  const invitation = inviteRes.json();
  assertEqual(invitation.status, 'pending', 'la invitación nace pending');

  const duplicateInviteRes = await app.inject({
    method: 'POST',
    url: `/clubs/${fixtures.clubId}/admin-invitations`,
    headers: { authorization: `Bearer ${clubAdminToken}` },
    payload: { email: inviteEmail },
  });
  assertEqual(duplicateInviteRes.statusCode, 409, 'una segunda invitación pendiente al mismo email devuelve 409');

  // El email invitado no tiene cuenta todavía — se registra recién ahora, mismo email.
  const backupRegisterRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: inviteEmail, password: 'super-secreta-123', fullName: 'Backup Invitado', primaryRole: 'club_admin' },
  });
  const { token: backupToken, user: backupUser } = backupRegisterRes.json();

  const mineRes = await app.inject({
    method: 'GET',
    url: '/club-admin-invitations/mine',
    headers: { authorization: `Bearer ${backupToken}` },
  });
  assertEqual(mineRes.statusCode, 200, 'GET /club-admin-invitations/mine devuelve 200');
  assertTrue(
    mineRes.json().some((i: any) => i.id === invitation.id && i.clubName === 'Club Deportivo Bosques'),
    'la invitación pendiente aparece para el email recién registrado, con el nombre del club (JOIN)',
  );

  const wrongEmailRespondRes = await app.inject({
    method: 'PUT',
    url: `/club-admin-invitations/${invitation.id}/respond`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { decision: 'accepted' },
  });
  assertEqual(wrongEmailRespondRes.statusCode, 403, 'responder con un email que no es el invitado devuelve 403');

  const acceptRes = await app.inject({
    method: 'PUT',
    url: `/club-admin-invitations/${invitation.id}/respond`,
    headers: { authorization: `Bearer ${backupToken}` },
    payload: { decision: 'accepted' },
  });
  assertEqual(acceptRes.statusCode, 200, 'aceptar la invitación (dueño del email) devuelve 200');
  assertEqual(acceptRes.json().status, 'accepted', 'la invitación queda accepted');

  const backupClubRes = await app.inject({ method: 'GET', url: `/club-admins/${backupUser.id}/club` });
  assertEqual(backupClubRes.json().id, fixtures.clubId, 'el backup ya resuelve al mismo club que el admin oficial');

  const originalStillAdminRes = await app.inject({ method: 'GET', url: `/club-admins/${fixtures.clubAdminUserId}/club` });
  assertEqual(
    originalStillAdminRes.json().id,
    fixtures.clubId,
    'el admin oficial sigue teniendo acceso — sumar un respaldo no lo reemplaza',
  );

  const respondAgainRes = await app.inject({
    method: 'PUT',
    url: `/club-admin-invitations/${invitation.id}/respond`,
    headers: { authorization: `Bearer ${backupToken}` },
    payload: { decision: 'accepted' },
  });
  assertEqual(respondAgainRes.statusCode, 409, 'responder una invitación ya respondida devuelve 409');
}

console.log('\n=== Escenario 34: administrador de respaldo de un club (solicitud de acceso) ===');
{
  const searchNoAuthRes = await app.inject({ method: 'GET', url: '/clubs/search?q=Bosques' });
  assertEqual(searchNoAuthRes.statusCode, 401, 'GET /clubs/search sin token devuelve 401');

  const searchRes = await app.inject({
    method: 'GET',
    url: '/clubs/search?q=Bosques',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertEqual(searchRes.statusCode, 200, 'GET /clubs/search devuelve 200');
  assertTrue(
    searchRes.json().some((c: any) => c.id === fixtures.clubId),
    'la búsqueda por nombre encuentra el club sembrado',
  );

  const requesterRegisterRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'backup.solicitante@example.com', password: 'super-secreta-123', fullName: 'Backup Solicitante', primaryRole: 'club_admin' },
  });
  const { token: requesterToken, user: requesterUser } = requesterRegisterRes.json();

  const requestRes = await app.inject({
    method: 'POST',
    url: `/clubs/${fixtures.clubId}/admin-join-requests`,
    headers: { authorization: `Bearer ${requesterToken}` },
  });
  assertEqual(requestRes.statusCode, 201, 'POST /clubs/:id/admin-join-requests devuelve 201');
  const request = requestRes.json();

  const duplicateRequestRes = await app.inject({
    method: 'POST',
    url: `/clubs/${fixtures.clubId}/admin-join-requests`,
    headers: { authorization: `Bearer ${requesterToken}` },
  });
  assertEqual(duplicateRequestRes.statusCode, 409, 'una segunda solicitud pendiente del mismo usuario devuelve 409');

  const clubAdminToken2 = app.jwt.sign({ sub: fixtures.clubAdminUserId, role: 'club_admin' });
  const wrongAdminRespondRes = await app.inject({
    method: 'PUT',
    url: `/club-admin-join-requests/${request.id}/respond`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { decision: 'accepted' },
  });
  assertEqual(wrongAdminRespondRes.statusCode, 403, 'quien no administra el club no puede aprobar la solicitud');

  const listPendingRes = await app.inject({
    method: 'GET',
    url: `/clubs/${fixtures.clubId}/admin-join-requests`,
    headers: { authorization: `Bearer ${clubAdminToken2}` },
  });
  assertEqual(listPendingRes.statusCode, 200, 'GET /clubs/:id/admin-join-requests devuelve 200');
  assertTrue(
    listPendingRes.json().some((r: any) => r.id === request.id && r.userName === 'Backup Solicitante'),
    'la solicitud pendiente trae el nombre de quien la mandó (JOIN con users)',
  );

  const approveRes = await app.inject({
    method: 'PUT',
    url: `/club-admin-join-requests/${request.id}/respond`,
    headers: { authorization: `Bearer ${clubAdminToken2}` },
    payload: { decision: 'accepted' },
  });
  assertEqual(approveRes.statusCode, 200, 'aprobar la solicitud (club_admin del club) devuelve 200');

  const requesterClubRes = await app.inject({ method: 'GET', url: `/club-admins/${requesterUser.id}/club` });
  assertEqual(requesterClubRes.json().id, fixtures.clubId, 'quien pidió acceso ya resuelve al club aprobado');
}

console.log('\n=== Escenario 35: liquidaciones/torneos de un club, solo para su propio admin ===');
{
  const clubAdminToken3 = app.jwt.sign({ sub: fixtures.clubAdminUserId, role: 'club_admin' });

  const settlementsNoAuthRes = await app.inject({ method: 'GET', url: `/clubs/${fixtures.clubId}/settlements` });
  assertEqual(settlementsNoAuthRes.statusCode, 401, 'GET /clubs/:id/settlements sin token devuelve 401');

  const settlementsWrongUserRes = await app.inject({
    method: 'GET',
    url: `/clubs/${fixtures.clubId}/settlements`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(settlementsWrongUserRes.statusCode, 403, 'GET /clubs/:id/settlements con un usuario ajeno devuelve 403');

  const settlementsOkRes = await app.inject({
    method: 'GET',
    url: `/clubs/${fixtures.clubId}/settlements`,
    headers: { authorization: `Bearer ${clubAdminToken3}` },
  });
  assertEqual(settlementsOkRes.statusCode, 200, 'GET /clubs/:id/settlements con su propio admin devuelve 200');

  const tournamentsNoAuthRes = await app.inject({ method: 'GET', url: `/clubs/${fixtures.clubId}/tournaments` });
  assertEqual(tournamentsNoAuthRes.statusCode, 401, 'GET /clubs/:id/tournaments sin token devuelve 401');

  const tournamentsWrongUserRes = await app.inject({
    method: 'GET',
    url: `/clubs/${fixtures.clubId}/tournaments`,
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertEqual(tournamentsWrongUserRes.statusCode, 403, 'GET /clubs/:id/tournaments con un usuario ajeno devuelve 403');

  const tournamentsOkRes = await app.inject({
    method: 'GET',
    url: `/clubs/${fixtures.clubId}/tournaments`,
    headers: { authorization: `Bearer ${clubAdminToken3}` },
  });
  assertEqual(tournamentsOkRes.statusCode, 200, 'GET /clubs/:id/tournaments con su propio admin devuelve 200');
}

console.log('\n=== Escenario 36: perfil público de coach no expone stripeConnectedAccountId ===');
{
  const profileRes = await app.inject({ method: 'GET', url: `/coaches/${fixtures.coachAUserId}` });
  assertEqual(profileRes.statusCode, 200, 'GET /coaches/:id devuelve 200');
  assertEqual(
    profileRes.json().profile.stripeConnectedAccountId,
    null,
    'stripeConnectedAccountId nunca sale en el perfil público, aunque el coach tenga uno real',
  );
}

console.log('\n=== Escenario 37: borrar un push token ajeno no funciona ===');
{
  await app.inject({
    method: 'POST',
    url: '/push-tokens',
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { token: 'ExponentPushToken[owned-by-coach-a]' },
  });

  const deleteWrongOwnerRes = await app.inject({
    method: 'DELETE',
    url: '/push-tokens/ExponentPushToken%5Bowned-by-coach-a%5D',
    headers: { authorization: `Bearer ${coachBToken}` },
  });
  assertEqual(deleteWrongOwnerRes.statusCode, 204, 'DELETE de un token ajeno igual devuelve 204 (best-effort, sin filtrar info)');

  const stillThereRows = await testPool.query(
    `SELECT 1 FROM push_tokens WHERE expo_push_token = 'ExponentPushToken[owned-by-coach-a]' AND user_id = $1`,
    [fixtures.coachAUserId],
  );
  assertEqual(
    stillThereRows.rows.length,
    1,
    'el DELETE de otro usuario no borró el token — sigue existiendo, atado a su dueño real',
  );
}

console.log('\n=== Escenario 38: archivar/reactivar un jugador (decisión #44) ===');
{
  const createRes = await app.inject({
    method: 'POST',
    url: '/players',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { fullName: 'Jugadora Archivable', birthDate: '2013-05-01', ageCategory: 'U12', country: 'EC' },
  });
  assertEqual(createRes.statusCode, 201, 'POST /players devuelve 201');
  assertEqual(createRes.json().active, true, 'un jugador nuevo nace active=true');
  const newPlayerId = createRes.json().id;

  const activeOnlyBeforeRes = await app.inject({
    method: 'GET',
    url: '/players?activeOnly=true',
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertTrue(
    activeOnlyBeforeRes.json().some((p: any) => p.id === newPlayerId),
    '?activeOnly=true incluye al jugador recién creado (todavía activo)',
  );

  const wrongUserArchiveRes = await app.inject({
    method: 'PUT',
    url: `/players/${newPlayerId}/active`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { active: false },
  });
  assertEqual(wrongUserArchiveRes.statusCode, 403, 'archivar el jugador de otro padre devuelve 403');

  const archiveRes = await app.inject({
    method: 'PUT',
    url: `/players/${newPlayerId}/active`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { active: false },
  });
  assertEqual(archiveRes.statusCode, 200, 'PUT /players/:id/active (dueño real) devuelve 200');
  assertEqual(archiveRes.json().active, false, 'el jugador queda active=false');

  const activeOnlyAfterRes = await app.inject({
    method: 'GET',
    url: '/players?activeOnly=true',
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertTrue(
    !activeOnlyAfterRes.json().some((p: any) => p.id === newPlayerId),
    '?activeOnly=true ya no incluye al jugador archivado',
  );

  const allPlayersRes = await app.inject({
    method: 'GET',
    url: '/players',
    headers: { authorization: `Bearer ${parentToken}` },
  });
  assertTrue(
    allPlayersRes.json().some((p: any) => p.id === newPlayerId && p.active === false),
    'GET /players sin filtro sigue trayendo al jugador archivado (para ParentProfileScreen)',
  );

  const reactivateRes = await app.inject({
    method: 'PUT',
    url: `/players/${newPlayerId}/active`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { active: true },
  });
  assertEqual(reactivateRes.statusCode, 200, 'reactivar (active: true) devuelve 200');
  assertEqual(reactivateRes.json().active, true, 'el jugador vuelve a quedar active=true — reversible');
}

console.log('\n=== Escenario 39: subir el archivo real de un documento de verificación de coach ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.docs@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach Con Documentos',
      primaryRole: 'coach',
    },
  });
  const { token: docCoachToken, user: docCoach } = registerRes.json();

  function documentForm(fields: Record<string, string>, fileByte = 1): FormData_ {
    const form = new FormData_();
    form.append('file', Buffer.from([fileByte, fileByte, fileByte]), { filename: 'id.jpg', contentType: 'image/jpeg' });
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return form;
  }

  const noAuthForm = documentForm({ docType: 'identity' });
  const noAuthRes = await app.inject({
    method: 'POST',
    url: `/coaches/${docCoach.id}/verification-documents/upload`,
    headers: noAuthForm.getHeaders(),
    payload: noAuthForm.getBuffer(),
  });
  assertEqual(noAuthRes.statusCode, 401, 'subir un documento sin Bearer token devuelve 401');

  const wrongCoachForm = documentForm({ docType: 'identity' });
  const wrongCoachRes = await app.inject({
    method: 'POST',
    url: `/coaches/${docCoach.id}/verification-documents/upload`,
    headers: { authorization: `Bearer ${coachAToken}`, ...wrongCoachForm.getHeaders() },
    payload: wrongCoachForm.getBuffer(),
  });
  assertEqual(wrongCoachRes.statusCode, 403, 'subir el documento de otro entrenador devuelve 403');

  const badDocTypeForm = documentForm({ docType: 'not_a_real_type' });
  const badDocTypeRes = await app.inject({
    method: 'POST',
    url: `/coaches/${docCoach.id}/verification-documents/upload`,
    headers: { authorization: `Bearer ${docCoachToken}`, ...badDocTypeForm.getHeaders() },
    payload: badDocTypeForm.getBuffer(),
  });
  assertEqual(badDocTypeRes.statusCode, 422, 'docType inválido devuelve 422');

  const r2Baseline39 = r2State.objects.size;
  const identityForm = documentForm({ docType: 'identity' }, 42);
  const identityRes = await app.inject({
    method: 'POST',
    url: `/coaches/${docCoach.id}/verification-documents/upload`,
    headers: { authorization: `Bearer ${docCoachToken}`, ...identityForm.getHeaders() },
    payload: identityForm.getBuffer(),
  });
  assertEqual(identityRes.statusCode, 200, 'subir el archivo real devuelve 200');
  const { fileUrl } = identityRes.json();
  assertEqual(
    fileUrl,
    `https://fake-r2.example.com/coach-verification-docs/${docCoach.id}/identity.jpg`,
    'devuelve la URL real en R2 (fake)',
  );
  assertEqual(r2State.objects.size, r2Baseline39 + 1, 'quedó "subido" en R2 (fake)');

  // El registro completo usa ese fileUrl real (no un placeholder) para el documento.
  const registerCoachRes = await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${docCoachToken}` },
    payload: {
      city: 'Quito',
      country: 'EC',
      yearsExperience: 3,
      hourlyRate: 20,
      ageCategories: ['U12'],
      levels: ['competitivo'],
      documents: [{ docType: 'identity', fileUrl }],
    },
  });
  assertEqual(registerCoachRes.statusCode, 201, 'POST /coaches con el fileUrl real devuelve 201');

  const savedDocsRes = await app.inject({
    method: 'GET',
    url: `/coaches/${docCoach.id}/verification-documents`,
    headers: { authorization: `Bearer ${docCoachToken}` },
  });
  const savedDoc = savedDocsRes.json().find((d: { docType: string }) => d.docType === 'identity');
  assertEqual(savedDoc.fileUrl, fileUrl, 'el documento guardado tiene la URL real, no un placeholder');
}

console.log('\n=== Escenario 40: subir el archivo real de identidad de quien registra un club ===');
{
  const registerRes = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'club.admin.docs@example.com',
      password: 'super-secreta-123',
      fullName: 'Admin De Club Con Documentos',
      primaryRole: 'club_admin',
    },
  });
  const { token: docAdminToken, user: docAdmin } = registerRes.json();

  function identityDocForm(fileByte = 1): FormData_ {
    const form = new FormData_();
    form.append('file', Buffer.from([fileByte, fileByte, fileByte]), { filename: 'id.jpg', contentType: 'image/jpeg' });
    return form;
  }

  const noAuthForm = identityDocForm();
  const noAuthRes = await app.inject({
    method: 'POST',
    url: '/clubs/identity-document/upload',
    headers: noAuthForm.getHeaders(),
    payload: noAuthForm.getBuffer(),
  });
  assertEqual(noAuthRes.statusCode, 401, 'subir el documento de identidad sin Bearer token devuelve 401');

  const r2Baseline40 = r2State.objects.size;
  const uploadForm = identityDocForm(77);
  const uploadRes = await app.inject({
    method: 'POST',
    url: '/clubs/identity-document/upload',
    headers: { authorization: `Bearer ${docAdminToken}`, ...uploadForm.getHeaders() },
    payload: uploadForm.getBuffer(),
  });
  assertEqual(uploadRes.statusCode, 200, 'subir el archivo real devuelve 200');
  const { fileUrl: clubFileUrl } = uploadRes.json();
  assertEqual(
    clubFileUrl,
    `https://fake-r2.example.com/club-identity-docs/${docAdmin.id}.jpg`,
    'devuelve la URL real en R2 (fake)',
  );
  assertEqual(r2State.objects.size, r2Baseline40 + 1, 'quedó "subido" en R2 (fake)');

  const registerClubRes = await app.inject({
    method: 'POST',
    url: '/clubs',
    headers: { authorization: `Bearer ${docAdminToken}` },
    payload: {
      name: 'Club Con Documento Real',
      type: 'club',
      city: 'Guayaquil',
      country: 'EC',
      identityDocumentUrl: clubFileUrl,
    },
  });
  assertEqual(registerClubRes.statusCode, 201, 'POST /clubs con el fileUrl real devuelve 201');
  assertEqual(registerClubRes.json().identityDocumentUrl, clubFileUrl, 'el club creado tiene la URL real, no un placeholder');
}

console.log('\n=== Escenario 42: reportar un posible error en un torneo (decisión #46) ===');
{
  // --- Club aprobado, con torneo, y un push token registrado para poder medir la notificación ---
  const reportAdminReg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'club.reports@example.com',
      password: 'super-secreta-123',
      fullName: 'Admin De Reportes',
      primaryRole: 'club_admin',
    },
  });
  const { token: reportAdminToken, user: reportAdmin } = reportAdminReg.json();

  const reportClubRes = await app.inject({
    method: 'POST',
    url: '/clubs',
    headers: { authorization: `Bearer ${reportAdminToken}` },
    payload: {
      name: 'Club De Reportes',
      type: 'club',
      city: 'Manta',
      country: 'EC',
      identityDocumentUrl: 'placeholder://identity',
    },
  });
  const reportClub = reportClubRes.json();

  await app.inject({
    method: 'PUT',
    url: `/clubs/${reportClub.id}/review`,
    headers: { authorization: `Bearer ${platformAdminToken}` },
    payload: { status: 'approved' },
  });

  const reportAdminDeviceToken = 'ExponentPushToken[smoke-test-report-admin]';
  await app.inject({
    method: 'POST',
    url: '/push-tokens',
    headers: { authorization: `Bearer ${reportAdminToken}` },
    payload: { token: reportAdminDeviceToken },
  });

  const inDaysReport = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const reportTournamentRes = await app.inject({
    method: 'POST',
    url: `/clubs/${reportClub.id}/tournaments`,
    headers: { authorization: `Bearer ${reportAdminToken}` },
    payload: {
      name: 'Copa Con Posible Error',
      venue: 'Cancha 1',
      city: 'Manta',
      ageCategories: ['U12'],
      startDate: inDaysReport(40),
      endDate: inDaysReport(42),
    },
  });
  const reportTournament = reportTournamentRes.json();

  // --- Un club_admin no puede reportar (solo padre/entrenador) ---
  const wrongRoleReportRes = await app.inject({
    method: 'POST',
    url: `/tournaments/${reportTournament.id}/reports`,
    headers: { authorization: `Bearer ${reportAdminToken}` },
    payload: { message: 'Esto no debería funcionar' },
  });
  assertEqual(wrongRoleReportRes.statusCode, 403, 'un club_admin no puede reportar un torneo');

  // --- Un padre reporta — dispara exactamente un push al admin del club ---
  pushState.sent.length = 0;
  const parentReportRes = await app.inject({
    method: 'POST',
    url: `/tournaments/${reportTournament.id}/reports`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { message: 'La fecha de inicio no coincide con la que anunciaron en redes.' },
  });
  assertEqual(parentReportRes.statusCode, 201, 'un padre puede reportar un torneo');
  const parentReport = parentReportRes.json();
  assertEqual(parentReport.tournamentName, 'Copa Con Posible Error', 'el reporte trae el nombre del torneo');
  assertEqual(parentReport.clubName, 'Club De Reportes', 'el reporte trae el nombre del club');
  assertEqual(pushState.sent.length, 1, 'reportar dispara exactamente un push al admin del club');
  assertEqual(pushState.sent[0]?.to, reportAdminDeviceToken, 'el push va al device token del admin del club');
  assertEqual(pushState.sent[0]?.title, 'Posible error en un torneo', 'el título del push es el esperado');

  // --- Un segundo reporte abierto de la misma persona sobre el mismo torneo no se permite ---
  const duplicateReportRes = await app.inject({
    method: 'POST',
    url: `/tournaments/${reportTournament.id}/reports`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { message: 'Otra vez lo mismo' },
  });
  assertEqual(duplicateReportRes.statusCode, 409, 'un segundo reporte abierto de la misma persona devuelve 409');

  // --- Un entrenador también puede reportar (mismo torneo, persona distinta) ---
  const coachReportRes = await app.inject({
    method: 'POST',
    url: `/tournaments/${reportTournament.id}/reports`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: { message: 'La sede que figura ya no existe.' },
  });
  assertEqual(coachReportRes.statusCode, 201, 'un entrenador también puede reportar un torneo');
  const coachReport = coachReportRes.json();

  // --- Cola del propio club — solo su admin, con los 2 reportes abiertos ---
  const wrongClubQueueRes = await app.inject({
    method: 'GET',
    url: `/clubs/${reportClub.id}/tournament-reports`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(wrongClubQueueRes.statusCode, 403, 'un usuario ajeno no puede ver la cola de reportes del club');

  const clubQueueRes = await app.inject({
    method: 'GET',
    url: `/clubs/${reportClub.id}/tournament-reports`,
    headers: { authorization: `Bearer ${reportAdminToken}` },
  });
  assertEqual(clubQueueRes.statusCode, 200, 'GET /clubs/:id/tournament-reports (su propio admin) devuelve 200');
  assertEqual(clubQueueRes.json().length, 2, 'la cola del club trae los 2 reportes abiertos');

  // --- Cola global del platform_admin — respaldo, ve los mismos reportes ---
  const forbiddenAdminQueueRes = await app.inject({
    method: 'GET',
    url: '/tournament-reports/pending',
    headers: { authorization: `Bearer ${reportAdminToken}` },
  });
  assertEqual(forbiddenAdminQueueRes.statusCode, 403, 'un club_admin no puede ver la cola global de platform_admin');

  const adminQueueRes = await app.inject({
    method: 'GET',
    url: '/tournament-reports/pending',
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertEqual(adminQueueRes.statusCode, 200, 'GET /tournament-reports/pending (platform_admin) devuelve 200');
  assertTrue(
    adminQueueRes.json().some((r: any) => r.id === parentReport.id) &&
      adminQueueRes.json().some((r: any) => r.id === coachReport.id),
    'la cola global incluye ambos reportes',
  );

  // --- Resolver: un actor sin rol de admin no puede ---
  const wrongActorResolveRes = await app.inject({
    method: 'PUT',
    url: `/tournament-reports/${parentReport.id}/resolve`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  assertEqual(wrongActorResolveRes.statusCode, 403, 'un entrenador no puede resolver un reporte');

  // --- El propio club_admin resuelve el reporte del padre ---
  const resolveByClubRes = await app.inject({
    method: 'PUT',
    url: `/tournament-reports/${parentReport.id}/resolve`,
    headers: { authorization: `Bearer ${reportAdminToken}` },
  });
  assertEqual(resolveByClubRes.statusCode, 200, 'el admin del club resuelve el reporte del padre');

  // --- Resolver de nuevo el mismo reporte ya no funciona (guard del trigger) ---
  const resolveAgainRes = await app.inject({
    method: 'PUT',
    url: `/tournament-reports/${parentReport.id}/resolve`,
    headers: { authorization: `Bearer ${reportAdminToken}` },
  });
  assertEqual(resolveAgainRes.statusCode, 404, 'resolver un reporte ya resuelto devuelve 404');

  // --- platform_admin resuelve el reporte del entrenador (sin ser admin de ese club) ---
  const resolveByAdminRes = await app.inject({
    method: 'PUT',
    url: `/tournament-reports/${coachReport.id}/resolve`,
    headers: { authorization: `Bearer ${platformAdminToken}` },
  });
  assertEqual(resolveByAdminRes.statusCode, 200, 'platform_admin puede resolver el reporte de cualquier club');

  // --- Ambas colas quedan vacías para este club/torneo tras resolver los 2 reportes ---
  const clubQueueAfterRes = await app.inject({
    method: 'GET',
    url: `/clubs/${reportClub.id}/tournament-reports`,
    headers: { authorization: `Bearer ${reportAdminToken}` },
  });
  assertEqual(clubQueueAfterRes.json(), [], 'la cola del club queda vacía tras resolver ambos reportes');
}

console.log('\n=== Escenario 43: editar un torneo — fechas bloqueadas con reservas activas (decisión #47) ===');
{
  const editAdminReg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'club.edits@example.com',
      password: 'super-secreta-123',
      fullName: 'Admin Que Edita',
      primaryRole: 'club_admin',
    },
  });
  const { token: editAdminToken } = editAdminReg.json();

  const editClubRes = await app.inject({
    method: 'POST',
    url: '/clubs',
    headers: { authorization: `Bearer ${editAdminToken}` },
    payload: {
      name: 'Club Que Edita',
      type: 'club',
      city: 'Ambato',
      country: 'EC',
      identityDocumentUrl: 'placeholder://identity',
    },
  });
  const editClub = editClubRes.json();

  const inDaysEdit = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const createRes = await app.inject({
    method: 'POST',
    url: `/clubs/${editClub.id}/tournaments`,
    headers: { authorization: `Bearer ${editAdminToken}` },
    payload: {
      name: 'Copa Editable',
      venue: 'Cancha Vieja',
      city: 'Ambato',
      ageCategories: ['U10'],
      startDate: inDaysEdit(50),
      endDate: inDaysEdit(52),
    },
  });
  const editTournament = createRes.json();
  assertEqual(editTournament.hasActiveBookings, false, 'un torneo recién creado no tiene reservas activas');

  // --- Sin reservas todavía: nombre Y fechas se pueden cambiar libremente ---
  const firstEditRes = await app.inject({
    method: 'PUT',
    url: `/clubs/${editClub.id}/tournaments/${editTournament.id}`,
    headers: { authorization: `Bearer ${editAdminToken}` },
    payload: {
      name: 'Copa Editable (renombrada)',
      venue: 'Cancha Nueva',
      city: 'Riobamba',
      ageCategories: ['U10', 'U12'],
      startDate: inDaysEdit(60),
      endDate: inDaysEdit(62),
    },
  });
  assertEqual(firstEditRes.statusCode, 200, 'editar sin reservas activas devuelve 200 (incl. fechas)');
  assertEqual(firstEditRes.json().name, 'Copa Editable (renombrada)', 'el nombre quedó actualizado');
  assertEqual(firstEditRes.json().city, 'Riobamba', 'la ciudad quedó actualizada');
  assertEqual(firstEditRes.json().ageCategories, ['U10', 'U12'], 'las categorías quedaron actualizadas');
  assertEqual(firstEditRes.json().startDate, inDaysEdit(60), 'la fecha de inicio quedó actualizada');

  // --- Un usuario que no administra este club no puede editar ---
  const foreignEditRes = await app.inject({
    method: 'PUT',
    url: `/clubs/${editClub.id}/tournaments/${editTournament.id}`,
    headers: { authorization: `Bearer ${coachAToken}` },
    payload: {
      name: 'Intento Ajeno',
      venue: 'Cancha Vieja',
      city: 'Riobamba',
      ageCategories: ['U10'],
      startDate: inDaysEdit(60),
      endDate: inDaysEdit(62),
    },
  });
  assertEqual(foreignEditRes.statusCode, 403, 'un usuario que no administra este club no puede editar el torneo');

  // --- Una reserva 'requested' (no descartada) activa el bloqueo de fechas ---
  const bookingRes = await app.inject({
    method: 'POST',
    url: '/bookings',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: {
      playerId: fixtures.playerId,
      coachId: fixtures.coachAUserId,
      tournamentId: editTournament.id,
      matchDatetime: inFuture(61 * 24),
      agreedRate: 1000,
    },
  });
  assertEqual(bookingRes.statusCode, 201, 'la reserva contra este torneo se crea con 201');

  const afterBookingListRes = await app.inject({
    method: 'GET',
    url: `/clubs/${editClub.id}/tournaments`,
    headers: { authorization: `Bearer ${editAdminToken}` },
  });
  const listedTournament = afterBookingListRes.json().find((t: any) => t.id === editTournament.id);
  assertEqual(listedTournament.hasActiveBookings, true, 'con una reserva activa, hasActiveBookings pasa a true');

  // --- Con reservas activas: nombre/ciudad SÍ se pueden cambiar, fechas NO ---
  const nameOnlyEditRes = await app.inject({
    method: 'PUT',
    url: `/clubs/${editClub.id}/tournaments/${editTournament.id}`,
    headers: { authorization: `Bearer ${editAdminToken}` },
    payload: {
      name: 'Copa Editable (con reservas)',
      venue: 'Cancha Nueva',
      city: 'Riobamba',
      ageCategories: ['U10', 'U12'],
      startDate: inDaysEdit(60),
      endDate: inDaysEdit(62),
    },
  });
  assertEqual(nameOnlyEditRes.statusCode, 200, 'editar sin tocar las fechas devuelve 200 aunque haya reservas activas');
  assertEqual(nameOnlyEditRes.json().name, 'Copa Editable (con reservas)', 'el nombre se actualizó igual');

  const dateEditRes = await app.inject({
    method: 'PUT',
    url: `/clubs/${editClub.id}/tournaments/${editTournament.id}`,
    headers: { authorization: `Bearer ${editAdminToken}` },
    payload: {
      name: 'Copa Editable (con reservas)',
      venue: 'Cancha Nueva',
      city: 'Riobamba',
      ageCategories: ['U10', 'U12'],
      startDate: inDaysEdit(70),
      endDate: inDaysEdit(72),
    },
  });
  assertEqual(dateEditRes.statusCode, 409, 'cambiar las fechas con reservas activas devuelve 409');
  assertEqual(dateEditRes.json().error, 'tournament_dates_locked', 'el código de error es el esperado');
}

console.log('\n=== Escenario 44: correos de aviso — "algo pendiente de aprobar/responder" ===');
{
  const PLATFORM_ADMIN_EMAIL = 'admin@example.com'; // fixtures.platformAdminUserId, ver test/seed.ts
  const CLUB_BOSQUES_ADMIN_EMAIL = 'club.bosques@example.com'; // fixtures.clubAdminUserId

  // --- 1) Documentos de un coach nuevo -> correo a platform_admin ---
  emailState.sent.length = 0;
  const emailCoachReg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.avisos@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach De Avisos',
      primaryRole: 'coach',
    },
  });
  const { token: emailCoachToken } = emailCoachReg.json();
  await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${emailCoachToken}` },
    payload: {
      city: 'Cuenca',
      country: 'EC',
      yearsExperience: 3,
      hourlyRate: 20,
      ageCategories: ['U12'],
      levels: ['competitivo'],
      documents: [{ docType: 'identity', fileUrl: 'placeholder://identity' }],
    },
  });
  assertEqual(emailState.sent.length, 1, 'un coach con documentos dispara exactamente un correo');
  assertEqual(emailState.sent[0].to, PLATFORM_ADMIN_EMAIL, 'el correo de coach nuevo va a platform_admin');

  // --- Un coach SIN documentos no dispara nada (nada que revisar todavía) ---
  emailState.sent.length = 0;
  const noDocsCoachReg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'coach.sin.docs@example.com',
      password: 'super-secreta-123',
      fullName: 'Coach Sin Docs',
      primaryRole: 'coach',
    },
  });
  await app.inject({
    method: 'POST',
    url: '/coaches',
    headers: { authorization: `Bearer ${noDocsCoachReg.json().token}` },
    payload: { city: 'Cuenca', country: 'EC', yearsExperience: 1, hourlyRate: 15, ageCategories: [], levels: [] },
  });
  assertEqual(emailState.sent.length, 0, 'un coach sin documentos no dispara ningún correo');

  // --- 2) Club nuevo -> correo a platform_admin ---
  emailState.sent.length = 0;
  const emailClubAdminReg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'club.avisos@example.com',
      password: 'super-secreta-123',
      fullName: 'Admin De Avisos',
      primaryRole: 'club_admin',
    },
  });
  await app.inject({
    method: 'POST',
    url: '/clubs',
    headers: { authorization: `Bearer ${emailClubAdminReg.json().token}` },
    payload: {
      name: 'Club De Avisos',
      type: 'club',
      city: 'Cuenca',
      country: 'EC',
      identityDocumentUrl: 'placeholder://identity',
    },
  });
  assertEqual(emailState.sent.length, 1, 'un club nuevo dispara exactamente un correo');
  assertEqual(emailState.sent[0].to, PLATFORM_ADMIN_EMAIL, 'el correo de club nuevo va a platform_admin');

  // --- 3) Nueva solicitud de reserva -> correo (además del push) al entrenador ---
  emailState.sent.length = 0;
  pushState.sent.length = 0;
  const emailBookingReq = await requestBooking(fixtures.coachAUserId, inFuture(70));
  const emailBooking = emailBookingReq.json();
  assertEqual(emailState.sent.length, 1, 'una solicitud de reserva dispara exactamente un correo');
  assertTrue(pushState.sent.length >= 1, 'una solicitud de reserva sigue disparando el push de siempre');

  // --- 4) Comprobante de pago enviado -> correo a platform_admin ---
  await app.inject({
    method: 'POST',
    url: `/bookings/${emailBooking.id}/accept`,
    headers: { authorization: `Bearer ${coachAToken}` },
  });
  emailState.sent.length = 0;
  await app.inject({
    method: 'POST',
    url: '/bookings/submit-payment-proof-batch',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { bookingIds: [emailBooking.id], provider: 'deuna', referenceCode: 'REF-AVISO-001' },
  });
  assertEqual(emailState.sent.length, 1, 'un comprobante de pago dispara exactamente un correo');
  assertEqual(emailState.sent[0].to, PLATFORM_ADMIN_EMAIL, 'el correo de comprobante de pago va a platform_admin');

  // --- 5) Solicitud de administrador de respaldo -> correo al/a los admin(s) actuales del club ---
  emailState.sent.length = 0;
  const backupRequesterReg = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'backup.avisos@example.com',
      password: 'super-secreta-123',
      fullName: 'Backup De Avisos',
      primaryRole: 'club_admin',
    },
  });
  await app.inject({
    method: 'POST',
    url: `/clubs/${fixtures.clubId}/admin-join-requests`,
    headers: { authorization: `Bearer ${backupRequesterReg.json().token}` },
  });
  // >= 1, no exactamente 1: fixtures.clubId ya puede tener administradores de respaldo sumados
  // por otros escenarios (33/34) para cuando se llega acá — a todos les toca avisarles.
  assertTrue(emailState.sent.length >= 1, 'una solicitud de respaldo dispara al menos un correo');
  assertTrue(
    emailState.sent.some((m) => m.to === CLUB_BOSQUES_ADMIN_EMAIL),
    'el correo de solicitud de respaldo incluye al admin original del club',
  );

  // --- 6) Reportar un torneo -> correo (además del push, ya probado en el Escenario 42) al/a
  // los admin(s) del club dueño ---
  emailState.sent.length = 0;
  await app.inject({
    method: 'POST',
    url: `/tournaments/${fixtures.tournamentId}/reports`,
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { message: 'Correo de prueba — Escenario 44' },
  });
  assertTrue(emailState.sent.length >= 1, 'reportar un torneo dispara al menos un correo');
  assertTrue(
    emailState.sent.some((m) => m.to === CLUB_BOSQUES_ADMIN_EMAIL),
    'el correo de reporte incluye al admin original del club dueño del torneo',
  );
}

console.log(`\n=== Resultado: ${passed} pasaron, ${failed} fallaron ===`);
await app.close();
process.exit(failed > 0 ? 1 : 0);
