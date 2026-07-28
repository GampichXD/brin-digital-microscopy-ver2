import axios from 'axios';

/**
 * Mencatat log aktivitas sistem (Audit Trail) ke backend secara otomatis.
 * Selalu mengambil nama operator aktif dari sesi login (localStorage.getItem('username')).
 */
export const logSystemAction = async (action: string, status: 'SUCCESS' | 'ERROR' = 'SUCCESS') => {
  try {
    const operator = localStorage.getItem('username') || 'Operator';
    await axios.post('http://localhost:8000/api/logs', {
      operator,
      action,
      status
    });
  } catch (err) {
    console.error('Gagal mencatat log aktivitas:', err);
  }
};
