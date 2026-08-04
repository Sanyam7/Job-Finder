import { describe, it, expect } from '@jest/globals';
import { JOB_STATUS, VERIFICATION_STATUS, ACCOUNT_STATUS } from '@verihire/shared';
import { computeVisibility } from '../../src/services/job.service.js';

/**
 * ★ The truth table for the core invariant.
 *
 * If any of these ever fails, a job is either leaking to the public before it was approved,
 * or an approved job is invisible to candidates. Both break the product — the first breaks
 * the promise, the second breaks the marketplace.
 */

const future = new Date(Date.now() + 30 * 86_400_000);
const past = new Date(Date.now() - 86_400_000);

const approvedJob = { status: JOB_STATUS.APPROVED, deadline: future, deletedAt: null };
const verifiedEmployer = {
  verificationStatus: VERIFICATION_STATUS.VERIFIED,
  status: ACCOUNT_STATUS.ACTIVE,
  deletedAt: null,
};

describe('computeVisibility — the two-gate invariant', () => {
  it('publishes an approved job from a verified, active employer', () => {
    expect(computeVisibility(approvedJob, verifiedEmployer)).toBe(true);
  });

  describe('gate 2 — the job itself must be approved', () => {
    it.each([
      [JOB_STATUS.DRAFT],
      [JOB_STATUS.PENDING],
      [JOB_STATUS.REJECTED],
      [JOB_STATUS.ARCHIVED],
    ])('hides a %s job even when the employer is verified', (status) => {
      expect(computeVisibility({ ...approvedJob, status }, verifiedEmployer)).toBe(false);
    });
  });

  describe('gate 1 — the employer must be verified', () => {
    it.each([
      [VERIFICATION_STATUS.UNSUBMITTED],
      [VERIFICATION_STATUS.PENDING],
      [VERIFICATION_STATUS.REJECTED],
    ])('hides an approved job when the employer is %s', (verificationStatus) => {
      expect(
        computeVisibility(approvedJob, { ...verifiedEmployer, verificationStatus }),
      ).toBe(false);
    });

    it('hides an approved job when the employer is suspended', () => {
      expect(
        computeVisibility(approvedJob, {
          ...verifiedEmployer,
          status: ACCOUNT_STATUS.SUSPENDED,
        }),
      ).toBe(false);
    });

    it('hides an approved job when the employer is soft-deleted', () => {
      expect(
        computeVisibility(approvedJob, { ...verifiedEmployer, deletedAt: new Date() }),
      ).toBe(false);
    });

    it('hides an approved job when the employer record is missing entirely', () => {
      expect(computeVisibility(approvedJob, null)).toBe(false);
    });
  });

  describe('lifecycle guards', () => {
    it('hides a job whose deadline has passed', () => {
      expect(computeVisibility({ ...approvedJob, deadline: past }, verifiedEmployer)).toBe(false);
    });

    it('hides a job with no deadline at all', () => {
      expect(computeVisibility({ ...approvedJob, deadline: null }, verifiedEmployer)).toBe(false);
    });

    it('hides a soft-deleted job', () => {
      expect(
        computeVisibility({ ...approvedJob, deletedAt: new Date() }, verifiedEmployer),
      ).toBe(false);
    });

    it('hides when the job itself is missing', () => {
      expect(computeVisibility(null, verifiedEmployer)).toBe(false);
    });
  });

  describe('full matrix', () => {
    /**
     * Exhaustive: every combination of the four inputs. Exactly one row may be visible.
     * This is the test that would catch someone "simplifying" the predicate later.
     */
    it('is visible in exactly one of the 40 combinations', () => {
      const jobStatuses = Object.values(JOB_STATUS);
      const verifications = Object.values(VERIFICATION_STATUS);
      const employerStatuses = [ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.SUSPENDED];
      const deadlines = [future, past];

      let visibleCount = 0;

      for (const status of jobStatuses) {
        for (const verificationStatus of verifications) {
          for (const employerStatus of employerStatuses) {
            for (const deadline of deadlines) {
              const visible = computeVisibility(
                { status, deadline, deletedAt: null },
                { verificationStatus, status: employerStatus, deletedAt: null },
              );
              if (visible) {
                visibleCount += 1;
                // The only combination that may be public.
                expect(status).toBe(JOB_STATUS.APPROVED);
                expect(verificationStatus).toBe(VERIFICATION_STATUS.VERIFIED);
                expect(employerStatus).toBe(ACCOUNT_STATUS.ACTIVE);
                expect(deadline).toBe(future);
              }
            }
          }
        }
      }

      expect(visibleCount).toBe(1);
    });
  });
});
