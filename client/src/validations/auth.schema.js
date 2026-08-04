import * as yup from 'yup';
import { LIMITS, PATTERNS, REGISTERABLE_ROLES } from '@verihire/shared';

/**
 * Client validation, built from the SAME limits and patterns the server uses.
 *
 * Importing them rather than retyping the numbers is the whole point of the shared
 * package: `MIN_PASSWORD_LENGTH` cannot be 8 here and 6 there, so a form can never accept
 * something the API will reject.
 */

const email = yup
  .string()
  .trim()
  .required('Email is required')
  .matches(PATTERNS.EMAIL, 'Enter a valid email address');

const password = yup
  .string()
  .required('Password is required')
  .min(LIMITS.MIN_PASSWORD_LENGTH, `At least ${LIMITS.MIN_PASSWORD_LENGTH} characters`)
  .max(LIMITS.MAX_PASSWORD_LENGTH, `At most ${LIMITS.MAX_PASSWORD_LENGTH} characters`)
  .matches(
    PATTERNS.PASSWORD,
    'Include an uppercase letter, a lowercase letter, a number and a special character',
  );

const name = (label) =>
  yup
    .string()
    .trim()
    .required(`${label} is required`)
    .min(LIMITS.MIN_NAME_LENGTH, `At least ${LIMITS.MIN_NAME_LENGTH} characters`)
    .max(LIMITS.MAX_NAME_LENGTH, `At most ${LIMITS.MAX_NAME_LENGTH} characters`);

export const loginSchema = yup.object({
  email,
  // Never apply strength rules on sign-in: an existing account may predate the current
  // policy, and telling someone their real password is "invalid" is baffling.
  password: yup.string().required('Password is required'),
});

export const signupSchema = yup.object({
  firstName: name('First name'),
  lastName: name('Last name'),
  email,
  password,
  confirmPassword: yup
    .string()
    .required('Confirm your password')
    .oneOf([yup.ref('password')], 'Passwords do not match'),
  role: yup
    .string()
    .required('Choose an account type')
    .oneOf(REGISTERABLE_ROLES, 'Choose a valid account type'),
  companyName: yup.string().when('role', {
    is: 'EMPLOYER',
    then: (schema) =>
      schema
        .trim()
        .required('Company name is required')
        .min(LIMITS.MIN_COMPANY_NAME_LENGTH, 'Too short')
        .max(LIMITS.MAX_COMPANY_NAME_LENGTH, 'Too long'),
    otherwise: (schema) => schema.strip(),
  }),
  acceptedTerms: yup.boolean().oneOf([true], 'You must accept the terms'),
});

export const forgotPasswordSchema = yup.object({ email });

export const resetPasswordSchema = yup.object({
  password,
  confirmPassword: yup
    .string()
    .required('Confirm your password')
    .oneOf([yup.ref('password')], 'Passwords do not match'),
});

export const changePasswordSchema = yup.object({
  currentPassword: yup.string().required('Your current password is required'),
  newPassword: password.notOneOf(
    [yup.ref('currentPassword')],
    'Your new password must be different',
  ),
  confirmPassword: yup
    .string()
    .required('Confirm your new password')
    .oneOf([yup.ref('newPassword')], 'Passwords do not match'),
});
