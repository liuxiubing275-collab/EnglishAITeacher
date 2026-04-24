/**
 * AI 英语私教 - 终极整合版
 * 核心逻辑：云端同步 + 1247 遗忘曲线 + 生词本自愈系统 + 防死循环 AI 创作
 */

// ================= [0] 配置区 =================
const SB_URL = 'https://bhilewmilbhxowxwwyfq.supabase.co'; 
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWxld21pbGJoeG93eHd3eWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYyNTUsImV4cCI6MjA5MjUzMjI1NX0._Kj-4i2KTU7LO07AwNkKAta-0qluh4BygU_OMwAKc6o'; 

let supabaseClient = null;
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
        console.log("✅ Supabase 客户端连接正常");
    }
} catch (e) { console.warn("Supabase 暂不可用，转为本地模式"); }

// ================= [1] 全局状态 =================
let wordList = [];
let currentWordIndex = 0;
let articleList = [];
let currentArticleText = "";
let articleSentences = [];
let currentSentenceIdx = 0;
let sentenceReplayTimer = null;
let currentChatMode = 'eng';
let chatHistory = [];
let isWrongBookMode = false;

// 翻译/挑战相关变量
let translationTasks = [];
let copySentenceQueue = [];
let currentCopyCount = 0;
let artChallengeData = [];

// ================= [2] 初始化 =================
window.onload = function() {
    console.log("🚀 AI 英语私教 启动中...");
    
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session) {
                document.getElementById('authSection').style.display = 'none';
                document.getElementById('userSection').style.display = 'block';
                document.getElementById('userEmailDisplay').innerText = "Hi, " + session.user.email;
                pullFromCloud(); 
            }
        });
    }

    loadAllData();

    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        document.getElementById('siliconApiKey').value = savedKey;
        document.getElementById('settingsCard').style.display = 'none';
    }

    switchTab('words');
    updateDailyDashboard();
    
    // 定时轮询
    setInterval(updateDailyDashboard, 30000); // 30秒刷一次任务
};

// ================= [3] 数据加载 (支持 3 行格式) =================
async function loadAllData() {
    let book = localStorage.getItem('selected_book_path') || 'default';
    let wPath = book === 'default' ? 'NewWords.txt' : `books/${book}/NewWords.txt`;
    let tPath = book === 'default' ? 'Texts.txt' : `books/${book}/Texts.txt`;

    try {
        const wRes = await fetch(wPath + '?t=' + Date.now());
        if (wRes.ok) {
            const wText = await wRes.text();
            const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
            wordList = [];
            // 核心：步长为 3 读取 (单词|释义, 例句, 宫殿)
            for (let i = 0; i < rawLines.length; i += 3) {
                const parts = rawLines[i].split(/\||:|：/);
                wordList.push({
                    en: parts[0].trim(),
                    zh: parts.length > 1 ? parts[1].trim() : "暂无释义",
                    ex: rawLines[i + 1] || "No example.",
                    hook: rawLines[i + 2] || "未配置挂钩。"
                });
            }
            if (wordList.length > 0) {
                initGroupSelect();
                updateWordDisplay();
            }
        }
        const aRes = await fetch(tPath + '?t=' + Date.now());
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i+1] || "" });
            }
            initArticleSelect();
        }
    } catch (e) { console.error("Data Load Error", e); }
}

// ================= [4] 单词挑战与生词系统 =================

function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';
    
    // 1. 添加普通组
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        select.add(new Option(`📦 第 ${i + 1} 组`, i));
    }
    select.add(new Option(`📚 全部练习`, 'all'));

    // 2. 添加生词本选项
    let wrongWords = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');
    if (wrongWords.length > 0) {
        let opt = new Option(`❤️ 生词本 (${wrongWords.length} 词)`, 'wrong_book');
        opt.style.color = "red";
        select.add(opt);
    }
    
    // 3. 更新看板统计
    const countSpan = document.getElementById('wrongWordsCount');
    if (countSpan) countSpan.innerText = wrongWords.length;
    const staticArea = document.getElementById('wrongWordsStatic');
    if (staticArea) staticArea.style.display = wrongWords.length > 0 ? 'block' : 'none';

    select.value = currentVal || 0;
}

