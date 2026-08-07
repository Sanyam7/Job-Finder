import { FIELD_SOURCE, PARSE_STATUS } from '@verihire/shared';
import logger from '../config/logger.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { Skill } from '../models/skill.model.js';
import { parseResume } from '../services/resumeParser.service.js';
import { downloadAsset } from '../services/upload.service.js';
import { eventBus } from '../events/eventBus.js';
import { EVENTS } from '../constants/events.js';

/**
 * ★ Writes parsed values onto the profile, skipping anything the candidate typed.
 *
 * Exported and kept separate from the job so the rule can be tested against a real profile
 * document without mocking Cloudinary and the parser. The guarantee worth testing is not
 * "does it fill fields" — it is "does it leave a hand-typed value alone", because that is
 * the one that loses somebody's work when it breaks, and it only breaks on the second
 * upload, which nobody does by accident while developing.
 *
 * @param {any} profile a CandidateProfile document
 * @param {Record<string, any>} fields
 * @returns {{autofilled: string[], preserved: string[]}}
 */
export const autofillFromDraft = (profile, fields) => {
  const autofilled = [];
  const preserved = [];

  for (const [path, value] of Object.entries(fields ?? {})) {
    if (profile.isUserEdited(path)) {
      preserved.push(path);
      continue;
    }
    profile.set(path, value);
    // PARSER, not USER: the candidate has not written this, and a later parse should be
    // free to improve it. Their own edit is what promotes a path to USER and locks it.
    profile.setFieldSource(path, FIELD_SOURCE.PARSER);
    autofilled.push(path);
  }

  return { autofilled, preserved };
};

/**
 * The resume-parse job.
 *
 * ★ This job autofills the profile, which is a deliberate reversal of ADR-006's original
 * "never auto-apply" rule and supersedes it.
 *
 * The original reasoning was that a parser's guess should never be presented as the
 * candidate's own words. That still holds, and is why every autofilled path is marked
 * PARSER rather than USER, and why anything the candidate typed is never overwritten. What
 * changed is the default: an empty profile beside a filled-in resume is a form the
 * candidate has already completed once, and asking them to approve it field by field cost
 * more than it protected. They can edit every value afterwards, which is the guarantee that
 * actually mattered.
 *
 * The line the job still will not cross is a path with USER provenance. See the autofill
 * loop below.
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
     * ★ Autofill.
     *
     * Parsed values are written straight onto the profile, so uploading a resume fills the
     * form in rather than handing the candidate a second form to fill in about the first.
     * Everything stays editable afterwards — nothing here locks a field.
     *
     * ★ Except paths the candidate typed themselves.
     *
     * Those are the one thing autofill must not touch. Someone who corrected the job title
     * a parser misread, then uploaded an updated CV, would otherwise watch their correction
     * silently revert — and a re-parse of an already-parsed field is exactly when that
     * happens. `isUserEdited` is what distinguishes "we put this here" from "they wrote
     * this", and only the first is ours to overwrite. Skipped paths stay in the draft, so
     * the review screen can still offer them as an explicit side-by-side choice.
     *
     * Applied values are marked PARSER, not USER: the candidate has not written them, and
     * a later parse should be free to improve them. Their own edit is what promotes a path
     * to USER and makes it permanent.
     */
    const { autofilled, preserved } = autofillFromDraft(profile, fields);

    // Only a path the candidate must still decide about counts as pending review.
    profile.parsedDraft.appliedAt = autofilled.length ? new Date() : null;

    await profile.save();

    eventBus.emit(EVENTS.RESUME_PARSED, {
      profileId,
      userId,
      fieldCount: Object.keys(fields).length,
      autofilledCount: autofilled.length,
      engine,
    });

    logger.info('Resume parsed and autofilled', {
      profileId,
      fields: Object.keys(fields).length,
      autofilled: autofilled.length,
      preserved: preserved.length,
      ms: Date.now() - started,
    });

    return { parsed: true, fields: Object.keys(fields), autofilled, preserved };
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
