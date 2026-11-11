import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemStatus } from './SystemStatus';

function renderStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SystemStatus />
    </QueryClientProvider>,
  );
}

function mockFetch(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

describe('SystemStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the API version and uptime when the API is healthy', async () => {
    mockFetch(
      Response.json({
        status: 'ok',
        version: '1.4.0',
        uptimeSeconds: 3_720,
        timestamp: '2026-10-07T12:00:00.000Z',
      }),
    );

    renderStatus();

    expect(await screen.findByText('En línea')).toBeInTheDocument();
    expect(screen.getByText('1.4.0')).toBeInTheDocument();
    expect(screen.getByText('1 h 2 min')).toBeInTheDocument();
  });

  it('offers a retry when the API is unreachable', async () => {
    mockFetch(new Response(null, { status: 502 }));

    renderStatus();

    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('treats a response that breaks the shared contract as an error', async () => {
    mockFetch(Response.json({ status: 'ok' }));

    renderStatus();

    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
  });
});
