import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const topicsPath = path.resolve(__dirname, '../src/lib/topics.json');
const subjectsPath = path.resolve(__dirname, '../src/lib/subjects.json');

// Typo map to flag non-canonical names
const KNOWN_TYPOS = {
  'testis & scrotum': 'Testis and Scrotum',
  'testis and scrotum': 'Testis and Scrotum',
  'testis and scrotum (anatomy)': 'Testis and Scrotum',
  'testis & scrotum (anatomy)': 'Testis and Scrotum',
  'enterobecteriaceae': 'enterobacteriaceae',
  'umblicial': 'umbilical',
};

function validateTopics() {
  if (!fs.existsSync(topicsPath)) {
    console.error(`Topics file not found at ${topicsPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(subjectsPath)) {
    console.error(`Subjects file not found at ${subjectsPath}`);
    process.exit(1);
  }

  const topics = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
  const subjects = JSON.parse(fs.readFileSync(subjectsPath, 'utf8'));
  const validSubjectIds = new Set(subjects.map(s => s.id));

  const seenIds = new Set();
  let hasErrors = false;

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];

    // (1) Type checking
    if (
      typeof topic.id !== 'number' ||
      typeof topic.subjectId !== 'number' ||
      typeof topic.name !== 'string' ||
      typeof topic.count !== 'number'
    ) {
      console.error(`Error: Invalid types in entry at index ${i}:`, topic);
      hasErrors = true;
      continue;
    }

    // (2) Unique IDs
    if (seenIds.has(topic.id)) {
      console.error(`Error: Duplicate topic ID found: ${topic.id}`);
      hasErrors = true;
    }
    seenIds.add(topic.id);

    // (3) Subject ID exists
    if (!validSubjectIds.has(topic.subjectId)) {
      console.error(`Error: Topic ID ${topic.id} references invalid subjectId ${topic.subjectId}`);
      hasErrors = true;
    }

    // (4) Canonical name check / known-typo map checks
    const lowercaseName = topic.name.toLowerCase();
    
    // If the topic name is exactly one of the flagged typo variants, fail
    if (
      (lowercaseName === 'testis & scrotum' || lowercaseName === 'testis and scrotum') && 
      topic.name !== 'Testis and Scrotum'
    ) {
      console.error(`Error: Non-canonical name found: "${topic.name}". Should be "Testis and Scrotum".`);
      hasErrors = true;
    }
    
    if (lowercaseName.includes('enterobecteriaceae')) {
      console.error(`Error: Misspelled topic name: "${topic.name}". Should be "enterobacteriaceae".`);
      hasErrors = true;
    }
    
    if (lowercaseName.includes('umblicial')) {
      console.error(`Error: Misspelled topic name: "${topic.name}". Should be "umbilical".`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('Validation failed!');
    process.exit(1);
  }

  console.log('Topics validation passed successfully.');
}

validateTopics();
