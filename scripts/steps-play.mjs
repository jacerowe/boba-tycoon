// Drive a live game with the bot and capture moments. Used for visual review.
export default async function (page, opt) {
  const shots = (opt.shots || '').split(',').filter(Boolean);
  await page.evaluate(() => { window.__boba.bot('competent'); });
  const until = async (fn, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await page.evaluate(fn)) return true;
      await page.waitForTimeout(50);
    }
    return false;
  };
  const base = opt.out.replace(/\.png$/, '');
  if (shots.includes('shake')) {
    await until(() => window.__boba.getState().world.player.task?.kind === 'shake', 60000);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${base}-shake.png` });
  }
  if (shots.includes('seal')) {
    await until(() => window.__boba.getState().world.player.task?.kind === 'sealRelease', 60000);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${base}-seal.png` });
  }
  if (shots.includes('serve')) {
    await until(() => window.__boba.events().some((e) => e.type === 'CustomerServed'), 60000);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${base}-serve.png` });
  }
}
