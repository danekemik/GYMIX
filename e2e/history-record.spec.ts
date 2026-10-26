import { expect, test } from '@playwright/test';
import { completeFirstExercise, finishPartially, prepareApp, startCompactWorkout } from './helpers';

test.beforeEach(async ({ page }) => {
  await prepareApp(page);
});

test('история открывает запись и циклически меняет статус упражнения', async ({ page }) => {
  await startCompactWorkout(page);
  await completeFirstExercise(page);
  await finishPartially(page);

  await page.getByRole('button', { name: 'Перейти в историю' }).click();
  const row = page.getByRole('button', { name: /выполнено 1 из \d+ упражнений/ });
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.getByRole('heading', { name: 'Тренировка' })).toBeVisible();
  await expect(page.getByText('Выполнено', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Редактировать запись' }).click();
  const status = page.getByRole('button', { name: /^Статус: / }).first();
  await expect(status).toHaveAccessibleName('Статус: Выполнено. Сменить');
  await status.click();
  await expect(status).toHaveAccessibleName('Статус: Пропущено. Сменить');
  await status.click();
  await expect(status).toHaveAccessibleName('Статус: Не завершено. Сменить');
  await status.click();
  await expect(status).toHaveAccessibleName('Статус: Выполнено. Сменить');

  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Редактировать запись' })).toBeVisible();
  await expect(page.getByText('Не удалось сохранить', { exact: false })).toHaveCount(0);
});
