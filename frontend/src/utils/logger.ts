import api from './api';

/**
 * Mencatat log aktivitas sistem (Audit Trail) ke backend secara otomatis.
 * Selalu mengambil nama operator aktif dari sesi login (localStorage.getItem('username')).
 */
export const logSystemAction = async (action: string, status: 'SUCCESS' | 'ERROR' = 'SUCCESS') => {
  try {
    const operator = localStorage.getItem('username') || 'Operator';
    await api.post('/api/logs', {
      operator,
      action,
      status
    });
  } catch (err) {
    console.error('Gagal mencatat log aktivitas:', err);
  }
};