function updateWordDisplay() {
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    
    if (source.length === 0) {
        if (isWrongBookMode) {
            alert("🎉 生词已全部消灭！");
            isWrongBookMode = false;
            document.getElementById('groupSelect').value = 0;
            changeGroup();
        }
        return;
    }

    if (currentWordIndex >= source.length) currentWordIndex = 0;
    const wordObj = source[currentWordIndex];
    const bounds = isWrongBookMode ? {start:0, total: source.length} : getGroupBounds();

    document.getElementById('targetWord').innerText = wordObj.en;
    document.getElementById('wordCounter').innerText = isWrongBookMode ? 
        `${currentWordIndex+1} / ${source.length}` : 
        `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    
    const zhEl = document.getElementById('chineseMeaning');
    zhEl.innerText = wordObj.zh; zhEl.style.display = 'none';

    const exBox = document.getElementById('exampleSentence');
    const exParts = wordObj.ex.split("中文：");
    exBox.innerHTML = exParts.length > 1 ? 
        `<div style="font-weight:600;">${exParts[0]}</div><div style="color:#8e8e93; font-size:0.9em; border-top:1px solid #eee; margin-top:8px; padding-top:8px;">译: ${exParts[1]}</div>` : 
        wordObj.ex;
    exBox.style.display = 'none';
    
    document.getElementById('wordResult').innerText = "";
    document.getElementById('dictationResult').innerText = "";
    document.getElementById('dictationInput').value = "";
    
    // 自动清晰化处理
    const isTesting = document.getElementById('dictationGroupMode').style.display === 'block';
    document.getElementById('targetWord').style.filter = isTesting ? 'blur(8px)' : 'none';
}

function checkDictation() {
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    if (source.length === 0) return;

    const input = document.getElementById('dictationInput').value.trim().toLowerCase();
    const targetObj = source[currentWordIndex];
    const target = targetObj.en.toLowerCase();
    const resultEl = document.getElementById('dictationResult');
    
    let wrongWords = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');

    if (input === target) {
        resultEl.style.color = "green"; resultEl.innerText = "✅ 正确！";
        document.getElementById('targetWord').style.filter = "none";
        // 写对移除
        wrongWords = wrongWords.filter(item => item.en.toLowerCase() !== target);
        localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWords));
        initGroupSelect();
        setTimeout(nextWord, 1500);
    } else {
        resultEl.style.color = "red"; resultEl.innerText = "❌ 拼写有误";
        // 写错加入
        if (!wrongWords.some(item => item.en.toLowerCase() === target)) {
            wrongWords.push(targetObj);
            localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWords));
            initGroupSelect();
        }
        document.getElementById('dictationInput').select();
    }
    pushToCloud();
}

// ================= [5] AI 故事 (防死循环版) =================

async function generateGroupStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请先存 API Key");
    
    const bounds = getGroupBounds();
    let words = [];
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    for(let i=bounds.start; i<=bounds.end; i++) if(source[i]) words.push(source[i].en);

    const box = document.getElementById('groupStoryContent');
    document.getElementById('groupStoryArea').style.display="block";
    box.innerHTML = "⏳ AI 正在尝试构思故事...";

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({
                model:'Qwen/Qwen2.5-7B-Instruct', 
                messages: [{role:"user", content: `Write a short story with [${words.join(", ")}]. Bold words. End with '---' and translation.`}],
                temperature: 0.3, frequency_penalty: 1.2, max_tokens: 600
            })
        });
        const data = await res.json();
        let txt = data.choices[0].message.content;
        box.innerHTML = txt.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    } catch(e) { box.innerText = "生成失败，请重试"; }
}

// ================= [6] 翻译挑战与 5次抄写 =================

async function startTranslationChallenge() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const bounds = getGroupBounds();
    let words = []; for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);
    
    document.getElementById('transSetup').style.display = 'none';
    document.getElementById('transWorking').style.display = 'block';
    const qBox = document.getElementById('transQuestions');
    qBox.innerHTML = "⏳ AI 出题中...";

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({
                model:'Qwen/Qwen2.5-7B-Instruct', 
                messages: [{role:"user", content: `根据单词[${words.join(",")}]出3道纯中文翻译题，禁止英文和括号。每行一句。`}]
            })
        });
        const data = await res.json();
        const lines = data.choices[0].message.content.trim().split('\n').filter(l => l.trim().length > 3).slice(0,3);
        translationTasks = lines.map(l => ({ cn: l.replace(/[\[\]]/g, '').replace(/^\d+[\.、\s]+/, '').trim(), userEn: '' }));
        qBox.innerHTML = translationTasks.map((t, i) => `
            <div style="margin-bottom:12px;">Q${i+1}: ${t.cn}<input type="text" class="trans-user-input" data-idx="${i}" style="margin-top:5px;"></div>
        `).join('');
    } catch(e) { alert("出题失败"); }
}

async function gradeTranslations() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const inputs = document.querySelectorAll('.trans-user-input');
    inputs.forEach(input => translationTasks[input.dataset.idx].userEn = input.value.trim());
    document.getElementById('btnSubmitTrans').innerText = "批改中...";

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({
                model:'Qwen/Qwen2.5-7B-Instruct', 
                messages: [{role:"user", content: `Translate to English: ${translationTasks.map(t=>t.cn).join(' | ')}. Output 3 lines English only, split by ###.`}],
                temperature: 0.1, frequency_penalty: 1.5
            })
        });
        const data = await res.json();
        const raw = data.choices[0].message.content;
        const corrects = raw.split('###').map(s => {
            // 物理洗词洗掉重复词
            return s.trim().replace(/[\u4e00-\u9fa5]/g, '').split(' ').filter((v,i,a) => v!==a[i-1]).join(' ');
        });
        
        copySentenceQueue = [];
        let html = "<h3>精准对比：</h3>";
        translationTasks.forEach((t, i) => {
            const correct = corrects[i] || "Error";
            copySentenceQueue.push(correct);
            html += `<div style="margin-bottom:10px; border:1px solid #eee; padding:10px; border-radius:10px; background:white;">
                <p style="font-size:12px; color:#666;">${t.cn}</p>
                <div style="display:flex; gap:10px;">
                    <div style="flex:1; color:red;"><small>你写:</small><br>${t.userEn}</div>
                    <div style="flex:1; color:green;"><b><small>地道:</small><br>${correct}</b></div>
                </div>
            </div>`;
        });
        document.getElementById('transComparisonArea').innerHTML = html;
        document.getElementById('transWorking').style.display = 'none';
        document.getElementById('transResult').style.display = 'block';
        startCopyExercise();
    } catch(e) { alert("批改失败"); }
}

