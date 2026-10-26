import { expect, test } from '@playwright/test';
import { prepareApp, startCompactWorkout } from './helpers';

test('без сети тренировка сохраняется как черновик и продолжается с тем же подходом', async ({ page, context }) => {
  await prepareApp(page);
  await context.setOffline(true);

  await startCompactWorkout(page);
  const weight = page.getByRole('textbox', { name: /^Вес, подход 1,/ });
  const reps = page.getByRole('textbox', { name: /^Повторения, подход 1,/ });
  await weight.fill('32.5');
  await reps.fill('12');
  const done = page.getByRole('button', { name: 'Подход 1 выполнен' });
  await done.click();
  await expect(done).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Выйти из тренировки' }).click();
  const exit = page.getByRole('dialog', { name: 'Выйти из тренировки?' });
  await expect(exit).toBeVisible();
  await exit.getByRole('button', { name: 'Сохранить и выйти' }).click();

  await expect(page.getByRole('button', { name: 'Продолжить тренировку' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать новую' })).toBeVisible();

  await page.getByRole('button', { name: 'Продолжить тренировку' }).click();
  await expect(page.getByRole('heading', { name: /^Длительность тренировки/ })).toBeVisible();
  await expect(page.getByText(/1 из \d+ подходов/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Вес, подход 1,/ })).toHaveValue('32.5');
  await expect(page.getByRole('textbox', { name: /^Повторения, подход 1,/ })).toHaveValue('12');

  await context.setOffline(false);
});
