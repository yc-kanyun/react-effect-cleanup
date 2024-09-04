import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react';
import { setupApp } from './setup';
import { createHashRouter, RouterProvider } from 'react-router-dom';

(() => {
  const root = document.getElementById('root');
  if (root === null) {
    return;
  }

  const appContext = setupApp()
  const router = createHashRouter(appContext.routes)

  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
})();
