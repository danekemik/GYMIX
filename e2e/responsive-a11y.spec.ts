import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { completeFirstExercise, finishPartially, prepareApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await prepareApp(page);
});

test('ключевые экраны проходят автоматическую проверку WCAG AA', async ({ page }) => {
  const audit = async (screen: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const summary = results.violations.map(
      (violation) =>
        `${screen}: ${violation.id}: ${violation.nodes
          .map((node) => `${node.target.join(' ')} ${node.html}`)
          .join(', ')}`,
    );
    expect(summary, summary.join('\n')).toEqual([]);
  };

  await audit('главная');

  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Формат' })).toBeVisible();
  await audit('формат');

  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Объём' })).toBeVisible();
  await audit('объём');

  await page.getByRole('button', { name: /^Компактная\s/ }).click();
  await page.getByRole('button', { name: 'Подобрать упражнения' }).click();
  await expect(page.getByRole('heading', { name: 'Состав тренировки' })).toBeVisible();
  await audit('состав');

  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: /^Длительность тренировки/ })).toBeVisible();
  await audit('выполнение');

  await completeFirstExercise(page);
  await finishPartially(page);
  await audit('итог');

  await page.getByRole('button', { name: 'Перейти в историю' }).click();
  await page.getByRole('button', { name: /выполнено 1 из \d+ упражнений/ }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка' })).toBeVisible();
  await audit('запись');

  await page.getByRole('button', { name: 'Редактировать запись' }).click();
  await audit('редактирование записи');
});

test('320, 393 и 820 px не дают горизонтального переполнения', async ({ page }) => {
  for (const width of [320, 393, 820]) {
    await page.setViewportSize({ width, height: 740 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${width}px: horizontal overflow`).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Начать тренировку' })).toBeVisible();
  }
});

test('при 200% текста основной сценарий не ломается', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const cta = page.getByRole('button', { name: 'Начать тренировку' });
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});

test('reduced motion отключает длинные переходы', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.getByRole('button', { name: 'Начать тренировку' }).evaluate((element) => {
    const style = getComputedStyle(element);
    return Math.max(
      ...style.transitionDuration.split(',').map((value) => Number.parseFloat(value) || 0),
    );
  });
  expect(duration).toBeLessThan(0.05);
});
