// window.__boba: the test/debug hook (with ?debug=1 and in dev builds).
import * as THREE from 'three';
import type { Game } from '../game';
import type { Quality } from '../data/types';
import { BEATS } from '../data/beats';
import { clearSave } from '../save/save';

export interface BobaHook {
  seed(n: number): void;
  setTimeScale(x: number): void;
  getState(): unknown;
  hash(): string;
  actions: {
    moveTo(target: string | { x: number; z: number }): void;
    shake(quality: Quality): void;
    seal(): void;
    serve(): void;
    buy(upgradeId: string): void;
    start(): void;
    claim(): void;
    answerOffer(yes: boolean): void;
    revealDone(): void;
    command(cmd: unknown): void;
  };
  triggerRush(eventId?: string): void;
  skipTo(beat: string | number): void;
  resetSave(): void;
  perf(): ReturnType<Game['perf']>;
  bot(kind: 'competent' | 'casual' | null): void;
  events(): ({ t: number; type: string } & Record<string, unknown>)[];
  commands(): unknown[];
  project(x: number, y: number, z: number): { x: number; y: number };
  stationScreen(id: string): { x: number; y: number } | null;
  input(): { mode: string; shake: unknown };
  game: Game;
}

export function installTestHook(game: Game): BobaHook {
  const send = (c: unknown) => game.send(c as never);
  const hook: BobaHook = {
    seed(n) {
      game.opts.seed = n;
      clearSave();
      game.resetSave();
    },
    setTimeScale(x) { game.debugScale = Math.max(0, x); },
    getState() { return JSON.parse(JSON.stringify(game.sim.state)); },
    hash() { return game.stateHash(); },
    actions: {
      moveTo(target) {
        if (typeof target === 'string') {
          if (target.startsWith('pad:')) {
            const p = game.padWorld(target.slice(4));
            if (p) send({ type: 'MoveTo', x: p.x, z: p.z });
          } else send({ type: 'InteractStation', stationId: target });
        } else send({ type: 'MoveTo', x: target.x, z: target.z });
      },
      shake(quality) { send({ type: 'ShakeResult', quality, reversals: quality === 'perfect' ? 9 : quality === 'great' ? 5 : 1 }); },
      seal() { send({ type: 'Seal' }); },
      serve() {
        const c = game.sim.shop.stations.find((s) => game.reg.station(s.def).role === 'counter');
        if (c) send({ type: 'InteractStation', stationId: c.id });
      },
      buy(id) { send({ type: 'BuyUpgrade', upgradeId: id }); },
      start() { if (!game.started) game.begin(); },
      claim() { send({ type: 'ClaimReward' }); },
      answerOffer(yes) { send({ type: 'AnswerOffer', accept: yes }); },
      revealDone() { game.reveal.skip(); },
      command(cmd) { send(cmd); },
    },
    triggerRush(eventId = 'rush') { send({ type: 'TriggerEvent', eventId }); },
    skipTo(beat) {
      const id = typeof beat === 'number' ? BEATS[Math.max(0, Math.min(BEATS.length - 1, beat))].id : beat;
      if (!game.started) game.begin();
      send({ type: 'DebugSkipTo', beat: id });
    },
    resetSave() { game.resetSave(); },
    perf() { return game.perf(); },
    bot(kind) { game.startBot(kind); },
    events() { return game.eventLog; },
    commands() { return game.commandLog; },
    project(x, y, z) {
      const p = game.view.project(new THREE.Vector3(x, y, z));
      return { x: p.x, y: p.y };
    },
    stationScreen(id) {
      const st = game.view.stations.get(id);
      if (!st) return null;
      const p = game.view.project(st.root.position.clone().setY(0.7));
      return { x: p.x, y: p.y };
    },
    input() { return { mode: game.input.mode, shake: { ...game.input.shake.live, active: game.input.shake.active } }; },
    game,
  };
  (window as unknown as { __boba: BobaHook }).__boba = hook;
  return hook;
}
