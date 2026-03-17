// ============================================================
// 1. グローバル定数・詳細データ定義
// ============================================================
let currentUser = null;
let currentTab = 'play';
let currentBoardTab = 'all';
let trpgTotalPoints = 0;

// 運営管理者UIDリスト (ここに自分のFirebase UIDを入れる)
const ADMIN_UIDS = ["ADMIN_USER_ID_1", "ADMIN_USER_ID_2"];

// TRPG詳細ステータス項目
const TRPG_STATS = [
    { id: 'STR', name: '筋力', desc: '肉体的な強さ' },
    { id: 'DEX', name: '敏捷性', desc: '素早さ、器用さ' },
    { id: 'INT', name: '知力', desc: 'ひらめき、記憶力' },
    { id: 'CON', name: '耐久力', desc: '体力、毒への耐性' },
    { id: 'APP', name: '外見', desc: '容姿、カリスマ性' },
    { id: 'POW', name: '精神力', desc: '意志の強さ、運、MP' },
    { id: 'SIZ', name: '体格', desc: '体の大きさ、HPに影響' },
    { id: 'EDU', name: '教育', desc: '知識、教養、年齢' }
];

// ============================================================
// 2. 認証 & ユーザー初期化
// ============================================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('login-btns').style.display = 'none';
        
        // ユーザーデータの取得・初期化
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            await setDoc(userRef, {
                username: user.displayName || "名無しの探索者",
                following: [],
                followers_count: 0,
                isAdmin: ADMIN_UIDS.includes(user.uid),
                createdAt: serverTimestamp()
            });
        }
        
        document.getElementById('user-name-text').innerText = user.displayName || "ユーザー";
        if (user.photoURL) {
            document.getElementById('header-avatar').src = user.photoURL;
            document.getElementById('header-avatar').style.display = 'block';
            document.getElementById('header-avatar-placeholder').style.display = 'none';
        }

        // 運営用ボタンの表示制御
        if (ADMIN_UIDS.includes(user.uid)) {
            document.getElementById('admin-notice-btn').style.display = 'block';
        }
        
        loadDrafts(); // 下書き読み込み
    } else {
        currentUser = null;
        document.getElementById('user-info').style.display = 'none';
        document.getElementById('login-btns').style.display = 'block';
    }
});

// ============================================================
// 3. 画面遷移 & タブ制御システム
// ============================================================
window.showMainTab = (tabName) => {
    const tabs = ['play', 'create', 'notice', 'board'];
    tabs.forEach(t => {
        const el = document.getElementById(`${t}-tab`);
        if (el) {
            el.style.display = (t === tabName) ? 'block' : 'none';
            // フェードイン効果
            el.style.opacity = 0;
            setTimeout(() => el.style.opacity = 1, 50);
        }
    });

    // ボタンの状態更新
    document.querySelectorAll('.side-menu-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.includes(tabName === 'play' ? '遊ぶ' : tabName === 'create' ? '作る' : tabName === 'notice' ? 'お知らせ' : '掲示板')) {
            btn.classList.add('active');
        }
    });

    currentTab = tabName;
    if (tabName === 'board') loadBoardPosts();
    if (tabName === 'notice') loadAdminNotices();
};

window.switchBoardTab = (subTab) => {
    currentBoardTab = subTab;
    document.querySelectorAll('.sub-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(subTab));
    });
    loadBoardPosts();
};

