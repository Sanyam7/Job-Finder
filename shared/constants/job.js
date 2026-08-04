/** Job-domain enums shared by the job form, the search filters and the API validators. */

export const EMPLOYMENT_TYPE = Object.freeze({
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  INTERNSHIP: 'INTERNSHIP',
  FREELANCE: 'FREELANCE',
});

export const EMPLOYMENT_TYPE_VALUES = Object.freeze(Object.values(EMPLOYMENT_TYPE));

export const EMPLOYMENT_TYPE_META = Object.freeze({
  FULL_TIME: { label: 'Full-time' },
  PART_TIME: { label: 'Part-time' },
  CONTRACT: { label: 'Contract' },
  INTERNSHIP: { label: 'Internship' },
  FREELANCE: { label: 'Freelance' },
});

export const WORK_MODE = Object.freeze({
  REMOTE: 'REMOTE',
  HYBRID: 'HYBRID',
  ONSITE: 'ONSITE',
});

export const WORK_MODE_VALUES = Object.freeze(Object.values(WORK_MODE));

export const WORK_MODE_META = Object.freeze({
  REMOTE: { label: 'Remote', icon: 'globe' },
  HYBRID: { label: 'Hybrid', icon: 'shuffle' },
  ONSITE: { label: 'On-site', icon: 'building' },
});

export const EDUCATION_LEVEL = Object.freeze({
  ANY: 'ANY',
  HIGH_SCHOOL: 'HIGH_SCHOOL',
  DIPLOMA: 'DIPLOMA',
  BACHELORS: 'BACHELORS',
  MASTERS: 'MASTERS',
  PHD: 'PHD',
});

export const EDUCATION_LEVEL_VALUES = Object.freeze(Object.values(EDUCATION_LEVEL));

export const EDUCATION_LEVEL_META = Object.freeze({
  ANY: { label: 'Any', rank: 0 },
  HIGH_SCHOOL: { label: 'High school', rank: 1 },
  DIPLOMA: { label: 'Diploma', rank: 2 },
  BACHELORS: { label: "Bachelor's degree", rank: 3 },
  MASTERS: { label: "Master's degree", rank: 4 },
  PHD: { label: 'PhD', rank: 5 },
});

export const SALARY_PERIOD = Object.freeze({
  YEARLY: 'YEARLY',
  MONTHLY: 'MONTHLY',
  HOURLY: 'HOURLY',
});

export const SALARY_PERIOD_VALUES = Object.freeze(Object.values(SALARY_PERIOD));

export const CURRENCY = Object.freeze({
  INR: 'INR',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  AED: 'AED',
  SGD: 'SGD',
});

export const CURRENCY_VALUES = Object.freeze(Object.values(CURRENCY));

export const CURRENCY_META = Object.freeze({
  INR: { symbol: '₹', label: 'Indian Rupee', locale: 'en-IN' },
  USD: { symbol: '$', label: 'US Dollar', locale: 'en-US' },
  EUR: { symbol: '€', label: 'Euro', locale: 'en-IE' },
  GBP: { symbol: '£', label: 'British Pound', locale: 'en-GB' },
  AED: { symbol: 'AED', label: 'UAE Dirham', locale: 'en-AE' },
  SGD: { symbol: 'S$', label: 'Singapore Dollar', locale: 'en-SG' },
});

export const COMPANY_SIZE = Object.freeze({
  '1-10': '1-10',
  '11-50': '11-50',
  '51-200': '51-200',
  '201-500': '201-500',
  '501-1000': '501-1000',
  '1001-5000': '1001-5000',
  '5000+': '5000+',
});

export const COMPANY_SIZE_VALUES = Object.freeze(Object.values(COMPANY_SIZE));

export const AVAILABILITY = Object.freeze({
  IMMEDIATE: 'IMMEDIATE',
  WITHIN_15_DAYS: 'WITHIN_15_DAYS',
  WITHIN_30_DAYS: 'WITHIN_30_DAYS',
  WITHIN_60_DAYS: 'WITHIN_60_DAYS',
  NOT_LOOKING: 'NOT_LOOKING',
});

export const AVAILABILITY_VALUES = Object.freeze(Object.values(AVAILABILITY));

