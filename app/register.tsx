import { useRouter } from 'expo-router';
import RegisterScreen from '../screens/auth/RegisterScreen';

export default function Register() {
  const router = useRouter();
  return <RegisterScreen onNavigateToLogin={() => router.back()} />;
}
