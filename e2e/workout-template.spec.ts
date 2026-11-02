import { expect, test } from '@playwright/test';
import {
  completeFirstExercise,
  createTemplateFromFinishedWorkout,
  finishPartially,
  prepareApp,
  startCompactWorkout,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await prepareApp(page);
});

test('частичное завершение сохраняет шаблон, а правка состава переживает перезагрузку', async ({ page }) => {
  await startCompactWorkout(page);
  await completeFirstExercise(page);

  await expect(page.getByText(/Упражнения: 1 из \d+/)).toBeVisible();
  await expect(page.getByText(/3 из \d+ подходов/)).toBeVisible();

  await finishPartially(page);
  await expect(page.getByRole('listitem').filter({ hasText: '20×10' }).first()).toBeVisible();
  await expect(page.getByText(/1 из \d+ упражнений/)).toBeVisible();

  const title = 'E2E шаблон';
  await createTemplateFromFinishedWorkout(page, title);

  await page.getByRole('button', { name: `Меню шаблона «${title}»` }).click();
  await page.getByRole('menuitem', { name: 'Редактировать состав' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Посмотреть тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Состав шаблона' })).toBeVisible();

  const planExercise = page.getByRole('button', { name: /\. Подробнее$/ });
  await page.getByRole('button', { name: /^Действия: / }).nth(1).click();
  await page.getByRole('menuitem', { name: 'Заменить упражнение' }).click();

  const replaceDialog = page.getByRole('dialog', { name: /^Замена упражнения/ });
  await expect(replaceDialog).toBeVisible();
  const replacement = replaceDialog.locator('.replace__pick').first();
  const replacementName = (await replacement.locator('.replace__name').textContent())?.trim();
  expect(replacementName).toBeTruthy();
  await replacement.click();

  await expect.poll(async () => planExercise.nth(1).getAttribute('aria-label')).toContain(replacementName!);

  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByText('Изменения шаблона сохранены.')).toBeVisible();

  await page.getByRole('button', { name: `Открыть шаблон «${title}»` }).click();
  await expect(page.getByRole('heading', { name: 'Состав тренировки' })).toBeVisible();
  await expect.poll(async () => planExercise.nth(1).getAttribute('aria-label')).toContain(replacementName!);

  // Reload from disk: the replacement must be read back from the local database.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Начать тренировку' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Тренировки', exact: true }).click();
  await expect(page.getByRole('button', { name: `Открыть шаблон «${title}»` })).toBeVisible();
  await page.getByRole('button', { name: `Открыть шаблон «${title}»` }).click();
  await expect.poll(async () => planExercise.nth(1).getAttribute('aria-label')).toContain(replacementName!);
});
