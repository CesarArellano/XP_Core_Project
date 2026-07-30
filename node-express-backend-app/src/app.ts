import cors from 'cors';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';

import healthRouter from './routes/health.ts';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/health', healthRouter);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}
