import { db, auth, onAuthStateChanged, signOut } from './firebase.js';
import { doc, getDoc, updateDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const gameId = params.get('id');

let currentUser = null;
let currentMode = 'simple';
let currentGenre = [];
let scenes = {};
let sceneCount = 0;
let libraries = [];
let customVars = [];
let thumbnailData = null;
let activeButtonTab = {};

// お絵かき
let editDrawCanvas, editDrawCtx;
let editDrawTool = 'pen';
let editDrawMode = 'normal';
let editDotSize = 8;
let editPenSize = 4;
let editDrawColor = '#000000';
let isEditDrawing = false;
let editDrawHistory = [];
let editDrawRedoStack = [];
let editDrawZoom = 1;
let editDrawOffset = { x: 0, y: 0 };
let editLastDrawPos = null;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const palette = ['#e94560','#1a6fc4','#1d9e75','#7f77dd','#e8760a','#d4537e','#444441','#0f6e56'];

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-btns').style.display = 'none';
    document.getElementById('user-name-text').textContent = user.displayName || user.email;
    await loadGame();
  } else {
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-btns').style.display = 'flex';
    document.getElementById('not-authorized').style.display = 'block';
  }
});

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

async function logout() { await signOut(auth); location.href = 'index.html'; }

async function loadGame() {
  if (!gameId) { document.getElementById('not-authorized').style.display = 'block'; return; }
  try {
    const docSnap = await getDoc(doc(db, 'games', gameId));
    if (!docSnap.exists()) { document.getElementById('not-authorized').style.display = 'block'; return; }
    const game = docSnap.data();
    if (game.uid !== currentUser.uid) { document.getElementById('not-authorized').style.display = 'block'; return; }

    document.getElementById('edit-main').style.display = 'block';
    currentMode = game.mode || 'simple';
    currentGenre = game.genres || [game.genre] || [];
    libraries = game.libraries || [];
    customVars = game.customVars || [];
    scenes = game.story || {};
    sceneCount = Object.keys(scenes).length;
    thumbnailData = game.thumbnail || null;

    document.getElementById('edit-title').value = game.title || '';
    document.getElementById('edit-description').value = game.description || '';
    document.getElementById('edit-tags').value = (game.tags || []).join(' ');
    document.getElementById('edit-library-panel').style.display = currentMode === 'simple' ? 'none' : 'block';

    document.querySelectorAll('#edit-genre-checkboxes input[type="checkbox"]').forEach(c => {
      c.checked = currentGenre.includes(c.value);
    });
    document.getElementById('edit-genre-count').textContent = currentGenre.length + ' / 3 選択中';

    if (thumbnailData) {
      const preview = document.getElementById('edit-thumbnail-preview');
      preview.src = thumbnailData; preview.style.display = 'block';
    }

    renderEditLibrary();
    renderEditCustomVars();
    renderEditTree();
    updateEditSceneStats();
  } catch (e) { alert('読み込みエラー：' + e.message); }
}

function updateEditGenre() {
  const checkboxes = document.querySelectorAll('#edit-genre-checkboxes input[type="checkbox"]');
  const checked = Array.from(checkboxes).filter(c => c.checked);
  if (checked.length > 3) { event.target.checked = false; alert('ジャンルは3つまで選択できます'); return; }
  currentGenre = checked.map(c => c.value);
  document.getElementById('edit-genre-count').textContent = currentGenre.length + ' / 3 選択中';
}

