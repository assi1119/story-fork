import { db, auth, googleProvider, collection, addDoc, getDocs, query, orderBy, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from './firebase.js';
import { doc, updateDoc, deleteDoc, increment, getDoc, setDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ADMIN_UID = 'AQtwwjYoTwMbCsrsMI0PA69XE443';

let scenes = {};
let sceneCount = 0;
let currentMode = 'simple';
let currentGenre = [];
let libraries = [];
let customVars = [];
let currentFilterGenre = 'all';
let thumbnailData = null;
let currentUser = null;
let activeButtonTab = {};
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const palette = ['#e94560','#1a6fc4','#1d9e75','#7f77dd','#e8760a','#d4537e','#444441','#0f6e56'];

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-btns').style.display = 'none';
    document.getElementById('user-name-text').textContent = user.displayName || user.email;
    document.getElementById('game-author').value = user.displayName || user.email;
    document.getElementById('not-logged-in').style.display = 'none';
    document.getElementById('mode-select').style.display = 'block';
    await loadUserAvatar(user.uid);
    if (user.uid === ADMIN_UID) {
      document.getElementById('admin-notice-btn').style.display = 'block';
    }
  } else {
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-btns').style.display = 'flex';
    document.getElementById('game-author').value = '';
    document.getElementById('not-logged-in').style.display = 'block';
    document.getElementById('mode-select').style.display = 'none';
    document.getElementById('game-form').style.display = 'none';
  }
  loadNotices();
});

async function loadUserAvatar(uid) {
  try {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (docSnap.exists() && docSnap.data().avatar) {
      const img = document.getElementById('header-avatar');
      if (img) {
        img.src = docSnap.data().avatar;
        img.style.display = 'block';
        document.getElementById('header-avatar-placeholder').style.display = 'none';
      }
    }
  } catch (e) { console.log(e); }
}

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function toggleSideMenu() {
  const menu = document.getElementById('side-menu');
  const overlay = document.getElementById('side-overlay');
  const isOpen = menu.classList.contains('open');
  if (isOpen) {
    menu.classList.remove('open');
    overlay.classList.remove('open');
  } else {
    menu.classList.add('open');
    overlay.classList.add('open');
  }
}

document.addEventListener('click', e => {
  const menu = document.getElementById('user-name');
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown && menu && !menu.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

function showLoginModal() {
  document.getElementById('login-modal').style.display = 'flex';
}

function hideLoginModal() {
  document.getElementById('login-modal').style.display = 'none';
}

function switchModalTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    if (!user.displayName) {
      const name = prompt('ユーザー名を入力してください（製作者名として表示されます）');
      if (name) await updateProfile(user, { displayName: name });
    }
    hideLoginModal();
  } catch (e) {
    alert('Googleログインに失敗しました：' + e.message);
  }
}

async function loginWithEmail() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  if (!email || !password) { alert('メールとパスワードを入力してください'); return; }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    hideLoginModal();
  } catch (e) {
    alert('ログインに失敗しました：' + e.message);
  }
}

async function registerWithEmail() {
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  if (!username) { alert('ユーザー名を入力してください'); return; }
  if (!email || !password) { alert('メールとパスワードを入力してください'); return; }
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCred.user, { displayName: username });
    hideLoginModal();
  } catch (e) {
    alert('登録に失敗しました：' + e.message);
  }
}

async function logout() {
  await signOut(auth);
}

function showTab(tab) {
  document.getElementById('play-tab').style.display = tab === 'play' ? 'block' : 'none';
  document.getElementById('create-tab').style.display = tab === 'create' ? 'block' : 'none';
  document.querySelectorAll('.tab-btn, .side-menu-item').forEach(b => b.classList.remove('active'));
  if (tab === 'play') {
    const title = document.getElementById('game-title').value;
    const desc = document.getElementById('game-description').value;
    const hasInput = title || desc || Object.keys(scenes).length > 1;
    if (!hasInput) resetCreateForm();
    loadGames();
  }
}

function resetCreateForm() {
  if (currentUser) {
    document.getElementById('mode-select').style.display = 'block';
  }
  document.getElementById('game-form').style.display = 'none';
  scenes = {};
  sceneCount = 0;
  libraries = [];
  customVars = [];
  thumbnailData = null;
  currentGenre = [];
}

function backToModeSelect() {
  resetCreateForm();
}

function updateGenreSelection() {
  const checkboxes = document.querySelectorAll('#genre-checkboxes input[type="checkbox"]');
  const checked = Array.from(checkboxes).filter(c => c.checked);
  if (checked.length > 3) {
    event.target.checked = false;
    alert('ジャンルは3つまで選択できます');
    return;
  }
  currentGenre = checked.map(c => c.value);
  document.getElementById('genre-count').textContent = currentGenre.length + ' / 3 選択中';
}

