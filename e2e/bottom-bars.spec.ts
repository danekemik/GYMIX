import { expect, test, type Page } from '@playwright/test';
import { completeFirstExercise, finishPartially, prepareApp, startCompactWorkout } from './helpers';

test.beforeEach(async ({ page }) => {
  await prepareApp(page);
});

/** Панель действий стоит на нижней кромке экрана, а последний блок прокручивается над ней. */
async function expectPinnedPanel(page: Page, screen: string): Promise<void> {
  const geometry = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('.app__main');
    const body = document.querySelector<HTMLElement>('.screen__body');
    const cta = document.querySelector<HTMLElement>('.screen__cta');
    if (main === null || body === null || cta === null) throw new Error('Нет разметки экрана');
    body.scrollTop = body.scrollHeight;
    const blocks = [...body.children].filter(
      (element) => (element as HTMLElement).getBoundingClientRect().height > 0,
    );
    const last = blocks[blocks.length - 1] as HTMLElement | undefined;
    if (last === undefined) throw new Error('Нет контента в теле экрана');
    return {
      mainScrollable: main.scrollHeight > main.clientHeight + 1,
      lastBottom: last.getBoundingClientRect().bottom,
      ctaTop: cta.getBoundingClientRect().top,
      ctaBottom: cta.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    };
  });

  // Прокручивается только тело экрана, панель остаётся на месте.
  expect(geometry.mainScrollable, `${screen}: прокручивается весь экран`).toBe(false);
  expect(geometry.ctaBottom, `${screen}: панель не прижата к низу`).toBeLessThanOrEqual(geometry.viewportHeight + 0.5);
  expect(geometry.ctaBottom, `${screen}: панель не прижата к низу`).toBeGreaterThanOrEqual(geometry.viewportHeight - 0.5);
  expect(geometry.lastBottom, `${screen}: контент уходит под панель`).toBeLessThanOrEqual(geometry.ctaTop + 0.5);
}

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

test('нижние панели шагов сборки и итога закреплены, контент прокручивается над ними', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });

  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Формат' })).toBeVisible();
  await expectPinnedPanel(page, 'формат');

  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Объём' })).toBeVisible();
  await expectPinnedPanel(page, 'объём');

  await page.getByRole('button', { name: 'Выбрать упражнения вручную' }).click();
  await expect(page.getByRole('heading', { name: 'Выбор упражнений' })).toBeVisible();
  await expectPinnedPanel(page, 'выбор упражнений');

  await page.locator('.topbar__back').click();
  await page.locator('.topbar__back').click();
  await expect(page.getByRole('heading', { name: 'Формат' })).toBeVisible();
  await page.locator('.type-row', { hasText: 'Одна группа' }).click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Целевая группа' })).toBeVisible();
  await expectPinnedPanel(page, 'целевая группа');

  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Объём' })).toBeVisible();
  await page.getByRole('button', { name: /^Компактная\s/ }).click();
  await page.getByRole('button', { name: 'Подобрать упражнения' }).click();
  await expect(page.getByRole('heading', { name: 'Состав тренировки' })).toBeVisible();
  await expectPinnedPanel(page, 'состав');

  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: /^Длительность тренировки/ })).toBeVisible();
  await completeFirstExercise(page);
  await finishPartially(page);
  await expectPinnedPanel(page, 'итог');

  await page.getByRole('button', { name: 'Перейти в историю' }).click();
  await page.getByRole('button', { name: /выполнено 1 из \d+ упражнений/ }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактировать запись' })).toBeVisible();
  await expectPinnedPanel(page, 'запись');
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