function startCopyExercise() {
    currentCopyCount = 0;
    document.getElementById('copyExerciseArea').style.display = 'block';
    updateCopyDisplay();
    document.getElementById('copyExerciseArea').scrollIntoView({behavior:'smooth'});
}

function updateCopyDisplay() {
    document.getElementById('copyTargetBox').innerText = copySentenceQueue[0];
    document.getElementById('copyProgressText').innerText = `已完成: ${currentCopyCount} / 5 遍`;
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
            else { alert("🎉 完美刻入脑海！"); resetTranslationChallenge(); }
        } else updateCopyDisplay();
    } else alert("拼写不完全一致，请仔细检查");
}

// ================= [7] 文章与回译 =================

async function startArticleChallenge() {
    const endIdx = parseInt(document.getElementById('articleEndSelect').value);
    const pool = articleList.slice(0, endIdx + 1);
    if (pool.length < 3) return alert("段落不足 3 个");
    
    let selected = [];
    while (selected.length < 3) {
        let r = Math.floor(Math.random() * pool.length);
        if (!selected.includes(r)) selected.push(r);
    }
    artChallengeData = selected.map(i => pool[i]);

    document.getElementById('artChallengeSetup').style.display = 'none';
    document.getElementById('artChallengeWorking').style.display = 'block';
    const qBox = document.getElementById('artChallengeQuestions');
    qBox.innerHTML = artChallengeData.map((t, i) => `
        <div style="margin-bottom:15px;">
            <p style="background:#FFFBE6; padding:8px; border-radius:8px;">${t.zh}</p>
            <textarea class="art-user-input" rows="2" placeholder="默写原句英文..."></textarea>
        </div>
    `).join('');
}

