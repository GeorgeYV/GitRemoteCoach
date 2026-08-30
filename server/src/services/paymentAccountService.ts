import { ValidationError } from '../lib/errors.js';
import * as paymentAccountRepository from '../repositories/paymentAccountRepository.js';
import type { PaymentCollectionAccountAdmin, PaymentInstructions, PublicPaymentAccount } from '../types.js';

/** Antes de que platform_admin cargue una cuenta real (o si la borra) — mismo texto que el
 * placeholder que vivía en config.ts, para que el padre siga viendo una señal clara de que todavía
 * no hay una cuenta configurada, en vez de un campo vacío que parezca un bug. */
const PLACEHOLDER = 'Pendiente de configurar';

/** PlatformAdminPaymentAccountsScreen — las 5 filas sembradas (decisión #54), sin filtrar por
 * país (son pocas, se listan todas de una). */
export async function listPaymentAccountsForAdmin(): Promise<PaymentCollectionAccountAdmin[]> {
  return paymentAccountRepository.listAll();
}

/**
 * Actualiza los datos de cobro de una fila puntual — el provider de la fila no se cambia acá
 * (decisión #54: platform_admin corrige/completa un número o cuenta sin pasar por un redeploy en
 * Render). Valida según el tipo de provider de ESA fila: un número/celular para deuna/yape/plin,
 * los 4 campos obligatorios de banco para bank_transfer (interbankAccountNumber sigue opcional).
 */
export async function updatePaymentAccount(
  id: string,
  params: {
    handle?: string;
    bankName?: string;
    accountType?: string;
    accountNumber?: string;
    accountHolderName?: string;
    interbankAccountNumber?: string;
  },
  updatedBy: string,
): Promise<PaymentCollectionAccountAdmin> {
  const existing = await paymentAccountRepository.findById(id);

  if (existing.provider === 'bank_transfer') {
    const bankName = params.bankName?.trim();
    const accountType = params.accountType?.trim();
    const accountNumber = params.accountNumber?.trim();
    const accountHolderName = params.accountHolderName?.trim();
    if (!bankName || !accountType || !accountNumber || !accountHolderName) {
      throw new ValidationError('Banco, tipo de cuenta, número de cuenta y titular son obligatorios');
    }
    return paymentAccountRepository.update(
      id,
      {
        handle: null,
        bankName,
        accountType,
        accountNumber,
        accountHolderName,
        interbankAccountNumber: params.interbankAccountNumber?.trim() || null,
      },
      updatedBy,
    );
  }

  const handle = params.handle?.trim();
  if (!handle) {
    throw new ValidationError('El número/celular es obligatorio');
  }
  return paymentAccountRepository.update(
    id,
    { handle, bankName: null, accountType: null, accountNumber: null, accountHolderName: null, interbankAccountNumber: null },
    updatedBy,
  );
}

/** GET /payment-instructions (BookingPaymentScreen) — shape público discriminado por provider,
 * mismo contrato que cuando esto vivía hardcodeado en config.ts (decisión #54). Una cuenta sin
 * cargar todavía (seed recién aplicado, admin no la completó) muestra el placeholder en vez de un
 * campo vacío/null, igual que antes con las env vars sin configurar. */
export async function getPaymentInstructions(): Promise<PaymentInstructions> {
  const rows = await paymentAccountRepository.listAll();
  const result: PaymentInstructions = { EC: [], PE: [] };

  for (const row of rows) {
    if (row.country !== 'EC' && row.country !== 'PE') continue;
    const account: PublicPaymentAccount =
      row.provider === 'bank_transfer'
        ? {
            provider: 'bank_transfer',
            label: row.label,
            bankName: row.bankName ?? PLACEHOLDER,
            accountType: row.accountType ?? PLACEHOLDER,
            accountNumber: row.accountNumber ?? PLACEHOLDER,
            accountHolderName: row.accountHolderName ?? PLACEHOLDER,
            interbankAccountNumber: row.interbankAccountNumber ?? undefined,
          }
        : { provider: row.provider, label: row.label, handle: row.handle ?? PLACEHOLDER };
    result[row.country].push(account);
  }

  return result;
}
