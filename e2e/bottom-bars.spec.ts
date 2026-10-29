import { expect, test } from '@playwright/test';
import { prepareApp, startCompactWorkout } from './helpers';

test.beforeEach(async ({ page }) => {
  await prepareApp(page);
});

test('нижняя панель выполнения не перекрывает упражнения при прокрутке', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startCompactWorkout(page);

  const geometry = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('.app__main');
    const body = document.querySelector<HTMLElement>('.exec-body');
    const footer = document.querySelector<HTMLElement>('.exec-footer');
    if (main === null || body === null || footer === null) throw new Error('Нет разметки выполнения');
    body.scrollTop = body.scrollHeight;
    const cards = document.querySelectorAll<HTMLElement>('.exec-card');
    const last = cards[cards.length - 1];
    if (last === undefined) throw new Error('Нет карточек упражнений');
    return {
      mainScrollable: main.scrollHeight > main.clientHeight + 1,
      bodyScrollable: body.scrollHeight > body.clientHeight + 1,
      lastCardBottom: last.getBoundingClientRect().bottom,
      footerTop: footer.getBoundingClientRect().top,
    };
  });

  // Прокручивается только список упражнений, а панель действий стоит на месте.
  expect(geometry.mainScrollable).toBe(false);
  expect(geometry.bodyScrollable).toBe(true);
  expect(geometry.lastCardBottom).toBeLessThanOrEqual(geometry.footerTop + 0.5);
});

test('кнопки в карточке упражнения остаются видимыми, а описание прокручивается', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Формат' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByRole('button', { name: 'Выбрать упражнения вручную' }).click();
  await page.locator('.manual-card__open').first().click();
  await page.locator('.manual-card__details').first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();

  const geometry = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.exercise-detail__body');
    const actions = document.querySelector<HTMLElement>('.exercise-detail .dialog__actions');
    if (body === null || actions === null) throw new Error('Нет разметки карточки');
    body.scrollTop = body.scrollHeight;
    return {
      bodyScrollable: body.scrollHeight > body.clientHeight + 1,
      actionsBottom: actions.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry.bodyScrollable).toBe(true);
  expect(geometry.actionsBottom).toBeLessThanOrEqual(geometry.viewportHeight + 0.5);
  await expect(sheet.getByRole('button', { name: 'Выбрать' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Исключить из подбора' })).toBeVisible();
});
