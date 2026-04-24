// ================= [0] 配置区 =================
const SB_URL = 'https://bhilewmilbhxowxwwyfq.supabase.co'; // 已修正 URL
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWxld21pbGJoeG93eHd3eWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYyNTUsImV4cCI6MjA5MjUzMjI1NX0._Kj-4i2KTU7LO07AwNkKAta-0qluh4BygU_OMwAKc6o'; 

let supabaseClient = null;
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
        console.log("✅ Supabase 客户端已就绪");
    }
} catch (e) { console.error("Supabase 初始化失败:", e); }

// ================= [1] 全局变量 =================
let wordList = [];
let currentWordIndex = 0;
let articleList = [];
let currentArticleText = "";
let articleSentences = [];
let currentSentenceIdx = 0;
let sentenceReplayTimer = null;
let currentChatMode = 'eng';
let chatHistory = [];
let translationTasks = [];
let copySentenceQueue = [];
let currentCopyCount = 0;
let artChallengeData = [];

// ================= [2] 初始化逻辑 =================
window.onload = function() {
    console.log("🚀 程序开始加载...");
    
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            const authSection = document.getElementById('authSection');
            const userSection = document.getElementById('userSection');
            if (session) {
                if(authSection) authSection.style.display = 'none';
                if(userSection) userSection.style.display = 'block';
                document.getElementById('userEmailDisplay').innerText = "已登录: " + session.user.email;
                pullFromCloud(); 
            }
        });
    }

    loadAllData();

    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        const keyInput = document.getElementById('siliconApiKey');
        if(keyInput) keyInput.value = savedKey;
        const settings = document.getElementById('settingsCard');
        if(settings) settings.style.display = 'none';
    }

    switchTab('words');
    updateDailyDashboard();
    
    // 定时刷新仪表盘
    setInterval(updateDailyDashboard, 10000);
    setInterval(() => {
        const select = document.getElementById('groupSelect');
        const span = document.getElementById('currentActiveGNum');
        if(select && span) span.innerText = (select.value === 'all' ? '全' : parseInt(select.value) + 1);
    }, 500);
};

// ================= [3] 数据加载 (3行格式) =================
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
            initArticleSelect();
        }
    } catch (e) { console.error("加载失败", e); }
}

// ================= [4] 单词核心逻辑 =================
function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    if(!select) return;
    select.innerHTML = '';
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        select.add(new Option(`📦 第 ${i + 1} 组`, i));
    }
    select.add(new Option(`📚 全部练习`, 'all'));
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
    const wordObj = wordList[currentWordIndex];
    const bounds = getGroupBounds();

    document.getElementById('targetWord').innerText = wordObj.en;
    document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    const zhEl = document.getElementById('chineseMeaning');
    zhEl.innerText = wordObj.zh; zhEl.style.display = 'none';

    const exBox = document.getElementById('exampleSentence');
    const parts = wordObj.ex.split("中文：");
    exBox.innerHTML = parts.length > 1 ? 
        `<div>${parts[0]}</div><div style="color:#8e8e93; font-size:0.9em; border-top:1px solid #eee; margin-top:5px; padding-top:5px;">${parts[1]}</div>` : 
        wordObj.ex;
    exBox.style.display = 'none';
    document.getElementById('targetWord').style.filter = 'none';
}

function nextWord() {
    const bounds = getGroupBounds();
    currentWordIndex++;
    if (currentWordIndex > bounds.end) currentWordIndex = bounds.start;
    updateWordDisplay();
}

