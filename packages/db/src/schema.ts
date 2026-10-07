import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Единственная схема данных проекта.
 *
 * Источник истины — спецификация V1, раздел 13 («Структура данных и связи»),
 * и `reference/exercise_database.md`. Схема применяется к PostgreSQL на
 * сервере и к PGlite в тестах и офлайн-хранилище клиента: диалект один.
 *
 * Матрица структур (workout_structures) в БД намеренно не дублируется:
 * канонична `@gymix/structures`, а сам канон называет нормализованную
 * матрицу ещё не проверенной. Хранение второй копии создало бы второй
 * источник истины, который некому синхронизировать.
 */

/* ------------------------------------------------------------------ *
 * Справочники, наполняемые из канонического каталога
 * ------------------------------------------------------------------ */

export const roleEnum = pgEnum('exercise_muscle_role', ['primary', 'secondary']);
export const involvementEnum = pgEnum('exercise_involvement', ['high', 'medium', 'low']);
export const confidenceEnum = pgEnum('exercise_confidence', ['high', 'medium', 'low']);
export const requirementEnum = pgEnum('equipment_requirement', ['required', 'optional']);

/** Десять верхнеуровневых групп мышц приложения. */
export const muscleGroups = pgTable(
  'muscle_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    displayOrder: integer('display_order').notNull(),
  },
);

/**
 * Анатомические теги внутри группы. В V1 известен один — `rear_delt`,
 * закрывающий слот «задняя дельта» в форматах Pull.
 */
export const anatomicalTags = pgTable('anatomical_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
});

export const movementPatterns = pgTable('movement_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  canonicalName: text('canonical_name').notNull().unique(),
});

export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    canonicalNameRu: text('canonical_name_ru').notNull().unique(),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    recordVersion: integer('record_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('exercises_active_idx').on(t.isActive)],
);

export const exerciseMuscles = pgTable(
  'exercise_muscles',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    muscleGroupId: uuid('muscle_group_id')
      .notNull()
      .references(() => muscleGroups.id, { onDelete: 'restrict' }),
    role: roleEnum('role').notNull(),
    /** Порядок доминирования внутри колонки Primary. */
    position: integer('position').notNull(),
    involvement: involvementEnum('involvement'),
    confidence: confidenceEnum('confidence'),
  },
  (t) => [
    primaryKey({ columns: [t.exerciseId, t.muscleGroupId, t.role] }),
    index('exercise_muscles_group_idx').on(t.muscleGroupId),
  ],
);

export const exerciseAnatomicalTags = pgTable(
  'exercise_anatomical_tags',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => anatomicalTags.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.tagId] })],
);

export const exerciseMovementPatterns = pgTable(
  'exercise_movement_patterns',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    movementPatternId: uuid('movement_pattern_id')
      .notNull()
      .references(() => movementPatterns.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.exerciseId, t.movementPatternId] }),
    index('exercise_patterns_pattern_idx').on(t.movementPatternId),
  ],
);

/**
 * Функциональные типы оборудования: без марок, моделей и названий станций.
 * Названия станций остаются псевдонимами каталога (см. equipment_aliases).
 */
export const equipment = pgTable('equipment', {
  id: uuid('id').primaryKey().defaultRandom(),
  canonicalName: text('canonical_name').notNull().unique(),
});

/** Таблица алиасов: лейбл каталога → один или несколько канонических типов. */
export const equipmentAliases = pgTable(
  'equipment_aliases',
  {
    alias: text('alias').notNull(),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.alias, t.equipmentId] })],
);

export const exerciseEquipment = pgTable(
  'exercise_equipment',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'restrict' }),
    requirement: requirementEnum('requirement').notNull().default('required'),
  },
  (t) => [
    primaryKey({ columns: [t.exerciseId, t.equipmentId] }),
    index('exercise_equipment_equipment_idx').on(t.equipmentId),
  ],
);

/* ------------------------------------------------------------------ *
 * Справочники тренировок
 * ------------------------------------------------------------------ */

export const workoutTypes = pgTable('workout_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  displayOrder: integer('display_order').notNull(),
});

export const workoutVolumes = pgTable('workout_volumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  displayOrder: integer('display_order').notNull(),
});

/* ------------------------------------------------------------------ *
 * Пользователь, устройства и доступ
 * ------------------------------------------------------------------ */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** Grace-period 7 дней до окончательного удаления аккаунта. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_deleted_idx').on(t.deletedAt)],
);

/**
 * Устройства пользователя. Нужны для списка доступа в профиле и для
 * `workout_sessions.owning_device_id`: активная тренировка принадлежит
 * ровно одному устройству.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('devices_user_idx').on(t.userId)],
);

/**
 * Refresh-сессии. Access-токен короткий и не хранится; отзыв доступа —
 * удаление записи. TTL 30 дней чистится фоновой очисткой.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    refreshHash: text('refresh_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_sessions_user_idx').on(t.userId),
    index('auth_sessions_expires_idx').on(t.expiresAt),
  ],
);

/**
 * Подтверждение email и восстановление пароля: одна таблица, разные цели.
 * `user_id` пуст на регистрации — пользователь ещё не подтверждён.
 */
export const emailPurposeEnum = pgEnum('email_code_purpose', ['signup', 'password_reset']);

export const emailCodes = pgTable(
  'email_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    purpose: emailPurposeEnum('purpose').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_codes_email_purpose_idx').on(t.email, t.purpose)],
);

