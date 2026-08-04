/**
 * ADR-001 — type-safe JavaScript.
 *
 * These typedefs are consumed by `checkJs` in both workspaces, so an editor autocompletes
 * `application.timeline[0].changedByRole` and `tsc --noEmit` fails CI on a typo. No .ts files,
 * no build step, real type safety at the boundaries that matter.
 */

/**
 * @typedef {'GUEST'|'CANDIDATE'|'EMPLOYER'|'ADMIN'} Role
 * @typedef {'ACTIVE'|'SUSPENDED'|'DELETED'} AccountStatus
 * @typedef {'UNSUBMITTED'|'PENDING'|'VERIFIED'|'REJECTED'} VerificationStatus
 * @typedef {'DRAFT'|'PENDING'|'APPROVED'|'REJECTED'|'ARCHIVED'} JobStatus
 * @typedef {'APPLIED'|'VIEWED'|'SHORTLISTED'|'INTERVIEW'|'REJECTED'|'HIRED'|'WITHDRAWN'} ApplicationStatus
 * @typedef {'FULL_TIME'|'PART_TIME'|'CONTRACT'|'INTERNSHIP'|'FREELANCE'} EmploymentType
 * @typedef {'REMOTE'|'HYBRID'|'ONSITE'} WorkMode
 * @typedef {'USER'|'PARSER'|'AI'} FieldSource
 * @typedef {'NONE'|'PARSING'|'PARSED'|'FAILED'} ParseStatus
 */

/**
 * Every machine-readable API error code.
 *
 * ★ Derived from the `ERROR_CODES` object rather than written out, so the union cannot drift
 * from the values the server actually emits — adding a code in one place adds it here.
 *
 * This is the type the `ApiError` subclasses take. Without it TypeScript infers each
 * constructor's `code` parameter from its *default value*, narrowing it to a single literal:
 * `NotFoundError` would accept only `'NOT_FOUND'` and reject `'JOB_NOT_FOUND'`, which is most
 * of what the codebase actually throws.
 *
 * @typedef {(typeof import('../constants/errorCodes.js').ERROR_CODES)[keyof typeof import('../constants/errorCodes.js').ERROR_CODES]} ErrorCode
 */

/**
 * @typedef {Object} CloudinaryAsset
 * @property {string} publicId
 * @property {string} url
 * @property {string} [originalName]
 * @property {string} [format]
 * @property {number} [sizeBytes]
 * @property {string} [uploadedAt]
 */

/**
 * @typedef {Object} SalaryRange
 * @property {number|null} min
 * @property {number|null} max
 * @property {string} currency
 * @property {'YEARLY'|'MONTHLY'|'HOURLY'} period
 * @property {boolean} isDisclosed
 */

/**
 * @typedef {Object} GeoLocation
 * @property {string} [city]
 * @property {string} [state]
 * @property {string} [country]
 * @property {boolean} [isRemoteAnywhere]
 */

/**
 * @typedef {Object} PublicUser
 * @property {string} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 * @property {Role} role
 * @property {AccountStatus} status
 * @property {boolean} isEmailVerified
 * @property {CloudinaryAsset|null} [avatar]
 * @property {string} [phone]
 * @property {string} createdAt
 */

/**
 * @typedef {Object} SessionUser
 * @property {string} id
 * @property {Role} role
 * @property {string} email
 * @property {boolean} isEmailVerified
 * @property {AccountStatus} status
 * @property {string|null} [employerId]
 * @property {VerificationStatus|null} [employerVerificationStatus]
 * @property {string|null} [candidateId]
 */

/**
 * @typedef {Object} SkillRef
 * @property {string} [skill] Skill collection id when the skill is in the taxonomy
 * @property {string} name
 * @property {'BEGINNER'|'INTERMEDIATE'|'ADVANCED'|'EXPERT'} [level]
 * @property {number} [yearsOfExperience]
 */

/**
 * @typedef {Object} ExperienceEntry
 * @property {string} [id]
 * @property {string} title
 * @property {string} company
 * @property {EmploymentType} [employmentType]
 * @property {string} [location]
 * @property {WorkMode} [workMode]
 * @property {string} startDate
 * @property {string|null} [endDate]
 * @property {boolean} isCurrent
 * @property {string} [description]
 * @property {string[]} [skills]
 * @property {FieldSource} [source]
 */