export const AVAILABILITY_META = Object.freeze({
  IMMEDIATE: { label: 'Immediately', maxDays: 0 },
  WITHIN_15_DAYS: { label: 'Within 15 days', maxDays: 15 },
  WITHIN_30_DAYS: { label: 'Within 30 days', maxDays: 30 },
  WITHIN_60_DAYS: { label: 'Within 60 days', maxDays: 60 },
  NOT_LOOKING: { label: 'Not looking right now', maxDays: null },
});

export const SKILL_LEVEL = Object.freeze({
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
  EXPERT: 'EXPERT',
});

export const SKILL_LEVEL_VALUES = Object.freeze(Object.values(SKILL_LEVEL));

export const PROFILE_VISIBILITY = Object.freeze({
  PUBLIC: 'PUBLIC',
  EMPLOYERS_ONLY: 'EMPLOYERS_ONLY',
  PRIVATE: 'PRIVATE',
});

export const PROFILE_VISIBILITY_VALUES = Object.freeze(Object.values(PROFILE_VISIBILITY));

export const PROFILE_VISIBILITY_META = Object.freeze({
  PUBLIC: { label: 'Public', description: 'Anyone can find your profile.' },
  EMPLOYERS_ONLY: {
    label: 'Verified employers only',
    description: 'Only admin-verified employers can find you.',
  },
  PRIVATE: {
    label: 'Private',
    description: 'Hidden from search. Employers only see you if you apply.',
  },
});

export const INTERVIEW_MODE = Object.freeze({
  ONLINE: 'ONLINE',
  ONSITE: 'ONSITE',
  PHONE: 'PHONE',
});

export const INTERVIEW_MODE_VALUES = Object.freeze(Object.values(INTERVIEW_MODE));

export const DOCUMENT_TYPE = Object.freeze({
  INCORPORATION: 'INCORPORATION',
  GST: 'GST',
  PAN: 'PAN',
  IDENTITY: 'IDENTITY',
  ADDRESS_PROOF: 'ADDRESS_PROOF',
  OTHER: 'OTHER',
});

export const DOCUMENT_TYPE_VALUES = Object.freeze(Object.values(DOCUMENT_TYPE));

export const DOCUMENT_TYPE_META = Object.freeze({
  INCORPORATION: { label: 'Certificate of incorporation', required: true },
  GST: { label: 'GST certificate', required: false },
  PAN: { label: 'Company PAN', required: false },
  IDENTITY: { label: 'Authorised signatory ID', required: true },
  ADDRESS_PROOF: { label: 'Address proof', required: false },
  OTHER: { label: 'Other supporting document', required: false },
});

export const INDUSTRIES = Object.freeze([
  'Information Technology',
  'Software Product',
  'IT Services & Consulting',
  'Financial Services',
  'Banking',
  'Insurance',
  'Healthcare',
  'Pharmaceuticals',
  'Education',
  'EdTech',
  'E-commerce',
  'Retail',
  'Manufacturing',
  'Automotive',
  'Telecommunications',
  'Media & Entertainment',
  'Gaming',
  'Real Estate',
  'Construction',
  'Logistics & Supply Chain',
  'Travel & Hospitality',
  'Food & Beverage',
  'Energy & Utilities',
  'Agriculture',
  'Legal',
  'Marketing & Advertising',
  'Human Resources',
  'Non-Profit',
  'Government',
  'Other',
]);

export const JOB_SORT = Object.freeze({
  NEWEST: 'newest',
  OLDEST: 'oldest',
  SALARY_HIGH: 'salary_high',
  RELEVANCE: 'relevance',
});

export const JOB_SORT_VALUES = Object.freeze(Object.values(JOB_SORT));

export const JOB_SORT_META = Object.freeze({
  newest: { label: 'Newest first' },
  oldest: { label: 'Oldest first' },
  salary_high: { label: 'Highest salary' },
  relevance: { label: 'Most relevant' },
});

export const POSTED_WITHIN = Object.freeze({
  DAY: 1,
  THREE_DAYS: 3,
  WEEK: 7,
  TWO_WEEKS: 14,
  MONTH: 30,
});

export const POSTED_WITHIN_OPTIONS = Object.freeze([
  { value: 1, label: 'Last 24 hours' },
  { value: 3, label: 'Last 3 days' },
  { value: 7, label: 'Last week' },
  { value: 14, label: 'Last 2 weeks' },
  { value: 30, label: 'Last month' },
]);
