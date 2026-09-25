import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plane, Users, LogOut, Compass, Shield, KeyRound, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { AdminUsersModal } from './AdminUsersModal.js';
import { ChangePasswordModal } from './ChangePasswordModal.js';
import { InviteModal } from './InviteModal.js';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform">
              <Plane className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-brand-600 transition-colors">
                Trips
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                Trip Book
              </span>
            </div>
          </Link>

          {/* Nav Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-brand-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Compass className="w-4 h-4" />
              <span className="hidden md:inline">Painel de Viagens</span>
            </Link>

            {user && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors cursor-pointer"
                title="Convidar Alguém"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Convidar</span>
              </button>
            )}

            {user?.role === 'ADMIN' && (
              <button
                onClick={() => setShowUsersModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer"
                title="Gerenciar Usuários"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Usuários</span>
                <span className="bg-purple-200 text-purple-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  Admin
                </span>
              </button>
            )}

            {/* User Profile Pill */}
            {user && (
              <div className="flex items-center gap-3 pl-2 sm:pl-4 border-l border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-600 font-semibold text-xs">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-xs font-semibold text-slate-800 leading-tight">{user.name}</p>
                    <p className="text-[10px] text-slate-500 leading-tight flex items-center gap-1">
                      {user.role === 'ADMIN' ? (
                        <span className="text-purple-600 font-medium flex items-center gap-0.5">
                          <Shield className="w-2.5 h-2.5" /> Administrador
                        </span>
                      ) : (
                        'Viajante'
                      )}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="p-2 text-slate-400 hover:text-brand-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                  title="Alterar Minha Senha"
                >
                  <KeyRound className="w-4 h-4" />
                </button>

                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Sair do sistema"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Admin Users Modal */}
      {showUsersModal && <AdminUsersModal onClose={() => setShowUsersModal(false)} />}

      {/* Invite Modal for Any User */}
      {showInviteModal && <InviteModal onClose={() => setShowInviteModal(false)} />}

      {/* Self-service Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        userName={user?.name}
      />
    </>
  );
};
