import { hc } from 'hono/client';
import type { AppType } from '../../../backend/src/index';

// End-to-end type-safe Hono RPC client
export const api = hc<AppType>(import.meta.env.VITE_API_URL || '/');
