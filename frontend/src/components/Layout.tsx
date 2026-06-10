import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-lg text-indigo-600">Budget</span>
          <NavLink
            to="/"
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            Accounts
          </NavLink>
          <NavLink
            to="/currencies"
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            Currencies
          </NavLink>
          <NavLink
            to="/categories"
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            Categories
          </NavLink>
          <NavLink
            to="/reports"
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            Reports
          </NavLink>
          <NavLink
            to="/data"
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            Data
          </NavLink>
        </div>
        <div className="flex items-center gap-4">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900'}`
            }
          >
            {user?.username}
          </NavLink>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