/**
 * @typedef {Object} EducationEntry
 * @property {string} [id]
 * @property {string} degree
 * @property {string} [fieldOfStudy]
 * @property {string} institution
 * @property {number} [startYear]
 * @property {number} [endYear]
 * @property {string} [grade]
 * @property {string} [description]
 * @property {FieldSource} [source]
 */

/**
 * @typedef {Object} ProjectEntry
 * @property {string} [id]
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} [techStack]
 * @property {string} [url]
 * @property {string} [repoUrl]
 * @property {FieldSource} [source]
 */

/**
 * @typedef {Object} CandidatePreferences
 * @property {EmploymentType[]} jobTypes
 * @property {WorkMode[]} workModes
 * @property {string[]} preferredLocations
 * @property {SalaryRange} [expectedSalary]
 * @property {number} [noticePeriodDays]
 * @property {string} [availability]
 * @property {boolean} [willingToRelocate]
 */

/**
 * @typedef {Object} CandidateProfile
 * @property {string} id
 * @property {PublicUser} user
 * @property {string} [headline]
 * @property {string} [bio]
 * @property {GeoLocation} [location]
 * @property {string} [currentCompany]
 * @property {string} [currentDesignation]
 * @property {number} [totalExperienceMonths]
 * @property {SkillRef[]} skills
 * @property {ExperienceEntry[]} experience
 * @property {EducationEntry[]} education
 * @property {ProjectEntry[]} projects
 * @property {CandidatePreferences} preferences
 * @property {boolean} openToWork
 * @property {number} profileCompleteness
 * @property {ParseStatus} [resumeParseStatus]
 */

/**
 * @typedef {Object} EmployerProfile
 * @property {string} id
 * @property {string} companyName
 * @property {string} slug
 * @property {CloudinaryAsset|null} [logo]
 * @property {string} [description]
 * @property {string} [industry]
 * @property {number} [foundedYear]
 * @property {string} [companySize]
 * @property {string} [website]
 * @property {string} [linkedin]
 * @property {VerificationStatus} verificationStatus
 * @property {AccountStatus} status
 * @property {{rejectionReason?: string, rejectionCategory?: string, submittedAt?: string,
 *            reviewedAt?: string, attemptCount?: number}} [verification]
 */

/**
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} title
 * @property {string} slug
 * @property {{name: string, logo: CloudinaryAsset|null, slug: string, isVerified: boolean}} companySnapshot
 * @property {string} description
 * @property {string[]} responsibilities
 * @property {string[]} requirements
 * @property {SkillRef[]} skillsRequired
 * @property {{minMonths: number|null, maxMonths: number|null}} experience
 * @property {EmploymentType} employmentType
 * @property {WorkMode} workMode
 * @property {GeoLocation} location
 * @property {SalaryRange} salary
 * @property {number} openings
 * @property {string} deadline
 * @property {JobStatus} status
 * @property {boolean} isPubliclyVisible
 * @property {string|null} publishedAt
 * @property {{views: number, applications: number}} [stats]
 */

/**
 * @typedef {Object} TimelineEvent
 * @property {ApplicationStatus} status
 * @property {'CANDIDATE'|'EMPLOYER'|'ADMIN'|'SYSTEM'} changedByRole
 * @property {string} [note]
 * @property {Record<string, unknown>} [metadata]
 * @property {string} at
 */

/**
 * @typedef {Object} Application
 * @property {string} id
 * @property {string} job
 * @property {ApplicationStatus} status
 * @property {TimelineEvent[]} timeline
 * @property {string} [coverLetter]
 * @property {CloudinaryAsset} resume
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Pagination
 * @property {number} page
 * @property {number} limit
 * @property {number} totalItems
 * @property {number} totalPages
 * @property {boolean} hasNextPage
 * @property {boolean} hasPrevPage
 */

/**
 * @template T
 * @typedef {Object} ApiSuccess
 * @property {true} success
 * @property {number} statusCode
 * @property {string} message
 * @property {T} data
 * @property {Pagination} [pagination]
 * @property {{requestId: string, timestamp: string}} meta
 */

/**
 * @typedef {Object} ApiFailure
 * @property {false} success
 * @property {number} statusCode
 * @property {string} message
 * @property {{code: string, details?: Array<{field: string, message: string}>|Record<string, unknown>,
 *            stack?: string}} error
 * @property {{requestId: string, timestamp: string}} meta
 */

export {};