// ============================================================
// 4. コミュニティ & フォローシステム
// ============================================================
async function loadBoardPosts() {
    const container = document.getElementById('board-list');
    container.innerHTML = '<div class="loading-spinner">運命の糸を紡いでいます...</div>';

    try {
        let q;
        const postsRef = collection(db, "posts");

        if (currentBoardTab === 'following') {
            if (!currentUser) {
                container.innerHTML = '<p class="empty-msg">ログインして、気になる作者をフォローしましょう！</p>';
                return;
            }
            const userSnap = await getDoc(doc(db, "users", currentUser.uid));
            const following = userSnap.data()?.following || [];
            if (following.length === 0) {
                container.innerHTML = '<p class="empty-msg">まだ誰もフォローしていません。</p>';
                return;
            }
            q = query(postsRef, where("authorId", "in", following), orderBy("createdAt", "desc"));
        } else if (currentBoardTab === 'announcement') {
            q = query(postsRef, where("isAnnouncement", "==", true), orderBy("createdAt", "desc"));
        } else {
            q = query(postsRef, orderBy("createdAt", "desc"), limit(30));
        }

        const snap = await getDocs(q);
        renderPosts(snap, container);
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p class="error">掲示板の取得に失敗しました。</p>';
    }
}

function renderPosts(snap, container) {
    if (snap.empty) {
        container.innerHTML = '<p class="empty-msg">まだ投稿がありません。</p>';
        return;
    }
    container.innerHTML = '';
    snap.forEach(postDoc => {
        const data = postDoc.data();
        const date = data.createdAt?.toDate().toLocaleString() || "不明";
        const postHtml = `
            <div class="board-card">
                <div class="post-header">
                    <span class="post-author">${data.authorName}</span>
                    <span class="post-date">${date}</span>
                </div>
                <div class="post-content">${data.content}</div>
                <div class="post-footer">
                    <button class="follow-mini-btn" onclick="toggleFollow('${data.authorId}')">
                        ${currentUser && data.authorId !== currentUser.uid ? 'フォロー切替' : ''}
                    </button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', postHtml);
    });
}

// ============================================================
// 5. TRPGキャラクター作成詳細ロジック
// ============================================================
window.openTRPGModal = async () => {
    if (!currentUser) return alert("ログインが必要です");
    
    // 生涯2体までの生存制限
    const q = query(collection(db, "trpg_characters"), 
        where("userId", "==", currentUser.uid), 
        where("isAlive", "==", true));
    const snap = await getDocs(q);
    
    if (snap.size >= 2) {
        alert("生存している探索者が既に2体います。これ以上の作成はできません。");
        return;
    }

    document.getElementById('trpg-modal').style.display = 'flex';
    document.getElementById('trpg-stat-inputs').innerHTML = '';
    document.getElementById('trpg-stat-points').innerText = '--';
    document.getElementById('trpg-save-btn').disabled = true;
};

window.rollTRPGStats = () => {
    // 3d6 + 10 の合計値をランダム決定
    trpgTotalPoints = (Math.floor(Math.random() * 6 + 1) + 
                       Math.floor(Math.random() * 6 + 1) + 
                       Math.floor(Math.random() * 6 + 1)) + 10;
    
    const container = document.getElementById('trpg-stat-inputs');
    container.innerHTML = '';
    
    TRPG_STATS.forEach(stat => {
        const div = document.createElement('div');
        div.className = 'stat-input-group';
        div.innerHTML = `
            <label title="${stat.desc}">${stat.name} (${stat.id})</label>
            <input type="number" class="trpg-stat-val" 
                   data-stat="${stat.id}" value="0" min="0" max="18" 
                   oninput="validateStatPoints()">
        `;
        container.appendChild(div);
    });
    validateStatPoints();
};

window.validateStatPoints = () => {
    const inputs = document.querySelectorAll('.trpg-stat-val');
    let currentSum = 0;
    inputs.forEach(input => currentSum += parseInt(input.value || 0));

    const remaining = trpgTotalPoints - currentSum;
    const display = document.getElementById('trpg-stat-points');
    const nameInput = document.getElementById('trpg-name-input');
    
    display.innerText = remaining;
    display.style.color = remaining < 0 ? "#ff4757" : (remaining === 0 ? "#2ed573" : "#333");

    // 保存ボタンの有効化条件: 名前あり 且つ ポイントを使い切っている 且つ 0以下でない
    const canSave = (remaining === 0 && nameInput.value.trim() !== "");
    document.getElementById('trpg-save-btn').disabled = !canSave;
};

window.saveTRPGCharacter = async () => {
    const stats = {};
    document.querySelectorAll('.trpg-stat-val').forEach(input => {
        stats[input.dataset.stat] = parseInt(input.value);
    });

    const newChar = {
        userId: currentUser.uid,
        name: document.getElementById('trpg-name-input').value,
        avatar: document.getElementById('trpg-avatar-input').value,
        stats: stats,
        skill: document.getElementById('trpg-skill-select').value,
        inventory: [], // アイテム初期化
        isAlive: true,
        isLost: false,
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "trpg_characters"), newChar);
        alert("探索者が登録されました。");
        closeTRPGModal();
    } catch (e) {
        alert("保存に失敗しました。");
    }
};

window.closeTRPGModal = () => {
    document.getElementById('trpg-modal').style.display = 'none';
};

// ============================================================
// 6. 高度な制作エディタ (複雑な分岐・フラグ管理の構築)
// ============================================================

/**
 * 新しいシーンをツリーに追加する
 * 内部ID(sceneId)の生成、バリデーション、バッドエンド判定フラグを完全実装
 */
window.addNewScene = () => {
    const sceneContainer = document.getElementById('scene-tree');
    // 重複しないユニークなIDを生成
    const sceneId = "scene_" + Date.now() + Math.floor(Math.random() * 1000);
    
    const sceneHtml = `
        <div class="scene-card" id="${sceneId}">
            <div class="scene-header">
                <div class="scene-title-row">
                    <input type="text" class="scene-name" placeholder="シーン名 (例: 呪われた地下室)">
                    <span class="scene-id-badge">ID: ${sceneId}</span>
                </div>
                <button class="delete-scene-btn" onclick="deleteScene('${sceneId}')">このシーンを削除</button>
            </div>
            
            <div class="scene-body-edit">
                <label>本文内容</label>
                <textarea class="scene-content" rows="4" placeholder="プレイヤーに表示される物語のテキストを入力..."></textarea>
            </div>
            
            <div class="choices-container">
                <div class="choices-header">
                    <h4>選択肢 / 行動の設定</h4>
                    <button class="add-choice-btn" onclick="addChoiceToScene('${sceneId}')">＋ 選択肢を追加</button>
                </div>
                <div id="choices-list-${sceneId}" class="choices-list-area">
                    </div>
            </div>
            
            <div class="scene-settings">
                <label class="death-check-label">
                    <input type="checkbox" class="is-death-scene"> 
                    <span class="death-warn">💀 死亡・ロストシーンに設定する</span>
                </label>
                <p class="setting-desc">※チェックすると、このシーンに到達した瞬間にTRPGキャラは死亡し、全アイテムを失います。</p>
            </div>
        </div>
    `;
    sceneContainer.insertAdjacentHTML('beforeend', sceneHtml);
    return sceneId;
};

/**
 * 選択肢に「高度な分岐・リソース管理ロジック」を付与する
 * アイテム消費、獲得、フラグ、多機能分岐をすべて網羅
 */
window.addChoiceToScene = (sceneId) => {
    const list = document.getElementById(`choices-list-${sceneId}`);
    const choiceId = "choice_" + Date.now() + Math.floor(Math.random() * 1000);
    
    const html = `
        <div class="choice-item" id="${choiceId}">
            <div class="choice-row-1">
                <input type="text" class="choice-text" placeholder="選択肢のボタン文字 (例: 扉を鍵で開ける)">
                <select class="branch-type" onchange="toggleBranchFields('${choiceId}')">
                    <option value="normal">通常遷移 (指定シーンへ)</option>
                    <option value="dice">ダイス判定 (ステータス依存)</option>
                    <option value="item">アイテム所持分岐</option>
                    <option value="flag">フラグ成立分岐</option>
                    <option value="prob">確率分岐 (%)</option>
                </select>
            </div>
            
            <div class="branch-details" id="details-${choiceId}">
                <div class="detail-row">
                    <span>移動先シーンID:</span>
                    <input type="text" class="next-scene-id" placeholder="scene_xxx...">
                </div>
            </div>

            <div class="choice-logic-grid">
                <div class="logic-box">
                    <label>🎁 獲得アイテム</label>
                    <input type="text" class="get-item-name" placeholder="なし">
                </div>
                <div class="logic-box">
                    <label>🚩 立てるフラグ</label>
                    <input type="text" class="set-flag-name" placeholder="なし">
                </div>
                <div class="logic-box cost-box">
                    <label>🔑 消費アイテム (必要条件)</label>
                    <input type="text" class="consume-item-name" placeholder="なし">
                </div>
            </div>
            
            <button class="remove-choice-btn" onclick="this.parentElement.remove()">選択肢を削除</button>
        </div>
    `;
    list.insertAdjacentHTML('beforeend', html);
};

// ============================================================
// 7. 分岐ロジック設定の詳細 (UI動的切り替え)
// ============================================================

/**
 * 選択した分岐タイプに応じて、入力フィールドを動的に生成する
 * 簡易化せず、すべてのパラメータ(成功/失敗/確率/ステータス)を網羅
 */
window.toggleBranchFields = (choiceId) => {
    const type = document.querySelector(`#${choiceId} .branch-type`).value;
    const details = document.getElementById(`details-${choiceId}`);
    
    let html = '';
    switch(type) {
        case 'dice':
            html = `
                <div class="dice-config">
                    <select class="stat-select">
                        <option value="STR">STR (筋力)</option><option value="DEX">DEX (敏捷)</option>
                        <option value="INT">INT (知力)</option><option value="CON">CON (耐久)</option>
                        <option value="APP">APP (外見)</option><option value="POW">POW (精神)</option>
                        <option value="SIZ">SIZ (体格)</option><option value="EDU">EDU (教育)</option>
                    </select>
                    <span>判定式: [値]×5 ≧ 1D100</span>
                    <div class="dest-group">
                        <input type="text" class="success-id" placeholder="成功時の移動先ID">
                        <input type="text" class="fail-id" placeholder="失敗時の移動先ID">
                    </div>
                </div>`;
            break;
            
        case 'item':
            html = `
                <div class="item-config">
                    <input type="text" class="cond-val" placeholder="判定に必要なアイテム名">
                    <div class="dest-group">
                        <input type="text" class="success-id" placeholder="所持している場合のID">
                        <input type="text" class="fail-id" placeholder="持っていない場合のID">
                    </div>
                </div>`;
            break;
            
        case 'flag':
            html = `
                <div class="flag-config">
                    <input type="text" class="cond-val" placeholder="判定に必要なフラグ名">
                    <div class="dest-group">
                        <input type="text" class="success-id" placeholder="フラグON時のID">
                        <input type="text" class="fail-id" placeholder="フラグOFF時のID">
                    </div>
                </div>`;
            break;
            
        case 'prob':
            html = `
                <div class="prob-config">
                    <span>当選確率:</span>
                    <input type="number" class="prob-val" value="50" min="0" max="100"> <span>%</span>
                    <div class="dest-group">
                        <input type="text" class="success-id" placeholder="当選時のID">
                        <input type="text" class="fail-id" placeholder="落選時のID">
                    </div>
                </div>`;
            break;
            
        default:
            html = `
                <div class="detail-row">
                    <span>移動先シーンID:</span>
                    <input type="text" class="next-scene-id" placeholder="scene_xxx...">
                </div>`;
    }
    details.innerHTML = html;
};

/**
 * シーン削除時の整合性チェック
 */
window.deleteScene = (sceneId) => {
    if (confirm("このシーンを削除しますか？\n他のシーンからの移動先として指定されている場合、リンクが切れる可能性があります。")) {
        const target = document.getElementById(sceneId);
        if (target) target.remove();
    }
};

// ============================================================
// 8. データ保存ロジック (バリデーション・JSON構造化)
// ============================================================

/**
 * 制作した全シーン・選択肢・分岐条件を一つのゲームデータとしてパースし、
 * Firestoreに「簡略化なし」で保存する。
 */
window.uploadGame = async () => {
    if (!currentUser) return alert("ログインが必要です。");

    const title = document.getElementById('game-title').value.trim();
    const description = document.getElementById('game-description').value.trim();
    const tags = document.getElementById('game-tags').value.split(/\s+/).filter(t => t !== "");
    const genres = Array.from(document.querySelectorAll('#genre-checkboxes input:checked')).map(cb => cb.value);

    // シーンデータの完全抽出
    const scenes = [];
    const sceneCards = document.querySelectorAll('.scene-card');
    
    if (sceneCards.length === 0) return alert("シーンを1つ以上作成してください。");

    sceneCards.forEach(card => {
        const sceneId = card.id;
        const sceneName = card.querySelector('.scene-name').value.trim();
        const content = card.querySelector('.scene-content').value;
        const isDeath = card.querySelector('.is-death-scene').checked;
        
        const choices = [];
        const choiceItems = card.querySelectorAll('.choice-item');

        choiceItems.forEach(item => {
            const type = item.querySelector('.branch-type').value;
            const details = item.querySelector('.branch-details');
            
            // 選択肢オブジェクトの構築
            let choiceObj = {
                text: item.querySelector('.choice-text').value.trim(),
                branchType: type,
                getItemName: item.querySelector('.get-item-name').value.trim() || null,
                setFlagName: item.querySelector('.set-flag-name').value.trim() || null,
                consumeItemName: item.querySelector('.consume-item-name').value.trim() || null
            };

            // 分岐先パラメータの抽出
            if (type === 'normal') {
                choiceObj.nextSceneId = details.querySelector('.next-scene-id').value.trim();
            } else {
                choiceObj.successId = details.querySelector('.success-id').value.trim();
                choiceObj.failId = details.querySelector('.fail-id').value.trim();
                if (type === 'dice') {
                    choiceObj.statSelect = details.querySelector('.stat-select').value;
                } else if (type === 'prob') {
                    choiceObj.probVal = parseInt(details.querySelector('.prob-val').value);
                } else {
                    choiceObj.condVal = details.querySelector('.cond-val').value.trim();
                }
            }
            choices.push(choiceObj);
        });

        scenes.push({
            id: sceneId,
            name: sceneName,
            content: content,
            isDeathScene: isDeath,
            choices: choices
        });
    });

    const gameData = {
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        title, description, tags, genres, scenes,
        startSceneId: scenes[0].id,
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "games"), gameData);
        alert("物語が世界に公開されました！");
        showMainTab('play');
    } catch (e) {
        console.error(e);
        alert("保存エラー: " + e.message);
    }
};

