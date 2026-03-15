import { db, auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase.js';
import { collection, query, where, getDocs, orderBy, doc, deleteDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-btns').style.display = 'none';
    document.getElementById('user-name-text').textContent = user.displayName || user.email;
    document.getElementById('not-logged-in-msg').style.display = 'none';
    document.getElementById('mypage-main').style.display = 'block';
    document.getElementById('mypage-username').textContent = user.displayName || 'ユーザー';
    document.getElementById('mypage-email').textContent = user.email;
    await loadMyGames();
    await loadPlayHistory();
  } else {
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-btns').style.display = 'flex';
    document.getElementById('not-logged-in-msg').style.display = 'block';
    document.getElementById('mypage-main').style.display = 'none';
  }
});

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

async function logout() {
  await signOut(auth);
  location.href = 'index.html';
}

async function loadMyGames() {
  const list = document.getElementById('my-games');
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const q = query(collection(db, 'games'), where('uid', '==', currentUser.uid), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const games = [];
    snapshot.forEach(doc => games.push({ id: doc.id, ...doc.data() }));
    list.innerHTML = '';
    if (games.length === 0) {
      list.innerHTML = '<p class="empty">まだゲームを作っていません</p>';
      return;
    }
    games.forEach(game => list.appendChild(createMyGameCard(game)));
  } catch (e) {
    list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>';
  }
}

function createMyGameCard(game) {
  const card = document.createElement('div');
  card.className = 'mypage-game-card';
  const genres = game.genres || [game.genre];
  const genreTags = genres.map(g => '<span class="game-genre-tag">' + g + '</span>').join('');
  card.innerHTML =
    '<div class="mypage-game-info">' +
    '<div class="genre-tags-row">' + genreTags + '</div>' +
    '<h4>' + game.title + '</h4>' +
    '<p>' + (game.description || '') + '</p>' +
    '<p class="game-playcount">プレイ数：' + (game.playCount || 0) + '回</p>' +
    '</div>' +
    '<div class="mypage-game-actions">' +
    '<a href="play.html?id=' + game.id + '" class="play-btn">遊ぶ</a>' +
    '<a href="edit.html?id=' + game.id + '" class="edit-btn">編集</a>' +
    '<button class="delete-game-btn" onclick="deleteGame(\'' + game.id + '\', \'' + game.title + '\')">削除</button>' +
    '</div>';
  return card;
}

async function deleteGame(gameId, title) {
  if (!confirm('「' + title + '」を本当に削除しますか？\nこの操作は取り消せません。')) return;
  try {
    await deleteDoc(doc(db, 'games', gameId));
    alert('削除しました');
    await loadMyGames();
  } catch (e) {
    alert('削除に失敗しました：' + e.message);
  }
}

async function loadPlayHistory() {
  const list = document.getElementById('play-history');
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const q = query(
      collection(db, 'playHistory'),
      where('uid', '==', currentUser.uid),
      orderBy('playedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    const history = [];
    snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
    list.innerHTML = '';
    if (history.length === 0) {
      list.innerHTML = '<p class="empty">まだプレイ履歴がありません</p>';
      return;
    }
    history.forEach(h => {
      const div = document.createElement('div');
      div.className = 'history-item';
      const date = new Date(h.playedAt).toLocaleDateString('ja-JP');
      div.innerHTML =
        '<span class="history-title"><a href="play.html?id=' + h.gameId + '">' + h.gameTitle + '</a></span>' +
        '<span class="history-date">' + date + '</span>';
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>';
  }
}

window.toggleUserMenu = toggleUserMenu;
window.logout = logout;
window.deleteGame = deleteGame;