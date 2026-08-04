import { FIELD_SOURCE, PARSE_STATUS } from '@verihire/shared';
import logger from '../config/logger.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { Skill } from '../models/skill.model.js';
import { parseResume } from '../services/resumeParser.service.js';
import { downloadAsset } from '../services/upload.service.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../constants/events.js';

/**
 * The resume-parse job.
 *
 * ★ ADR-006 in executable form. This function may write to exactly two places:
 * `profile.parsedDraft` and `profile.resume.parseStatus`. It never touches a live profile
 * field — not even an empty one, and not even when the candidate has typed nothing at all.
 *
 * The same function backs the BullMQ worker and the inline fallback, so "no Redis" cannot
 * mean "different behaviour".
 *
 * @param {{profileId: string, publicId: string, format: string, userId?: string}} payload
 */
export const runResumeParse = async ({ profileId, publicId, format, userId }) => {
  const started = Date.now();

  try {
    const [buffer, taxonomy] = await Promise.all([
      downloadAsset(publicId),
      // Canonical names plus aliases, so "reactjs" in a PDF becomes "React" — the name
      // employers actually filter on.
      Skill.find({ isApproved: true }).select('name aliases').lean(),
    ]);

    const { fields, engine, textLength } = await parseResume(buffer, { format, taxonomy });

    const profile = await candidateRepository.findById(profileId, { lean: false });
    if (!profile) {
      logger.warn('Resume parse finished for a profile that no longer exists', { profileId });
      return { parsed: false, reason: 'PROFILE_GONE' };
    }

    /**
     * A resume we could not read is not a failure the candidate needs to act on beyond
     * knowing about it — most often it is a scanned image. PARSED with an empty draft would
     * show them an empty review screen with no explanation, so this is reported as FAILED
     * with a plain-language reason.
     */
    if (!Object.keys(fields).length) {
      profile.resume.parseStatus = PARSE_STATUS.FAILED;
      profile.resume.parseError =
        textLength < 50
          ? "We couldn't read any text in that file — it may be a scan or an image."
          : "We couldn't confidently identify any details in that resume.";
      await profile.save();

      eventBus.emit(EVENTS.RESUME_PARSE_FAILED, { profileId, userId, reason: 'NO_FIELDS' });
      return { parsed: false, reason: 'NO_FIELDS' };
    }

    // ★ The draft, and only the draft.
    profile.parsedDraft = {
      extractedAt: new Date(),
      engine,
      llmUsed: false,
      fields,
      appliedAt: null,
    };
    profile.resume.parseStatus = PARSE_STATUS.PARSED;
    profile.resume.parseError = null;

    /**
     * Provenance for fields the candidate has never touched.
     *
     * Marking an untouched path PARSER lets the review UI show "read from your resume"
     * without implying they wrote it. Paths already marked USER are left exactly as they
     * are — this loop is the one place a re-parse could clobber authorship, so it does not.
     */
    for (const path of Object.keys(fields)) {
      if (!profile.isUserEdited(path)) profile.setFieldSource(path, FIELD_SOURCE.PARSER);
    }

    await profile.save();

    eventBus.emit(EVENTS.RESUME_PARSED, {
      profileId,
      userId,
      fieldCount: Object.keys(fields).length,
      engine,
    });

    logger.info('Resume parsed', {
      profileId,
      fields: Object.keys(fields).length,
      ms: Date.now() - started,
    });

    return { parsed: true, fields: Object.keys(fields) };
  } catch (error) {
    const message = /** @type {Error} */ (error).message;
    logger.error('Resume parse failed', { profileId, message });

    // Record the failure on the profile so the UI can offer "try again" instead of a
    // spinner that never resolves.
    await candidateRepository
      .updateById(profileId, {
        $set: {
          'resume.parseStatus': PARSE_STATUS.FAILED,
          'resume.parseError': "We couldn't read that resume. You can fill in your profile manually.",
        },
      })
      .catch(() => {});

    eventBus.emit(EVENTS.RESUME_PARSE_FAILED, { profileId, userId, reason: message });
    throw error; // let BullMQ retry
  }
};

export default runResumeParse;