async function gradeArticleChallenge() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const inputs = document.querySelectorAll('.art-user-input');
    const fbBox = document.getElementById('artChallengeComparison');
    document.getElementById('artChallengeWorking').style.display = 'none';
    document.getElementById('artChallengeResult').style.display = 'block';
    fbBox.innerHTML = "AI 老师正在逐句对比阅卷...";
    
    let prompt = `Compare these English translations. Provide feedback for each sentence in tags <p1>, <p2>, <p3>. 
    ${artChallengeData.map((t,i)=> `Q${i+1}: Original:[${t.en}], User:[${inputs[i].value}]`).join('\n')}`;

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:prompt}]})
        });
        const data = await res.json();
        const raw = data.choices[0].message.content;
        let html = "";
        artChallengeData.forEach((t, i) => {
            const match = raw.match(new RegExp(`<p${i+1}>([\\s\\S]*?)<\\/p${i+1}>`));
            html += `<div style="margin-bottom:10px; border:1px solid #ddd; padding:10px; border-radius:10px; background:white;">
                <p style="font-size:12px;">${t.zh}</p>
                <div style="color:green; font-weight:bold;">原: ${t.en}</div>
                <div style="color:red;">你: ${inputs[i].value}</div>
                <div style="margin-top:5px; padding:5px; background:#f9f9ff; font-size:13px;">💡 ${match?match[1]:"批改完成"}</div>
            </div>`;
        });
        fbBox.innerHTML = html;
    } catch(e) { fbBox.innerHTML = "批改失败"; }
}

