import { db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const gameId = params.get('id');

let game = null;
let state = [];
let flags = [];
let lastDiceResult = null;

async function init() {
  try {
    const docRef = doc(db, 'games', gameId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      document.getElementById('scene-text').textContent = 'ゲームが見つかりません';
      return;
    }
    game = { id: docSnap.id, ...docSnap.data() };
    document.getElementById('game-title-display').textContent = game.title;
    state = JSON.parse(JSON.stringify(game.libraries || []));
    showScene('scene1');
  } catch (e) {
    document.getElementById('scene-text').textContent = 'エラー：' + e.message;
  }
}

function resolveText(text) {
  return text.replace(/\{([^}]+)\}/g, (match, name) => {
    const lib = state.find(l => l.name === name.trim());
    if (!lib) return match;
    if (lib.type === 'affection') {
      let hearts = '';
      for (let j = 0; j < lib.max; j++) {
        hearts += j < lib.value ? '❤' : '♡';
      }
      return hearts;
    }
    if (lib.type === 'saikoro') {
      return lib.results && lib.results.length > 0
        ? lib.results.map(r => '[' + r + ']').join(' ') + '（合計:' + lib.results.reduce((a, b) => a + b, 0) + '）'
        : '（未振）';
    }
    if (lib.type === 'dice') return lib.result !== null ? lib.result : '（未振）';
    if (lib.type === 'money') return lib.value + lib.unit;
    if (lib.type === 'time') return lib.value + lib.unit;
    if (lib.type === 'flag') return lib.value ? 'ON' : 'OFF';
    if (lib.type === 'status') return lib.value;
    return lib.value !== undefined ? lib.value : match;
  });
}

function showScene(sceneId) {
  const scene = game.story[sceneId];
  if (!scene) return;
  document.getElementById('scene-title-display').textContent = scene.title || '';
  document.getElementById('scene-text').textContent = resolveText(scene.text);
  renderStatus();
  renderButtons(scene);
}

function renderStatus() {
  const bar = document.getElementById('status-bar');
  bar.innerHTML = '';
  state.forEach((lib, i) => {
    const div = document.createElement('div');
    div.className = 'status-item';
    if (lib.type === 'affection') {
      let hearts = '';
      for (let j = 0; j < lib.max; j++) {
        hearts += j < lib.value ? '❤' : '♡';
      }
      div.innerHTML = '<span class="status-name">' + lib.name + '</span><span class="status-hearts">' + hearts + '</span>';
    } else if (lib.type === 'dice') {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span>' +
        '<button class="dice-btn" onclick="rollDice(' + i + ')">振る</button>' +
        (lib.result !== null ? '<span class="dice-result">→ ' + lib.result + '</span>' : '');
    } else if (lib.type === 'saikoro') {
      const diceDisplay = lib.results && lib.results.length > 0
        ? lib.results.map(r => '[' + r + ']').join(' ') + ' 合計:' + lib.results.reduce((a, b) => a + b, 0)
        : '';
      div.innerHTML = '<span class="status-name">' + lib.name + '</span>' +
        '<button class="dice-btn" onclick="rollSaikoro(' + i + ')">振る</button>' +
        (diceDisplay ? '<span class="dice-result">→ ' + diceDisplay + '</span>' : '');
    } else if (lib.type === 'san') {
      div.innerHTML = '<span class="status-name">SAN値</span><span class="status-value">' + lib.value + ' / ' + lib.max + '</span>';
    } else if (lib.type === 'counter') {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span><span class="status-value">' + lib.value + '</span>';
    } else if (lib.type === 'money') {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span><span class="status-value">' + lib.value + lib.unit + '</span>';
    } else if (lib.type === 'time') {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span><span class="status-value">' + lib.value + lib.unit + '</span>';
    } else if (lib.type === 'flag') {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span><span class="status-value">' + (lib.value ? 'ON' : 'OFF') + '</span>';
    } else if (lib.type === 'status') {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span><span class="status-value">' + lib.value + '</span>';
    }
    bar.appendChild(div);
  });
}

function rollDice(libIndex) {
  const lib = state[libIndex];
  let total = 0;
  for (let i = 0; i < lib.count; i++) {
    total += Math.floor(Math.random() * lib.faces) + 1;
  }
  state[libIndex].result = total;
  lastDiceResult = total;
  renderStatus();
}

function rollSaikoro(libIndex) {
  const lib = state[libIndex];
  const results = [];
  for (let i = 0; i < lib.count; i++) {
    results.push(Math.floor(Math.random() * 6) + 1);
  }
  state[libIndex].results = results;
  lastDiceResult = results.reduce((a, b) => a + b, 0);
  renderStatus();
}

function checkCondition(btn) {
  const cond = btn.ifCondition;
  if (!cond || cond.type === 'none') return true;
  if (cond.type === 'flag') return flags.includes(cond.tag);
  if (cond.type === 'dice') return lastDiceResult !== null && lastDiceResult >= cond.diceMin;
  return true;
}

function applyLibEffect(btn) {
  if (!btn.libEffect || !btn.libEffect.libId) return null;
  const lib = state.find(l => l.id === btn.libEffect.libId);
  if (!lib) return null;
  const change = btn.libEffect.change || 0;
  if (['affection', 'san', 'counter', 'money', 'time'].includes(lib.type)) {
    lib.value = Math.max(0, (lib.value || 0) + change);
  }
  if (btn.libEffect.branchMin !== '' && btn.libEffect.branchMin !== undefined) {
    const min = parseInt(btn.libEffect.branchMin);
    if (lib.value >= min && btn.libEffect.branchMinScene) {
      return btn.libEffect.branchMinScene;
    } else if (lib.value < min && btn.libEffect.branchElseScene) {
      return btn.libEffect.branchElseScene;
    }
  }
  return null;
}

function applyDiceFlag(btn) {
  if (!btn.diceFlag || !btn.diceFlag.libId) return;
  const lib = state.find(l => l.id === btn.diceFlag.libId);
  if (!lib) return;
  const result = lib.type === 'saikoro'
    ? (lib.results || []).reduce((a, b) => a + b, 0)
    : lib.result || 0;
  const min = parseInt(btn.diceFlag.min) || 1;
  if (result >= min) {
    if (btn.diceFlag.successFlag) flags.push(btn.diceFlag.successFlag);
  } else {
    if (btn.diceFlag.failFlag) flags.push(btn.diceFlag.failFlag);
  }
}

function renderButtons(scene) {
  const btns = document.getElementById('buttons');
  btns.innerHTML = '';
  scene.buttons.forEach(btn => {
    if (!checkCondition(btn)) return;
    const button = document.createElement('button');
    button.className = 'choice-btn';
    button.textContent = btn.label;
    button.style.background = btn.color;
    button.onclick = () => {
      if (btn.flagGive) flags.push(btn.flagGive);
      applyDiceFlag(btn);
      const branchScene = applyLibEffect(btn);
      const nextScene = branchScene || btn.next;
      showScene(nextScene);
    };
    btns.appendChild(button);
  });
}

window.rollDice = rollDice;
window.rollSaikoro = rollSaikoro;

init();