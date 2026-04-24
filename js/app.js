// ================= [0] Supabase 云端初始化 =================
// 请在此处填入你在 Supabase 官网获取的真实参数
const supabaseUrl = 'https://xxxxxxxxxxxx.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; 
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ================= [1] 全局变量定义 =================
let activeUtterance = null;
let wordList = [];
let currentWordIndex = 0;
let articleList = [];
let currentArticleText = "";
let articleSentences = [];
let currentSentenceIdx = 0;
let sentenceReplayTimer = null;
let currentChatMode = 'eng';
let chatHistory = [];

// ================= [2] 初始化与 Auth 监听 =================
window.onload = function() {
    // 监听 Supabase 登录状态
    supabase.auth.onAuthStateChange((event, session) => {
        const authSection = document.getElementById('authSection');
        const userSection = document.getElementById('userSection');
        if (session) {
            if(authSection) authSection.style.display = 'none';
            if(userSection) userSection.style.display = 'block';
            document.getElementById('userEmailDisplay').innerText = "已登录: " + session.user.email;
            pullFromCloud(); // 登录后自动从云端同步
        } else {
            if(authSection) authSection.style.display = 'block';
            if(userSection) userSection.style.display = 'none';
        }
    });

    loadAllData();
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        document.getElementById('siliconApiKey').value = savedKey;
        document.getElementById('settingsCard').style.display = 'none';
    }
    switchChatMode('eng');
    updateDailyDashboard();
    
    // 实时同步当前组号到看板
    setInterval(() => {
        const val = document.getElementById('groupSelect').value;
        const gNum = val === 'all' ? '全' : parseInt(val) + 1;
        const activeSpan = document.getElementById('currentActiveGNum');
        if(activeSpan) activeSpan.innerText = gNum;
    }, 500);
};

// ================= [3] 数据加载逻辑 (三行读取) =================
async function loadAllData() {
    let currentBookPath = localStorage.getItem('selected_book_path') || 'default';
    let wordPath = currentBookPath === 'default' ? 'NewWords.txt' : `books/${currentBookPath}/NewWords.txt`;
    let textPath = currentBookPath === 'default' ? 'Texts.txt' : `books/${currentBookPath}/Texts.txt`;

    try {
        const wRes = await fetch(wordPath + '?t=' + Date.now());
        if (wRes.ok) {
            const wText = await wRes.text();
            const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
            wordList = [];
            for (let i = 0; i < rawLines.length; i += 3) {
                const parts = rawLines[i].split(/\||:|：/);
                wordList.push({
                    en: parts[0].trim(),
                    zh: parts.length > 1 ? parts[1].trim() : "暂无释义",
                    ex: rawLines[i + 1] || "暂无例句。",
                    hook: rawLines[i + 2] || "暂无记忆钩子。"
                });
            }
            if (wordList.length > 0) {
                initGroupSelect();
                updateWordDisplay();
            }
        }
        const aRes = await fetch(textPath + '?t=' + Date.now());
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i+1] || "" });
            }
            if (articleList.length > 0) initArticleSelect();
        }
    } catch (e) { console.error("加载数据失败", e); }
}

// ================= [4] 单词核心控制 =================
function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    select.innerHTML = '';
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        select.add(new Option(`📦 第 ${i + 1} 组 (${i*10+1}-${Math.min((i+1)*10, wordList.length)})`, i));
    }
    select.add(new Option(`📚 全部练习 (共 ${wordList.length} 词)`, 'all'));
    select.value = 0;
}

function getGroupBounds() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return { start: 0, end: wordList.length - 1, total: wordList.length };
    const start = parseInt(val) * 10;
    const end = Math.min(start + 9, wordList.length - 1);
    return { start, end, total: end - start + 1 };
}

function updateWordDisplay() {
    if (wordList.length === 0) return;
    const currentWord = wordList[currentWordIndex];
    const bounds = getGroupBounds();

    document.getElementById('targetWord').innerText = currentWord.en;
    document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    document.getElementById('chineseMeaning').innerText = currentWord.zh;
    document.getElementById('chineseMeaning').style.display = 'none';

    // 格式化例句显示
    const exBox = document.getElementById('exampleSentence');
    const exParts = currentWord.ex.split("中文：");
    exBox.innerHTML = exParts.length > 1 ? 
        `<div>${exParts[0]}</div><div style="color:#8e8e93; font-size:0.9em; margin-top:5px; border-top:1px solid #eee; padding-top:5px;">${exParts[1]}</div>` : 
        currentWord.ex;
    exBox.style.display = 'none';
    
    document.getElementById('wordResult').innerText = "";
    document.getElementById('targetWord').style.filter = 'none';
}

function nextWord() {
    const bounds = getGroupBounds();
    currentWordIndex++;
    if (currentWordIndex > bounds.end) currentWordIndex = bounds.start;
    updateWordDisplay();
}

function restartWords() {
    currentWordIndex = getGroupBounds().start;
    updateWordDisplay();
}

function readTargetWord() {
    window.speechSynthesis.cancel();
    const wordEl = document.getElementById('targetWord');
    if (wordEl) wordEl.style.filter = 'none';
    const utterance = new SpeechSynthesisUtterance(wordList[currentWordIndex].en);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
}

