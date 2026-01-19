let decks = JSON.parse(localStorage.getItem('decks')) || [];
let currentDeckIdx = -1, currentCards = [], currentIndex = 0, isReviewMode = false, isQuickMode = false;
let score = 0, studyStartTime = null; 
let stats = JSON.parse(localStorage.getItem('study_stats')) || { lastDate: null, streak: 0, history: {} };

function getTodayStr() { return new Date().toISOString().split('T')[0]; }
let dailyProgress = JSON.parse(localStorage.getItem('daily_progress')) || { date: getTodayStr(), hasCreatedCard: false, reviewedDecks: [] };

if (dailyProgress.date !== getTodayStr()) {
    dailyProgress = { date: getTodayStr(), hasCreatedCard: false, reviewedDecks: [] };
    localStorage.setItem('daily_progress', JSON.stringify(dailyProgress));
}

// === UTILS ===
function save() { localStorage.setItem('decks', JSON.stringify(decks)); }
function stripHtml(html) { if (!html) return ""; return html.replace(/<[^>]*>?/gm, ''); }
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(stripHtml(text));
        u.lang = 'ja-JP'; u.rate = 0.8; window.speechSynthesis.speak(u);
    }
}
function speakCurrent(e) { if(e) e.stopPropagation(); speak(currentCards[currentIndex].front); }

// === NAVIGATION ===
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'home-screen') updateHome();
    if (id === 'stats-screen') renderStats();
}

function updateHome() {
    const list = document.getElementById('deck-list'); list.innerHTML = '';
    if(decks.length === 0) list.innerHTML = `<div style="text-align:center; padding:30px; color:#999">Chưa có bài học nào.<br>Hãy tạo bài mới!</div>`;
    decks.forEach((d, i) => {
        const div = document.createElement('div'); div.className = 'deck-item';
        div.innerHTML = `<div><strong>${d.name}</strong><small>${d.cards.length} thẻ • ⭐ ${d.reviewList.length}</small></div><span style="font-size:20px; color:#ccc">›</span>`;
        div.onclick = () => openDeck(i); list.appendChild(div);
    });
    checkDailyQuests(); checkStreak();
}

// === DECK LOGIC ===
window.createNewDeck = () => { const n = prompt("Tên bài học:"); if(n){ decks.push({name:n, cards:[], reviewList:[], createdAt:new Date().toISOString()}); save(); updateHome(); }};
function openDeck(i) {
    currentDeckIdx = i; const d = decks[i];
    // Sync review list
    const validIds = new Set(d.cards.map(c=>c.id)); d.reviewList = d.reviewList.filter(c=>validIds.has(c.id));
    document.getElementById('current-deck-name').innerText = d.name;
    document.getElementById('card-count').innerText = d.cards.length;
    document.getElementById('star-count').innerText = d.reviewList.length;
    showScreen('deck-detail-screen'); renderCards();
}
window.deleteCurrentDeck = () => { if(confirm("Xóa bài này?")){ decks.splice(currentDeckIdx,1); save(); showScreen('home-screen'); }};
window.shuffleDeck = () => { if(decks[currentDeckIdx].cards.length<2) return alert("Ít thẻ quá!"); decks[currentDeckIdx].cards.sort(()=>0.5-Math.random()); save(); renderCards(); alert("Đã trộn!"); };

function renderCards() {
    const c = document.getElementById('card-list'); c.innerHTML = '';
    if(!decks[currentDeckIdx].cards.length) { c.innerHTML = '<div style="text-align:center; padding:20px; color:#999">Chưa có thẻ nào</div>'; return; }
    decks[currentDeckIdx].cards.forEach((card, i) => {
        const div = document.createElement('div'); div.className = 'card-item-manage';
        div.onclick = () => { 
            isReviewMode=false; currentCards=[...decks[currentDeckIdx].cards]; currentIndex=i; showScreen('study-screen'); loadCard(); startTimer(); 
        };
        div.innerHTML = `<div class="card-index">${i+1}</div><div class="card-content"><b>${stripHtml(card.front)}</b><br><span style="color:#666; font-size:13px">${card.back.substring(0,30)}...</span></div><button onclick="deleteCard(event,${i})" class="btn-icon danger" style="width:30px; height:30px; font-size:14px">🗑️</button>`;
        c.appendChild(div);
    });
}
window.deleteCard = (e, i) => { e.stopPropagation(); if(confirm("Xóa thẻ?")){ const d=decks[currentDeckIdx]; const id=d.cards[i].id; d.reviewList=d.reviewList.filter(x=>x.id!==id); d.cards.splice(i,1); save(); renderCards(); }};

