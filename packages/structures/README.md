# @gymix/structures

Домен структур тренировки: справочные константы и матрица «формат × объём».
Пакет чистый — без зависимостей и побочных эффектов на импорте, используется
и клиентом, и сервером, и генератором.

## Публичный API

- **Справочники**: `MUSCLE_GROUPS`, `GENERATOR_MUSCLE_GROUPS`, `WORKOUT_TYPES`,
  `VOLUME_LEVELS`, `MGS_CATEGORIES`, `MGS_CATEGORY_GROUPS`, `ANATOMICAL_TAGS`.
- **Матрица**: `STRUCTURES`, `MATRIX`, `findStructure(key)`,
  `matrixEntry(type, volume)`, `mgsSlots(targetGroup, volume)`.
- **Типы**: `MuscleGroup`, `WorkoutType`, `VolumeLevel`, `MgsCategory`, `Slot`,
  `StructureKey`, `Structure`.

Когда менять: это единственный источник форматов, объёмов и раскладки слотов.
Правки здесь отражаются во всём приложении — сверяйтесь с
`reference/product_logic.md`.

## Команды

```bash
pnpm --filter @gymix/structures typecheck
pnpm --filter @gymix/structures test
```