function toggleMeaning() {
    const el = document.getElementById('chineseMeaning');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function showAndPlayExample() {
    document.getElementById('exampleSentence').style.display = 'block';
    let speechText = wordList[currentWordIndex].ex.split("中文：")[0];
    const englishOnly = speechText.replace(/[^\x00-\xff]/g, '').trim();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(englishOnly); u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

// ================= [5] 云端同步逻辑 (Supabase) =================
async function handleLogin() {
    const email = document.getElementById('syncEmail').value;
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert("错误: " + error.message);
    else alert("验证邮件已发送！请查收邮箱并点击链接。");
}

async function pushToCloud() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const progressData = {
        eng_study_history: localStorage.getItem('eng_study_history'),
        selected_book_path: localStorage.getItem('selected_book_path'),
        silicon_api_key: localStorage.getItem('silicon_api_key')
    };
    await supabase.from('user_progress').upsert({ id: user.id, data: progressData, updated_at: new Date() });
    console.log("☁️ 进度已同步到云端");
}

async function pullFromCloud() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('user_progress').select('data').single();
    if (data && data.data) {
        let changed = false;
        for (let key in data.data) {
            if (data.data[key] && localStorage.getItem(key) !== data.data[key]) {
                localStorage.setItem(key, data.data[key]);
                changed = true;
            }
        }
        if (changed) { 
            updateDailyDashboard();
            console.log("✅ 本地已同步云端进度");
        }
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
    location.reload();
}

function manualPush() { pushToCloud(); alert("手动备份完成！"); }

// ================= [6] 1247 看板逻辑 =================
function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return alert("请先选组");
    const currentGNum = parseInt(val) + 1;
    const today = new Date(); today.setHours(0,0,0,0);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    
    for (let i = 1; i <= currentGNum; i++) {
        let target = new Date(today);
        if (i === currentGNum) {} 
        else if (i === currentGNum - 1) target.setDate(today.getDate() - 1);
        else if (i === currentGNum - 3) target.setDate(today.getDate() - 3);
        else if (i === currentGNum - 6) target.setDate(today.getDate() - 6);
        else target.setDate(today.getDate() - 20);
        history[i] = target.getFullYear() + "-" + (target.getMonth()+1).toString().padStart(2,'0') + "-" + target.getDate().toString().padStart(2,'0');
    }
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    updateDailyDashboard();
    pushToCloud(); // 关键：标记后自动推送到云端
    alert(`🎉 第 ${currentGNum} 组已学完，进度已同步！`);
}

function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    if (!dashboard) return;
    const today = new Date(); today.setHours(0,0,0,0);
    document.getElementById('todayDate').innerText = today.toISOString().split('T')[0];
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    
    let maxG = 0; Object.keys(history).forEach(g => { if(parseInt(g)>maxG) maxG=parseInt(g); });
    tasks.push(`🆕 <b>新课：</b> 第 <a href="#" onclick="jumpToGroup(${maxG})" style="color:#f1c40f; font-weight:bold;">${maxG+1}</a> 组`);
    
    let review = [];
    for (let g in history) {
        const parts = history[g].split('-');
        const d = new Date(parts[0], parts[1]-1, parts[2]);
        const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
        if ([1, 3, 6].includes(diff)) review.push(`<a href="#" onclick="jumpToGroup(${g-1})" style="color:#f1c40f; font-weight:bold; margin-right:8px;">第 ${g} 组</a>`);
    }
    if (review.length) tasks.push(`<br>🔄 <b>必复习：</b> ${review.reverse().join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function jumpToGroup(idx) { document.getElementById('groupSelect').value = idx; changeGroup(); }

// ================= [7] AI 故事与记忆宫殿 =================
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请先设置 API Key");
    const bounds = getGroupBounds();
    let words = [];
    for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);

    const btn = document.getElementById('btnGenStory');
    const box = document.getElementById('aiStoryContent');
    btn.innerText = "⏳ 构思中..."; box.style.display="block"; box.innerText="AI 正在创作故事...";

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:`用这些词写一段励志英文短文，加粗单词，带翻译：[${words.join(", ")}]`}]})
        });
        const data = await res.json();
        box.innerHTML = data.choices[0].message.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        document.getElementById('btnShadowStory').style.display = 'block';
        btn.innerText = "重新生成故事";
    } catch(e) { box.innerText = "生成失败"; }
}

function generateGroupMemoryPalace() {
    const bounds = getGroupBounds();
    const palaceArea = document.getElementById('memoryPalaceArea');
    const palaceContent = document.getElementById('palaceContent');
    let html = "";
    for (let i = bounds.start; i <= bounds.end; i++) {
        if (wordList[i]) {
            html += `<div style="margin-bottom:10px; border-bottom:1px dashed #eee; padding-bottom:5px;"><b>${i - bounds.start + 1}. ${wordList[i].en}</b> [${wordList[i].zh}]<br><small>${wordList[i].hook}</small></div>`;
        }
    }
    palaceArea.style.display = 'block';
    palaceContent.innerHTML = html;
}

function closeMemoryPalace() { document.getElementById('memoryPalaceArea').style.display = 'none'; window.scrollTo({top:0, behavior:'smooth'}); }

// ================= [8] 其他辅助逻辑 (聊天、切换等) =================
function switchTab(tabName) {
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + tabName).style.display = 'block';
    document.getElementById('btn-' + tabName).classList.add('active');
    
    const selector = document.getElementById('bookSelectorContainer');
    if(selector) selector.style.display = (tabName === 'chat' ? 'none' : 'flex');
}

function toggleSettings() { 
    const s = document.getElementById('settingsCard');
    s.style.display = s.style.display === 'none' ? 'block' : 'none';
}

function saveApiKey() {
    const key = document.getElementById('siliconApiKey').value.trim();
    localStorage.setItem('silicon_api_key', key);
    alert("已保存"); toggleSettings();
    pushToCloud(); // 保存后同步到云端
}

function changeBook() {
    localStorage.setItem('selected_book_path', document.getElementById('bookSelect').value);
    currentWordIndex = 0; loadAllData();
}

// (语音识别 startListeningForWord, 翻译挑战等函数请确保 HTML 里的 onclick 与此一致，此处由于长度限制略省)
// ... 补充已有的 startListeningForWord 等函数 ...