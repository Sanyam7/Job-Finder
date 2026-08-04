import { describe, it, expect } from '@jest/globals';
import {
  extractEmail,
  extractPhone,
  extractLinks,
  extractHeadline,
  extractSkills,
  extractExperience,
  extractEducation,
  computeTotalExperienceMonths,
  splitSections,
  normaliseWhitespace,
} from '../../src/services/resumeParser.service.js';

/**
 * The deterministic parser, in isolation.
 *
 * These run with no database, no network and no API key — which is the point of ADR-011:
 * the extraction that ships must work for a self-hosted deployment with no LLM budget.
 *
 * Most cases below are *negative*. Precision matters more than recall here, because every
 * extracted value is shown to the candidate for approval, and a review screen full of
 * confident nonsense trains people to click "accept" without reading it.
 */

/**
 * ★ Regression cover for the mojibake bug.
 *
 * The whitespace class in `normaliseWhitespace` once contained a literal non-breaking space
 * that had been stored as `U+00C2 U+00A0` — a UTF-8 NBSP decoded as Latin-1 and re-saved. That
 * silently added `Â` to the class, so every `Â` in a resume became a space. Nothing threw and
 * no test noticed, because the damage was confined to characters no fixture happened to use.
 *
 * The first case is the one that matters: it fails if anyone reintroduces a literal.
 */
