import React, { useState } from 'react';
import axios from 'axios';

import type { LoginResponse } from '../types/auth';

interface LoginProps {
  onLoginSuccess: (username: string, role: 'ADMIN' | 'OPERATOR') => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      const response = await axios.post<LoginResponse>('http://localhost:8000/api/auth/login', {
        username,
        password
      });

      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('role', response.data.role);
      localStorage.setItem('username', response.data.username);

      // Panggil fungsi callback pembuka gerbang App.tsx milikmu
      onLoginSuccess(response.data.username, response.data.role);
    } catch (error: unknown) {
      // === PERBAIKAN: Hindari penggunaan type 'any' untuk mematuhi ESLint ===
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.detail || 'Gagal login, periksa kembali akun operator';
        setErrorMsg(message);
      } else {
        setErrorMsg('Terjadi kesalahan koneksi sistem');
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleLogin} className="p-8 bg-white shadow-lg rounded-lg w-96">
        <h2 className="text-2xl mb-6 font-bold text-center text-gray-800">Mikroskop Digital Login</h2>
        
        {errorMsg && (
          <div className="mb-4 p-2 text-sm text-red-600 bg-red-100 rounded text-center">
            {errorMsg}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">ID Operator</label>
          <input 
            className="border rounded p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="text" 
            placeholder="Masukkan username/ID" 
            value={username}
            onChange={(e) => setUsername(e.target.value)} 
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-600 mb-1">Password</label>
          <input 
            className="border rounded p-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="password" 
            placeholder="••••••••" 
            value={password}
            onChange={(e) => setPassword(e.target.value)} 
            required
          />
        </div>

        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium p-2 rounded w-full transition-colors">
          Masuk Ke Sistem
        </button>
      </form>
    </div>
  );
};

export default Login;