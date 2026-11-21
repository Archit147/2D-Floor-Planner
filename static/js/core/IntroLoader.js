export function playIntro() {
  const loader = document.querySelector('#intro-loader');
  const wordmark = document.querySelector('#intro-wordmark');
  if (!loader || !wordmark) return;

  for (const [index, letter] of Array.from('MERIDIAN').entries()) {
    const span = document.createElement('span');
    span.textContent = letter;
    span.style.setProperty('--letter-index', index);
    wordmark.append(span);
  }

  const startedAt = performance.now();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minimumDuration = reducedMotion ? 220 : 1450;
  let isLeaving = false;
  const finish = () => {
    if (isLeaving) return;
    isLeaving = true;
    const remaining = Math.max(0, minimumDuration - (performance.now() - startedAt));
    window.setTimeout(() => {
      loader.classList.add('is-leaving');
      window.setTimeout(() => loader.remove(), reducedMotion ? 40 : 620);
    }, remaining);
  };

  if (document.readyState === 'complete') finish();
  else window.addEventListener('load', finish, { once: true });
  window.setTimeout(finish, reducedMotion ? 900 : 3200);
}