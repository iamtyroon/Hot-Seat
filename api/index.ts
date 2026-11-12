import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serverApp } from '../server.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const group = req.query.group;
    const path = req.query.path;
    if (typeof group !== 'string') {
      return res.status(400).json({ error: 'Missing API route group.' });
    }

    const nestedPath = Array.isArray(path) ? path.join('/') : path;
    const forwardedQuery = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'group' || key === 'path') continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item === 'string') forwardedQuery.append(key, item);
      }
    }
    req.url = `/api/${group}${nestedPath ? `/${nestedPath}` : ''}${
      forwardedQuery.size ? `?${forwardedQuery}` : ''
    }`;

    const app = await serverApp;
    app(req, res);
  } catch (error) {
    console.error('Hot Seat API initialization failed:', error);
    res.status(500).json({ error: 'API initialization failed.' });
  }
}
