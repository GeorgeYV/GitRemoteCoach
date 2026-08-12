import { useLocalSearchParams } from 'expo-router';
import { ParentBookingFlow } from '../screens/previewFlows';

export default function TrainersRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId?: string }>();
  return <ParentBookingFlow initialTournamentId={tournamentId} />;
}
