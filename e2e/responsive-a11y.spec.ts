import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
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

/**
 * Переполнение ищется по фактическим bounding box, а не только по
 * document.scrollWidth: контент может быть обрезан внутри контейнера
 * с overflow: hidden. Проверяются текстовые блоки и элементы управления.
 */
async function expectNoClipping(page: Page, screen: string): Promise<void> {
  const issues = await page.evaluate(() => {
    const found: string[] = [];
    const doc = document.documentElement;
    const pageOverflow = doc.scrollWidth - doc.clientWidth;
    if (pageOverflow > 1) found.push(`документ шире вьюпорта на ${pageOverflow}px`);

    const selector = [
      'h1', 'h2', 'h3', 'p', 'label', 'input', 'button',
      '.tabbar__label', '.type-row__group', '.volume-card__name',
      '.plan__name', '.plan__group', '.exec-card__name', '.exec-card__group',
      '.history-row__meta', '.finish-hero__caption',
    ].join(',');

    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.closest('.visually-hidden, .set-field__label')) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const label = `${el.tagName.toLowerCase()}.${el.className.split(' ').join('.')}`;
      if (box.left < -0.5 || box.right > window.innerWidth + 0.5) {
        found.push(`${label} выходит за край: ${Math.round(box.left)}…${Math.round(box.right)}`);
      }
      if (style.overflowX === 'hidden' && el.scrollWidth > el.clientWidth + 1) {
        found.push(`${label} обрезан по ширине: ${el.scrollWidth}/${el.clientWidth}`);
      }
    }
    return [...new Set(found)].slice(0, 12);
  });
  expect(issues, `${screen}: ${issues.join('; ')}`).toEqual([]);
}

async function walkBuildFlow(page: Page, screen: string): Promise<void> {
  await expectNoClipping(page, `${screen}: главная`);

  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Формат' })).toBeVisible();
  await expectNoClipping(page, `${screen}: формат`);

  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Объём' })).toBeVisible();
  await expectNoClipping(page, `${screen}: объём`);

  await page.getByRole('button', { name: /^Компактная\s/ }).click();
  await page.getByRole('button', { name: 'Подобрать упражнения' }).click();
  await expect(page.getByRole('heading', { name: 'Состав тренировки' })).toBeVisible();
  await expectNoClipping(page, `${screen}: состав`);

  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.getByRole('heading', { name: /^Длительность тренировки/ })).toBeVisible();
  await expectNoClipping(page, `${screen}: выполнение`);
}

for (const width of [320, 393, 820]) {
  test(`${width}px: шаги сборки и выполнения без переполнения`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await walkBuildFlow(page, `${width}px`);
  });
}

test('при 200% текста сценарий не ломается и не обрезает контент', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });

  await walkBuildFlow(page, '200%');

  await completeFirstExercise(page);
  await expectNoClipping(page, '200%: отмеченные подходы');
  await finishPartially(page);
  await expectNoClipping(page, '200%: итог');

  await page.getByRole('button', { name: 'Перейти в историю' }).click();
  await expect(page.getByRole('button', { name: /выполнено 1 из \d+ упражнений/ })).toBeVisible();
  await expectNoClipping(page, '200%: история');
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
