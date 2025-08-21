
import { useAuth as useAuthContext } from '../contexts/AuthContext';

export const useAuthentication = () => {
  try {
    return useAuthContext();
  } catch (error) {
    console.warn('useAuthentication: AuthContext not available yet');
    return null;
  }
};
