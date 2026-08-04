import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import publicRoutes from './public.routes.js';
import candidateRoutes from './candidate.routes.js';
import employerRoutes from './employer.routes.js';
import jobRoutes from './job.routes.js';
import applicationRoutes from './application.routes.js';
import notificationRoutes from './notification.routes.js';
import bookmarkRoutes from './bookmark.routes.js';
import adminRoutes from './admin.routes.js';

/**
 * API v1.
 *
 * Versioning at the path root (ADR-010) means a future `/api/v2` can mount beside this one
 * and deployed clients keep working while they migrate.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Unauthenticated surface — every route composes a gate filter in its repository.
router.use('/public', publicRoutes);

router.use('/candidates', candidateRoutes);
router.use('/employers', employerRoutes);
router.use('/jobs', jobRoutes);
router.use('/applications', applicationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/bookmarks', bookmarkRoutes);
router.use('/admin', adminRoutes);

export default router;
