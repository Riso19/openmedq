import { sqliteTable, text, integer, blob, primaryKey, index } from 'drizzle-orm/sqlite-core';

// Subjects (21 Medical Subjects for NEET PG)
export const subjects = sqliteTable('subjects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

// Topics under each subject
export const topics = sqliteTable('topics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subjectId: integer('subject_id').references(() => subjects.id).notNull(),
  name: text('name').notNull(),
});

// Question Metadata Index (Full body is in R2 JSON packs)
export const questions = sqliteTable('questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subjectId: integer('subject_id').references(() => subjects.id),
  topicId: integer('topic_id').references(() => topics.id),
  examType: text('exam_type'), // NEET_PG, FMGE, INICET
  examYear: integer('exam_year'),
});

// Users
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // Clerk User ID
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  createdAt: integer('created_at').notNull(),
  streakDays: integer('streak_days').notNull().default(0),
  lastActiveDate: text('last_active_date'), // YYYY-MM-DD
  lifetimeDopa: integer('lifetime_dopa').notNull().default(0),
});

// User Monthly Dopa (resets monthly, holds Dopa per month for leaderboard)
export const userMonthlyDopa = sqliteTable('user_monthly_dopa', {
  userId: text('user_id').references(() => users.id).notNull(),
  month: text('month').notNull(), // "YYYY-MM"
  dopa: integer('dopa').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.userId, table.month] }),
    monthDopaIdx: index('month_dopa_idx').on(table.month, table.dopa, table.updatedAt),
  };
});

// User State (Compressed Progress Blob / JSON Arrays)
export const userState = sqliteTable('user_state', {
  userId: text('user_id').primaryKey().references(() => users.id),
  incorrectIds: text('incorrect_ids'), // Compressed JSON array of incorrect question IDs
  bookmarkedIds: text('bookmarked_ids'), // Compressed JSON array of bookmarks
  progressData: blob('progress_data'), // Gzipped progress bitset
  updatedAt: integer('updated_at').notNull(),
});