// === IMPORT ===
window.handleBulkImport = () => {
    if(currentDeckIdx===-1) return alert("Lỗi!");
    const val = document.getElementById('bulk-input').value.trim(); if(!val) return;
    let count=0;
    val.split('\n').forEach(line => {
        const p = line.split('-'); 
        if(p.length>=2) {
            const front = p[0].trim(); const back = p.slice(1).join('-').split(',').map(s=>stripHtml(s).trim()).join('<br>');
            decks[currentDeckIdx].cards.push({id:Date.now()+Math.random(), front, back}); count++;
        }
    });
    if(count){ save(); dailyProgress.hasCreatedCard=true; localStorage.setItem('daily_progress',JSON.stringify(dailyProgress)); document.getElementById('bulk-input').value=''; alert("Đã thêm "+count); openDeck(currentDeckIdx); }
};
window.closeImport = () => { if(currentDeckIdx===-1) showScreen('home-screen'); else showScreen('deck-detail-screen'); };

// === STUDY LOGIC ===
window.startStudy = (isRev) => {
    if(currentDeckIdx===-1) return; isReviewMode=isRev; const d=decks[currentDeckIdx];
    currentCards = isRev ? [...d.reviewList] : [...d.cards];
    if(!currentCards.length) return alert("Không có thẻ để học!");
    currentIndex=0; showScreen('study-screen'); loadCard(); startTimer();
};
function loadCard() {
    const c = currentCards[currentIndex];
    const cardEl = document.getElementById('main-card'); cardEl.classList.remove('is-flipped');
    setTimeout(() => {
        document.getElementById('front-text').innerHTML = stripHtml(c.front);
        document.getElementById('back-text').innerHTML = c.back;
        document.getElementById('study-progress').innerText = `${currentIndex+1}/${currentCards.length}`;
        updateStarIcon(c);
    }, 200);
}
function updateStarIcon(c) {
    let starred = false;
    if(isQuickMode) starred = decks[c.sourceDeckIdx].reviewList.some(x=>x.id===c.id);
    else starred = decks[currentDeckIdx].reviewList.some(x=>x.id===c.id);
    document.getElementById('star-indicator').className = starred ? "star-badge" : "star-badge hidden";
}
window.flipCard = () => document.getElementById('main-card').classList.toggle('is-flipped');
window.nextCard = () => { if(currentIndex<currentCards.length-1) { currentIndex++; loadCard(); } else alert("Hết thẻ!"); };
window.prevCard = () => { if(currentIndex>0) { currentIndex--; loadCard(); } };
window.toggleStarCurrent = () => {
    const c = currentCards[currentIndex];
    if(isQuickMode) {
        const d = decks[c.sourceDeckIdx]; const idx = d.reviewList.findIndex(x=>x.id===c.id);
        idx===-1 ? d.reviewList.push(decks[c.sourceDeckIdx].cards.find(x=>x.id===c.id)) : d.reviewList.splice(idx,1);
    } else {
        const d = decks[currentDeckIdx]; const idx = d.reviewList.findIndex(x=>x.id===c.id);
        idx===-1 ? d.reviewList.push(c) : d.reviewList.splice(idx,1);
    }
    save(); updateStarIcon(c);
};
window.markKnown = (k) => {
    // Logic: Nếu chưa thuộc -> auto thêm sao. Nếu thuộc -> xóa sao (nếu đang học sao)
    const c = currentCards[currentIndex];
    if(isQuickMode) {
        const d = decks[c.sourceDeckIdx]; const idx = d.reviewList.findIndex(x=>x.id===c.id);
        if(!k && idx===-1) d.reviewList.push(decks[c.sourceDeckIdx].cards.find(x=>x.id===c.id));
        else if(k && idx!==-1) d.reviewList.splice(idx,1);
    } else {
        const d = decks[currentDeckIdx]; const idx = d.reviewList.findIndex(x=>x.id===c.id);
        if(!k && idx===-1) d.reviewList.push(c);
        else if(k && idx!==-1) d.reviewList.splice(idx,1);
    }
    save(); window.nextCard();
};