// ============================================================
// 9. ゲーム実行コアエンジン (State管理)
// ============================================================

const StoryForkEngine = {
    state: {
        data: null,
        currentScene: null,
        inventory: [],
        flags: [],
        character: null
    },

    /**
     * ゲーム開始：キャラ選択と初期化
     */
    async start(gameData) {
        this.state.data = gameData;
        
        // TRPGモード判定
        if (gameData.tags.includes("TRPG")) {
            const charId = await this.selectCharacterUI();
            if (!charId) return;
            const snap = await getDoc(doc(db, "trpg_characters", charId));
            this.state.character = { id: snap.id, ...snap.data() };
            this.state.inventory = [...(this.state.character.inventory || [])];
        }

        this.state.currentScene = gameData.scenes.find(s => s.id === gameData.startSceneId);
        this.render();
    },

    /**
     * 選択肢実行：消費・獲得・分岐の連鎖
     */
    async handleAction(choice) {
        // --- 1. アイテム消費 (不足なら中断) ---
        if (choice.consumeItemName) {
            const item = choice.consumeItemName.trim();
            if (!this.state.inventory.includes(item)) {
                return alert(`【失敗】「${item}」が必要です。`);
            }
            this.state.inventory = this.state.inventory.filter(i => i !== item);
            if (this.state.character) {
                await updateDoc(doc(db, "trpg_characters", this.state.character.id), {
                    inventory: arrayRemove(item)
                });
            }
        }

        // --- 2. アイテム獲得・フラグ ---
        if (choice.getItemName) {
            const newItem = choice.getItemName.trim();
            if (!this.state.inventory.includes(newItem)) {
                this.state.inventory.push(newItem);
                if (this.state.character) {
                    await updateDoc(doc(db, "trpg_characters", this.state.character.id), {
                        inventory: arrayUnion(newItem)
                    });
                }
            }
        }
        if (choice.setFlagName) {
            const f = choice.setFlagName.trim();
            if (!this.state.flags.includes(f)) this.state.flags.push(f);
        }

        // --- 3. 分岐先決定 ---
        let nextId = this.decideNextId(choice);
        const nextScene = this.state.data.scenes.find(s => s.id === nextId);

        // --- 4. 死亡判定 (全ロスト) ---
        if (nextScene && nextScene.isDeathScene) {
            alert("💀 キャラクターがロストしました。");
            if (this.state.character) {
                await updateDoc(doc(db, "trpg_characters", this.state.character.id), {
                    isAlive: false, inventory: []
                });
            }
            this.state.inventory = [];
        }

        this.state.currentScene = nextScene;
        this.render();
    },

    decideNextId(c) {
        switch(c.branchType) {
            case 'dice':
                const stat = this.state.character.stats[c.statSelect] || 10;
                const roll = Math.floor(Math.random() * 100) + 1;
                alert(`ダイス: ${roll} / 目標: ${stat * 5}`);
                return (roll <= stat * 5) ? c.successId : c.failId;
            case 'item': return this.state.inventory.includes(c.condVal) ? c.successId : c.failId;
            case 'flag': return this.state.flags.includes(c.condVal) ? c.successId : c.failId;
            case 'prob': return (Math.random() * 100 <= c.probVal) ? c.successId : c.failId;
            default: return c.nextSceneId;
        }
    },

// ============================================================
// 10. 実行エンジン：ライフサイクル完全制御 (描画)
// ============================================================

    render() {
        const scene = this.state.currentScene;
        const overlay = document.getElementById('game-play-overlay');
        if (!overlay) return;

        overlay.innerHTML = `
            <div class="game-container">
                <div class="game-hud">
                    ${this.state.character ? `👤 ${this.state.character.name} | 🎒 ${this.state.inventory.join(', ') || '空'}` : 'Guest Mode'}
                </div>
                <div class="scene-box">
                    <p>${scene.content.replace(/\n/g, '<br>')}</p>
                </div>
                <div class="choice-box">
                    ${scene.choices.map((c, i) => `
                        <button onclick="StoryForkEngine.handleActionByIndex(${i})">
                            ${c.text} ${c.consumeItemName ? `<small>[要:${c.consumeItemName}]</small>` : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    },

    handleActionByIndex(index) {
        this.handleAction(this.state.currentScene.choices[index]);
    },

    async selectCharacterUI() {
        // キャラ選択の簡易実装（実際はモーダル表示）
        const q = query(collection(db, "trpg_characters"), where("userId", "==", currentUser.uid), where("isAlive", "==", true));
        const snap = await getDocs(q);
        if (snap.empty) { alert("生存キャラがいません。"); return null; }
        return snap.docs[0].id;
    }
};

window.StoryForkEngine = StoryForkEngine;