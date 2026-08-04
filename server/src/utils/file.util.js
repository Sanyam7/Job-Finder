import path from 'node:path';
import { FILE_SIGNATURES } from '@verihire/shared';

/**
 * Content-type sniffing from the actual bytes.
 *
 * The browser-supplied `Content-Type` and the filename extension are both attacker-
 * controlled: renaming `payload.html` to `resume.pdf` and setting the header to
 * `application/pdf` costs nothing. Reading the file's own magic number is the only check
 * that reflects what the file actually is.
 *
 * @param {Buffer} buffer
 * @returns {string|null} a key from FILE_SIGNATURES, or null if unrecognised
 */
export const detectFileType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;

  const header = buffer.subarray(0, 4).toString('hex').toLowerCase();

  for (const [type, signatures] of Object.entries(FILE_SIGNATURES)) {
    if (!signatures.includes(header)) continue;

    // RIFF is shared by WebP, WAV and AVI — the format tag at byte 8 disambiguates.
    if (type === 'webp') {
      const format = buffer.subarray(8, 12).toString('ascii');
      if (format !== 'WEBP') continue;
    }
    return type;
  }

  return null;
};

/**
 * Validates a buffer against an allowed set.
 *
 * `.docx` is a ZIP container, so it sniffs as `zip`. We accept that only when the
 * extension also says docx — a bare ZIP renamed to `.docx` is still rejected by the
 * downstream parser, and a `.zip` claiming to be a resume never gets here.
 *
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string[]} allowedTypes keys from FILE_SIGNATURES
 * @returns {{valid: boolean, detected: string|null, reason?: string}}
 */
export const validateFileSignature = (buffer, originalName, allowedTypes) => {
  const detected = detectFileType(buffer);
  const ext = path.extname(originalName ?? '').toLowerCase();

  if (!detected) {
    return { valid: false, detected: null, reason: 'Unrecognised or corrupted file' };
  }

  if (detected === 'zip') {
    if (ext === '.docx' && allowedTypes.includes('zip')) {
      return { valid: true, detected: 'docx' };
    }
    return { valid: false, detected: 'zip', reason: 'Archives are not accepted' };
  }

  if (!allowedTypes.includes(detected)) {
    return {
      valid: false,
      detected,
      reason: `This is a ${detected.toUpperCase()} file, which is not accepted here`,
    };
  }

  return { valid: true, detected };
};

/**
 * Strips path separators and control characters from a user-supplied filename.
 *
 * `../../etc/passwd` and names containing NUL are the classic traversal payloads; this
 * runs before the name is ever used in a storage key or echoed back.
 *
 * @param {string} name
 * @returns {string}
 */
export const sanitiseFilename = (name) => {
  const base = path.basename(String(name ?? 'file'));
  return (
    base
      // Control chars plus the separators/reserved chars Windows and POSIX both reject.
      // The control-character range is the point of this line, not an oversight: a filename
      // carrying a NUL or an ESC is either a path-traversal attempt or a terminal-injection
      // one, and neither belongs in a name we store or log.
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 200) || 'file'
  );
};

/** @param {number} bytes */
export const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** @param {string} name */
export const getExtension = (name) => path.extname(String(name ?? '')).toLowerCase();
