import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react';
import 'virtual:uno.css'

(() => {
  const root = document.getElementById('root');
  if (root === null) {
    return;
  }

  createRoot(root).render(
    <StrictMode>
      <div>Hello world!</div>
    </StrictMode>
  )
})();
