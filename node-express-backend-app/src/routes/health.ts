import { Router } from 'express';

import { getHealthStatus } from './health.service.ts';

const router = Router();

router.get('/', (req, res) => {
  res.json(getHealthStatus());
});

export default router;
