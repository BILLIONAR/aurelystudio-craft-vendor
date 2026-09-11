import {icon} from './icons.js';
/** A brief brand entrance. The app is ready underneath before the exit begins. */
export function playIntro() {
  const navigation = performance.getEntriesByType('navigation')[0]?.type;
  if (navigation === 'reload' || navigation === 'back_forward') return;
  const app = document.getElementById('app');
  if (!app || document.getElementById('brand-intro')) return;
  const layer = document.createElement('section');
  layer.id = 'brand-intro';
  layer.className = 'studio-entrance';
  layer.tabIndex = -1;
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', 'Welcome to AurelyStudio');
  layer.innerHTML = `<div class="entrance-lockup">
    <img class="entrance-logo" src="./logo-a.svg" alt="AurelyStudio gold A logo" width="112" height="112">
    <div class="entrance-wordmark">AurelyStudio</div>
    <div class="entrance-purpose">Craft Fair Vendor OS</div>
    <div class="entrance-journey" aria-label="Plan, prepare and sell">
      <div class="entrance-step"><span>${icon('Events',24)}</span><small>Plan</small></div>
      <i class="entrance-connector" aria-hidden="true"></i>
      <div class="entrance-step"><span>${icon('Inventory',24)}</span><small>Prepare</small></div>
      <i class="entrance-connector" aria-hidden="true"></i>
      <div class="entrance-step"><span>${icon('Sales',24)}</span><small>Sell</small></div>
    </div>
    <div class="entrance-hairline" aria-hidden="true"></div>
    <button class="entrance-enter" type="button">Enter studio <span aria-hidden="true">↗</span></button>
  </div>`;
  const previousFocus = document.activeElement;
  let finished = false;
  let timer;
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    // Reveal the ready workspace behind the fading overlay: no blank frame.
    app.classList.remove('entrance-pending');
    layer.classList.add('entrance-leaving');
    setTimeout(() => {
      const restore = layer.contains(document.activeElement);
      app.inert = false;
      layer.remove();
      if (restore) {
        const target = previousFocus !== document.body && previousFocus?.isConnected ? previousFocus : app.querySelector('main h1');
        if (target) {
          if (!target.matches('button,a,input')) target.setAttribute('tabindex', '-1');
          target.focus({preventScroll:true});
        }
      }
    }, 320);
  }
  const onKey = e => {
    if (e.key === 'Escape' || e.key === 'Enter') {e.preventDefault();finish();}
    if (e.key === 'Tab') {e.preventDefault();layer.querySelector('button').focus({preventScroll:true});}
  };
  document.body.append(layer);
  app.inert = true;
  app.classList.add('entrance-pending');
  layer.querySelector('button').addEventListener('click', finish);
  // Focus the dialog instead of giving the entry button a premature focus ring.
  layer.focus({preventScroll:true});
  document.addEventListener('keydown', onKey);
  timer = setTimeout(finish, 3680); // 3680ms hold + 320ms exit = 4 seconds.
  return finish;
}