function restartWords() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }
function toggleMeaning() { const el = document.getElementById('chineseMeaning'); el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
function toggleBlur() { const el = document.getElementById('targetWord'); el.style.filter = el.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)'; }

function readTargetWord() {
    window.speechSynthesis.cancel();
    document.getElementById('targetWord').style.filter = 'none';
    const u = new SpeechSynthesisUtterance(wordList[currentWordIndex].en);
    u.lang = 'en-US'; window.speechSynthesis.speak(u);
}

function showAndPlayExample() {
    document.getElementById('exampleSentence').style.display = 'block';
    let text = wordList[currentWordIndex].ex.split("中文：")[0].replace(/[^\x00-\xff]/g, '').trim();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

// ================= [5] 云端同步与看板 =================
function getLocalDateString(date) {
    let y = date.getFullYear(), m = (date.getMonth()+1).toString().padStart(2,'0'), d = date.getDate().toString().padStart(2,'0');
    return `${y}-${m}-${d}`;
}

async function pushToCloud() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const progressData = {
        eng_study_history: localStorage.getItem('eng_study_history'),
        selected_book_path: localStorage.getItem('selected_book_path'),
        silicon_api_key: localStorage.getItem('silicon_api_key')
    };
    await supabaseClient.from('user_progress').upsert({ id: user.id, data: progressData, updated_at: new Date() });
}

async function pullFromCloud() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const { data } = await supabaseClient.from('user_progress').select('data').single();
    if (data && data.data) {
        let changed = false;
        for (let key in data.data) {
            if (data.data[key] && localStorage.getItem(key) !== data.data[key]) {
                localStorage.setItem(key, data.data[key]);
                changed = true;
            }
        }
        if (changed) updateDailyDashboard();
    }
}

function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return alert("请先选组");
    const gNum = parseInt(val) + 1;
    const today = new Date(); today.setHours(0,0,0,0);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    for (let i = 1; i <= gNum; i++) {
        let target = new Date(today);
        if (i === gNum - 1) target.setDate(today.getDate() - 1);
        else if (i === gNum - 3) target.setDate(today.getDate() - 3);
        else if (i === gNum - 6) target.setDate(today.getDate() - 6);
        else if (i < gNum) target.setDate(today.getDate() - 20);
        history[i] = getLocalDateString(target);
    }
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    updateDailyDashboard(); pushToCloud();
    alert("🎉 记录成功，云端已同步！");
}

function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    if (!dashboard) return;
    const today = new Date(); today.setHours(0,0,0,0);
    document.getElementById('todayDate').innerText = getLocalDateString(today);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    let maxG = 0; Object.keys(history).forEach(g => { if(parseInt(g)>maxG) maxG=parseInt(g); });
    tasks.push(`🆕 <b>新课：</b> 第 <a href="#" onclick="jumpToGroup(${maxG})" style="color:#f1c40f;">${maxG+1}</a> 组`);
    let review = [];
    for (let g in history) {
        const parts = history[g].split('-');
        const d = new Date(parts[0], parts[1]-1, parts[2]);
        const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
        if ([1, 3, 6].includes(diff)) review.push(`<a href="#" onclick="jumpToGroup(${g-1})" style="color:#f1c40f; margin-right:10px;">第 ${g} 组</a>`);
    }
    if (review.length) tasks.push(`<br>🔄 <b>复习：</b> ${review.reverse().join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function jumpToGroup(idx) { 
    const select = document.getElementById('groupSelect');
    if(select) { select.value = idx; changeGroup(); }
}

// ================= [6] AI 翻译挑战 =================
async function startTranslationChallenge() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if(!apiKey) return alert("请设置 API Key");
    const bounds = getGroupBounds();
    let words = []; for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);
    
    document.getElementById('transSetup').style.display = 'none';
    document.getElementById('transWorking').style.display = 'block';
    const qBox = document.getElementById('transQuestions');
    qBox.innerHTML = "⏳ AI 老师正在出题...";

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({
                model:'Qwen/Qwen2.5-7B-Instruct', 
                messages: [{role:"user", content: `使用[${words.join(",")}]出3道纯中文翻译题。严禁英文和中括号。每行一句。`}]
            })
        });
        const data = await res.json();
        const lines = data.choices[0].message.content.trim().split('\n').filter(l => l.trim().length > 3).slice(0,3);
        translationTasks = lines.map(l => ({ cn: l.replace(/^\d+[\.、\s]+/, '').trim(), userEn: '' }));
        qBox.innerHTML = translationTasks.map((t, i) => `
            <div style="margin-bottom:10px;">Q${i+1}: ${t.cn}<input type="text" class="trans-user-input" data-idx="${i}" style="margin-top:5px;"></div>
        `).join('');
    } catch(e) { alert("出题失败"); }
}

async function gradeTranslations() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const inputs = document.querySelectorAll('.trans-user-input');
    inputs.forEach(input => translationTasks[input.dataset.idx].userEn = input.value.trim());
    document.getElementById('btnSubmitTrans').innerText = "正在批改...";

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({
                model:'Qwen/Qwen2.5-7B-Instruct', 
                messages: [{role:"user", content: `批改：${translationTasks.map(t=>t.cn + "->" + t.userEn).join('; ')}。仅输出地道答案，用###分隔。`}],
                temperature: 0.1
            })
        });
        const data = await res.json();
        const corrects = data.choices[0].message.content.split('###').map(s => s.trim().replace(/^[\d.、\s]+/, ''));
        
        document.getElementById('transResult').style.display = 'block';
        document.getElementById('transWorking').style.display = 'none';
        copySentenceQueue = [];
        let html = "<h3>批改报告</h3>";
        translationTasks.forEach((t, i) => {
            const correct = corrects[i] || "Error";
            copySentenceQueue.push(correct);
            html += `<div style="margin-bottom:10px; border:1px solid #eee; padding:8px; border-radius:10px;">
                <p>${t.cn}</p><p style="color:red; margin:0;">你写: ${t.userEn}</p><p style="color:green; font-weight:bold; margin:0;">地道: ${correct}</p>
            </div>`;
        });
        document.getElementById('transComparisonArea').innerHTML = html;
        startCopyExercise();
    } catch(e) { alert("批改失败"); }
}

