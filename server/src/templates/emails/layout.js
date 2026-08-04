import { BRAND } from '@verihire/shared';
import env from '../../config/env.js';

/**
 * Shared email chrome.
 *
 * Inline styles and a table-free single-column layout, because Outlook and Gmail strip
 * `<style>` blocks and ignore most modern CSS. Dark-mode-safe colours are chosen to stay
 * legible under Gmail's automatic colour inversion.
 *
 * @param {{title: string, preheader?: string, body: string, cta?: {label: string, url: string},
 *          footerNote?: string}} params
 * @returns {string}
 */
export const renderLayout = ({ title, preheader = '', body, cta, footerNote }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none;font-size:1px;color:#f1f5f9;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>

  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">

    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">
        ${BRAND.name}
      </span>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">Verified jobs only</div>
    </div>

    <div style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">
        ${escapeHtml(title)}
      </h1>
      <div style="font-size:15px;line-height:1.65;color:#334155;">
        ${body}
      </div>

      ${
        cta
          ? `<div style="margin:28px 0 8px;">
               <a href="${cta.url}"
                  style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;
                         padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;">
                 ${escapeHtml(cta.label)}
               </a>
             </div>
             <p style="font-size:12px;color:#94a3b8;margin:12px 0 0;word-break:break-all;">
               If the button doesn't work, paste this into your browser:<br>${cta.url}
             </p>`
          : ''
      }

      ${
        footerNote
          ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e2e8f0;
                       font-size:13px;color:#64748b;line-height:1.6;">${footerNote}</p>`
          : ''
      }
    </div>

    <div style="text-align:center;margin-top:24px;font-size:12px;color:#94a3b8;line-height:1.6;">
      <p style="margin:0 0 6px;">${escapeHtml(BRAND.description)}</p>
      <p style="margin:0;">
        <a href="${env.CLIENT_URL}" style="color:#64748b;text-decoration:underline;">${BRAND.domain}</a>
        &nbsp;·&nbsp;
        <a href="mailto:${BRAND.supportEmail}" style="color:#64748b;text-decoration:underline;">Support</a>
      </p>
      <p style="margin:12px 0 0;color:#cbd5e1;">
        You received this because you have a ${BRAND.name} account.
      </p>
    </div>
  </div>
</body>
</html>`;

/**
 * Escapes untrusted values before they enter an HTML email.
 *
 * User-supplied strings (names, company names, rejection reasons) all pass through here.
 * An unescaped company name is a stored-XSS vector that lands in someone's inbox.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** @param {string} html */
export const toPlainText = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** @param {string} tone one of: info, success, warning, danger */
export const calloutBox = (tone, content) => {
  const palette = {
    info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
    success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
    danger: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  };
  const c = palette[tone] ?? palette.info;
  return `<div style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;
                      padding:14px 16px;margin:20px 0;font-size:14px;line-height:1.6;color:${c.text};">
            ${content}
          </div>`;
};
