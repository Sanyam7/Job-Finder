import { PATTERNS } from '@verihire/shared';
import logger from '../config/logger.js';

/**
 * ★ Deterministic resume extraction (ADR-011).
 *
 * Everything here runs with no API key, no network call and no per-parse cost. An optional
 * LLM pass can *add* to the result later (`llm.service.js`), but it is never load-bearing:
 * if it is disabled, times out, or returns nonsense, the candidate still gets a usable draft.
 *
 * Two rules shape the whole file:
 *
 *  1. **Precision over recall.** A field we are unsure about is left out. Every extracted
 *     value lands in front of the candidate for approval, and a review screen full of
 *     confident nonsense is worse than a short, correct one — it trains people to click
 *     "accept all" without reading, which is exactly what ADR-006 exists to prevent.
 *  2. **Nothing here writes to a profile.** This module returns data. Storing it is the
 *     caller's job, and the only place it can be stored is `parsedDraft`.
 */

/** Section headings, in the wording resumes actually use. */
const SECTION_PATTERNS = Object.freeze({
  experience: /^(work\s+)?(experience|employment|professional\s+experience|career\s+history|work\s+history)\b/i,
  education: /^(education|academic|qualifications|academic\s+background)\b/i,
  skills: /^(technical\s+)?(skills|technologies|tech\s+stack|competencies|expertise)\b/i,
  projects: /^(projects|personal\s+projects|side\s+projects|portfolio)\b/i,
  certifications: /^(certifications?|licenses?|courses)\b/i,
  summary: /^(summary|profile|objective|about\s+me|professional\s+summary)\b/i,
  achievements: /^(achievements|accomplishments|awards|honou?rs)\b/i,
});

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const MONTH_ALT = Object.keys(MONTHS).join('|');

/** "Jan 2020 – Mar 2023", "01/2020 - Present", "2020 to 2023". */
const DATE_RANGE = new RegExp(
  `((?:${MONTH_ALT})[a-z]*\\.?\\s*\\d{4}|\\d{1,2}[/-]\\d{4}|\\d{4})` +
    `\\s*(?:–|—|-|to|until)\\s*` +
    `((?:${MONTH_ALT})[a-z]*\\.?\\s*\\d{4}|\\d{1,2}[/-]\\d{4}|\\d{4}|present|current|now|ongoing)`,
  'i',
);

/**
 * Extracts raw text from a resume buffer.
 *
 * `pdf-parse` and `mammoth` are imported lazily. Both pull in heavy dependency trees, and
 * the API process only needs them if someone uploads a resume — paying that cost at boot on
 * every replica, worker and test run is pure waste.
 *
 * @param {Buffer} buffer
 * @param {string} format 'pdf' | 'docx' | 'doc'
 * @returns {Promise<string>}
 */
export const extractText = async (buffer, format) => {
  const kind = String(format ?? '').toLowerCase().replace(/^\./, '');

  if (kind === 'pdf') {
    const { default: pdfParse } = await import('pdf-parse');
    const result = await pdfParse(buffer);
    return normaliseWhitespace(result.text ?? '');
  }

  if (kind === 'docx' || kind === 'zip') {
    const { default: mammoth } = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return normaliseWhitespace(result.value ?? '');
  }

  /**
   * Legacy `.doc` is a binary OLE format that neither library reads.
   *
   * Rather than fail the upload, we return empty text: the resume is still stored and still
   * attaches to applications, the candidate just fills in their profile by hand. Refusing
   * the file outright would be a worse trade for someone whose only CV is a 2009 Word doc.
   */
  logger.info('No text extractor for this resume format — profile fields must be entered manually', {
    format: kind,
  });
  return '';
};

/**
 * Collapses the whitespace zoo that falls out of PDF and DOCX text extraction.
 *
 * ★ Every character in these classes is written as a `\uXXXX` escape rather than typed
 * literally, and that is not a style preference. A raw non-breaking space here previously
 * arrived as the two-character sequence `U+00C2 U+00A0` — the mojibake signature of a UTF-8
 * NBSP decoded as Latin-1 and re-saved. That silently added `Â` to the character class, so
 * every `Â` in a resume was replaced with a space and names like "ÂNGELA" came out mangled.
 * Nothing threw; the parser just quietly produced wrong text. An escape sequence is pure
 * ASCII and cannot be corrupted by a re-encode.
 *
 * Exported so the escape-only rule above can be asserted directly. Reaching it through
 * `parseResume` would need a real PDF fixture, which is exactly the kind of friction that
 * leaves a silent bug like this one untested for a second time.
 *
 * @param {string} text
 */