function startCreate(mode) {
  currentMode = mode;
  libraries = [];
  customVars = [];
  scenes = {};
  sceneCount = 0;
  thumbnailData = null;
  currentGenre = [];
  document.getElementById('mode-select').style.display = 'none';
  document.getElementById('game-form').style.display = 'block';
  document.getElementById('library-list').innerHTML = '';
  document.getElementById('scene-tree').innerHTML = '';
  document.getElementById('thumbnail-preview').style.display = 'none';
  document.getElementById('thumbnail-preview').src = '';
  document.getElementById('game-title').value = '';
  document.getElementById('game-description').value = '';
  document.getElementById('game-author').value = currentUser ? (currentUser.displayName || currentUser.email) : '';
  document.getElementById('library-panel').style.display = mode === 'simple' ? 'none' : 'block';
  document.querySelectorAll('#genre-checkboxes input[type="checkbox"]').forEach(c => c.checked = false);
  document.getElementById('genre-count').textContent = '0 / 3 選択中';
  addScene();
}

function updateGenre() { renderTree(); }

function previewThumbnail(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    thumbnailData = e.target.result;
    const preview = document.getElementById('thumbnail-preview');
    preview.src = thumbnailData;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function addScene() {
  sceneCount++;
  const id = 'scene' + sceneCount;
  scenes[id] = {
    id, title: '', text: '', buttons: [], elements: [],
    sceneConditions: [], sceneConditionMode: 'all', sceneConditionFail: ''
  };
  renderTree();
  return id;
}

function deleteScene(sceneId) {
  if (Object.keys(scenes).length <= 1) {
    alert('最低1つのシーンが必要です');
    return;
  }
  delete scenes[sceneId];

  const oldIds = Object.keys(scenes);
  const newScenes = {};
  const idMap = {};

  oldIds.forEach((oldId, index) => {
    idMap[oldId] = 'scene' + (index + 1);
  });

  oldIds.forEach(oldId => {
    const scene = scenes[oldId];
    const newId = idMap[oldId];
    scene.id = newId;
    scene.buttons.forEach(btn => {
      btn.next = idMap[btn.next] || Object.keys(idMap)[0];
      if (btn.libEffect) {
        if (btn.libEffect.branchMinScene) btn.libEffect.branchMinScene = idMap[btn.libEffect.branchMinScene] || '';
        if (btn.libEffect.branchElseScene) btn.libEffect.branchElseScene = idMap[btn.libEffect.branchElseScene] || '';
      }
    });
    newScenes[newId] = scene;
  });

  scenes = newScenes;
  sceneCount = Object.keys(scenes).length;
  window.scenes = scenes;
  renderTree();
}

function addButton(sceneId) {
  const scene = scenes[sceneId];
  const label = ALPHABET[scene.buttons.length];
  if (!label) { alert('ボタンはZまで追加できます'); return; }
  const nextId = addScene();
  scene.buttons.push({
    label,
    color: '#00c896',
    next: nextId,
    flagGive: [],
    ifConditions: [],
    ifMode: 'all',
    libEffect: { libId: '', change: 0, branchMin: '', branchMinScene: '', branchElseScene: '' },
    diceFlag: { libId: '', min: 1, successFlag: '', failFlag: '' },
    varEffect: { varName: '', change: 0 }
  });
  renderTree();
}

function deleteButton(sceneId, btnIndex) {
  scenes[sceneId].buttons.splice(btnIndex, 1);
  renderTree();
}

function updateButtonColor(sceneId, btnIndex, color) {
  scenes[sceneId].buttons[btnIndex].color = color;
  renderTree();
}

function updateSceneText(sceneId, value) {
  scenes[sceneId].text = value;
}

function updateSceneTitle(sceneId, value) {
  scenes[sceneId].title = value;
}

function toggleButtonTab(sceneId, btnIndex, tab) {
  const key = sceneId + '_' + btnIndex;
  activeButtonTab[key] = activeButtonTab[key] === tab ? null : tab;
  renderTree();
}

function addFlagGive(sceneId, btnIndex) {
  const flag = prompt('付与するタグ名を入力（例：鍵、仲間A）');
  if (!flag) return;
  if (!scenes[sceneId].buttons[btnIndex].flagGive) scenes[sceneId].buttons[btnIndex].flagGive = [];
  scenes[sceneId].buttons[btnIndex].flagGive.push(flag);
  renderTree();
}

function removeFlagGive(sceneId, btnIndex, flagIndex) {
  scenes[sceneId].buttons[btnIndex].flagGive.splice(flagIndex, 1);
  renderTree();
}

function addIfCondition(sceneId, btnIndex) {
  if (!scenes[sceneId].buttons[btnIndex].ifConditions) scenes[sceneId].buttons[btnIndex].ifConditions = [];
  scenes[sceneId].buttons[btnIndex].ifConditions.push({ type: 'flag', tag: '', diceMin: 1, varName: '', varMin: 0 });
  renderTree();
}

function removeIfCondition(sceneId, btnIndex, condIndex) {
  scenes[sceneId].buttons[btnIndex].ifConditions.splice(condIndex, 1);
  renderTree();
}

function addSceneCondition(sceneId) {
  if (!scenes[sceneId].sceneConditions) scenes[sceneId].sceneConditions = [];
  scenes[sceneId].sceneConditions.push({ type: 'flag', tag: '', varName: '', varMin: 0 });
  renderTree();
}

function removeSceneCondition(sceneId, condIndex) {
  scenes[sceneId].sceneConditions.splice(condIndex, 1);
  renderTree();
}

function addCustomVar() {
  const name = prompt('変数名を入力（例：好感度、ポイント）');
  if (!name) return;
  const type = prompt('型を入力（number / text / bool）');
  if (!type) return;
  const init = prompt('初期値を入力（例：0、こんにちは、true）');
  if (init === null) return;
  customVars.push({ name, type, value: type === 'number' ? parseInt(init) : type === 'bool' ? init === 'true' : init });
  renderCustomVars();
}

function removeCustomVar(index) {
  customVars.splice(index, 1);
  renderCustomVars();
}

function renderCustomVars() {
  const list = document.getElementById('custom-var-list');
  if (!list) return;
  list.innerHTML = '';
  customVars.forEach((v, i) => {
    const div = document.createElement('div');
    div.className = 'lib-item';
    div.innerHTML = '<span class="lib-preview">' + v.name + ' (' + v.type + ') = ' + v.value + '</span>' +
      '<button class="delete-btn" onclick="removeCustomVar(' + i + ')">✕</button>';
    list.appendChild(div);
  });
}

function addLibrary(type) {
  const lib = { type, id: 'lib' + Date.now() };

  if (type === 'affection') {
    const name = prompt('好感度の名前を入力（例：アリス 好感度）');
    if (!name) return;
    const max = prompt('ハートの数を入力（例：5）');
    if (!max) return;
    lib.name = name; lib.max = parseInt(max); lib.value = 0;
  } else if (type === 'dice') {
    const faces = prompt('ダイスの面数を入力（4/6/8/10/12/20/100）');
    if (!faces) return;
    const count = prompt('一度に振る数を入力（例：1 または 2）');
    if (!count) return;
    lib.faces = parseInt(faces); lib.count = parseInt(count);
    lib.name = count + 'd' + faces; lib.result = null;
  } else if (type === 'saikoro') {
    const count = prompt('さいころの個数を入力（1〜6）');
    if (!count) return;
    const c = Math.min(6, Math.max(1, parseInt(count)));
    lib.count = c; lib.faces = 6; lib.name = c + '個のさいころ'; lib.results = [];
  } else if (type === 'san') {
    const max = prompt('SAN値の最大値を入力（例：100）');
    if (!max) return;
    lib.name = 'SAN値'; lib.max = parseInt(max); lib.value = parseInt(max);
  } else if (type === 'counter') {
    const name = prompt('カウンターの名前を入力（例：撃破数）');
    if (!name) return;
    const init = prompt('初期値を入力（例：0）');
    if (init === null) return;
    lib.name = name; lib.value = parseInt(init);
  } else if (type === 'money') {
    const name = prompt('名前を入力（例：所持金）');
    if (!name) return;
    const unit = prompt('単位を入力（例：G、円）');
    if (!unit) return;
    const init = prompt('初期値を入力（例：100）');
    if (init === null) return;
    lib.name = name; lib.unit = unit; lib.value = parseInt(init);
  } else if (type === 'time') {
    const name = prompt('名前を入力（例：日数）');
    if (!name) return;
    const unit = prompt('単位を入力（例：日目）');
    if (!unit) return;
    const init = prompt('初期値を入力（例：1）');
    if (init === null) return;
    lib.name = name; lib.unit = unit; lib.value = parseInt(init);
  } else if (type === 'flag') {
    const name = prompt('フラグの名前を入力');
    if (!name) return;
    lib.name = name; lib.value = false;
  } else if (type === 'status') {
    const name = prompt('状態の名前を入力（例：天気）');
    if (!name) return;
    const options = prompt('選択肢をカンマ区切りで入力（例：晴れ,雨,雪）');
    if (!options) return;
    lib.name = name; lib.options = options.split(','); lib.value = lib.options[0];
  } else if (type === 'hp') {
    const max = prompt('HPの最大値を入力（例：100）');
    if (!max) return;
    lib.name = 'HP'; lib.max = parseInt(max); lib.value = parseInt(max);
  } else if (type === 'mp') {
    const max = prompt('MPの最大値を入力（例：50）');
    if (!max) return;
    lib.name = 'MP'; lib.max = parseInt(max); lib.value = parseInt(max);
  } else if (type === 'level') {
    lib.name = 'レベル'; lib.value = 1;
  } else if (type === 'exp') {
    const next = prompt('次のレベルまでのEXP（例：100）');
    if (!next) return;
    lib.name = 'EXP'; lib.value = 0; lib.nextLevel = parseInt(next);
  } else if (type === 'inventory') {
    lib.name = 'アイテム'; lib.items = [];
  } else if (type === 'skill') {
    const name = prompt('技能名を入力（例：図書館）');
    if (!name) return;
    const value = prompt('技能値を入力（例：60）');
    if (!value) return;
    lib.name = name + '技能'; lib.skillName = name; lib.value = parseInt(value);
  } else if (type === 'charsheet') {
    const name = prompt('キャラシート項目名（例：STR）');
    if (!name) return;
    const value = prompt('初期値（例：10）');
    if (!value) return;
    lib.name = name; lib.value = parseInt(value);
  } else if (type === 'score') {
    lib.name = 'スコア'; lib.value = 0; lib.total = 0;
  } else if (type === 'timer') {
    const sec = prompt('制限時間（秒）を入力（例：30）');
    if (!sec) return;
    lib.name = 'タイマー'; lib.seconds = parseInt(sec); lib.remaining = parseInt(sec); lib.active = false;
  } else if (type === 'result') {
    lib.name = '結果表示'; lib.message = '';
  } else if (type === 'character') {
    const name = prompt('キャラクター名を入力（例：アリス）');
    if (!name) return;
    lib.name = name; lib.charName = name; lib.image = '';
    lib.expression = '通常'; lib.expressions = ['通常']; lib.value = 0;
  }

  libraries.push(lib);
  renderLibrary();
}

function renderLibrary() {
  const list = document.getElementById('library-list');
  list.innerHTML = '';
  libraries.forEach((lib, i) => {
    const div = document.createElement('div');
    div.className = 'lib-item';
    let preview = lib.name || lib.type;
    if (lib.type === 'affection') preview = lib.name + ' ' + '♡'.repeat(lib.max);
    else if (lib.type === 'hp' || lib.type === 'mp') preview = lib.name + ' ' + lib.value + '/' + lib.max;
    else if (lib.type === 'san') preview = 'SAN値 ' + lib.value + '/' + lib.max;
    else if (lib.type === 'score') preview = 'スコア 0';
    else if (lib.type === 'timer') preview = 'タイマー ' + lib.seconds + '秒';
    else if (lib.type === 'character') preview = lib.name + '（キャラクター）';
    else if (lib.value !== undefined) preview = lib.name + ' ' + lib.value + (lib.unit || '');
    div.innerHTML = '<span class="lib-preview">' + preview + '</span>' +
      '<button class="delete-btn" onclick="deleteLibrary(' + i + ')">✕</button>';
    list.appendChild(div);
  });
}

function deleteLibrary(index) {
  libraries.splice(index, 1);
  renderLibrary();
}

function getSceneOptions() {
  return Object.keys(scenes).map(id =>
    '<option value="' + id + '">' + id + (scenes[id].title ? ' (' + scenes[id].title + ')' : '') + '</option>'
  ).join('');
}

function getLibOptions() {
  return '<option value="">なし</option>' +
    libraries.map(lib => '<option value="' + lib.id + '">' + lib.name + '</option>').join('');
}

function getDiceLibOptions() {
  return '<option value="">なし</option>' +
    libraries.filter(lib => lib.type === 'dice' || lib.type === 'saikoro')
      .map(lib => '<option value="' + lib.id + '">' + lib.name + '</option>').join('');
}

function getVarOptions() {
  return '<option value="">なし</option>' +
    customVars.map(v => '<option value="' + v.name + '">' + v.name + '</option>').join('');
}

function renderTree() {
  const tree = document.getElementById('scene-tree');
  tree.innerHTML = '';
  Object.values(scenes).forEach(scene => {
    tree.appendChild(createSceneCard(scene));
  });
}

function createSceneCard(scene) {
  const card = document.createElement('div');
  card.className = 'scene-card';
  card.id = 'card-' + scene.id;

  const allVarNames = [...libraries.map(l => '{' + l.name + '}'), ...customVars.map(v => '{' + v.name + '}')];
  const hintText = allVarNames.length > 0
    ? '文章に ' + allVarNames.join(' ') + ' と書くと値が表示されます'
    : '{ 変数名 } と書くと値が表示されます';

  let buttonsHTML = '';

  if (currentMode === 'simple') {
    buttonsHTML = scene.buttons.map((btn, i) => {
      const sceneOpts = Object.keys(scenes).map(id =>
        '<option value="' + id + '"' + (btn.next === id ? ' selected' : '') + '>' +
        id + (scenes[id].title ? ' (' + scenes[id].title + ')' : '') + '</option>'
      ).join('');
      return '<div class="button-row">' +
        '<span class="btn-label" style="background:#00c896">【' + btn.label + '】</span>' +
        '<span class="btn-option-label" style="color:#00a878;font-weight:700;margin-left:8px;">飛び先：</span>' +
        '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].next = this.value">' + sceneOpts + '</select>' +
        '<button class="delete-btn" onclick="deleteButton(\'' + scene.id + '\', ' + i + ')">✕</button>' +
        '</div>';
    }).join('');
  } else {
    buttonsHTML = scene.buttons.map((btn, i) => {
      const key = scene.id + '_' + i;
      const activeTab = activeButtonTab[key] || null;
      const sceneOpts = getSceneOptions();
      const libOpts = getLibOptions();
      const diceOpts = getDiceLibOptions();
      const varOpts = getVarOptions();

      const flagGives = (btn.flagGive || []).map((f, fi) =>
        '<span class="flag-tag">' + f + ' <span onclick="removeFlagGive(\'' + scene.id + '\', ' + i + ', ' + fi + ')">✕</span></span>'
      ).join('');

      const ifConditionsHTML = (btn.ifConditions || []).map((cond, ci) =>
        '<div class="if-condition-row">' +
        '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].type = this.value; renderTree()">' +
        '<option value="flag"' + (cond.type === 'flag' ? ' selected' : '') + '>タグを持っている</option>' +
        '<option value="dice"' + (cond.type === 'dice' ? ' selected' : '') + '>ダイス結果が○以上</option>' +
        '<option value="var"' + (cond.type === 'var' ? ' selected' : '') + '>変数が○以上</option>' +
        '</select>' +
        (cond.type === 'flag' ? '<input type="text" class="btn-option-input" placeholder="タグ名" value="' + (cond.tag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].tag = this.value">' : '') +
        (cond.type === 'dice' ? '<input type="number" class="btn-option-input-sm" placeholder="最低値" value="' + (cond.diceMin || 1) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].diceMin = parseInt(this.value)">' : '') +
        (cond.type === 'var' ?
          '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].varName = this.value">' + varOpts + '</select>' +
          '<input type="number" class="btn-option-input-sm" placeholder="最低値" value="' + (cond.varMin || 0) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifConditions[' + ci + '].varMin = parseInt(this.value)">' : '') +
        '<button class="delete-btn" onclick="removeIfCondition(\'' + scene.id + '\', ' + i + ', ' + ci + ')">✕</button>' +
        '</div>'
      ).join('');

      return '<div class="btn-block">' +
        '<div class="button-row">' +
        '<span class="btn-label" style="background:' + btn.color + '">【' + btn.label + '】</span>' +
        '<span class="btn-arrow">→</span>' +
        '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].next = this.value">' +
        sceneOpts.replace('value="' + btn.next + '"', 'value="' + btn.next + '" selected') +
        '</select>' +
        '<button class="delete-btn" onclick="deleteButton(\'' + scene.id + '\', ' + i + ')">✕</button>' +
        '</div>' +
        '<div class="btn-tab-bar">' +
        '<button class="btn-tab' + (activeTab === 'color' ? ' active' : '') + '" onclick="toggleButtonTab(\'' + scene.id + '\', ' + i + ', \'color\')">🎨 色</button>' +
        '<button class="btn-tab' + (activeTab === 'flag' ? ' active' : '') + '" onclick="toggleButtonTab(\'' + scene.id + '\', ' + i + ', \'flag\')">🚩 フラグ</button>' +
        '<button class="btn-tab' + (activeTab === 'lib' ? ' active' : '') + '" onclick="toggleButtonTab(\'' + scene.id + '\', ' + i + ', \'lib\')">📚 ライブラリ</button>' +
        '<button class="btn-tab' + (activeTab === 'var' ? ' active' : '') + '" onclick="toggleButtonTab(\'' + scene.id + '\', ' + i + ', \'var\')">🔢 変数</button>' +
        '<button class="btn-tab' + (activeTab === 'if' ? ' active' : '') + '" onclick="toggleButtonTab(\'' + scene.id + '\', ' + i + ', \'if\')">❓ IF条件</button>' +
        '<button class="btn-tab' + (activeTab === 'dice' ? ' active' : '') + '" onclick="toggleButtonTab(\'' + scene.id + '\', ' + i + ', \'dice\')">🎲 ダイス</button>' +
        '</div>' +
        (activeTab === 'color' ?
          '<div class="btn-tab-content"><div class="color-palette">' +
          palette.map(c => '<span class="palette-dot' + (btn.color === c ? ' selected' : '') + '" style="background:' + c + '" onclick="updateButtonColor(\'' + scene.id + '\', ' + i + ', \'' + c + '\')"></span>').join('') +
          '</div><input type="color" value="' + btn.color + '" onchange="updateButtonColor(\'' + scene.id + '\', ' + i + ', this.value)"></div>' : '') +
        (activeTab === 'flag' ?
          '<div class="btn-tab-content">' +
          '<div class="flag-tags">' + flagGives + '</div>' +
          '<button class="add-btn" onclick="addFlagGive(\'' + scene.id + '\', ' + i + ')">＋ フラグを追加</button>' +
          '</div>' : '') +
        (activeTab === 'lib' ?
          '<div class="btn-tab-content">' +
          '<div class="btn-option-row"><span class="btn-option-label">対象：</span>' +
          '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.libId = this.value">' + libOpts + '</select>' +
          '<span class="btn-option-label">変化：</span>' +
          '<input type="number" class="btn-option-input-sm" value="' + (btn.libEffect.change || 0) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.change = parseInt(this.value)"></div>' +
          '<div class="btn-option-row"><span class="btn-option-hint">値が</span>' +
          '<input type="number" class="btn-option-input-sm" placeholder="例：5" value="' + (btn.libEffect.branchMin || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.branchMin = this.value">' +
          '<span class="btn-option-hint">以上なら</span>' +
          '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.branchMinScene = this.value">' + sceneOpts + '</select>' +
          '<span class="btn-option-hint">未満なら</span>' +
          '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.branchElseScene = this.value">' + sceneOpts + '</select></div>' +
          '</div>' : '') +
        (activeTab === 'var' ?
          '<div class="btn-tab-content">' +
          '<div class="btn-option-row"><span class="btn-option-label">変数：</span>' +
          '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].varEffect.varName = this.value">' + varOpts + '</select>' +
          '<span class="btn-option-label">変化：</span>' +
          '<input type="number" class="btn-option-input-sm" value="' + (btn.varEffect ? btn.varEffect.change || 0 : 0) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].varEffect.change = parseInt(this.value)"></div>' +
          '</div>' : '') +
        (activeTab === 'if' ?
          '<div class="btn-tab-content">' +
          '<div class="btn-option-row"><span class="btn-option-label">条件モード：</span>' +
          '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifMode = this.value">' +
          '<option value="all"' + ((btn.ifMode || 'all') === 'all' ? ' selected' : '') + '>全て満たす（AND）</option>' +
          '<option value="any"' + ((btn.ifMode || 'all') === 'any' ? ' selected' : '') + '>どれか満たす（OR）</option>' +
          '</select></div>' +
          ifConditionsHTML +
          '<button class="add-btn" onclick="addIfCondition(\'' + scene.id + '\', ' + i + ')">＋ 条件を追加</button>' +
          '</div>' : '') +
        (activeTab === 'dice' ?
          '<div class="btn-tab-content">' +
          '<div class="btn-option-row"><span class="btn-option-label">ダイス：</span>' +
          '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.libId = this.value">' + diceOpts + '</select>' +
          '<span class="btn-option-label">以上：</span>' +
          '<input type="number" class="btn-option-input-sm" value="' + (btn.diceFlag.min || 1) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.min = parseInt(this.value)"></div>' +
          '<div class="btn-option-row">' +
          '<span class="btn-option-hint">成功フラグ：</span>' +
          '<input type="text" class="btn-option-input" placeholder="例：成功" value="' + (btn.diceFlag.successFlag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.successFlag = this.value">' +
          '<span class="btn-option-hint">失敗フラグ：</span>' +
          '<input type="text" class="btn-option-input" placeholder="例：失敗" value="' + (btn.diceFlag.failFlag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.failFlag = this.value"></div>' +
          '</div>' : '') +
        '</div>';
    }).join('');
  }

  const sceneConditions = scene.sceneConditions || [];
  const sceneCondMode = scene.sceneConditionMode || 'all';
  const sceneCondFail = scene.sceneConditionFail || '';

  const sceneCondHTML = sceneConditions.map((cond, ci) =>
    '<div class="if-condition-row">' +
    '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].sceneConditions[' + ci + '].type = this.value; renderTree()">' +
    '<option value="flag"' + (cond.type === 'flag' ? ' selected' : '') + '>タグを持っている</option>' +
    '<option value="var"' + (cond.type === 'var' ? ' selected' : '') + '>変数が○以上</option>' +
    '</select>' +
    (cond.type === 'flag' ?
      '<input type="text" class="btn-option-input" placeholder="タグ名" value="' + (cond.tag || '') + '" oninput="scenes[\'' + scene.id + '\'].sceneConditions[' + ci + '].tag = this.value">' : '') +
    (cond.type === 'var' ?
      '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].sceneConditions[' + ci + '].varName = this.value">' + getVarOptions() + '</select>' +
      '<input type="number" class="btn-option-input-sm" placeholder="最低値" value="' + (cond.varMin || 0) + '" oninput="scenes[\'' + scene.id + '\'].sceneConditions[' + ci + '].varMin = parseInt(this.value)">' : '') +
    '<button class="delete-btn" onclick="removeSceneCondition(\'' + scene.id + '\', ' + ci + ')">✕</button>' +
    '</div>'
  ).join('');

  const sceneCondPanel = currentMode === 'normal' ?
    '<div class="scene-condition-panel">' +
    '<div class="scene-condition-title">🔒 このシーンの表示条件</div>' +
    '<div class="btn-option-row"><span class="btn-option-label">条件モード：</span>' +
    '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].sceneConditionMode = this.value">' +
    '<option value="all"' + (sceneCondMode === 'all' ? ' selected' : '') + '>全て満たす（AND）</option>' +
    '<option value="any"' + (sceneCondMode === 'any' ? ' selected' : '') + '>どれか満たす（OR）</option>' +
    '</select></div>' +
    sceneCondHTML +
    '<button class="add-btn" onclick="addSceneCondition(\'' + scene.id + '\')">＋ 条件を追加</button>' +
    (sceneConditions.length > 0 ?
      '<div class="btn-option-row"><span class="btn-option-label">条件未達成時：</span>' +
      '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].sceneConditionFail = this.value">' +
      getSceneOptions().replace('value="' + sceneCondFail + '"', 'value="' + sceneCondFail + '" selected') +
      '</select></div>' : '') +
    '</div>' : '';

  card.innerHTML =
    '<div class="scene-header">' +
    '<span class="scene-label">' + scene.id + '</span>' +
    '<input type="text" class="scene-title-input" placeholder="シーンタイトル（任意）" value="' + (scene.title || '') + '" oninput="updateSceneTitle(\'' + scene.id + '\', this.value)">' +
    '<button class="delete-scene-btn" onclick="deleteScene(\'' + scene.id + '\')">✕</button>' +
    '</div>' +
    sceneCondPanel +
    '<textarea placeholder="シーンのテキストを入力...&#10;ヒント：' + hintText + '" oninput="updateSceneText(\'' + scene.id + '\', this.value)">' + scene.text + '</textarea>' +
    '<div class="buttons-list">' + buttonsHTML + '</div>' +
    '<div class="scene-actions">' +
    '<button class="add-btn" onclick="addButton(\'' + scene.id + '\')">＋ ボタン追加</button>' +
    '<button class="add-btn" onclick="addScene()">＋ シーン追加</button>' +
    '</div>';

  return card;
}

async function uploadGame() {
  if (!currentUser) { alert('ゲームを作るにはログインが必要です'); return; }
  const title = document.getElementById('game-title').value;
  const description = document.getElementById('game-description').value;
  const author = currentUser.displayName || currentUser.email;

  if (!title) { alert('タイトルを入力してください'); return; }
  if (currentGenre.length === 0) { alert('ジャンルを1つ以上選択してください'); return; }
  if (Object.keys(scenes).length === 0) { alert('シーンを追加してください'); return; }

async function saveDraft() {
  if (!currentUser) { alert('セーブするにはログインが必要です'); return; }
  const title = document.getElementById('game-title').value || '無題の下書き';

  const draft = {
    title,
    genres: currentGenre,
    genre: currentGenre[0] || '',
    description: document.getElementById('game-description').value,
    author: currentUser.displayName || currentUser.email,
    uid: currentUser.uid,
    thumbnail: thumbnailData || '',
    mode: currentMode,
    libraries: JSON.parse(JSON.stringify(libraries)),
    customVars: JSON.parse(JSON.stringify(customVars)),
    story: JSON.parse(JSON.stringify(scenes)),
    savedAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'drafts'), draft);
    alert('下書きを保存しました！');
  } catch (e) {
    alert('エラー：' + e.message);
  }
}

async function loadDrafts() {
  if (!currentUser) { alert('ログインが必要です'); return; }
  try {
    const q = query(collection(db, 'drafts'), where('uid', '==', currentUser.uid));
    const snapshot = await getDocs(q);
    const drafts = [];
    snapshot.forEach(d => drafts.push({ id: d.id, ...d.data() }));
    drafts.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    if (drafts.length === 0) { alert('保存された下書きがありません'); return; }

    const options = drafts.map((d, i) =>
      i + ': ' + d.title + '（' + new Date(d.savedAt).toLocaleDateString('ja-JP') + '）'
    ).join('\n');

    const choice = prompt('読み込む下書きの番号を入力してください：\n' + options);
    if (choice === null) return;
    const index = parseInt(choice);
    if (isNaN(index) || index < 0 || index >= drafts.length) { alert('無効な番号です'); return; }

    const draft = drafts[index];
    if (!confirm('「' + draft.title + '」を読み込みますか？\n現在の作業内容は失われます。')) return;

    currentMode = draft.mode || 'simple';
    currentGenre = draft.genres || [draft.genre] || [];
    libraries = draft.libraries || [];
    customVars = draft.customVars || [];
    scenes = draft.story || {};
    sceneCount = Object.keys(scenes).length;
    thumbnailData = draft.thumbnail || null;

    document.getElementById('mode-select').style.display = 'none';
    document.getElementById('game-form').style.display = 'block';
    document.getElementById('game-title').value = draft.title || '';
    document.getElementById('game-description').value = draft.description || '';
    document.getElementById('game-author').value = draft.author || '';
    document.getElementById('library-panel').style.display = currentMode === 'simple' ? 'none' : 'block';

    document.querySelectorAll('#genre-checkboxes input[type="checkbox"]').forEach(c => {
      c.checked = currentGenre.includes(c.value);
    });
    document.getElementById('genre-count').textContent = currentGenre.length + ' / 3 選択中';

    if (thumbnailData) {
      const preview = document.getElementById('thumbnail-preview');
      preview.src = thumbnailData;
      preview.style.display = 'block';
    }

    renderLibrary();
    renderCustomVars();
    renderTree();
    window.scenes = scenes;
    alert('読み込みました！');
  } catch (e) {
    alert('エラー：' + e.message);
  }
}

  const game = {
    title,
    genres: currentGenre,
    genre: currentGenre[0],
    description,
    author,
    uid: currentUser.uid,
    thumbnail: thumbnailData || '',
    mode: currentMode,
    libraries: JSON.parse(JSON.stringify(libraries)),
    customVars: JSON.parse(JSON.stringify(customVars)),
    story: JSON.parse(JSON.stringify(scenes)),
    playCount: 0,
    createdAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'games'), game);
    alert('アップロードしました！');
    document.querySelectorAll('.tab-btn')[0].click();
  } catch (e) {
    alert('エラーが発生しました：' + e.message);
  }
}

async function postNotice() {
  if (!currentUser || currentUser.uid !== ADMIN_UID) return;
  const title = prompt('お知らせのタイトルを入力');
  if (!title) return;
  const body = prompt('お知らせの本文を入力');
  if (!body) return;
  try {
    await addDoc(collection(db, 'notices'), {
      title, body, createdAt: new Date().toISOString()
    });
    alert('お知らせを投稿しました！');
    loadNotices();
  } catch (e) {
    alert('エラー：' + e.message);
  }
}

async function editNotice(noticeId, currentTitle, currentBody) {
  const title = prompt('タイトルを編集', currentTitle);
  if (!title) return;
  const body = prompt('本文を編集', currentBody);
  if (!body) return;
  try {
    await updateDoc(doc(db, 'notices', noticeId), { title, body });
    alert('更新しました！');
    loadNotices();
  } catch (e) {
    alert('エラー：' + e.message);
  }
}

async function deleteNotice(noticeId) {
  if (!confirm('このお知らせを削除しますか？')) return;
  try {
    await deleteDoc(doc(db, 'notices', noticeId));
    alert('削除しました！');
    loadNotices();
  } catch (e) {
    alert('エラー：' + e.message);
  }
}

async function loadNotices() {
  const area = document.getElementById('notice-area');
  if (!area) return;
  try {
    const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const notices = [];
    snapshot.forEach(d => notices.push({ id: d.id, ...d.data() }));
    if (notices.length === 0) { area.style.display = 'none'; return; }
    area.style.display = 'block';
    const isAdmin = currentUser && currentUser.uid === ADMIN_UID;
    area.innerHTML = notices.map(n =>
      '<div class="notice-item">' +
      '<div class="notice-title">' + n.title + '</div>' +
      '<div class="notice-body">' + n.body + '</div>' +
      '<div class="notice-footer">' +
      '<div class="notice-date">' + new Date(n.createdAt).toLocaleDateString('ja-JP') + '</div>' +
      (isAdmin ?
        '<div class="notice-admin-btns">' +
        '<button class="notice-edit-btn" onclick="editNotice(\'' + n.id + '\', \'' + n.title.replace(/'/g, "\\'") + '\', \'' + n.body.replace(/'/g, "\\'") + '\')">編集</button>' +
        '<button class="notice-delete-btn" onclick="deleteNotice(\'' + n.id + '\')">削除</button>' +
        '</div>' : '') +
      '</div>' +
      '</div>'
    ).join('');
  } catch (e) {
    area.style.display = 'none';
  }
}

function renderGameCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';
  const thumb = game.thumbnail
    ? '<img src="' + game.thumbnail + '" class="game-thumb" alt="サムネイル">'
    : '<div class="game-thumb-placeholder"></div>';
  const genres = game.genres || [game.genre];
  const genreTags = genres.map(g => '<span class="game-genre-tag">' + g + '</span>').join('');
  card.innerHTML =
    thumb +
    '<div class="game-card-body">' +
    '<div class="genre-tags-row">' + genreTags + '</div>' +
    '<h2>' + game.title + '</h2>' +
    '<p>' + game.description + '</p>' +
    '<p class="game-author">製作者：' + (game.author || '不明') + '</p>' +
    '<p class="game-playcount">プレイ数：' + (game.playCount || 0) + '回</p>' +
    '<a href="play.html?id=' + game.id + '">遊ぶ</a>' +
    '</div>';
  return card;
}

async function loadGames() {
  const list = document.getElementById('game-list');
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const games = [];
    snapshot.forEach(d => games.push({ id: d.id, ...d.data() }));
    list.innerHTML = '';
    if (games.length === 0) {
      list.innerHTML = '<p class="empty">まだゲームがありません。作るタブからゲームを作ってみよう！</p>';
      return;
    }
    games.forEach(game => list.appendChild(renderGameCard(game)));
    window._allGames = games;
  } catch (e) {
    list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>';
  }
}

