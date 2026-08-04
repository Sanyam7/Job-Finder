import { slugify } from '@verihire/shared';
import { Skill } from '../../models/skill.model.js';
import logger from '../../config/logger.js';

/**
 * Canonical skill taxonomy.
 *
 * `aliases` is the point of this file: without it a search for "React" misses every
 * candidate who typed "ReactJS", and the platform looks empty for the most common query
 * on the board.
 */
const SKILLS = [
  // languages
  { name: 'JavaScript', category: 'LANGUAGE', aliases: ['js', 'ecmascript', 'es6'] },
  { name: 'TypeScript', category: 'LANGUAGE', aliases: ['ts'] },
  { name: 'Python', category: 'LANGUAGE', aliases: ['python3', 'py'] },
  { name: 'Java', category: 'LANGUAGE', aliases: ['core java', 'java8', 'java 8'] },
  { name: 'C#', category: 'LANGUAGE', aliases: ['csharp', 'c sharp', 'dotnet c#'] },
  { name: 'Go', category: 'LANGUAGE', aliases: ['golang'] },
  { name: 'Rust', category: 'LANGUAGE', aliases: [] },
  { name: 'PHP', category: 'LANGUAGE', aliases: [] },
  { name: 'Ruby', category: 'LANGUAGE', aliases: [] },
  { name: 'Kotlin', category: 'LANGUAGE', aliases: [] },
  { name: 'Swift', category: 'LANGUAGE', aliases: [] },
  { name: 'C++', category: 'LANGUAGE', aliases: ['cpp', 'c plus plus'] },
  { name: 'SQL', category: 'LANGUAGE', aliases: ['structured query language'] },

  // frontend
  { name: 'React', category: 'FRAMEWORK', aliases: ['reactjs', 'react.js', 'react js'] },
  { name: 'Next.js', category: 'FRAMEWORK', aliases: ['nextjs', 'next js'] },
  { name: 'Vue.js', category: 'FRAMEWORK', aliases: ['vue', 'vuejs', 'vue js'] },
  { name: 'Angular', category: 'FRAMEWORK', aliases: ['angularjs', 'angular 2+'] },
  { name: 'Svelte', category: 'FRAMEWORK', aliases: ['sveltekit'] },
  { name: 'Redux', category: 'FRAMEWORK', aliases: ['redux toolkit', 'rtk'] },
  { name: 'Tailwind CSS', category: 'FRAMEWORK', aliases: ['tailwind', 'tailwindcss'] },
  { name: 'HTML', category: 'LANGUAGE', aliases: ['html5'] },
  { name: 'CSS', category: 'LANGUAGE', aliases: ['css3', 'scss', 'sass'] },

  // backend
  { name: 'Node.js', category: 'FRAMEWORK', aliases: ['node', 'nodejs', 'node js'] },
  { name: 'Express.js', category: 'FRAMEWORK', aliases: ['express', 'expressjs'] },
  { name: 'NestJS', category: 'FRAMEWORK', aliases: ['nest', 'nest.js'] },
  { name: 'Django', category: 'FRAMEWORK', aliases: [] },
  { name: 'Flask', category: 'FRAMEWORK', aliases: [] },
  { name: 'FastAPI', category: 'FRAMEWORK', aliases: ['fast api'] },
  { name: 'Spring Boot', category: 'FRAMEWORK', aliases: ['springboot', 'spring'] },
  { name: 'Laravel', category: 'FRAMEWORK', aliases: [] },
  { name: '.NET', category: 'FRAMEWORK', aliases: ['dotnet', 'asp.net', 'aspnet'] },
  { name: 'GraphQL', category: 'FRAMEWORK', aliases: ['graph ql', 'apollo'] },
  { name: 'REST APIs', category: 'FRAMEWORK', aliases: ['rest', 'restful', 'rest api'] },

  // data
  { name: 'MongoDB', category: 'DATABASE', aliases: ['mongo', 'mongodb atlas'] },
  { name: 'PostgreSQL', category: 'DATABASE', aliases: ['postgres', 'psql'] },
  { name: 'MySQL', category: 'DATABASE', aliases: ['my sql'] },
  { name: 'Redis', category: 'DATABASE', aliases: [] },
  { name: 'Elasticsearch', category: 'DATABASE', aliases: ['elastic search', 'elk'] },
  { name: 'DynamoDB', category: 'DATABASE', aliases: ['dynamo'] },

  // cloud / devops
  { name: 'AWS', category: 'CLOUD', aliases: ['amazon web services'] },
  { name: 'Azure', category: 'CLOUD', aliases: ['microsoft azure'] },
  { name: 'Google Cloud', category: 'CLOUD', aliases: ['gcp', 'google cloud platform'] },
  { name: 'Docker', category: 'DEVOPS', aliases: ['containerization'] },
  { name: 'Kubernetes', category: 'DEVOPS', aliases: ['k8s'] },
  { name: 'Terraform', category: 'DEVOPS', aliases: ['iac'] },
  { name: 'CI/CD', category: 'DEVOPS', aliases: ['cicd', 'continuous integration', 'jenkins'] },
  { name: 'Linux', category: 'DEVOPS', aliases: ['unix', 'ubuntu'] },
  { name: 'Git', category: 'TOOL', aliases: ['github', 'gitlab', 'version control'] },

  // data science
  { name: 'Machine Learning', category: 'DATA', aliases: ['ml'] },
  { name: 'TensorFlow', category: 'DATA', aliases: [] },
  { name: 'PyTorch', category: 'DATA', aliases: ['torch'] },
  { name: 'Pandas', category: 'DATA', aliases: [] },
  { name: 'Data Analysis', category: 'DATA', aliases: ['data analytics'] },
  { name: 'Power BI', category: 'DATA', aliases: ['powerbi'] },
  { name: 'Tableau', category: 'DATA', aliases: [] },

  // mobile
  { name: 'React Native', category: 'MOBILE', aliases: ['react-native', 'rn'] },
  { name: 'Flutter', category: 'MOBILE', aliases: ['dart flutter'] },
  { name: 'Android', category: 'MOBILE', aliases: ['android development'] },
  { name: 'iOS', category: 'MOBILE', aliases: ['ios development'] },

  // testing
  { name: 'Jest', category: 'TESTING', aliases: [] },
  { name: 'Cypress', category: 'TESTING', aliases: [] },
  { name: 'Playwright', category: 'TESTING', aliases: [] },
  { name: 'Selenium', category: 'TESTING', aliases: [] },

  // design
  { name: 'Figma', category: 'DESIGN', aliases: [] },
  { name: 'UI/UX Design', category: 'DESIGN', aliases: ['ui ux', 'ux', 'ui design', 'ux design'] },
  { name: 'Adobe XD', category: 'DESIGN', aliases: ['xd'] },

  // soft
  { name: 'Communication', category: 'SOFT_SKILL', aliases: [] },
  { name: 'Leadership', category: 'SOFT_SKILL', aliases: ['team leadership'] },
  { name: 'Problem Solving', category: 'SOFT_SKILL', aliases: [] },
  { name: 'Agile', category: 'SOFT_SKILL', aliases: ['scrum', 'kanban'] },
];

/**
 * Idempotent — safe to run on every deploy.
 *
 * Uses `upsert` rather than `insertMany`, so re-running never throws on the unique index
 * and newly added skills land without wiping usage counts on existing ones.
 */
export const seedSkills = async () => {
  /**
   * Mongoose types `bulkWrite` against the model's concrete raw-document type, and an object
   * literal built here does not structurally match it (`category` is a plain string, not the
   * enum union). The shape is validated by the schema on write.
   *
   * @type {any[]}
   */
  const operations = SKILLS.map((skill) => ({
    updateOne: {
      filter: { slug: slugify(skill.name) },
      update: {
        $set: {
          name: skill.name,
          slug: slugify(skill.name),
          category: skill.category,
          aliases: skill.aliases,
          isApproved: true,
        },
        $setOnInsert: { usageCount: 0 },
      },
      upsert: true,
    },
  }));

  const result = await Skill.bulkWrite(operations);

  logger.info('Skills seeded', {
    inserted: result.upsertedCount,
    updated: result.modifiedCount,
    total: SKILLS.length,
  });

  return { inserted: result.upsertedCount, updated: result.modifiedCount };
};

export default seedSkills;
