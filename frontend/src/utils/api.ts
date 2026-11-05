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

// <video src> dan <a href> tidak bisa membawa header Authorization, jadi URL yang
// dibuka langsung oleh browser membawa token lewat query string.
export const withToken = (url: string): string => {
  const token = localStorage.getItem('token');
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};

export default api;