describe('whitespace normalisation', () => {
  it('leaves accented capitals alone', () => {
    expect(normaliseWhitespace('ÂNGELA ÁVILA')).toBe('ÂNGELA ÁVILA');
    expect(normaliseWhitespace('Antônio Ângelo Étienne')).toBe('Antônio Ângelo Étienne');
  });

  it('collapses the space characters PDF extractors actually emit', () => {
    // NBSP, en quad, thin space, narrow NBSP, ideographic space.
    expect(normaliseWhitespace('a b')).toBe('a b');
    expect(normaliseWhitespace('a b')).toBe('a b');
    expect(normaliseWhitespace('a b')).toBe('a b');
    expect(normaliseWhitespace('a b')).toBe('a b');
    expect(normaliseWhitespace('a　b')).toBe('a b');
    expect(normaliseWhitespace('a\t\tb')).toBe('a b');
  });

  it('removes zero-width characters rather than turning them into spaces', () => {
    // If a zero-width space became a real space, "JavaScript" would arrive as two words and
    // stop matching the skill taxonomy — the opposite of what the caller wants.
    expect(normaliseWhitespace('Java​Script')).toBe('JavaScript');
    expect(normaliseWhitespace('﻿React')).toBe('React');
  });

  it('normalises line endings and caps blank runs at one', () => {
    expect(normaliseWhitespace('a\r\nb')).toBe('a\nb');
    expect(normaliseWhitespace('a\n\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('contact extraction', () => {
  it('finds an email address', () => {
    expect(extractEmail('Priya Sharma\npriya.sharma@example.com | Bengaluru')).toBe(
      'priya.sharma@example.com',
    );
  });

  it('returns null when there is no email', () => {
    expect(extractEmail('Priya Sharma — Senior Engineer')).toBeNull();
  });

  it('finds an international phone number', () => {
    expect(extractPhone('Contact: +91 98765 43210')).toBe('+91 98765 43210');
  });

  it('does not mistake a date range for a phone number', () => {
    // "20202023" is 8 digits — short enough that a naive digit-run matcher accepts it.
    expect(extractPhone('Worked at Acme 2020 - 2023, shipped 15 releases')).toBeNull();
  });

  it('does not mistake a year or a percentage for a phone number', () => {
    expect(extractPhone('Improved uptime to 99.95% in 2021')).toBeNull();
  });
});

describe('link extraction', () => {
  it('separates LinkedIn, GitHub and a portfolio', () => {
    const links = extractLinks(
      'github.com/priyacodes · linkedin.com/in/priya-sharma · https://priya.dev',
    );

    expect(links.github).toBe('https://github.com/priyacodes');
    expect(links.linkedin).toBe('https://linkedin.com/in/priya-sharma');
    // The portfolio must not be filled with a social profile we already classified.
    expect(links.portfolio).toBe('https://priya.dev');
  });

  it('returns nothing when there are no links', () => {
    expect(extractLinks('Priya Sharma, Bengaluru')).toEqual({});
  });
});

describe('headline extraction', () => {
  it('takes the role line under the name', () => {
    expect(
      extractHeadline(['Priya Sharma', 'Senior Frontend Engineer', 'priya@example.com']),
    ).toBe('Senior Frontend Engineer');
  });

  it('skips contact lines', () => {
    expect(
      extractHeadline(['Priya Sharma', 'priya@example.com', '+91 98765 43210', 'Backend Developer']),
    ).toBe('Backend Developer');
  });

  it('returns null rather than guessing when no line looks like a role', () => {
    expect(extractHeadline(['Priya Sharma', 'Bengaluru, India'])).toBeNull();
  });
});

describe('skill extraction', () => {
  it('splits a comma and bullet separated list', () => {
    const skills = extractSkills(['React, Node.js, TypeScript · Docker | PostgreSQL']);
    expect(skills.map((s) => s.name)).toEqual([
      'React',
      'Node.js',
      'TypeScript',
      'Docker',
      'PostgreSQL',
    ]);
  });

  /**
   * ★ The alias map. Without it a candidate's "ReactJS" never matches a job asking for
   * "React", and the symptom looks like an empty job board rather than a parser bug.
   */
  it('canonicalises aliases to the taxonomy name', () => {
    const skills = extractSkills(
      ['reactjs, node, TS'],
      [
        { name: 'React', aliases: ['reactjs', 'react.js'] },
        { name: 'Node.js', aliases: ['node', 'nodejs'] },
        { name: 'TypeScript', aliases: ['ts'] },
      ],
    );
    expect(skills.map((s) => s.name)).toEqual(['React', 'Node.js', 'TypeScript']);
  });

  it('strips a "Languages:" style label instead of reading it as a skill', () => {
    const skills = extractSkills(['Languages: JavaScript, Python']);
    expect(skills.map((s) => s.name)).toEqual(['JavaScript', 'Python']);
  });

  it('drops prose that is not a skill', () => {
    const skills = extractSkills([
      'React, experienced in building large scale distributed systems end to end, Docker',
    ]);
    expect(skills.map((s) => s.name)).toEqual(['React', 'Docker']);
  });

  it('de-duplicates case-insensitively', () => {
    const skills = extractSkills(['React, react, REACT']);
    expect(skills).toHaveLength(1);
  });

  it('extracts nothing when there is no skills section', () => {
    expect(extractSkills([])).toEqual([]);
  });
});

describe('section splitting', () => {
  it('labels sections by their headings', () => {
    const sections = splitSections(
      [
        'Priya Sharma',
        'Senior Engineer',
        'EXPERIENCE',
        'Engineer at Acme',
        'Education',
        'B.Tech in Computer Science',
        'Skills',
        'React, Node',
      ].join('\n'),
    );

    expect(sections.header).toContain('Priya Sharma');
    expect(sections.experience).toContain('Engineer at Acme');
    expect(sections.education).toContain('B.Tech in Computer Science');
    expect(sections.skills).toContain('React, Node');
  });

  it('does not treat a sentence containing a heading word as a heading', () => {
    const sections = splitSections(
      'Header line\nI have significant experience building payment systems at scale',
    );
    expect(sections.experience).toBeUndefined();
  });
});

describe('experience extraction', () => {
  it('reads a role anchored on its date range', () => {
    const entries = extractExperience([
      'Senior Engineer at Acme Technologies',
      'Jan 2020 - Present',
      '- Led the design system rewrite',
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Senior Engineer');
    expect(entries[0].company).toBe('Acme Technologies');
    expect(entries[0].isCurrent).toBe(true);
    expect(entries[0].endDate).toBeNull();
  });

  it('handles numeric and year-only date formats', () => {
    const entries = extractExperience(['Developer at Zeta', '01/2018 - 12/2019']);
    expect(entries[0].startDate.getUTCFullYear()).toBe(2018);
    expect(entries[0].endDate.getUTCFullYear()).toBe(2019);
    expect(entries[0].isCurrent).toBe(false);
  });

  it('ignores lines with no date range', () => {
    expect(extractExperience(['Some responsibilities', 'More prose'])).toEqual([]);
  });
});

describe('education extraction', () => {
  it('reads a degree, institution and years', () => {
    const entries = extractEducation([
      'B.Tech in Computer Science',
      'Demo Institute of Technology',
      '2016 - 2020',
    ]);

    expect(entries[0].degree).toContain('B.Tech');
    expect(entries[0].fieldOfStudy).toBe('Computer Science');
    expect(entries[0].institution).toBe('Demo Institute of Technology');
    expect(entries[0].startYear).toBe(2016);
    expect(entries[0].endYear).toBe(2020);
  });
});

describe('total experience', () => {
  it('sums consecutive roles', () => {
    const months = computeTotalExperienceMonths([
      { startDate: new Date('2018-01-01'), endDate: new Date('2020-01-01'), isCurrent: false },
      { startDate: new Date('2020-01-01'), endDate: new Date('2022-01-01'), isCurrent: false },
    ]);
    expect(months).toBeGreaterThanOrEqual(47);
    expect(months).toBeLessThanOrEqual(49);
  });

  /**
   * ★ Overlapping roles are merged, not added.
   *
   * Someone who freelanced while employed has four years of experience, not eight. Adding
   * them would be a material misrepresentation on a hiring platform — the parser must not
   * inflate a candidate's record even in their favour.
   */
  it('merges overlapping roles instead of double counting', () => {
    const months = computeTotalExperienceMonths([
      { startDate: new Date('2018-01-01'), endDate: new Date('2022-01-01'), isCurrent: false },
      { startDate: new Date('2019-01-01'), endDate: new Date('2021-01-01'), isCurrent: false },
    ]);
    expect(months).toBeGreaterThanOrEqual(47);
    expect(months).toBeLessThanOrEqual(49);
  });

  it('counts an ongoing role up to today', () => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    const months = computeTotalExperienceMonths([
      { startDate: start, endDate: null, isCurrent: true },
    ]);
    expect(months).toBeGreaterThanOrEqual(23);
    expect(months).toBeLessThanOrEqual(25);
  });

  it('returns zero for no roles', () => {
    expect(computeTotalExperienceMonths([])).toBe(0);
  });
});
