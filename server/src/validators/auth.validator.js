import { body } from 'express-validator';
import { LIMITS, PATTERNS, REGISTERABLE_ROLES } from '@verihire/shared';
import { objectIdParam } from './common.validator.js';

const passwordRule = (field = 'password', label = 'Password') =>
  body(field)
    .isString()
    .withMessage(`${label} is required`)
    .isLength({ min: LIMITS.MIN_PASSWORD_LENGTH, max: LIMITS.MAX_PASSWORD_LENGTH })
    .withMessage(`${label} must be ${LIMITS.MIN_PASSWORD_LENGTH}–${LIMITS.MAX_PASSWORD_LENGTH} characters`)
    .matches(PATTERNS.PASSWORD)
    .withMessage(
      `${label} must include an uppercase letter, a lowercase letter, a number and a special character`,
    );

const emailRule = () =>
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Enter a valid email address')
    .normalizeEmail({ gmail_remove_dots: false })
    .isLength({ max: 254 })
    .withMessage('That email address is too long');

const nameRule = (field, label) =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage(`${label} is required`)
    .isLength({ min: LIMITS.MIN_NAME_LENGTH, max: LIMITS.MAX_NAME_LENGTH })
    .withMessage(`${label} must be ${LIMITS.MIN_NAME_LENGTH}–${LIMITS.MAX_NAME_LENGTH} characters`)
    .matches(PATTERNS.HUMAN_NAME)
    .withMessage(`${label} contains characters we can't accept`);

export const registerRules = [
  nameRule('firstName', 'First name'),
  nameRule('lastName', 'Last name'),
  emailRule(),
  passwordRule(),

  body('confirmPassword')
    .optional()
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),

  body('role')
    .trim()
    .notEmpty()
    .withMessage('Choose whether you are hiring or looking for work')
    .isIn(REGISTERABLE_ROLES)
    .withMessage('Choose a valid account type'),

  // Only meaningful for employers; captured at sign-up so the verification wizard starts
  // pre-filled instead of asking for it twice.
  body('companyName')
    .if(body('role').equals('EMPLOYER'))
    .trim()
    .notEmpty()
    .withMessage('Company name is required')
    .isLength({
      min: LIMITS.MIN_COMPANY_NAME_LENGTH,
      max: LIMITS.MAX_COMPANY_NAME_LENGTH,
    })
    .withMessage(
      `Company name must be ${LIMITS.MIN_COMPANY_NAME_LENGTH}–${LIMITS.MAX_COMPANY_NAME_LENGTH} characters`,
    ),

  body('acceptedTerms')
    .optional()
    .isBoolean()
    .withMessage('Terms acceptance must be true or false'),
];

export const loginRules = [
  emailRule(),
  body('password').isString().notEmpty().withMessage('Password is required'),
  body('rememberMe').optional().isBoolean().toBoolean(),
];

export const verifyEmailRules = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage('Verification token is required')
    .isLength({ min: 32, max: 128 })
    .withMessage('That verification link is not valid'),
];

export const resendVerificationRules = [emailRule()];

export const forgotPasswordRules = [emailRule()];

export const resetPasswordRules = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage('Reset token is required')
    .isLength({ min: 32, max: 128 })
    .withMessage('That reset link is not valid'),
  passwordRule('password', 'New password'),
  body('confirmPassword')
    .optional()
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
];

export const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Your current password is required'),
  passwordRule('newPassword', 'New password'),
  body('newPassword').custom((value, { req }) => {
    if (value === req.body.currentPassword) {
      throw new Error('Your new password must be different from your current one');
    }
    return true;
  }),
];

export const sessionIdRules = [objectIdParam('sessionId', 'session')];
