import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { store, persistor } from './app/store.js';
import { queryClient } from './app/queryClient.js';
import { AppBootstrap } from './app/AppBootstrap.jsx';
import { attachAuthBridge, redirectToLogin } from './api/axiosClient.js';
import { setAccessToken, clearCredentials } from './features/auth/slices/authSlice.js';
import { FullPageSpinner } from './components/common/FullPageSpinner.jsx';
import './styles/index.css';

/**
 * Connects the HTTP layer to the store without an import cycle.
 *
 * `store → slices → api → store` would be circular if axiosClient imported the store
 * directly. Injecting the three functions it actually needs keeps the transport layer
 * free of React and Redux imports entirely.
 */
attachAuthBridge({
  getAccessToken: () => store.getState().auth.accessToken,
  setAccessToken: (token) => store.dispatch(setAccessToken(token)),
  onSessionLost: (reason) => {
    store.dispatch(clearCredentials(reason));
    queryClient.clear(); // never let one user's cached data survive into another session
    redirectToLogin(reason);
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<FullPageSpinner />} persistor={persistor}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppBootstrap>
              <App />
            </AppBootstrap>
          </BrowserRouter>
        </QueryClientProvider>
      </PersistGate>
    </Provider>
  </React.StrictMode>,
);
