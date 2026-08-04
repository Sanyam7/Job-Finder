import { ROLES, ERROR_CODES } from '@verihire/shared';
import { userRepository } from '../repositories/user.repository.js';
import { NotFoundError } from '../errors/index.js';
import { MESSAGES } from '../constants/messages.js';

/**
 * Builds the role-specific context the SPA needs to render the correct shell.
 *
 * An employer's verification status is fetched here rather than embedded in the JWT: it
 * changes the moment an admin acts, and a claim baked into a 15-minute token would leave a
 * just-suspended employer with a working "Post a job" button. It also means the client can
 * render the locked dashboard without a second round-trip after login.
 *
 * @param {any} user
 * @returns {Promise<Record<string, any>>}
 */
export const buildSessionContext = async (user) => {
  if (!user) return {};
  const userId = String(user._id ?? user.id);

  if (user.role === ROLES.EMPLOYER) {
    // Imported lazily so Phase 1 (auth) does not hard-depend on Phase 2 models being
    // registered — the repository is only reachable once the profile module exists.
    const { employerRepository } = await import('../repositories/employer.repository.js').catch(
      () => ({ employerRepository: null }),
    );
    if (!employerRepository) return {};

    const employer = await employerRepository.findByOwner(userId, {
      select: '_id verificationStatus status companyName slug logo',
    });

    return {
      employerId: employer ? String(employer._id) : null,
      employerVerificationStatus: employer?.verificationStatus ?? null,
      employerStatus: employer?.status ?? null,
      companyName: employer?.companyName ?? null,
      companySlug: employer?.slug ?? null,
      companyLogo: employer?.logo?.url ?? null,
    };
  }

  if (user.role === ROLES.CANDIDATE) {
    const { candidateRepository } = await import('../repositories/candidate.repository.js').catch(
      () => ({ candidateRepository: null }),
    );
    if (!candidateRepository) return {};

    const profile = await candidateRepository.findByUser(userId, {
      select: '_id profileCompleteness resume openToWork',
    });

    return {
      candidateId: profile ? String(profile._id) : null,
      hasResume: Boolean(profile?.resume?.publicId),
      profileCompleteness: profile?.profileCompleteness ?? 0,
      openToWork: profile?.openToWork ?? false,
    };
  }

  return {};
};

/**
 * @param {string} userId
 * @returns {Promise<{user: any, context: Record<string, any>}>}
 */
export const getAccount = async (userId) => {
  const user = await userRepository.findById(userId, { lean: false });
  if (!user || user.deletedAt) {
    throw new NotFoundError(ERROR_CODES.USER_NOT_FOUND, MESSAGES.USER.NOT_FOUND);
  }
  const context = await buildSessionContext(user);
  return { user, context };
};

/**
 * @param {string} userId
 * @param {{firstName?: string, lastName?: string, phone?: string}} dto
 */
export const updateAccount = async (userId, dto) => {
  const user = await userRepository.updateById(userId, dto, { lean: false });
  if (!user) throw new NotFoundError(ERROR_CODES.USER_NOT_FOUND, MESSAGES.USER.NOT_FOUND);
  return user;
};

export default { buildSessionContext, getAccount, updateAccount };
