import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Screens load on demand (lazyRouteComponent): the first spec to open one also waits for its
// module, which can take more than the default second when every package's tests run at once.
configure({ asyncUtilTimeout: 3000 });

// jsdom has no layout; the router's scroll restoration calls this on every navigation.
window.scrollTo = () => undefined;

afterEach(() => {
  cleanup();
});
