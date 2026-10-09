import type { Catalog, CatalogExercise } from '@gymix/catalog/parse';
import { ANATOMICAL_TAGS, MUSCLE_GROUPS, VOLUME_LEVELS, WORKOUT_TYPES } from '@gymix/structures';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { resolveEquipmentLabel, type Reference } from './parse.js';
import {
  anatomicalTags,
  equipment,
  equipmentAliases,
  exerciseAnatomicalTags,
  exerciseEquipment,
  exerciseMovementPatterns,
  exerciseMuscles,
  exercises,
  movementPatterns,
  muscleGroups,
  workoutTypes,
  workoutVolumes,
} from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT>;

export interface SeedCounts {
  readonly muscleGroups: number;
  readonly anatomicalTags: number;
  readonly movementPatterns: number;
  readonly equipment: number;
  readonly equipmentAliases: number;
  readonly workoutTypes: number;
  readonly workoutVolumes: number;
  readonly exercises: number;
  readonly exerciseMuscles: number;
  readonly exerciseMovementPatterns: number;
  readonly exerciseEquipment: number;
  readonly exerciseAnatomicalTags: number;
}

/**
 * Наполняет БД референсными справочниками и каноническим каталогом.
 *
 * Чистая функция без `node:fs`: и каталог, и reference приходят уже
 * распарсенными, поэтому работает и в Node, и в браузере (PGlite).
 * Выполняется на пустой БД после миграций; повторный запуск нарушает
 * уникальность, потому что seed — это не миграция, а загрузка данных.
 */
export async function seedFromData(
  db: Db,
  catalog: Catalog,
  reference: Reference,
): Promise<SeedCounts> {
  await db.insert(muscleGroups).values(
    MUSCLE_GROUPS.map((name, index) => ({ name, displayOrder: index + 1 })),
  );
  await db.insert(anatomicalTags).values(ANATOMICAL_TAGS.map((key) => ({ key })));
  await db.insert(movementPatterns).values(
    reference.movementPatterns.map((canonicalName) => ({ canonicalName })),
  );

  const equipmentRows = await db
    .insert(equipment)
    .values(reference.equipment.map((canonicalName) => ({ canonicalName })))
    .returning({ id: equipment.id, name: equipment.canonicalName });
  const equipmentId = new Map(equipmentRows.map((r) => [r.name, r.id]));

  const aliasValues = [...reference.equipmentAliases].flatMap(([alias, targets]) =>
    targets.map((target) => {
      const id = equipmentId.get(target);
      if (id === undefined) {
        throw new Error(`алиас «${alias}» ссылается на неизвестный тип «${target}»`);
      }
      return { alias, equipmentId: id };
    }),
  );
  await db.insert(equipmentAliases).values(aliasValues);

  await db
    .insert(workoutTypes)
    .values(WORKOUT_TYPES.map((key, index) => ({ key, displayOrder: index + 1 })));
  await db
    .insert(workoutVolumes)
    .values(VOLUME_LEVELS.map((key, index) => ({ key, displayOrder: index + 1 })));

  const exerciseRows = await db
    .insert(exercises)
    .values(catalog.exercises.map((e) => ({ canonicalNameRu: e.name })))
    .returning({ id: exercises.id, name: exercises.canonicalNameRu });
  const exerciseId = new Map(exerciseRows.map((r) => [r.name, r.id]));

  const groupIdRows = await db.select({ id: muscleGroups.id, name: muscleGroups.name }).from(muscleGroups);
  const groupId = new Map(groupIdRows.map((r) => [r.name, r.id]));
  const patternRows = await db
    .select({
      id: movementPatterns.id,
      name: movementPatterns.canonicalName,
    })
    .from(movementPatterns);
  const patternId = new Map(patternRows.map((r) => [r.name, r.id]));
  const tagRows = await db.select({ id: anatomicalTags.id, name: anatomicalTags.key }).from(anatomicalTags);
  const tagId = new Map(tagRows.map((r) => [r.name, r.id]));

  const muscleValues = catalog.exercises.flatMap((e) => muscleValuesFor(e, exerciseId, groupId));
  await db.insert(exerciseMuscles).values(muscleValues);

  const patternValues = catalog.exercises.flatMap((e) => {
    const exId = requireId(exerciseId, e.name);
    return e.patterns.map((name) => {
      const id = patternId.get(name);
      if (id === undefined) throw new Error(`неизвестный паттерн «${name}» у «${e.name}»`);
      return { exerciseId: exId, movementPatternId: id };
    });
  });
  await db.insert(exerciseMovementPatterns).values(patternValues);

  const equipmentValues = catalog.exercises.flatMap((e) => {
    const exId = requireId(exerciseId, e.name);
    const seen = new Set<string>();
    const rows: Array<{ exerciseId: string; equipmentId: string; requirement: 'required' }> = [];
    for (const label of e.equipment) {
      for (const target of resolveEquipmentLabel(reference, label)) {
        const id = equipmentId.get(target);
        if (id === undefined) throw new Error(`неизвестный тип оборудования «${target}»`);
        if (seen.has(target)) continue;
        seen.add(target);
        rows.push({ exerciseId: exId, equipmentId: id, requirement: 'required' });
      }
    }
    return rows;
  });
  await db.insert(exerciseEquipment).values(equipmentValues);

  const tagValues = catalog.exercises.flatMap((e) => {
    const exId = requireId(exerciseId, e.name);
    return e.tags.map((name) => {
      const id = tagId.get(name);
      if (id === undefined) throw new Error(`неизвестный тег «${name}» у «${e.name}»`);
      return { exerciseId: exId, tagId: id };
    });
  });
  await db.insert(exerciseAnatomicalTags).values(tagValues);

  return {
    muscleGroups: MUSCLE_GROUPS.length,
    anatomicalTags: ANATOMICAL_TAGS.length,
    movementPatterns: reference.movementPatterns.length,
    equipment: reference.equipment.length,
    equipmentAliases: aliasValues.length,
    workoutTypes: WORKOUT_TYPES.length,
    workoutVolumes: VOLUME_LEVELS.length,
    exercises: catalog.exercises.length,
    exerciseMuscles: muscleValues.length,
    exerciseMovementPatterns: patternValues.length,
    exerciseEquipment: equipmentValues.length,
    exerciseAnatomicalTags: tagValues.length,
  };
}

function muscleValuesFor(
  exercise: CatalogExercise,
  exerciseId: ReadonlyMap<string, string>,
  groupId: ReadonlyMap<string, string>,
): Array<{
  exerciseId: string;
  muscleGroupId: string;
  role: 'primary' | 'secondary';
  position: number;
}> {
  const exId = requireId(exerciseId, exercise.name);
  const one = (role: 'primary' | 'secondary', names: readonly string[]) =>
    names.map((name, index) => {
      const id = groupId.get(name);
      if (id === undefined) throw new Error(`неизвестная группа «${name}» у «${exercise.name}»`);
      return { exerciseId: exId, muscleGroupId: id, role, position: index + 1 };
    });
  return [...one('primary', exercise.muscles), ...one('secondary', exercise.secondaryMuscles)];
}

function requireId(map: ReadonlyMap<string, string>, key: string): string {
  const id = map.get(key);
  if (id === undefined) throw new Error(`нет записи для «${key}»`);
  return id;
}