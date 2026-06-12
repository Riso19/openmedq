import subjectsData from './subjects.json';

export interface Subject {
  id: number;
  name: string;
  count: number;
}

// Map the processed subjects from the JSON file to keep counts 100% accurate, limiting to standard MBBS subjects 1-19
export const subjectsList: Subject[] = (subjectsData as Subject[]).filter(s => s.id >= 1 && s.id <= 19);

export interface PYQPaper {
  year: number;
  count: number;
  name: string;
}

export const PYQ_PAPERS: PYQPaper[] = [
  { year: 2025, count: 200, name: 'NEET PG 2025' },
  { year: 2024, count: 142, name: 'NEET PG 2024' },
  { year: 2023, count: 200, name: 'NEET PG 2023' },
  { year: 2022, count: 200, name: 'NEET PG 2022' },
  { year: 2021, count: 200, name: 'NEET PG 2021' },
  { year: 2020, count: 300, name: 'NEET PG 2020' },
  { year: 2019, count: 300, name: 'NEET PG 2019' },
  { year: 2018, count: 300, name: 'NEET PG 2018' },
];

export const NEET_PG_PYQ_SUBJECT: Subject = {
  id: 99,
  name: 'NEET PG PYQs',
  count: 1842,
};

export const allSubjectsList: Subject[] = [
  ...subjectsList,
  NEET_PG_PYQ_SUBJECT,
];

