import { setupServer } from 'msw/node';
import { handlers } from './mswHandlers';

// Shared MSW server for the whole test suite. Individual tests override
// behavior with `server.use(...)` (see named handler factories in mswHandlers).
export const server = setupServer(...handlers);