function startCopyExercise() { currentCopyCount = 0; document.getElementById('copyExerciseArea').style.display = 'block'; updateCopyDisplay(); }
function updateCopyDisplay() {
    document.getElementById('copyTargetBox').innerText = copySentenceQueue[0];
    document.getElementById('copyProgressText').innerText = `已抄写: ${currentCopyCount}/5`;
    document.getElementById('copyInput').value = ""; document.getElementById('copyInput').focus();
}
function handleCopyInput() {
    const input = document.getElementById('copyInput').value.trim().toLowerCase().replace(/[.,!?'"]/g, '');
    const target = copySentenceQueue[0].trim().toLowerCase().replace(/[.,!?'"]/g, '');
    if (input === target) {
        currentCopyCount++;
        if (currentCopyCount >= 5) {
            copySentenceQueue.shift();
            if (copySentenceQueue.length > 0) { currentCopyCount = 0; updateCopyDisplay(); }
            else { alert("🎉 挑战完成！"); document.getElementById('copyExerciseArea').style.display = 'none'; }
        } else updateCopyDisplay();
    } else alert("不完全一致，请仔细检查");
}

// ================= [7] AI 故事与记忆宫殿 =================
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if(!apiKey) return alert("请存 Key");
    const bounds = getGroupBounds();
    let words = []; for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);
    const box = document.getElementById('aiStoryContent');
    box.style.display="block"; box.innerText="AI 正在构思故事...";
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:`用单词[${words.join(",")}]写100词英文故事，加粗单词，带翻译。`}]})
        });
        const data = await res.json();
        box.innerHTML = data.choices[0].message.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        document.getElementById('btnShadowStory').style.display = 'block';
    } catch(e) { box.innerText = "生成失败"; }
}

async function generateGroupStory() { generateRevisionStory(); }

function generateGroupMemoryPalace() {
    const bounds = getGroupBounds();
    const palaceArea = document.getElementById('memoryPalaceArea');
    const palaceContent = document.getElementById('palaceContent');
    let html = "";
    for (let i = bounds.start; i <= bounds.end; i++) {
        if (wordList[i]) {
            html += `<div style="margin-bottom:10px; border-bottom:1px dashed #eee;"><b>${i - bounds.start + 1}. ${wordList[i].en}</b><br><small>${wordList[i].hook}</small></div>`;
        }
    }
    palaceArea.style.display = 'block'; palaceContent.innerHTML = html;
}