// ================= [8] 看板与同步逻辑 =================

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
        const dateParts = history[g].split('-');
        const d = new Date(dateParts[0], dateParts[1]-1, dateParts[2]);
        const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
        if ([1, 3, 6].includes(diff)) review.push(`<a href="#" onclick="jumpToGroup(${g-1})" style="color:#f1c40f; margin-right:10px;">第 ${g} 组</a>`);
    }
    if (review.length) tasks.push(`<br>🔄 <b>复习：</b> ${review.reverse().join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return;
    const currentGNum = parseInt(val) + 1;
    const today = new Date(); today.setHours(0,0,0,0);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    for (let i = 1; i <= currentGNum; i++) {
        let target = new Date(today);
        if (i === currentGNum - 1) target.setDate(today.getDate() - 1);
        else if (i === currentGNum - 3) target.setDate(today.getDate() - 3);
        else if (i === currentGNum - 6) target.setDate(today.getDate() - 6);
        else if (i < currentGNum) target.setDate(today.getDate() - 20);
        history[i] = getLocalDateString(target);
    }
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    updateDailyDashboard(); pushToCloud();
    alert("🎉 记录成功并同步云端！");
}

// ================= [9] 辅助组件 (聊天/识别/文章) =================

async function sendChatMessage() {
    const input = document.getElementById('chatMsgInput');
    const txt = input.value.trim(); if(!txt) return;
    const key = localStorage.getItem('silicon_api_key');
    if(!key) return alert("请存 Key");
    
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
    const rec = new SR(); rec.lang = currentChatMode === 'eng' ? 'en-US' : 'zh-CN';
    rec.start();
    rec.onresult = (e) => { sendChatMessage(e.results[0][0].transcript); };
}

function startListeningForWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR(); rec.lang = 'en-US';
    const resEl = document.getElementById('wordResult');
    resEl.innerText = "聆听中..."; rec.start();
    rec.onresult = (e) => {
        const spoken = e.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim();
        const target = document.getElementById('targetWord').innerText.toLowerCase().trim();
        resEl.innerHTML = (spoken === target) ? `<span style="color:green">✅ ${spoken}</span>` : `<span style="color:red">❌ ${spoken}</span>`;
    };
}

// ================= [10] 存入其余函数 =================
function switchTab(t) {
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + t).style.display = 'block';
    document.getElementById('btn-' + t).classList.add('active');
    const b = document.getElementById('bookSelectorContainer'); if(b) b.style.display = (t === 'chat' ? 'none' : 'flex');
}
function changeGroup() {
    const val = document.getElementById('groupSelect').value;
    isWrongBookMode = (val === 'wrong_book');
    currentWordIndex = isWrongBookMode ? 0 : getGroupBounds().start;
    updateWordDisplay();
}
function nextWord() { currentWordIndex++; updateWordDisplay(); }
function restartWords() { currentWordIndex = isWrongBookMode ? 0 : getGroupBounds().start; updateWordDisplay(); }
function toggleMeaning() { const el = document.getElementById('chineseMeaning'); el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
function toggleBlur() { const el = document.getElementById('targetWord'); el.style.filter = el.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)'; }
function readTargetWord() { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(document.getElementById('targetWord').innerText); u.lang='en-US'; window.speechSynthesis.speak(u); }
function showAndPlayExample() { document.getElementById('exampleSentence').style.display='block'; let t = document.getElementById('exampleSentence').innerText.split('译:')[0]; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang='en-US'; window.speechSynthesis.speak(u); }
function generateGroupMemoryPalace() {
    const bounds = getGroupBounds(); const area = document.getElementById('memoryPalaceArea'); const content = document.getElementById('palaceContent');
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    let html = ""; for (let i = bounds.start; i <= bounds.end; i++) if (source[i]) html += `<div style="margin-bottom:10px; border-bottom:1px dashed #eee;"><b>${i+1}. ${source[i].en}</b><br><small>${source[i].hook}</small></div>`;
    area.style.display = 'block'; content.innerHTML = html;
}
function closeMemoryPalace() { document.getElementById('memoryPalaceArea').style.display = 'none'; }
function jumpToWrongBook() { document.getElementById('groupSelect').value = 'wrong_book'; changeGroup(); }
function initArticleSelect() {
    const s = document.getElementById('articleStartSelect'), e = document.getElementById('articleEndSelect');
    s.innerHTML = ''; e.innerHTML = ''; articleList.forEach((_, i) => { s.add(new Option(`第 ${i+1} 段`, i)); e.add(new Option(`第 ${i+1} 段`, i)); });
    changeArticleRange();
}
function changeArticleRange() {
    const s = parseInt(document.getElementById('articleStartSelect').value), e = parseInt(document.getElementById('articleEndSelect').value);
    const sel = articleList.slice(s, Math.max(s, e) + 1);
    document.getElementById('articleDisplay').innerHTML = sel.map(item => `<div style="margin-bottom:10px;">${item.en}<br><small style="color:#7f8c8d">${item.zh}</small></div>`).join('');
    currentArticleText = sel.map(item => item.en).join(' ');
}
function speakArticle() { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(currentArticleText); u.lang = 'en-US'; u.rate = parseFloat(document.getElementById('speedSelect').value); window.speechSynthesis.speak(u); }
function startListeningForArticle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; const rec = new SR(); rec.lang = 'en-US';
    const con = document.getElementById('diffContent'); document.getElementById('diffResult').style.display = 'block';
    con.innerText = "聆听中..."; rec.start();
    rec.onresult = (e) => { const spoken = e.results[0][0].transcript; con.innerHTML = `听到了: "${spoken}"<br>${compareSentences(currentArticleText, spoken)}`; };
}
function compareSentences(original, spoken) {
    let oW = original.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/), sW = spoken.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/), oRaw = original.split(/\s+/), html = [], idx = 0;
    for (let i = 0; i < oW.length; i++) {
        if (!oW[i]) continue; let found = false;
        for (let j = idx; j < Math.min(idx + 3, sW.length); j++) if (oW[i] === sW[j]) { found = true; idx = j + 1; break; }
        html.push(found ? `<span style="color:green;font-weight:bold;">${oRaw[i]}</span>` : `<span style="color:red;text-decoration:line-through;">${oRaw[i]}</span>`);
    } return html.join(' ');
}
function startArticleDictation() {
    articleSentences = currentArticleText.match(/[^.!?\n]+[.!?\n]+/g) || [currentArticleText];
    articleSentences = articleSentences.map(s => s.trim()).filter(s => s.length > 0);
    currentSentenceIdx = 0; document.getElementById('articleDictationSetup').style.display = 'none';
    document.getElementById('articleDictationRunning').style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'blur(8px)'; playCurrentSentence();
}
function playCurrentSentence() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    const s = articleSentences[currentSentenceIdx]; document.getElementById('articleDictProgress').innerText = `听写: ${currentSentenceIdx+1}/${articleSentences.length}`;
    const h = document.getElementById('timerHint'); h.innerText = "🔊 第一遍..."; const u = new SpeechSynthesisUtterance(s); u.lang = 'en-US';
    u.onend = () => { h.innerText = "⏳ 10秒后..."; sentenceReplayTimer = setTimeout(() => { h.innerText = "🔊 第二遍..."; window.speechSynthesis.speak(u); }, 10000); };
    window.speechSynthesis.speak(u); setTimeout(()=>document.getElementById('articleDictInput').focus(), 200);
}
function checkArticleDictation() {
    const input = document.getElementById('articleDictInput').value.trim(); const res = document.getElementById('articleDictResult');
    res.style.display = 'block'; res.innerHTML = `写: ${input}<br>参: <b>${articleSentences[currentSentenceIdx]}</b>`;
    document.getElementById('btnNextSentence').style.display = 'block';
}
function nextDictationSentence() {
    currentSentenceIdx++; if (currentSentenceIdx >= articleSentences.length) { alert("完结！"); quitArticleDictation(); }
    else { document.getElementById('articleDictResult').style.display = 'none'; document.getElementById('btnNextSentence').style.display = 'none'; document.getElementById('articleDictInput').value = ""; playCurrentSentence(); }
}
function quitArticleDictation() { clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel(); document.getElementById('articleDictationRunning').style.display = 'none'; document.getElementById('articleDictationSetup').style.display = 'block'; document.getElementById('articleDisplay').style.filter = 'none'; }
function resetTranslationChallenge() { document.getElementById('copyExerciseArea').style.display='none'; document.getElementById('transResult').style.display='none'; document.getElementById('transSetup').style.display='block'; }
function resetArtChallenge() { document.getElementById('artChallengeSetup').style.display = 'block'; document.getElementById('artChallengeResult').style.display = 'none'; }
function switchChatMode(m) {
    currentChatMode = m; document.getElementById('modeBtnEng').classList.toggle('active', m==='eng'); document.getElementById('modeBtnChn').classList.toggle('active', m==='chn');
    document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${m==='eng'?"Hi teacher!":"你好！我是助手。"}</div>`;
    chatHistory = [{role:"system", content: m==='eng'?"Teacher role. Correct errors.":"中文助手。"}];
}
function appendChatBubble(t, s) {
    const id = "msg-" + Date.now(); const div = document.createElement('div'); div.className = `chat-bubble bubble-${s}`; div.id = id; div.innerText = t;
    document.getElementById('chatLog').appendChild(div); document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight; return id;
}
function saveApiKey() { localStorage.setItem('silicon_api_key', document.getElementById('siliconApiKey').value.trim()); alert("Key 已保存"); pushToCloud(); }
function changeBook() { localStorage.setItem('selected_book_path', document.getElementById('bookSelect').value); location.reload(); }
async function handleLogin() { const email = document.getElementById('syncEmail').value; if(supabaseClient) { const { error } = await supabaseClient.auth.signInWithOtp({ email }); alert(error ? error.message : "链接已发送"); } }
function handleLogout() { if(supabaseClient) supabaseClient.auth.signOut().then(() => location.reload()); }
function manualPush() { pushToCloud().then(() => alert("云端已同步")); }
function toggleSettings() { const s = document.getElementById('settingsCard'); s.style.display = (s.style.display === 'none' ? 'block' : 'none'); }
function nextArticleRange() {
    const s = document.getElementById('articleStartSelect'), e = document.getElementById('articleEndSelect');
    let span = parseInt(e.value) - parseInt(s.value) + 1, nextS = parseInt(s.value) + span;
    if (nextS >= articleList.length) nextS = 0;
    s.value = nextS; e.value = Math.min(nextS + span - 1, articleList.length - 1); changeArticleRange();
}