function previewEditThumbnail(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    thumbnailData = e.target.result;
    const preview = document.getElementById('edit-thumbnail-preview');
    preview.src = thumbnailData; preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function updateGame() {
  if (!currentUser || !gameId) return;
  const title = document.getElementById('edit-title').value;
  const description = document.getElementById('edit-description').value;
  const tagsInput = document.getElementById('edit-tags').value;
  const tags = tagsInput ? tagsInput.trim().split(/\s+/) : [];
  if (!title) { alert('タイトルを入力してください'); return; }
  if (currentGenre.length === 0) { alert('ジャンルを1つ以上選択してください'); return; }
  try {
    await updateDoc(doc(db, 'games', gameId), {
      title, description, tags, genres: currentGenre, genre: currentGenre[0],
      thumbnail: thumbnailData || '',
      libraries: JSON.parse(JSON.stringify(libraries)),
      customVars: JSON.parse(JSON.stringify(customVars)),
      story: JSON.parse(JSON.stringify(scenes)),
      updatedAt: new Date().toISOString()
    });
    alert('更新しました！');
    location.href = 'mypage.html';
  } catch (e) { alert('エラー：' + e.message); }
}

async function saveDraft() {
  if (!currentUser) return;
  const title = document.getElementById('edit-title').value || '無題の下書き';
  const draft = {
    title, genres: currentGenre, genre: currentGenre[0] || '',
    description: document.getElementById('edit-description').value,
    tags: (document.getElementById('edit-tags').value || '').trim().split(/\s+/).filter(Boolean),
    author: currentUser.displayName || currentUser.email,
    uid: currentUser.uid, thumbnail: thumbnailData || '', mode: currentMode,
    libraries: JSON.parse(JSON.stringify(libraries)),
    customVars: JSON.parse(JSON.stringify(customVars)),
    story: JSON.parse(JSON.stringify(scenes)),
    savedAt: new Date().toISOString()
  };
  try {
    await addDoc(collection(db, 'drafts'), draft);
    alert('下書きに保存しました！');
  } catch (e) { alert('エラー：' + e.message); }
}

function switchEditTab(tab) {
  document.querySelectorAll('.create-tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('edit-editor-panel').style.display = tab === 'editor' ? 'block' : 'none';
  document.getElementById('edit-draw-panel').style.display = tab === 'draw' ? 'block' : 'none';
  if (tab === 'draw') initEditDrawCanvas();
}

// シーン操作
function addEditScene() {
  sceneCount++;
  const id = 'scene' + sceneCount;
  scenes[id] = { id, title: '', text: '', buttons: [], elements: [], sceneConditions: [], sceneConditionMode: 'all', sceneConditionFail: '', memo: '' };
  renderEditTree(); updateEditSceneStats(); return id;
}

function deleteEditScene(sceneId) {
  if (Object.keys(scenes).length <= 1) { alert('最低1つのシーンが必要です'); return; }
  delete scenes[sceneId];
  const oldIds = Object.keys(scenes);
  const newScenes = {}, idMap = {};
  oldIds.forEach((oldId, index) => { idMap[oldId] = 'scene' + (index + 1); });
  oldIds.forEach(oldId => {
    const scene = scenes[oldId];
    const newId = idMap[oldId];
    scene.id = newId;
    scene.buttons.forEach(btn => {
      btn.next = idMap[btn.next] || Object.keys(idMap)[0];
      if (btn.extraDests) btn.extraDests.forEach(d => { d.next = idMap[d.next] || Object.keys(idMap)[0]; });
      if (btn.libEffect) {
        if (btn.libEffect.branchMinScene) btn.libEffect.branchMinScene = idMap[btn.libEffect.branchMinScene] || '';
        if (btn.libEffect.branchElseScene) btn.libEffect.branchElseScene = idMap[btn.libEffect.branchElseScene] || '';
      }
    });
    if (scene.sceneConditionFail) scene.sceneConditionFail = idMap[scene.sceneConditionFail] || '';
    newScenes[newId] = scene;
  });
  scenes = newScenes; sceneCount = Object.keys(scenes).length;
  renderEditTree(); updateEditSceneStats();
}

function copyEditScene(sceneId) {
  const original = scenes[sceneId];
  const newScene = JSON.parse(JSON.stringify(original));
  sceneCount++;
  const newId = 'scene' + sceneCount;
  newScene.id = newId;
  newScene.title = newScene.title ? newScene.title + ' (コピー)' : 'コピー';
  scenes[newId] = newScene;
  renderEditTree(); updateEditSceneStats();
}

function sortEditScenes() {
  const sceneList = Object.values(scenes);
  if (sceneList.length === 0) return;
  const root = sceneList[0];
  const sorted = {};
  const visited = new Set();
  let counter = 1;
  function traverse(sceneId) {
    if (!sceneId || visited.has(sceneId) || !scenes[sceneId]) return;
    visited.add(sceneId);
    const scene = scenes[sceneId];
    const newId = 'scene' + counter++;
    sorted[newId] = { ...scene, id: newId };
    scene.buttons.forEach(btn => traverse(btn.next));
  }
  traverse(root.id);
  Object.keys(scenes).forEach(id => {
    if (!visited.has(id)) { const newId = 'scene' + counter++; sorted[newId] = { ...scenes[id], id: newId }; }
  });
  scenes = sorted; sceneCount = Object.keys(scenes).length;
  renderEditTree(); updateEditSceneStats();
  alert('自動整列しました！');
}

function updateEditSceneStats() {
  const statsEl = document.getElementById('edit-scene-stats');
  if (!statsEl) return;
  const sceneNum = Object.keys(scenes).length;
  let charCount = 0;
  Object.values(scenes).forEach(s => { charCount += (s.text || '').length; });
  statsEl.textContent = '(' + sceneNum + 'シーン・' + charCount + '文字)';
}

function addEditButton(sceneId) {
  const scene = scenes[sceneId];
  const label = ALPHABET[scene.buttons.length];
  if (!label) { alert('ボタンはZまで追加できます'); return; }
  const nextId = addEditScene();
  scene.buttons.push({
    label, color: '#00c896', next: nextId, flagGive: [],
    ifConditions: [], ifMode: 'all',
    libEffect: { libId: '', change: 0, branchMin: '', branchMinScene: '', branchElseScene: '' },
    diceFlag: { libId: '', min: 1, successFlag: '', failFlag: '' },
    varEffect: { varName: '', change: 0 },
    extraDests: []
  });
  renderEditTree();
}

function deleteEditButton(sceneId, btnIndex) { scenes[sceneId].buttons.splice(btnIndex, 1); renderEditTree(); }
function updateEditButtonColor(sceneId, btnIndex, color) { scenes[sceneId].buttons[btnIndex].color = color; renderEditTree(); }
function updateEditSceneText(sceneId, value) { scenes[sceneId].text = value; updateEditSceneStats(); }
function updateEditSceneMemo(sceneId, value) { scenes[sceneId].memo = value; }
function updateEditSceneTitle(sceneId, value) { scenes[sceneId].title = value; }

function toggleEditButtonTab(sceneId, btnIndex, tab) {
  const key = sceneId + '_' + btnIndex;
  activeButtonTab[key] = activeButtonTab[key] === tab ? null : tab;
  renderEditTree();
}

function addEditFlagGive(sceneId, btnIndex) {
  const flag = prompt('付与するタグ名を入力'); if (!flag) return;
  if (!scenes[sceneId].buttons[btnIndex].flagGive) scenes[sceneId].buttons[btnIndex].flagGive = [];
  scenes[sceneId].buttons[btnIndex].flagGive.push(flag);
  renderEditTree();
}

function removeEditFlagGive(sceneId, btnIndex, flagIndex) {
  scenes[sceneId].buttons[btnIndex].flagGive.splice(flagIndex, 1);
  renderEditTree();
}

function addEditIfCondition(sceneId, btnIndex) {
  if (!scenes[sceneId].buttons[btnIndex].ifConditions) scenes[sceneId].buttons[btnIndex].ifConditions = [];
  scenes[sceneId].buttons[btnIndex].ifConditions.push({ type: 'flag', tag: '', diceMin: 1, varName: '', varMin: 0 });
  renderEditTree();
}

function removeEditIfCondition(sceneId, btnIndex, condIndex) {
  scenes[sceneId].buttons[btnIndex].ifConditions.splice(condIndex, 1);
  renderEditTree();
}

function addEditSceneCondition(sceneId) {
  if (!scenes[sceneId].sceneConditions) scenes[sceneId].sceneConditions = [];
  scenes[sceneId].sceneConditions.push({ type: 'flag', tag: '', varName: '', varMin: 0 });
  renderEditTree();
}

function removeEditSceneCondition(sceneId, condIndex) {
  scenes[sceneId].sceneConditions.splice(condIndex, 1);
  renderEditTree();
}

function addEditExtraDest(sceneId, btnIndex) {
  if (!scenes[sceneId].buttons[btnIndex].extraDests) scenes[sceneId].buttons[btnIndex].extraDests = [];
  scenes[sceneId].buttons[btnIndex].extraDests.push({ type: 'flag', next: Object.keys(scenes)[0], flag: '', prob: 50, varName: '', varMin: 0 });
  renderEditTree();
}

function removeEditExtraDest(sceneId, btnIndex, destIndex) {
  scenes[sceneId].buttons[btnIndex].extraDests.splice(destIndex, 1);
  renderEditTree();
}

function addEditCustomVar() {
  const name = prompt('変数名を入力'); if (!name) return;
  const type = prompt('型を入力（number / text / bool）'); if (!type) return;
  const init = prompt('初期値を入力'); if (init === null) return;
  customVars.push({ name, type, value: type === 'number' ? parseInt(init) : type === 'bool' ? init === 'true' : init });
  renderEditCustomVars();
}

function removeEditCustomVar(index) { customVars.splice(index, 1); renderEditCustomVars(); }

function renderEditCustomVars() {
  const list = document.getElementById('edit-custom-var-list');
  if (!list) return;
  list.innerHTML = '';
  customVars.forEach((v, i) => {
    const div = document.createElement('div');
    div.className = 'lib-item';
    div.innerHTML = '<span class="lib-preview">' + v.name + ' (' + v.type + ') = ' + v.value + '</span>' +
      '<button class="delete-btn" onclick="removeEditCustomVar(' + i + ')">✕</button>';
    list.appendChild(div);
  });
}

function addEditLibrary(type) {
  const lib = { type, id: 'lib' + Date.now() };
  if (type === 'affection') { const name = prompt('好感度の名前'); if (!name) return; const max = prompt('ハートの数'); if (!max) return; lib.name = name; lib.max = parseInt(max); lib.value = 0; }
  else if (type === 'dice') { const faces = prompt('面数'); if (!faces) return; const count = prompt('振る数'); if (!count) return; lib.faces = parseInt(faces); lib.count = parseInt(count); lib.name = count + 'd' + faces; lib.result = null; }
  else if (type === 'saikoro') { const count = prompt('個数（1〜6）'); if (!count) return; const c = Math.min(6, Math.max(1, parseInt(count))); lib.count = c; lib.faces = 6; lib.name = c + '個のさいころ'; lib.results = []; }
  else if (type === 'san') { const max = prompt('最大値'); if (!max) return; lib.name = 'SAN値'; lib.max = parseInt(max); lib.value = parseInt(max); }
  else if (type === 'counter') { const name = prompt('名前'); if (!name) return; const init = prompt('初期値'); if (init === null) return; lib.name = name; lib.value = parseInt(init); }
  else if (type === 'money') { const name = prompt('名前'); if (!name) return; const unit = prompt('単位'); if (!unit) return; const init = prompt('初期値'); if (init === null) return; lib.name = name; lib.unit = unit; lib.value = parseInt(init); }
  else if (type === 'time') { const name = prompt('名前'); if (!name) return; const unit = prompt('単位'); if (!unit) return; const init = prompt('初期値'); if (init === null) return; lib.name = name; lib.unit = unit; lib.value = parseInt(init); }
  else if (type === 'flag') { const name = prompt('フラグ名'); if (!name) return; lib.name = name; lib.value = false; }
  else if (type === 'status') { const name = prompt('状態名'); if (!name) return; const options = prompt('選択肢をカンマ区切りで'); if (!options) return; lib.name = name; lib.options = options.split(','); lib.value = lib.options[0]; }
  else if (type === 'hp') { const max = prompt('最大値'); if (!max) return; lib.name = 'HP'; lib.max = parseInt(max); lib.value = parseInt(max); }
  else if (type === 'mp') { const max = prompt('最大値'); if (!max) return; lib.name = 'MP'; lib.max = parseInt(max); lib.value = parseInt(max); }
  else if (type === 'level') { lib.name = 'レベル'; lib.value = 1; }
  else if (type === 'exp') { const next = prompt('次のレベルまでのEXP'); if (!next) return; lib.name = 'EXP'; lib.value = 0; lib.nextLevel = parseInt(next); }
  else if (type === 'inventory') { lib.name = 'アイテム'; lib.items = []; }
  else if (type === 'skill') { const name = prompt('技能名'); if (!name) return; const value = prompt('技能値'); if (!value) return; lib.name = name + '技能'; lib.skillName = name; lib.value = parseInt(value); }
  else if (type === 'charsheet') { const name = prompt('項目名'); if (!name) return; const value = prompt('初期値'); if (!value) return; lib.name = name; lib.value = parseInt(value); }
  else if (type === 'score') { lib.name = 'スコア'; lib.value = 0; lib.total = 0; }
  else if (type === 'timer') { const sec = prompt('制限時間（秒）'); if (!sec) return; lib.name = 'タイマー'; lib.seconds = parseInt(sec); lib.remaining = parseInt(sec); lib.active = false; }
  else if (type === 'result') { lib.name = '結果表示'; lib.message = ''; }
  else if (type === 'character') { const name = prompt('キャラクター名'); if (!name) return; lib.name = name; lib.charName = name; lib.image = ''; lib.expression = '通常'; lib.expressions = ['通常']; lib.value = 0; }
  libraries.push(lib);
  renderEditLibrary();
}

function renderEditLibrary() {
  const list = document.getElementById('edit-library-list');
  if (!list) return;
  list.innerHTML = '';
  libraries.forEach((lib, i) => {
    const div = document.createElement('div');
    div.className = 'lib-item';
    let preview = lib.name || lib.type;
    if (lib.type === 'affection') preview = lib.name + ' ' + '♡'.repeat(lib.max);
    else if (lib.type === 'hp' || lib.type === 'mp') preview = lib.name + ' ' + lib.value + '/' + lib.max;
    else if (lib.type === 'san') preview = 'SAN値 ' + lib.value + '/' + lib.max;
    else if (lib.type === 'timer') preview = 'タイマー ' + lib.seconds + '秒';
    else if (lib.type === 'character') preview = lib.name + '（キャラクター）';
    else if (lib.value !== undefined) preview = lib.name + ' ' + lib.value + (lib.unit || '');
    div.innerHTML = '<span class="lib-preview">' + preview + '</span>' +
      '<button class="delete-btn" onclick="deleteEditLibrary(' + i + ')">✕</button>';
    list.appendChild(div);
  });
}

function deleteEditLibrary(index) { libraries.splice(index, 1); renderEditLibrary(); }

function getEditSceneOptions() {
  return Object.keys(scenes).map(id =>
    '<option value="' + id + '">' + id + (scenes[id].title ? ' (' + scenes[id].title + ')' : '') + '</option>'
  ).join('');
}

function getEditLibOptions() {
  return '<option value="">なし</option>' + libraries.map(lib => '<option value="' + lib.id + '">' + lib.name + '</option>').join('');
}

function getEditDiceLibOptions() {
  return '<option value="">なし</option>' + libraries.filter(lib => lib.type === 'dice' || lib.type === 'saikoro').map(lib => '<option value="' + lib.id + '">' + lib.name + '</option>').join('');
}

function getEditVarOptions() {
  return '<option value="">なし</option>' + customVars.map(v => '<option value="' + v.name + '">' + v.name + '</option>').join('');
}

function renderEditTree() {
  const tree = document.getElementById('edit-scene-tree');
  tree.innerHTML = '';
  Object.values(scenes).forEach(scene => tree.appendChild(createEditSceneCard(scene)));
}

function createEditSceneCard(scene) {
  const card = document.createElement('div');
  card.className = 'scene-card';

  const allVarNames = [...libraries.map(l => '{' + l.name + '}'), ...customVars.map(v => '{' + v.name + '}')];
  const hintText = allVarNames.length > 0 ? '文章に ' + allVarNames.join(' ') + ' と書くと値が表示されます' : '{ 変数名 } と書くと値が表示されます';

  const sceneConditions = scene.sceneConditions || [];
  const sceneCondMode = scene.sceneConditionMode || 'all';
  const sceneCondFail = scene.sceneConditionFail || '';

  const sceneCondHTML = sceneConditions.map((cond, ci) =>
    '<div class="if-condition-row">' +
    '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].sceneConditions[' + ci + '].type = this.value; renderEditTree()">' +
    '<option value="flag"' + (cond.type === 'flag' ? ' selected' : '') + '>タグを持っている</option>' +
    '<option value="var"' + (cond.type === 'var' ? ' selected' : '') + '>変数が○以上</option>' +
    '</select>' +
    (cond.type === 'flag' ? '<input type="text" class="btn-option-input" placeholder="タグ名" value="' + (cond.tag || '') + '" oninput="scenes[\'' + scene.id + '\'].sceneConditions[' + ci + '].tag = this.value">' : '') +
    (cond.type === 'var' ? '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].sceneConditions[' + ci + '].varName = this.value">' + getEditVarOptions() + '</select><input type="number" class="btn-option-input-sm" value="' + (cond.varMin || 0) + '" oninput="scenes[\'' + scene.id + '\'].sceneConditions[' + ci + '].varMin = parseInt(this.value)">' : '') +
    '<button class="delete-btn" onclick="removeEditSceneCondition(\'' + scene.id + '\', ' + ci + ')">✕</button></div>'
  ).join('');

  const sceneCondPanel = currentMode === 'normal' ?
    '<div class="scene-condition-panel"><div class="scene-condition-title">🔒 このシーンの表示条件</div>' +
    '<div class="btn-option-row"><span class="btn-option-label">条件モード：</span>' +
    '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].sceneConditionMode = this.value">' +
    '<option value="all"' + (sceneCondMode === 'all' ? ' selected' : '') + '>全て満たす（AND）</option>' +
    '<option value="any"' + (sceneCondMode === 'any' ? ' selected' : '') + '>どれか満たす（OR）</option>' +
    '</select></div>' + sceneCondHTML +
    '<button class="add-btn" onclick="addEditSceneCondition(\'' + scene.id + '\')">＋ 条件を追加</button>' +
    (sceneConditions.length > 0 ? '<div class="btn-option-row"><span class="btn-option-label">条件未達成時：</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].sceneConditionFail = this.value">' + getEditSceneOptions().replace('value="' + sceneCondFail + '"', 'value="' + sceneCondFail + '" selected') + '</select></div>' : '') +
    '</div>' : '';

  let buttonsHTML = '';
  if (currentMode === 'simple') {
    buttonsHTML = scene.buttons.map((btn, i) => {
      const sceneOpts = Object.keys(scenes).map(id => '<option value="' + id + '"' + (btn.next === id ? ' selected' : '') + '>' + id + (scenes[id].title ? ' (' + scenes[id].title + ')' : '') + '</option>').join('');
      return '<div class="button-row"><span class="btn-label" style="background:#00c896">【' + btn.label + '】</span><span class="btn-option-label" style="color:#00a878;font-weight:700;margin-left:8px;">飛び先：</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].next = this.value">' + sceneOpts + '</select><button class="delete-btn" onclick="deleteEditButton(\'' + scene.id + '\', ' + i + ')">✕</button></div>';
    }).join('');
  } else {
    buttonsHTML = scene.buttons.map((btn, i) => {
      const key = scene.id + '_' + i;
      const activeTab = activeButtonTab[key] || null;
      const sceneOpts = getEditSceneOptions();
      const libOpts = getEditLibOptions();
      const diceOpts = getEditDiceLibOptions();
      const varOpts = getEditVarOptions();
      const flagGives = (btn.flagGive || []).map((f, fi) => '<span class="flag-tag">' + f + ' <span onclick="removeEditFlagGive(\'' + scene.id + '\', ' + i + ', ' + fi + ')">✕</span></span>').join('');
      const ifConditionsHTML = (btn.ifConditions || []).map((cond, ci) =>
        '<div class="if-condition-row"><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].type = this.value; renderEditTree()">' +
        '<option value="flag"' + (cond.type === 'flag' ? ' selected' : '') + '>タグを持っている</option>' +
        '<option value="dice"' + (cond.type === 'dice' ? ' selected' : '') + '>ダイス結果が○以上</option>' +
        '<option value="var"' + (cond.type === 'var' ? ' selected' : '') + '>変数が○以上</option></select>' +
        (cond.type === 'flag' ? '<input type="text" class="btn-option-input" placeholder="タグ名" value="' + (cond.tag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].tag = this.value">' : '') +
        (cond.type === 'dice' ? '<input type="number" class="btn-option-input-sm" value="' + (cond.diceMin || 1) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].diceMin = parseInt(this.value)">' : '') +
        (cond.type === 'var' ? '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].varName = this.value">' + varOpts + '</select><input type="number" class="btn-option-input-sm" value="' + (cond.varMin || 0) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].varMin = parseInt(this.value)">' : '') +
        '<button class="delete-btn" onclick="removeEditIfCondition(\'' + scene.id + '\', ' + i + ', ' + ci + ')">✕</button></div>'
      ).join('');
      const extraDestsHTML = (btn.extraDests || []).map((dest, di) =>
        '<div class="extra-dest-row"><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].extraDests[' + di + '].type = this.value; renderEditTree()">' +
        '<option value="flag"' + (dest.type === 'flag' ? ' selected' : '') + '>フラグ条件</option>' +
        '<option value="random"' + (dest.type === 'random' ? ' selected' : '') + '>ランダム</option>' +
        '<option value="var"' + (dest.type === 'var' ? ' selected' : '') + '>変数条件</option></select>' +
        (dest.type === 'flag' ? '<input type="text" class="btn-option-input" placeholder="フラグ名" value="' + (dest.flag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].extraDests[' + di + '].flag = this.value">' : '') +
        (dest.type === 'random' ? '<input type="number" class="btn-option-input-sm" value="' + (dest.prob || 50) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].extraDests[' + di + '].prob = parseInt(this.value)"><span class="btn-option-hint">%の確率で</span>' : '') +
        (dest.type === 'var' ? '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].extraDests[' + di + '].varName = this.value">' + varOpts + '</select><input type="number" class="btn-option-input-sm" value="' + (dest.varMin || 0) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].extraDests[' + di + '].varMin = parseInt(this.value)"><span class="btn-option-hint">以上なら</span>' : '') +
        '<span class="btn-option-hint">→</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].extraDests[' + di + '].next = this.value">' + sceneOpts.replace('value="' + (dest.next || '') + '"', 'value="' + (dest.next || '') + '" selected') + '</select>' +
        '<button class="delete-btn" onclick="removeEditExtraDest(\'' + scene.id + '\', ' + i + ', ' + di + ')">✕</button></div>'
      ).join('');

      return '<div class="btn-block"><div class="button-row"><span class="btn-label" style="background:' + btn.color + '">【' + btn.label + '】</span><span class="btn-arrow">→</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].next = this.value">' + sceneOpts.replace('value="' + btn.next + '"', 'value="' + btn.next + '" selected') + '</select><button class="extra-dest-add-btn" onclick="addEditExtraDest(\'' + scene.id + '\', ' + i + ')">＋</button><button class="delete-btn" onclick="deleteEditButton(\'' + scene.id + '\', ' + i + ')">✕</button></div>' +
        (extraDestsHTML ? '<div class="extra-dests">' + extraDestsHTML + '</div>' : '') +
        '<div class="btn-tab-bar"><button class="btn-tab' + (activeTab === 'color' ? ' active' : '') + '" onclick="toggleEditButtonTab(\'' + scene.id + '\', ' + i + ', \'color\')">🎨 色</button><button class="btn-tab' + (activeTab === 'flag' ? ' active' : '') + '" onclick="toggleEditButtonTab(\'' + scene.id + '\', ' + i + ', \'flag\')">🚩 フラグ</button><button class="btn-tab' + (activeTab === 'lib' ? ' active' : '') + '" onclick="toggleEditButtonTab(\'' + scene.id + '\', ' + i + ', \'lib\')">📚 ライブラリ</button><button class="btn-tab' + (activeTab === 'var' ? ' active' : '') + '" onclick="toggleEditButtonTab(\'' + scene.id + '\', ' + i + ', \'var\')">🔢 変数</button><button class="btn-tab' + (activeTab === 'if' ? ' active' : '') + '" onclick="toggleEditButtonTab(\'' + scene.id + '\', ' + i + ', \'if\')">❓ IF条件</button><button class="btn-tab' + (activeTab === 'dice' ? ' active' : '') + '" onclick="toggleEditButtonTab(\'' + scene.id + '\', ' + i + ', \'dice\')">🎲 ダイス</button></div>' +
        (activeTab === 'color' ? '<div class="btn-tab-content"><div class="color-palette">' + palette.map(c => '<span class="palette-dot' + (btn.color === c ? ' selected' : '') + '" style="background:' + c + '" onclick="updateEditButtonColor(\'' + scene.id + '\', ' + i + ', \'' + c + '\')"></span>').join('') + '</div><input type="color" value="' + btn.color + '" onchange="updateEditButtonColor(\'' + scene.id + '\', ' + i + ', this.value)"></div>' : '') +
        (activeTab === 'flag' ? '<div class="btn-tab-content"><div class="flag-tags">' + flagGives + '</div><button class="add-btn" onclick="addEditFlagGive(\'' + scene.id + '\', ' + i + ')">＋ フラグを追加</button></div>' : '') +
        (activeTab === 'lib' ? '<div class="btn-tab-content"><div class="btn-option-row"><span class="btn-option-label">対象：</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.libId = this.value">' + libOpts + '</select><span class="btn-option-label">変化：</span><input type="number" class="btn-option-input-sm" value="' + (btn.libEffect.change || 0) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.change = parseInt(this.value)"></div><div class="btn-option-row"><span class="btn-option-hint">値が</span><input type="number" class="btn-option-input-sm" value="' + (btn.libEffect.branchMin || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.branchMin = this.value"><span class="btn-option-hint">以上なら</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.branchMinScene = this.value">' + sceneOpts + '</select><span class="btn-option-hint">未満なら</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.branchElseScene = this.value">' + sceneOpts + '</select></div></div>' : '') +
        (activeTab === 'var' ? '<div class="btn-tab-content"><div class="btn-option-row"><span class="btn-option-label">変数：</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].varEffect.varName = this.value">' + varOpts + '</select><span class="btn-option-label">変化：</span><input type="number" class="btn-option-input-sm" value="' + (btn.varEffect ? btn.varEffect.change || 0 : 0) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].varEffect.change = parseInt(this.value)"></div></div>' : '') +
        (activeTab === 'if' ? '<div class="btn-tab-content"><div class="btn-option-row"><span class="btn-option-label">条件モード：</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifMode = this.value"><option value="all"' + ((btn.ifMode || 'all') === 'all' ? ' selected' : '') + '>全て満たす（AND）</option><option value="any"' + ((btn.ifMode || 'all') === 'any' ? ' selected' : '') + '>どれか満たす（OR）</option></select></div>' + ifConditionsHTML + '<button class="add-btn" onclick="addEditIfCondition(\'' + scene.id + '\', ' + i + ')">＋ 条件を追加</button></div>' : '') +
        (activeTab === 'dice' ? '<div class="btn-tab-content"><div class="btn-option-row"><span class="btn-option-label">ダイス：</span><select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.libId = this.value">' + diceOpts + '</select><span class="btn-option-label">以上：</span><input type="number" class="btn-option-input-sm" value="' + (btn.diceFlag.min || 1) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.min = parseInt(this.value)"></div><div class="btn-option-row"><span class="btn-option-hint">成功フラグ：</span><input type="text" class="btn-option-input" value="' + (btn.diceFlag.successFlag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.successFlag = this.value"><span class="btn-option-hint">失敗フラグ：</span><input type="text" class="btn-option-input" value="' + (btn.diceFlag.failFlag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.failFlag = this.value"></div></div>' : '') +
        '</div>';
    }).join('');
  }

  card.innerHTML =
    '<div class="scene-header"><span class="scene-label">' + scene.id + '</span><input type="text" class="scene-title-input" placeholder="シーンタイトル（任意）" value="' + (scene.title || '') + '" oninput="updateEditSceneTitle(\'' + scene.id + '\', this.value)"><button class="copy-scene-btn" onclick="copyEditScene(\'' + scene.id + '\')" title="コピー">📋</button><button class="delete-scene-btn" onclick="deleteEditScene(\'' + scene.id + '\')">✕</button></div>' +
    sceneCondPanel +
    '<textarea placeholder="シーンのテキストを入力...&#10;ヒント：' + hintText + '" oninput="updateEditSceneText(\'' + scene.id + '\', this.value)">' + scene.text + '</textarea>' +
    '<details class="scene-memo-wrap"><summary>📝 メモ（作者のみ表示）</summary><textarea class="scene-memo" placeholder="メモを入力..." oninput="updateEditSceneMemo(\'' + scene.id + '\', this.value)">' + (scene.memo || '') + '</textarea></details>' +
    '<div class="buttons-list">' + buttonsHTML + '</div>' +
    '<div class="scene-actions"><button class="add-btn" onclick="addEditButton(\'' + scene.id + '\')">＋ ボタン追加</button><button class="add-btn" onclick="addEditScene()">＋ シーン追加</button></div>';

  return card;
}

// お絵かき（edit用）
function initEditDrawCanvas() {
  editDrawCanvas = document.getElementById('edit-draw-canvas');
  if (!editDrawCanvas || editDrawCanvas._bound) return;
  editDrawCtx = editDrawCanvas.getContext('2d');
  editDrawCanvas._bound = true;

  editDrawCanvas.addEventListener('mousedown', e => {
    const pos = getEditDrawPos(e);
    if (editDrawTool === 'eyedrop') { pickEditColor(pos); return; }
    if (editDrawTool === 'fill') { floodEditFill(pos); return; }
    isEditDrawing = true; editLastDrawPos = pos;
    saveEditDrawHistory();
    if (editDrawTool === 'pen') drawEditDot(pos);
    if (editDrawTool === 'eraser') eraseEditDot(pos);
  });
  editDrawCanvas.addEventListener('mousemove', e => {
    if (!isEditDrawing) return;
    const pos = getEditDrawPos(e);
    if (editDrawTool === 'pen') drawEditLine(editLastDrawPos, pos);
    if (editDrawTool === 'eraser') eraseEditLine(editLastDrawPos, pos);
    editLastDrawPos = pos;
  });
  editDrawCanvas.addEventListener('mouseup', () => { isEditDrawing = false; editLastDrawPos = null; });
  editDrawCanvas.addEventListener('mouseleave', () => { isEditDrawing = false; });
}

function getEditDrawPos(e) {
  const rect = editDrawCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / editDrawZoom;
  const y = (e.clientY - rect.top) / editDrawZoom;
  if (editDrawMode === 'dot') return { x: Math.floor(x / editDotSize) * editDotSize, y: Math.floor(y / editDotSize) * editDotSize };
  return { x, y };
}

function drawEditDot(pos) {
  if (!editDrawCtx) return;
  editDrawCtx.fillStyle = editDrawColor;
  if (editDrawMode === 'dot') editDrawCtx.fillRect(pos.x, pos.y, editDotSize, editDotSize);
  else { editDrawCtx.beginPath(); editDrawCtx.arc(pos.x, pos.y, editPenSize / 2, 0, Math.PI * 2); editDrawCtx.fill(); }
}

function drawEditLine(from, to) {
  if (!editDrawCtx || !from || !to) return;
  if (editDrawMode === 'dot') {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / editDotSize;
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      editDrawCtx.fillStyle = editDrawColor;
      editDrawCtx.fillRect(Math.floor((from.x + (to.x - from.x) * t) / editDotSize) * editDotSize, Math.floor((from.y + (to.y - from.y) * t) / editDotSize) * editDotSize, editDotSize, editDotSize);
    }
  } else {
    editDrawCtx.save(); editDrawCtx.strokeStyle = editDrawColor; editDrawCtx.lineWidth = editPenSize; editDrawCtx.lineCap = 'round'; editDrawCtx.lineJoin = 'round';
    editDrawCtx.beginPath(); editDrawCtx.moveTo(from.x, from.y); editDrawCtx.lineTo(to.x, to.y); editDrawCtx.stroke(); editDrawCtx.restore();
  }
}

function eraseEditDot(pos) { if (!editDrawCtx) return; const size = editDrawMode === 'dot' ? editDotSize : editPenSize; editDrawCtx.clearRect(pos.x - size / 2, pos.y - size / 2, size * 2, size * 2); }
function eraseEditLine(from, to) {
  if (!editDrawCtx || !from || !to) return;
  const size = editDrawMode === 'dot' ? editDotSize : editPenSize;
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / size;
  for (let i = 0; i <= steps; i++) { const t = steps === 0 ? 0 : i / steps; editDrawCtx.clearRect(from.x + (to.x - from.x) * t - size, from.y + (to.y - from.y) * t - size, size * 2, size * 2); }
}

function pickEditColor(pos) {
  if (!editDrawCtx) return;
  const pixel = editDrawCtx.getImageData(Math.floor(pos.x), Math.floor(pos.y), 1, 1).data;
  if (pixel[3] === 0) return;
  const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  setEditDrawColor(hex); document.getElementById('edit-draw-color').value = hex;
}

function floodEditFill(pos) {
  if (!editDrawCtx) return;
  const imageData = editDrawCtx.getImageData(0, 0, editDrawCanvas.width, editDrawCanvas.height);
  const data = imageData.data;
  const x = Math.floor(pos.x), y = Math.floor(pos.y);
  const idx = (y * editDrawCanvas.width + x) * 4;
  const targetR = data[idx], targetG = data[idx+1], targetB = data[idx+2], targetA = data[idx+3];
  const fillColor = { r: parseInt(editDrawColor.slice(1,3),16), g: parseInt(editDrawColor.slice(3,5),16), b: parseInt(editDrawColor.slice(5,7),16) };
  if (targetR === fillColor.r && targetG === fillColor.g && targetB === fillColor.b) return;
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    const i = (cy * editDrawCanvas.width + cx) * 4;
    if (cx < 0 || cx >= editDrawCanvas.width || cy < 0 || cy >= editDrawCanvas.height) continue;
    if (data[i] !== targetR || data[i+1] !== targetG || data[i+2] !== targetB || data[i+3] !== targetA) continue;
    data[i] = fillColor.r; data[i+1] = fillColor.g; data[i+2] = fillColor.b; data[i+3] = 255;
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
  editDrawCtx.putImageData(imageData, 0, 0);
}

function saveEditDrawHistory() { if (!editDrawCtx) return; editDrawHistory.push(editDrawCtx.getImageData(0, 0, editDrawCanvas.width, editDrawCanvas.height)); if (editDrawHistory.length > 50) editDrawHistory.shift(); editDrawRedoStack = []; }
function editDrawUndo() { if (!editDrawCtx || editDrawHistory.length === 0) return; editDrawRedoStack.push(editDrawCtx.getImageData(0, 0, editDrawCanvas.width, editDrawCanvas.height)); editDrawCtx.putImageData(editDrawHistory.pop(), 0, 0); }
function editDrawRedo() { if (!editDrawCtx || editDrawRedoStack.length === 0) return; editDrawHistory.push(editDrawCtx.getImageData(0, 0, editDrawCanvas.width, editDrawCanvas.height)); editDrawCtx.putImageData(editDrawRedoStack.pop(), 0, 0); }
function editDrawClear() { if (!editDrawCtx) return; saveEditDrawHistory(); editDrawCtx.clearRect(0, 0, editDrawCanvas.width, editDrawCanvas.height); }
function editDrawZoomIn() { editDrawZoom = Math.min(editDrawZoom + 0.2, 5); editDrawCanvas.style.transform = 'scale(' + editDrawZoom + ')'; editDrawCanvas.style.transformOrigin = '0 0'; }
function editDrawZoomOut() { editDrawZoom = Math.max(editDrawZoom - 0.2, 0.2); editDrawCanvas.style.transform = 'scale(' + editDrawZoom + ')'; editDrawCanvas.style.transformOrigin = '0 0'; }
function setEditDrawTool(tool) { editDrawTool = tool; document.querySelectorAll('#edit-draw-panel .draw-tool').forEach(b => b.classList.remove('active')); const btn = document.getElementById('edit-tool-' + tool); if (btn) btn.classList.add('active'); }
function setEditDrawMode(mode) { editDrawMode = mode; document.getElementById('edit-dot-size-group').style.display = mode === 'dot' ? 'flex' : 'none'; }
function setEditDotSize(size) { editDotSize = size; }
function setEditPenSize(size) { editPenSize = parseInt(size); document.getElementById('edit-pen-size-display').textContent = size; }
function setEditDrawColor(color) { editDrawColor = color; }
function applyEditDrawAsThumbnail() {
  if (!editDrawCanvas) return;
  thumbnailData = editDrawCanvas.toDataURL('image/png');
  const preview = document.getElementById('edit-thumbnail-preview');
  preview.src = thumbnailData; preview.style.display = 'block';
  alert('サムネイルに設定しました！');
}

// window登録
window.toggleUserMenu = toggleUserMenu;
window.logout = logout;
window.updateEditGenre = updateEditGenre;
window.previewEditThumbnail = previewEditThumbnail;
window.updateGame = updateGame;
window.saveDraft = saveDraft;
window.switchEditTab = switchEditTab;
window.addEditScene = addEditScene;
window.deleteEditScene = deleteEditScene;
window.copyEditScene = copyEditScene;
window.sortEditScenes = sortEditScenes;
window.addEditButton = addEditButton;
window.deleteEditButton = deleteEditButton;
window.updateEditButtonColor = updateEditButtonColor;
window.updateEditSceneText = updateEditSceneText;
window.updateEditSceneTitle = updateEditSceneTitle;
window.updateEditSceneMemo = updateEditSceneMemo;
window.addEditLibrary = addEditLibrary;
window.deleteEditLibrary = deleteEditLibrary;
window.addEditCustomVar = addEditCustomVar;
window.removeEditCustomVar = removeEditCustomVar;
window.renderEditTree = renderEditTree;
window.toggleEditButtonTab = toggleEditButtonTab;
window.addEditFlagGive = addEditFlagGive;
window.removeEditFlagGive = removeEditFlagGive;
window.addEditIfCondition = addEditIfCondition;
window.removeEditIfCondition = removeEditIfCondition;
window.addEditSceneCondition = addEditSceneCondition;
window.removeEditSceneCondition = removeEditSceneCondition;
window.addEditExtraDest = addEditExtraDest;
window.removeEditExtraDest = removeEditExtraDest;
window.setEditDrawTool = setEditDrawTool;
window.setEditDrawMode = setEditDrawMode;
window.setEditDotSize = setEditDotSize;
window.setEditPenSize = setEditPenSize;
window.setEditDrawColor = setEditDrawColor;
window.editDrawUndo = editDrawUndo;
window.editDrawRedo = editDrawRedo;
window.editDrawClear = editDrawClear;
window.editDrawZoomIn = editDrawZoomIn;
window.editDrawZoomOut = editDrawZoomOut;
window.applyEditDrawAsThumbnail = applyEditDrawAsThumbnail;
window.scenes = scenes;
