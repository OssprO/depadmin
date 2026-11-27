import type { Notice, NoticesResponse } from '@depadmin/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '@/lib/http';
import { fakeApi, owner501, problem, sessionFor, tenant302 } from '@/test/fake-api';
import { renderApp } from '@/test/render-app';

const water: Notice = {
  id: '3f1e2a7c-5b10-4d9c-8b7a-0b9d8f5e7c2a',
  title: 'Corte de agua',
  body: 'El jueves de 9 a 14.\nLlenen sus tinacos.',
  expiresOn: '2026-12-03',
  publishedAt: '2026-12-01T16:00:00.000Z',
  author: { role: 'OWNER', unit: 401 },
  current: true,
  read: false,
};

const meeting: Notice = {
  ...water,
  id: '8a5f1e2d-3c4b-4a60-9e8d-7f3c2b1a4c6b',
  title: 'Junta de vecinos',
  body: 'El sábado a las 10, en el patio.',
  expiresOn: null,
  author: { role: 'SUPERADMIN' },
  read: true,
};

const painting: Notice = {
  ...water,
  id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  title: 'Pintura del pasillo',
  expiresOn: '2026-11-20',
  current: false,
};

const board = (canPublish: boolean, notices: Notice[]): NoticesResponse => ({
  canPublish,
  notices,
  unread: notices.filter((notice) => notice.current && !notice.read).length,
});

describe('NoticesPage', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('shows the current notices, then the earlier ones, and marks the new ones read', async () => {
    let notices = [water, meeting, painting];
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(tenant302),
      'GET /api/notices': () => Response.json(board(false, notices)),
      'POST /api/notices/read': () => {
        notices = notices.map((notice) => ({ ...notice, read: true }));
        return new Response(null, { status: 204 });
      },
    });
    renderApp('/notices');

    const current = await screen.findByRole('region', { name: 'Vigentes' });
    const [first, second] = within(current).getAllByRole('article');
    expect(first).toHaveAccessibleName('Corte de agua Nuevo');
    expect(first).toHaveTextContent(
      'Depto 401 · 1 de diciembre de 2026 · vigente hasta el 3 de diciembre de 2026',
    );
    expect(within(first!).getByText(/El jueves de 9 a 14\.\s+Llenen sus tinacos\./)).toHaveClass(
      'whitespace-pre-line',
    );
    expect(second).toHaveAccessibleName('Junta de vecinos');
    expect(second).toHaveTextContent('Superadmin · 1 de diciembre de 2026');
    const earlier = within(screen.getByRole('region', { name: 'Anteriores' })).getByRole('article');
    expect(earlier).toHaveAccessibleName('Pintura del pasillo Nuevo');
    expect(earlier).toHaveTextContent('· hasta el 20 de noviembre de 2026');

    await waitFor(() => expect(api.callsTo('POST /api/notices/read')).toHaveLength(1));
    expect(api.callsTo('POST /api/notices/read')[0]?.body).toEqual({
      ids: [water.id, painting.id],
    });
    // Read now, they keep their «Nuevo» while the screen is open.
    await waitFor(() => expect(api.callsTo('GET /api/notices')).toHaveLength(2));
    expect(first).toHaveAccessibleName('Corte de agua Nuevo');
    expect(screen.queryByRole('button', { name: 'Publicar aviso' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retirar/ })).not.toBeInTheDocument();
  });

  it('says when there is nothing, and marks nothing', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(tenant302),
      'GET /api/notices': () => Response.json(board(false, [meeting])),
    });
    renderApp('/notices');

    expect(await screen.findByRole('article')).toHaveAccessibleName('Junta de vecinos');
    expect(screen.queryByRole('region', { name: 'Anteriores' })).not.toBeInTheDocument();
    expect(api.callsTo('POST /api/notices/read')).toEqual([]);
  });

  it('lets the shift administrator publish a notice, warned that it goes by email', async () => {
    let notices: Notice[] = [];
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/notices': () => Response.json(board(true, notices)),
      'POST /api/notices': () => {
        notices = [{ ...water, read: true }];
        return Response.json(notices[0], { status: 201 });
      },
    });
    renderApp('/notices');

    expect(await screen.findByText('No hay avisos vigentes.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }));
    const form = await screen.findByRole('dialog', { name: 'Publicar aviso' });
    expect(form).toHaveTextContent('no escribas importes ni nombres');
    await userEvent.click(within(form).getByRole('button', { name: 'Publicar' }));
    expect(within(form).getByText('Escribe un título')).toBeInTheDocument();
    expect(within(form).getByText('Escribe el aviso')).toBeInTheDocument();
    expect(api.callsTo('POST /api/notices')).toEqual([]);

    await userEvent.type(within(form).getByLabelText('Título'), ' Corte de agua ');
    await userEvent.type(
      within(form).getByLabelText('Aviso'),
      'El jueves de 9 a 14.{enter}Llenen sus tinacos.',
    );
    await userEvent.type(within(form).getByLabelText('Vigente hasta (opcional)'), '2026-12-03');
    await userEvent.click(within(form).getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.callsTo('POST /api/notices')[0]?.body).toEqual({
      title: 'Corte de agua',
      body: 'El jueves de 9 a 14.\nLlenen sus tinacos.',
      expiresOn: '2026-12-03',
    });
    expect(await screen.findByRole('article')).toHaveAccessibleName('Corte de agua');
  });

  it('withdraws a notice after asking, and says why it could not', async () => {
    const api = fakeApi({
      'POST /api/auth/refresh': sessionFor(owner501),
      'GET /api/notices': () => Response.json(board(true, [meeting])),
      [`DELETE /api/notices/${meeting.id}`]: () => problem(404, 'NOTICE_NOT_FOUND'),
    });
    renderApp('/notices');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Retirar el aviso «Junta de vecinos»' }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: '¿Retirar el aviso?' });
    expect(dialog).toHaveTextContent('El correo que ya salió no se puede recoger.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, retirar' }));

    expect(await within(dialog).findByText(/quizá alguien lo retiró/)).toBeInTheDocument();
    expect(api.callsTo(`DELETE /api/notices/${meeting.id}`)).toHaveLength(1);
  });
});