// === QUIZ LOGIC ===
window.startQuiz = (isRev) => {
    if(currentDeckIdx===-1) return; isReviewMode=isRev; const d=decks[currentDeckIdx];
    currentCards = isRev ? [...d.reviewList] : [...d.cards];
    if(currentCards.length<4) return alert("Cần ít nhất 4 thẻ!");
    currentCards.sort(()=>0.5-Math.random()); currentIndex=0; score=0;
    showScreen('quiz-screen'); loadQuiz(); startTimer();
};
function loadQuiz() {
    const c = currentCards[currentIndex];
    document.getElementById('quiz-score').innerText = `Điểm: ${score}`;
    document.getElementById('quiz-progress').innerText = `Câu ${currentIndex+1}/${currentCards.length}`;
    document.getElementById('quiz-question').innerText = stripHtml(c.front);
    
    // Gen options
    const allBacks = decks[currentDeckIdx].cards.map(x=>x.back);
    let opts = [c.back];
    while(opts.length<4) { let r = allBacks[Math.floor(Math.random()*allBacks.length)]; if(!opts.includes(r)) opts.push(r); }
    opts.sort(()=>0.5-Math.random());
    
    const grid = document.getElementById('quiz-options'); grid.innerHTML = '';
    document.getElementById('quiz-overlay').classList.remove('hidden'); document.getElementById('quiz-overlay').style.display='flex';
    grid.classList.add('blurred-grid');
    
    opts.forEach(o => {
        const btn = document.createElement('button'); btn.innerHTML = o;
        btn.onclick = () => checkAnswer(btn, o===c.back, c);
        grid.appendChild(btn);
    });
}
window.revealAnswers = () => { document.getElementById('quiz-overlay').classList.add('hidden'); document.getElementById('quiz-overlay').style.display='none'; document.getElementById('quiz-options').classList.remove('blurred-grid'); };
function checkAnswer(btn, isCorrect, c) {
    const grid = document.getElementById('quiz-options'); grid.classList.add('blurred-grid'); speak(c.front);
    if(isCorrect) { btn.classList.add('correct'); score++; if(isReviewMode && !isQuickMode) { decks[currentDeckIdx].reviewList = decks[currentDeckIdx].reviewList.filter(x=>x.id!==c.id); save(); } }
    else { btn.classList.add('wrong'); Array.from(grid.children).forEach(b=>{if(b.innerHTML===c.back)b.classList.add('correct')}); if(!isQuickMode && !decks[currentDeckIdx].reviewList.find(x=>x.id===c.id)) { decks[currentDeckIdx].reviewList.push(c); save(); } }
    setTimeout(() => { currentIndex++; if(currentIndex<currentCards.length) loadQuiz(); else { alert(`Kết quả: ${score}/${currentCards.length}`); stopStudySession(); }}, isCorrect?1500:3000);
}

// === QUICK STUDY ===
window.openQuickStudy = () => {
    if(!decks.length) return alert("Chưa có bài nào!");
    const l = document.getElementById('quick-deck-list'); l.innerHTML = '';
    decks.forEach((d,i) => {
        l.innerHTML += `<div class="deck-checkbox-item"><input type="checkbox" id="qd${i}" value="${i}" checked><label for="qd${i}">${d.name} <span>(${d.cards.length})</span></label></div>`;
    });
    showScreen('quick-setup-screen');
};
window.startQuickSession = () => {
    const checks = document.querySelectorAll('#quick-deck-list input:checked');
    if(!checks.length) return alert("Chọn ít nhất 1 bài!");
    let pool = [];
    checks.forEach(cb => {
        const dIdx = parseInt(cb.value);
        decks[dIdx].cards.forEach(c => pool.push({...c, sourceDeckIdx: dIdx}));
    });
    if(!pool.length) return alert("Không có thẻ nào!");
    pool.sort(()=>0.5-Math.random());
    const lim = parseInt(document.getElementById('quick-count').value);
    currentCards = pool.slice(0, lim); isQuickMode = true; currentIndex=0;
    showScreen('study-screen'); loadCard(); startTimer();
};