// ================= [8] 互动聊天 =================
function switchChatMode(mode) {
    currentChatMode = mode;
    document.getElementById('modeBtnEng').classList.toggle('active', mode === 'eng');
    document.getElementById('modeBtnChn').classList.toggle('active', mode === 'chn');
    document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${mode==='eng'?"Hi! Let's chat!":"你好！我是中文助手。"}</div>`;
    chatHistory = [{role:"system", content: mode==='eng'?"You are a teacher. Correct errors.":"你是助手。"}];
}

async function sendChatMessage() {
    const input = document.getElementById('chatMsgInput');
    const txt = input.value.trim(); if(!txt) return;
    const key = localStorage.getItem('silicon_api_key');
    if(!key) return alert("请设置 Key");
    
    appendChatBubble(txt, 'user'); input.value = "";
    chatHistory.push({role:"user", content:txt});
    const loadingId = appendChatBubble("⏳ ...", 'ai');

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: chatHistory})
        });
        const data = await res.json();
        const aiTxt = data.choices[0].message.content;
        chatHistory.push({role:"assistant", content:aiTxt});
        document.getElementById(loadingId).innerText = aiTxt;
    } catch (e) { document.getElementById(loadingId).innerText = "Error"; }
}

function startChatVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return alert("不支持");
    const rec = new SR(); rec.lang = currentChatMode === 'eng' ? 'en-US' : 'zh-CN';
    rec.start();
    rec.onresult = (e) => { sendChatMessage(e.results[0][0].transcript); };
}

// ================= [9] 辅助与文章 =================
function switchTab(t) {
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + t).style.display = 'block';
    document.getElementById('btn-' + t).classList.add('active');
    const b = document.getElementById('bookSelectorContainer'); if(b) b.style.display = (t === 'chat' ? 'none' : 'flex');
}

function appendChatBubble(t, s) {
    const id = "msg-" + Date.now();
    const div = document.createElement('div');
    div.className = `chat-bubble bubble-${s}`; div.id = id; div.innerText = t;
    document.getElementById('chatLog').appendChild(div);
    document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight;
    return id;
}

function initArticleSelect() {
    const s = document.getElementById('articleStartSelect');
    const e = document.getElementById('articleEndSelect');
    if(!s || !e) return;
    s.innerHTML = ''; e.innerHTML = '';
    articleList.forEach((_, i) => { s.add(new Option(`第 ${i+1} 段`, i)); e.add(new Option(`第 ${i+1} 段`, i)); });
    changeArticleRange();
}

function changeArticleRange() {
    const sVal = parseInt(document.getElementById('articleStartSelect').value);
    const eVal = parseInt(document.getElementById('articleEndSelect').value);
    const selected = articleList.slice(sVal, Math.max(sVal, eVal) + 1);
    document.getElementById('articleDisplay').innerHTML = selected.map(item => `<div style="margin-bottom:10px;">${item.en}<br><small style="color:#7f8c8d">${item.zh}</small></div>`).join('');
    currentArticleText = selected.map(item => item.en).join(' ');
}

// 其余辅助函数... (speakArticle, startArticleDictation等请保持之前实现)
function saveApiKey() { localStorage.setItem('silicon_api_key', document.getElementById('siliconApiKey').value.trim()); alert("已保存"); }
function changeBook() { localStorage.setItem('selected_book_path', document.getElementById('bookSelect').value); location.reload(); }
async function handleLogin() {
    const email = document.getElementById('syncEmail').value;
    if(supabaseClient) { const { error } = await supabaseClient.auth.signInWithOtp({ email }); alert(error ? error.message : "验证邮件已发送"); }
}
function handleLogout() { if(supabaseClient) supabaseClient.auth.signOut().then(() => location.reload()); }
function manualPush() { pushToCloud().then(() => alert("云端已同步")); }
function closeMemoryPalace() { document.getElementById('memoryPalaceArea').style.display = 'none'; }
function toggleSettings() { 
    const s = document.getElementById('settingsCard');
    s.style.display = (s.style.display === 'none' ? 'block' : 'none');
}