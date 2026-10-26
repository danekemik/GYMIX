import { expect, type Page } from '@playwright/test';

/** A remembered account lets the app open without a backend. Sync requests
 * are stubbed per test, so the local database and UI stay the real ones. */
export const SESSION = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'e2e@gymix.test',
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  deviceId: '22222222-2222-4222-8222-222222222222',
  accessToken: 'e2e-access-token',
  refreshToken: 'e2e-refresh-token',
};

export async function prepareApp(page: Page): Promise<void> {
  await page.addInitScript((session) => {
    localStorage.setItem('gymix:account:v1', JSON.stringify(session));
  }, SESSION);
  // The app is offline-first. Never let a test reach a real local server.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'offline', message: 'Нет связи' } }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать тренировку' })).toBeVisible({ timeout: 30_000 });
}

export async function startCompactWorkout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Формат' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click();

  await page.getByRole('button', { name: /^Компактная\s/ }).click();
  await page.getByRole('button', { name: 'Подобрать упражнения' }).click();
  await expect(page.getByRole('heading', { name: 'Состав тренировки' })).toBeVisible();

  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: /^Длительность тренировки/ })).toBeVisible();
}

export async function completeFirstExercise(page: Page): Promise<void> {
  const sets = [
    { index: 1, weight: '20', reps: '10' },
    { index: 2, weight: '20', reps: '10' },
    { index: 3, weight: '20', reps: '8' },
  ];
  for (const set of sets) {
    await page.getByRole('textbox', { name: new RegExp(`^Вес, подход ${set.index},`) }).fill(set.weight);
    await page.getByRole('textbox', { name: new RegExp(`^Повторения, подход ${set.index},`) }).fill(set.reps);
    const done = page.getByRole('button', { name: `Подход ${set.index} выполнен` });
    await done.click();
    await expect(done).toHaveAttribute('aria-pressed', 'true');
  }
}

export async function finishPartially(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Завершить' }).click();
  const partial = page.getByRole('dialog', { name: 'Завершить частично?' });
  await expect(partial).toBeVisible();
  await partial.getByRole('button', { name: 'Сохранить результат' }).click();
  await expect(page.getByRole('heading', { name: 'Итог тренировки' })).toBeVisible();
}

export async function createTemplateFromFinishedWorkout(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Сохранить как шаблон' }).click();
  const dialog = page.getByRole('dialog', { name: 'Сохранить как шаблон' });
  await dialog.getByRole('textbox', { name: 'Название' }).fill(title);
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Шаблон сохранён' })).toBeVisible();
  await page.getByRole('button', { name: 'К шаблонам' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}