function filterGenre(genre) {
  currentFilterGenre = genre;
  document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('search-input').value = '';
  applyFilter();
}

function searchGames() { applyFilter(); }

function applyFilter() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const games = window._allGames || [];
  const list = document.getElementById('game-list');
  list.innerHTML = '';
  const filtered = games.filter(game => {
    const genres = game.genres || [game.genre];
    const matchGenre = currentFilterGenre === 'all' || genres.includes(currentFilterGenre);
    const matchSearch = !q ||
      game.title.toLowerCase().includes(q) ||
      (game.author || '').toLowerCase().includes(q) ||
      genres.some(g => g.toLowerCase().includes(q));
    return matchGenre && matchSearch;
  });
  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty">該当するゲームが見つかりませんでした</p>';
    return;
  }
  filtered.forEach(game => list.appendChild(renderGameCard(game)));
}

window.showTab = showTab;
window.startCreate = startCreate;
window.backToModeSelect = backToModeSelect;
window.updateGenre = updateGenre;
window.updateGenreSelection = updateGenreSelection;
window.previewThumbnail = previewThumbnail;
window.addScene = addScene;
window.deleteScene = deleteScene;
window.addButton = addButton;
window.deleteButton = deleteButton;
window.updateButtonColor = updateButtonColor;
window.updateSceneText = updateSceneText;
window.updateSceneTitle = updateSceneTitle;
window.addLibrary = addLibrary;
window.deleteLibrary = deleteLibrary;
window.addCustomVar = addCustomVar;
window.removeCustomVar = removeCustomVar;
window.uploadGame = uploadGame;
window.filterGenre = filterGenre;
window.searchGames = searchGames;
window.scenes = scenes;
window.renderTree = renderTree;
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;
window.switchModalTab = switchModalTab;
window.loginWithGoogle = loginWithGoogle;
window.loginWithEmail = loginWithEmail;
window.registerWithEmail = registerWithEmail;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.toggleSideMenu = toggleSideMenu;
window.toggleButtonTab = toggleButtonTab;
window.addFlagGive = addFlagGive;
window.removeFlagGive = removeFlagGive;
window.addIfCondition = addIfCondition;
window.removeIfCondition = removeIfCondition;
window.postNotice = postNotice;
window.editNotice = editNotice;
window.deleteNotice = deleteNotice;
window.saveDraft = saveDraft;
window.loadDrafts = loadDrafts;
window.addSceneCondition = addSceneCondition;
window.removeSceneCondition = removeSceneCondition;

loadGames();
