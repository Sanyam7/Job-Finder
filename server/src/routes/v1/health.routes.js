import { Router } from 'express';
import { liveness, readiness } from '../../controllers/health.controller.js';

const router = Router();

router.get('/', liveness);
router.get('/ready', readiness);

export default router;
