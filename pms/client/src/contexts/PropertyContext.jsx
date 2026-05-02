import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/index.js';

const PropertyContext = createContext({ property: null, loading: true, setProperty: () => {}, reload: () => {} });

export function PropertyProvider({ children }) {
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    api.get('/api/settings')
      .then(res => setProperty(res.data))
      .catch(() => setProperty(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <PropertyContext.Provider value={{ property, loading, setProperty, reload }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
