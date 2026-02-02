import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const AppLayout = ({ children }) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <header className="flex items-center justify-between px-8 py-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
            <span className="text-white font-bold text-sm">O</span>
          </div>
          <span className="text-lg font-semibold text-slate-900">Obligo</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-8 py-12">
        {children}
      </main>
    </div>
  );
};
