import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createQueryClient } from '@/app/query-client';
import { createAppRouter } from '@/app/router';
import { connectSession } from '@/lib/http';
import { session } from '@/lib/session';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

const queryClient = createQueryClient();
const router = createAppRouter({ queryClient, session });
connectSession(session);

createRoot(root).render(
  <StrictMode>
    <App router={router} queryClient={queryClient} />
  </StrictMode>,
);