// === STATS & QUESTS ===
function checkDailyQuests() {
    const l = document.getElementById('quest-list'); l.innerHTML = '';
    // Quest 1
    const q1 = document.createElement('li'); q1.className = dailyProgress.hasCreatedCard ? 'quest-item done' : 'quest-item';
    q1.innerHTML = dailyProgress.hasCreatedCard ? 'Tạo thẻ mới' : 'Tạo 1 thẻ mới';
    if(!dailyProgress.hasCreatedCard) q1.onclick = () => { if(decks.length) alert("Vào bài học -> Thêm từ"); else createNewDeck(); };
    l.appendChild(q1);
    // Quest 2
    let hasRev = false; const now = new Date();
    decks.forEach((d,i) => {
        const diff = Math.floor((now - new Date(d.createdAt))/86400000);
        if([1,3,7,14,30].includes(diff)) {
            hasRev = true; const q = document.createElement('li');
            const done = dailyProgress.reviewedDecks.includes(i);
            q.className = done ? 'quest-item done' : 'quest-item';
            q.innerHTML = `Ôn tập: ${d.name}`;
            if(!done) q.onclick = () => openDeck(i);
            l.appendChild(q);
        }
    });
    if(!hasRev) l.innerHTML += `<li class="quest-item done">Không có bài ôn tập hôm nay</li>`;
}
function checkStreak() {
    const today = getTodayStr();
    if(stats.lastDate && stats.lastDate !== today) {
        const y = new Date(); y.setDate(y.getDate()-1);
        if(stats.lastDate !== y.toISOString().split('T')[0]) stats.streak=0;
    }
    document.getElementById('streak-count').innerText = stats.streak;
}
function startTimer() {
    studyStartTime = Date.now();
    const today = getTodayStr();
    if(stats.lastDate !== today) {
        const y = new Date(); y.setDate(y.getDate()-1);
        if(stats.lastDate === y.toISOString().split('T')[0]) stats.streak++; else stats.streak=1;
        stats.lastDate = today; localStorage.setItem('study_stats', JSON.stringify(stats)); checkStreak();
    }
}
window.stopStudySession = () => {
    if(studyStartTime) {
        const sec = Math.round((Date.now()-studyStartTime)/1000);
        const t = getTodayStr(); stats.history[t] = (stats.history[t]||0) + sec;
        localStorage.setItem('study_stats', JSON.stringify(stats)); studyStartTime=null;
    }
    if(!isQuickMode && currentDeckIdx!==-1 && !dailyProgress.reviewedDecks.includes(currentDeckIdx)) {
        dailyProgress.reviewedDecks.push(currentDeckIdx); localStorage.setItem('daily_progress', JSON.stringify(dailyProgress));
    }
    isQuickMode = false;
    if(currentDeckIdx===-1) showScreen('home-screen'); else showScreen('deck-detail-screen');
};
function renderStats() {
    const t = getTodayStr(); document.getElementById('today-time').innerText = Math.round((stats.history[t]||0)/60) + 'p';
    document.getElementById('total-days').innerText = Object.keys(stats.history).length;
    // Chart logic simplified
    const chart = document.getElementById('weekly-chart'); chart.innerHTML='';
    for(let i=6; i>=0; i--) {
        const d = new Date(); d.setDate(d.getDate()-i); const ds = d.toISOString().split('T')[0];
        const val = stats.history[ds]||0; const h = Math.min(100, Math.max(5, val/60)); // max 60 mins scale
        chart.innerHTML += `<div class="chart-col"><div class="bar" style="height:${h}%"></div><div class="day-label">${ds.slice(8)}</div></div>`;
    }
}

// === SYSTEM ===
window.exportData = () => {
    const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(decks));
    a.download = `mina_backup.json`; a.click();
};
window.importData = (e) => {
    const r = new FileReader(); r.onload = (ev) => { try{ decks=JSON.parse(ev.target.result); save(); updateHome(); alert("Xong!"); }catch(e){alert("Lỗi file");} };
    r.readAsText(e.target.files[0]);
};

// Start
updateHome();