export const normaliseWhitespace = (text) =>
  text
    .replace(/\r\n?/g, '\n')
    // Tab, NBSP, and the narrow/thin/ideographic spaces PDF extractors emit between glyphs.
    .replace(/[\t\u00A0\u2000-\u200A\u202F\u205F\u3000]+/g, ' ')
    // Zero-width characters are removed outright: they are invisible, they break every
    // subsequent word boundary, and no resume ever meant to contain one.
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Splits the document into labelled sections.
 * @param {string} text
 * @returns {Record<string, string[]>}
 */
export const splitSections = (text) => {
  const lines = text.split('\n').map((l) => l.trim());
  /** @type {Record<string, string[]>} */
  const sections = { header: [] };
  let current = 'header';

  for (const line of lines) {
    if (!line) continue;

    // A heading is short and matches a known label — "Experience", not a sentence that
    // happens to contain the word.
    const matched = line.length <= 40
      ? Object.entries(SECTION_PATTERNS).find(([, pattern]) => pattern.test(line))
      : null;

    if (matched) {
      current = matched[0];
      sections[current] ??= [];
      continue;
    }

    sections[current] ??= [];
    sections[current].push(line);
  }

  return sections;
};

/* ------------------------------------------------------------------ fields */

/** @param {string} text */
export const extractEmail = (text) => {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match && PATTERNS.EMAIL.test(match[0]) ? match[0].toLowerCase() : null;
};

/**
 * Phone numbers, with a deliberate bias against false positives.
 *
 * Resumes are full of digit runs that are not phone numbers — years, postcodes, scores,
 * "99.2% uptime". Requiring 10–13 digits and rejecting anything that looks like a bare year
 * range removes most of them.
 *
 * @param {string} text
 */
export const extractPhone = (text) => {
  const candidates = text.match(/(\+?\d[\d\s().-]{8,}\d)/g) ?? [];

  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) continue;
    if (/^(19|20)\d{2}(19|20)\d{2}$/.test(digits)) continue; // "20202023" — a date range
    return raw.trim().replace(/\s{2,}/g, ' ');
  }
  return null;
};

/** @param {string} text */
export const extractLinks = (text) => {
  const links = {};

  const linkedin = text.match(/(?:https?:\/\/)?(?:[\w]+\.)?linkedin\.com\/in\/[\w-]+/i);
  if (linkedin) links.linkedin = ensureProtocol(linkedin[0]);

  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i);
  if (github) links.github = ensureProtocol(github[0]);

  // Any other URL becomes the portfolio guess — but never a social profile we already have.
  const urls = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  const portfolio = urls.find(
    (u) => !/linkedin\.com|github\.com|twitter\.com|x\.com|mailto:/i.test(u),
  );
  if (portfolio) links.portfolio = portfolio.replace(/[.,;]$/, '');

  return links;
};

/** @param {string} url */
const ensureProtocol = (url) => (url.startsWith('http') ? url : `https://${url}`);

/**
 * The headline: the professional title, usually the line just under the name.
 * @param {string[]} headerLines
 */
export const extractHeadline = (headerLines = []) => {
  const ROLE_WORDS =
    /(engineer|developer|designer|manager|analyst|architect|consultant|scientist|lead|director|specialist|administrator|intern)/i;

  // Skip line 0 — that is the name. Look at the next few for something role-shaped.
  for (const line of headerLines.slice(1, 6)) {
    if (line.length > 90 || line.length < 5) continue;
    if (line.includes('@') || /^\+?\d/.test(line)) continue; // contact lines
    if (ROLE_WORDS.test(line)) return line.replace(/\s*[|·•]\s*.*$/, '').trim();
  }
  return null;
};

/**
 * Skills from the skills section.
 *
 * Only that section is used. Scanning the whole document for known skill names produces
 * "SQL" from "no SQL experience required" and similar — and every false positive here ends
 * up in front of an employer as something the candidate claimed.
 *
 * @param {string[]} skillLines
 * @param {{name: string, aliases?: string[]}[]} [taxonomy] the Skill collection
 */
