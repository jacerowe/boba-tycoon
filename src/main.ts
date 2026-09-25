import './ui/ui.css';
import { Game } from './game';
import { installTestHook } from './debug/testHook';
import { installDevPanel } from './ui/devpanel';
import { BEATS } from './data/beats';
import { runLineup } from './view/lineup';

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1' || import.meta.env.DEV;
const beatParam = params.get('beat');
const beat = beatParam == null ? null : /^\d+$/.test(beatParam) ? BEATS[Math.min(BEATS.length - 1, Number(beatParam))].id : beatParam;

const app = document.getElementById('app')!;
const ui = document.createElement('div');
ui.id = 'ui';
document.body.appendChild(ui);

if (params.get('lineup') === '1') {
  runLineup(app);
} else {
  const game = new Game(app, ui, {
    seed: Number(params.get('seed') ?? Math.floor(Math.random() * 1e9)),
    debug,
    beat,
    skipTutorial: params.get('skipTutorial') === '1',
    noSave: params.get('nosave') === '1',
    lineup: false,
  });
  const dev = installDevPanel(game, ui);
  game.onDevToggle = () => dev.toggle();
  if (debug) {
    installTestHook(game);
    if (params.get('debug') === '1') game.showFps(true);
  }
  game.showStart();
  game.run();
  if (params.get('autostart') === '1') game.begin();
}

const splash = document.getElementById('splash');
if (splash) {
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 320);
}
console.info(`Boba Tycoon ${__BUILD_HASH__}`);
