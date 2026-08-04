import { RefreshToken } from '../models/refreshToken.model.js';
import { VerificationToken } from '../models/verificationToken.model.js';
import { hashToken } from '../utils/crypto.util.js';

class TokenRepository {
  /* ------------------------------------------------------------- refresh tokens */

  /**
   * @param {{user: string, tokenHash: string, family: string, expiresAt: Date,
   *          ip?: string, userAgent?: string, device?: string}} data
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   */
  async createRefreshToken(data, opts = {}) {
    const [doc] = await RefreshToken.create([data], { session: opts.session });
    return doc;
  }

  /**
   * Looks a token up by its hash. The raw token is never stored, so this is the only way
   * to resolve one — a database leak yields nothing replayable.
   * @param {string} rawToken
   */
  findRefreshByRaw(rawToken) {
    return RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  }

  /**
   * @param {string} id
   * @param {{reason: string, replacedBy?: string|null}} payload
   * @param {{session?: import('mongoose').ClientSession}} [opts]
   */
  revokeRefreshToken(id, { reason, replacedBy = null }, opts = {}) {
    return RefreshToken.findByIdAndUpdate(
      id,
      { revokedAt: new Date(), revokedReason: reason, replacedBy },
      { new: true, session: opts.session },
    );
  }

  /**
   * ★ Reuse detection response — kills every descendant of one login at once.
   *
   * When a revoked token is presented we cannot distinguish the victim from the attacker,
   * so both are logged out and the user is alerted. A stolen refresh token therefore buys
   * at most one use rather than indefinite access.
   *
   * @param {string} family
   * @param {string} [reason]
   */
  revokeFamily(family, reason = 'REUSE_DETECTED') {
    return RefreshToken.updateMany(
      { family, revokedAt: null },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  /**
   * @param {string} userId
   * @param {string} [reason]
   * @param {{exceptId?: string}} [opts]
   */
  revokeAllForUser(userId, reason = 'LOGOUT_ALL', { exceptId } = {}) {
    return RefreshToken.updateMany(
      {
        user: userId,
        revokedAt: null,
        ...(exceptId ? { _id: { $ne: exceptId } } : {}),
      },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  /** @param {string} userId */
  findActiveSessions(userId) {
    return RefreshToken.find({
      user: userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort('-createdAt')
      .lean();
  }

  /** @param {string} id @param {string} userId */
  findSessionForUser(id, userId) {
    return RefreshToken.findOne({ _id: id, user: userId });
  }

  purgeExpiredRefreshTokens() {
    return RefreshToken.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        { revokedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    });
  }

  /* -------------------------------------------------------- verification tokens */

  /**
   * @param {{user: string, tokenHash: string, type: string, expiresAt: Date, ip?: string}} data
   */
  createVerificationToken(data) {
    return VerificationToken.create(data);
  }

  /**
   * @param {string} rawToken
   * @param {string} type
   */
  findVerificationByRaw(rawToken, type) {
    return VerificationToken.findOne({ tokenHash: hashToken(rawToken), type });
  }

  /** @param {string} id */
  markVerificationUsed(id) {
    return VerificationToken.findByIdAndUpdate(id, { usedAt: new Date() }, { new: true });
  }

  /**
   * Invalidates outstanding tokens of a type before issuing a new one, so "resend link"
   * cannot leave several valid reset links alive at once.
   * @param {string} userId
   * @param {string} type
   */
  invalidateVerificationTokens(userId, type) {
    return VerificationToken.updateMany(
      { user: userId, type, usedAt: null },
      { usedAt: new Date() },
    );
  }

  purgeExpiredVerificationTokens() {
    return VerificationToken.deleteMany({ expiresAt: { $lt: new Date() } });
  }
}

export const tokenRepository = new TokenRepository();
export default tokenRepository;