export const extractSkills = (skillLines = [], taxonomy = []) => {
  if (!skillLines.length) return [];

  /**
   * Alias → canonical name.
   *
   * "ReactJS", "React.js" and "React" must all resolve to the one name employers filter on,
   * or the candidate's skills silently fail to match any job's requirements — a bug that
   * looks like "there are no jobs for me" rather than like a bug.
   */
  const canonical = new Map();
  for (const skill of taxonomy) {
    canonical.set(skill.name.toLowerCase(), skill.name);
    for (const alias of skill.aliases ?? []) canonical.set(String(alias).toLowerCase(), skill.name);
  }

  const tokens = skillLines
    .join(', ')
    // Strip "Languages:" style prefixes so the label is not read as a skill.
    .replace(/^[A-Za-z /&]{3,25}:/gm, '')
    .split(/[,;|•·\n]+/)
    .map((t) => t.trim().replace(/^[-–—*]\s*/, ''))
    .filter(Boolean);

  const seen = new Set();
  const skills = [];

  for (const token of tokens) {
    if (token.length < 2 || token.length > 40) continue;
    if (/^\d+$/.test(token)) continue;
    // More than four words is a sentence, not a skill.
    if (token.split(/\s+/).length > 4) continue;

    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    skills.push({ name: canonical.get(key) ?? token });
    if (skills.length >= 40) break;
  }

  return skills;
};

/**
 * Work history.
 *
 * Anchored on date ranges rather than on layout: a date range is the one element every
 * resume format agrees on, whereas "company on the left, dates on the right" survives
 * exactly one PDF-to-text conversion out of three.
 *
 * @param {string[]} lines
 */
export const extractExperience = (lines = []) => {
  const entries = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(DATE_RANGE);
    if (!match) continue;

    const { startDate, endDate, isCurrent } = parseDateRange(match[1], match[2]);
    if (!startDate) continue;

    // The role and company are on the date line itself or the line just above it.
    const dateLineRest = lines[i].replace(match[0], '').replace(/[|·•,-]\s*$/, '').trim();
    const contextLine = i > 0 ? lines[i - 1] : '';
    const context = [dateLineRest, contextLine].filter((s) => s && s.length <= 120);

    const { title, company } = splitTitleAndCompany(context);
    if (!title && !company) continue;

    entries.push({
      title: title ?? 'Role',
      company: company ?? 'Company',
      startDate,
      endDate: isCurrent ? null : endDate,
      isCurrent,
      description: collectBullets(lines, i + 1),
    });

    if (entries.length >= 15) break;
  }

  return entries;
};

/**
 * "Senior Engineer at Acme" / "Senior Engineer, Acme" / "Senior Engineer | Acme"
 * @param {string[]} context
 */
const splitTitleAndCompany = (context) => {
  for (const line of context) {
    const at = line.split(/\s+(?:at|@|·|\||,)\s+/);
    if (at.length >= 2 && at[0].length <= 80) {
      return { title: at[0].trim(), company: at[1].trim().replace(/[.,;]$/, '') };
    }
  }
  const first = context.find(Boolean);
  return { title: first?.trim() ?? null, company: null };
};

/**
 * @param {string[]} lines
 * @param {number} from
 */
const collectBullets = (lines, from) => {
  const bullets = [];
  for (let i = from; i < Math.min(from + 8, lines.length); i += 1) {
    const line = lines[i];
    if (!line || DATE_RANGE.test(line)) break; // the next role has started
    if (/^[-–—*•]\s+/.test(line) || line.length > 40) {
      bullets.push(line.replace(/^[-–—*•]\s+/, ''));
    }
  }
  return bullets.join(' ').slice(0, 2000) || null;
};

/**
 * @param {string} rawStart
 * @param {string} rawEnd
 */
const parseDateRange = (rawStart, rawEnd) => {
  const isCurrent = /present|current|now|ongoing/i.test(rawEnd);
  return {
    startDate: parseLooseDate(rawStart),
    endDate: isCurrent ? null : parseLooseDate(rawEnd),
    isCurrent,
  };
};

/** @param {string} value */
const parseLooseDate = (value) => {
  if (!value) return null;
  const text = value.trim().toLowerCase();

  const monthYear = text.match(new RegExp(`^(${MONTH_ALT})[a-z]*\\.?\\s*(\\d{4})$`));
  if (monthYear) return new Date(Date.UTC(Number(monthYear[2]), MONTHS[monthYear[1]], 1));

  const numeric = text.match(/^(\d{1,2})[/-](\d{4})$/);
  if (numeric) return new Date(Date.UTC(Number(numeric[2]), Number(numeric[1]) - 1, 1));

  const year = text.match(/^(\d{4})$/);
  if (year) {
    const y = Number(year[1]);
    // A "year" outside this range is a product version or a postcode, not a date.
    if (y < 1950 || y > new Date().getFullYear() + 1) return null;
    return new Date(Date.UTC(y, 0, 1));
  }

  return null;
};

