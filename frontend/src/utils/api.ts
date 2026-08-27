import axios from 'axios';

// Konfigurasi instance Axios pusat
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 120000,
});

// Interceptor untuk menyuntikkan Token JWT secara otomatis ke setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;
