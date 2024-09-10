import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react';
import { setupApp } from './setup';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

async function prepare() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mock-server/browser')
    return worker.start()
  }

  return Promise.resolve()
}

void prepare().then(() => {
  const root = document.getElementById('root');
  if (root === null) {
    return;
  }

  const appContext = setupApp()
  const router = createBrowserRouter(appContext.routes)

  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
      <Toaster />
    </StrictMode>
  )
})
