import { useRouter } from 'expo-router';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

export default function ForgotPassword() {
  const router = useRouter();
  // replace en vez de back(): esta pantalla puede abrirse directo por URL (sin haber pasado
  // por login antes), y ahí router.back() no tiene ningún historial que hacer pop.
  return (
    <ForgotPasswordScreen onSuccess={() => router.replace('/login')} onNavigateToLogin={() => router.replace('/login')} />
  );
}
