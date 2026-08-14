import { useRouter } from 'expo-router';
import LoginScreen from '../screens/auth/LoginScreen';

export default function Login() {
  const router = useRouter();
  return (
    <LoginScreen
      onNavigateToRegister={() => router.push('/register')}
      onNavigateToForgotPassword={() => router.push('/forgot-password')}
    />
  );
}