/* ------------------------------------------------------------------ *
 * Шаблоны и генерации
 * ------------------------------------------------------------------ */

export const workoutTemplates = pgTable(
  'workout_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    typeId: uuid('type_id')
      .notNull()
      .references(() => workoutTypes.id, { onDelete: 'restrict' }),
    volumeId: uuid('volume_id')
      .notNull()
      .references(() => workoutVolumes.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('workout_templates_user_idx').on(t.userId)],
);

export const templateExercises = pgTable(
  'template_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    /** Ключ слота в `@gymix/structures`, чтобы порядок переживал правки. */
    slotKey: text('slot_key').notNull(),
    position: integer('position').notNull(),
    defaultSets: integer('default_sets').notNull().default(3),
  },
  (t) => [
    index('template_exercises_template_idx').on(t.templateId),
    uniqueIndex('template_exercises_template_position_uq').on(t.templateId, t.position),
  ],
);

/**
 * Технический журнал генерации: чем собрана сборка, если её нужно
 * воспроизвести или отладить. `structure` — снимок структуры в JSON.
 */
export const workoutGenerations = pgTable(
  'workout_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    structure: jsonb('structure').notNull(),
    seed: text('seed').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('workout_generations_user_idx').on(t.userId)],
);

/* ------------------------------------------------------------------ *
 * Фактические тренировки
 * ------------------------------------------------------------------ */

export const userExcludedExercises = pgTable(
  'user_excluded_exercises',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.exerciseId] }),
    index('user_excluded_exercises_exercise_idx').on(t.exerciseId),
  ],
);

export const sessionStatusEnum = pgEnum('workout_session_status', ['active', 'completed']);
export const sessionExerciseStatusEnum = pgEnum('session_exercise_status', [
  'pending',
  'active',
  'completed',
  'skipped',
]);

export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceTemplateId: uuid('source_template_id').references(
      () => workoutTemplates.id,
      { onDelete: 'set null' },
    ),
    typeId: uuid('type_id')
      .notNull()
      .references(() => workoutTypes.id, { onDelete: 'restrict' }),
    volumeId: uuid('volume_id')
      .notNull()
      .references(() => workoutVolumes.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: sessionStatusEnum('status').notNull().default('active'),
    /** Optimistic concurrency для синхронизации: инкремент при каждом патче. */
    revision: integer('revision').notNull().default(1),
    owningDeviceId: uuid('owning_device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('workout_sessions_user_status_idx').on(t.userId, t.status),
    index('workout_sessions_owning_device_idx').on(t.owningDeviceId),
  ],
);

/**
 * Снимок упражнения в сессии. `exercise_name_snapshot` обязателен по
 * LOCKED-требованию истории: прошлая тренировка показывает фактически
 * выбранное упражнение, даже если каталог позже изменился.
 */
export const sessionExercises = pgTable(
  'session_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id').references(() => exercises.id, {
      onDelete: 'set null',
    }),
    exerciseNameSnapshot: text('exercise_name_snapshot').notNull(),
    position: integer('position').notNull(),
    status: sessionExerciseStatusEnum('status').notNull().default('pending'),
  },
  (t) => [
    index('session_exercises_session_idx').on(t.sessionId),
    uniqueIndex('session_exercises_session_position_uq').on(t.sessionId, t.position),
  ],
);

/**
 * Подход. Три пустых подхода создаются по умолчанию (LOCKED), поэтому
 * вес и повторения пусты до заполнения; доп. подходы добавляются здесь же.
 */
export const sessionSets = pgTable(
  'session_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionExerciseId: uuid('session_exercise_id')
      .notNull()
      .references(() => sessionExercises.id, { onDelete: 'cascade' }),
    setNumber: integer('set_number').notNull(),
    weight: numeric('weight', { precision: 6, scale: 2 }),
    reps: integer('reps'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('session_sets_exercise_number_uq').on(t.sessionExerciseId, t.setNumber),
  ],
);

/**
 * Активные интервалы таймера. Длительность тренировки — сумма только
 * закрытых интервалов плюс текущий открытый: паузы и фон не засчитываются
 * (LOCKED). Одновременно открыт не более одного интервала.
 */
export const sessionIntervals = pgTable(
  'session_intervals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    index('session_intervals_session_idx').on(t.sessionId),
    uniqueIndex('session_intervals_open_uq')
      .on(t.sessionId)
      .where(sql`ended_at IS NULL`),
  ],
);

export const bodyWeightEntries = pgTable(
  'body_weight_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    measuredAt: date('measured_at').notNull(),
    value: numeric('value', { precision: 5, scale: 2 }).notNull(),
    unit: text('unit').notNull().default('kg'),
  },
  (t) => [
    index('body_weight_entries_user_date_idx').on(t.userId, t.measuredAt),
    uniqueIndex('body_weight_entries_user_day_uq').on(t.userId, t.measuredAt),
  ],
);

/* ------------------------------------------------------------------ *
 * Синхронизация
 * ------------------------------------------------------------------ */

/**
 * Журнал применённых операций. Клиент присылает `operation_id`;
 * повторная отправка той же операции не применяется дважды — так
 * очередь идемпотентна, как требует LOCKED-контракт синхронизации.
 */
export const syncOperations = pgTable(
  'sync_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationId: uuid('operation_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => workoutSessions.id, {
      onDelete: 'set null',
    }),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sync_operations_user_operation_uq').on(t.userId, t.operationId),
    index('sync_operations_session_idx').on(t.sessionId),
  ],
);
