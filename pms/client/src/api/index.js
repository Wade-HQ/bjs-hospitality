import axios from 'axios';

const api = axios.create({
  baseURL: '',
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't redirect during auth-check calls — AuthContext handles those itself
    const url = error.config?.url || '';
    const isAuthCheck = url.includes('/api/auth/me') || url.includes('/api/auth/sso');
    if (error.response?.status === 401 && !isAuthCheck && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