/** @param {string[]} lines */
export const extractEducation = (lines = []) => {
  const DEGREE =
    /(b\.?tech|m\.?tech|b\.?e\b|m\.?e\b|b\.?sc|m\.?sc|b\.?a\b|m\.?a\b|bca|mca|mba|ph\.?d|bachelor|master|diploma|associate)/i;

  const entries = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!DEGREE.test(lines[i])) continue;

    const years = lines.slice(i, i + 3).join(' ').match(/(19|20)\d{2}/g) ?? [];
    const institution =
      lines.slice(i, i + 3).find((l) => /(university|college|institute|school|academy)/i.test(l)) ??
      null;

    entries.push({
      degree: lines[i].split(/[,|·]/)[0].trim().slice(0, 120),
      fieldOfStudy: lines[i].match(/in\s+([A-Za-z& ]{3,60})/i)?.[1]?.trim() ?? null,
      institution: institution?.trim().slice(0, 150) ?? 'Not specified',
      startYear: years.length >= 2 ? Number(years[0]) : null,
      endYear: years.length >= 2 ? Number(years[1]) : years.length === 1 ? Number(years[0]) : null,
    });

    if (entries.length >= 8) break;
  }

  return entries;
};

/**
 * Total experience, summed from the extracted roles.
 *
 * Overlapping roles are merged rather than added: someone who freelanced while employed has
 * not worked two jobs' worth of years, and doubling their experience would be a
 * material misrepresentation on a hiring platform.
 *
 * @param {{startDate: Date, endDate: Date|null, isCurrent: boolean}[]} experience
 */
export const computeTotalExperienceMonths = (experience = []) => {
  const intervals = experience
    .filter((e) => e.startDate)
    .map((e) => ({
      start: new Date(e.startDate).getTime(),
      end: (e.isCurrent || !e.endDate ? new Date() : new Date(e.endDate)).getTime(),
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  if (!intervals.length) return 0;

  const merged = [intervals[0]];
  for (const interval of intervals.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push(interval);
  }

  const totalMs = merged.reduce((sum, i) => sum + (i.end - i.start), 0);
  return Math.min(Math.round(totalMs / (30.44 * 86_400_000)), 720);
};

/* ------------------------------------------------------------------- parse */

/**
 * ★ Parses a resume into a draft.
 *
 * Returns a flat `{dotPath: value}` map, which is exactly the shape `parsedDraft.fields`
 * stores and the review screen renders. Paths whose extraction produced nothing are simply
 * absent — never present-and-null, which the UI would have to render as "we found: nothing".
 *
 * @param {Buffer} buffer
 * @param {{format: string, taxonomy?: {name: string, aliases?: string[]}[]}} opts
 * @returns {Promise<{fields: Record<string, any>, engine: string, textLength: number}>}
 */
export const parseResume = async (buffer, { format, taxonomy = [] }) => {
  const text = await extractText(buffer, format);

  if (!text || text.length < 50) {
    // A scanned photo of a CV extracts to nothing. That is not an error — it is a document
    // we cannot read, and the candidate should be told exactly that.
    return { fields: {}, engine: 'deterministic', textLength: text.length };
  }

  const sections = splitSections(text);
  const header = sections.header ?? [];

  const experience = extractExperience(sections.experience ?? []);
  const education = extractEducation(sections.education ?? []);
  const skills = extractSkills(sections.skills ?? [], taxonomy);
  const links = extractLinks(text);
  const headline = extractHeadline(header);
  const bio = (sections.summary ?? []).join(' ').slice(0, 2000) || null;

  /** @type {Record<string, any>} */
  const fields = {};

  if (headline) fields.headline = headline;
  if (bio && bio.length >= 40) fields.bio = bio;
  if (skills.length) fields.skills = skills;
  if (experience.length) fields.experience = experience;
  if (education.length) fields.education = education;
  if (Object.keys(links).length) fields.links = links;

  if (experience.length) {
    const months = computeTotalExperienceMonths(experience);
    if (months > 0) fields.totalExperienceMonths = months;

    const current = experience.find((e) => e.isCurrent);
    if (current) {
      fields.currentCompany = current.company;
      fields.currentDesignation = current.title;
    }
  }

  /**
   * Email and phone are extracted but NOT offered as profile fields.
   *
   * The account already has a verified email and the candidate's own phone number. Letting a
   * PDF overwrite a verified contact address would break account recovery and hand an
   * attacker a path to it via a crafted upload.
   */
  logger.debug('Resume parsed', {
    textLength: text.length,
    fields: Object.keys(fields),
    contactFound: { email: Boolean(extractEmail(text)), phone: Boolean(extractPhone(text)) },
  });

  return { fields, engine: 'deterministic', textLength: text.length };
};

export default { parseResume, extractText, splitSections, computeTotalExperienceMonths };
