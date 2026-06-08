import Dexie, { type Table } from 'dexie';

export interface LocalQuestion {
  id: number;
  questionText: string;
  opa: string;
  opb: string;
  opc: string;
  opd: string;
  correctOption: number;
  subjectId: number;
  topicId: number;
  examType?: string;
  examYear?: number;
  explanation?: string;
  hasImage?: boolean;
}

export interface LocalProgress {
  questionId: number;
  status: 'CORRECT' | 'INCORRECT' | 'BOOKMARKED';
  timeTaken?: number;
  answeredAt: number;
}

export class OpenMedQDatabase extends Dexie {
  questions!: Table<LocalQuestion>;
  progress!: Table<LocalProgress>;

  constructor() {
    super('OpenMedQDatabase');
    this.version(1).stores({
      questions: 'id, subjectId, topicId, examType',
      progress: 'questionId, status, answeredAt',
    });
  }
}

export const db = new OpenMedQDatabase();