describe('the notices elsewhere', () => {
  afterEach(() => {
    connectSession(null);
    vi.unstubAllGlobals();
  });

  it('shows the new ones on the home, a tap from the screen', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(tenant302),
      'GET /api/notices': () => Response.json(board(false, [water, meeting, painting])),
    });
    const { router } = renderApp('/');

    const card = await screen.findByRole('region', { name: 'Aviso nuevo' });
    const link = within(card).getByRole('link');
    expect(link).toHaveTextContent('Corte de agua');
    expect(link).toHaveTextContent('Depto 401 · 1 de diciembre de 2026');
    await userEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe('/notices'));
  });

  it('shows nothing on the home when everything was read', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(tenant302),
      'GET /api/notices': () => Response.json(board(false, [meeting])),
    });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: /^Hola/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /^Avisos? nuevos?$/ })).toBeNull(),
    );
  });

  it('counts the unread ones in «Más»', async () => {
    fakeApi({
      'POST /api/auth/refresh': sessionFor(tenant302),
      'GET /api/notices': () =>
        Response.json(board(false, [water, { ...meeting, read: false }, painting])),
    });
    renderApp('/more');

    expect(await screen.findByRole('link', { name: /^Avisos, 2 avisos sin leer/ })).toHaveAttribute(
      'href',
      '/notices',
    );
  });

  it('counts them in the side menu from a tablet up', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(min-width: 48rem)',
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    fakeApi({
      'POST /api/auth/refresh': sessionFor(tenant302),
      'GET /api/notices': () => Response.json(board(false, [water, meeting])),
    });
    renderApp('/tools');

    const menu = await screen.findByRole('navigation', { name: 'Principal' });
    expect(
      await within(menu).findByRole('link', { name: 'Avisos, 1 aviso sin leer' }),
    ).toHaveAttribute('href', '/notices');
  });
});
