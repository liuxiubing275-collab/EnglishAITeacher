// ================= [0] Supabase 云端初始化 =================
// 请在此处填入你在 Supabase 官网获取的真实参数
const supabaseUrl = 'https://bhilewmilbhxowxwwyfq.supabase.co/rest/v1/'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWxld21pbGJoeG93eHd3eWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYyNTUsImV4cCI6MjA5MjUzMjI1NX0._Kj-4i2KTU7LO07AwNkKAta-0qluh4BygU_OMwAKc6o'; 

let supabaseClient;
try {
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
    }
} catch (e) { console.error("Supabase初始化失败:", e); }

// ================= [1] 全局变量 =================
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
            } else {
                if(authSection) authSection.style.display = 'block';
                if(userSection) userSection.style.display = 'none';
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
    
    setInterval(() => {
        const val = document.getElementById('groupSelect').value;
        const gNum = val === 'all' ? '全' : parseInt(val) + 1;
        const activeSpan = document.getElementById('currentActiveGNum');
        if(activeSpan) activeSpan.innerText = gNum;
    }, 500);
};

// ================= [3] 数据加载逻辑 =================
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
    } catch (e) { console.error("加载失败:", e); }
}

// ================= [4] 单词控制功能 =================
function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    if(!select) return;
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
    const wordObj = wordList[currentWordIndex];
    const bounds = getGroupBounds();

    document.getElementById('targetWord').innerText = wordObj.en;
    document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    const chineseEl = document.getElementById('chineseMeaning');
    chineseEl.innerText = wordObj.zh;
    chineseEl.style.display = 'none';

    const exBox = document.getElementById('exampleSentence');
    const exParts = wordObj.ex.split("中文：");
    exBox.innerHTML = exParts.length > 1 ? 
        `<div style="font-weight:500;">${exParts[0]}</div><div style="color:#8e8e93; font-size:0.9em; margin-top:5px; border-top:1px solid #f0f0f0; padding-top:5px;">译: ${exParts[1]}</div>` : 
        wordObj.ex;
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

function restartWords() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }

function toggleMeaning() {
    const el = document.getElementById('chineseMeaning');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function toggleBlur() { 
    const el = document.getElementById('targetWord');
    el.style.filter = el.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)';
}

function readTargetWord() {
    window.speechSynthesis.cancel();
    document.getElementById('targetWord').style.filter = 'none';
    const u = new SpeechSynthesisUtterance(wordList[currentWordIndex].en);
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

function showAndPlayExample() {
    const exBox = document.getElementById('exampleSentence');
    exBox.style.display = 'block';
    let speechText = wordList[currentWordIndex].ex.split("中文：")[0];
    const englishOnly = speechText.replace(/[^\x00-\xff]/g, '').trim();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(englishOnly); u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

// ================= [5] 云端与1247看板 =================
function getLocalDateString(date) {
    return date.getFullYear() + "-" + (date.getMonth() + 1).toString().padStart(2, '0') + "-" + date.getDate().toString().padStart(2, '0');
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
        if (changed) { updateDailyDashboard(); location.reload(); }
    }
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

function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return alert("请选组");
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
        history[i] = getLocalDateString(target);
    }
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    updateDailyDashboard();
    pushToCloud();
    alert("🎉 进度已同步云端！");
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
        if ([1, 3, 6].includes(diff)) review.push(`<a href="#" onclick="jumpToGroup(${g-1})">第 ${g} 组</a>`);
    }
    if (review.length) tasks.push(`<br>🔄 <b>复习：</b> ${review.reverse().join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function jumpToGroup(idx) { document.getElementById('groupSelect').value = idx; changeGroup(); }

// ================= [6] AI 增强功能 (故事/宫殿) =================
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请存 Key");
    const bounds = getGroupBounds();
    let words = [];
    for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);
    const box = document.getElementById('aiStoryContent');
    box.style.display="block"; box.innerText="AI 正在构思故事...";
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:`用这些词写励志故事，加粗单词，带翻译：[${words.join(", ")}]`}]})
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
            html += `<div style="margin-bottom:10px; border-bottom:1px dashed #eee; padding-bottom:5px;"><b>${i - bounds.start + 1}. ${wordList[i].en}</b><br><small>${wordList[i].hook}</small></div>`;
        }
    }
    palaceArea.style.display = 'block';
    palaceContent.innerHTML = html;
}

function closeMemoryPalace() { document.getElementById('memoryPalaceArea').style.display = 'none'; window.scrollTo({top:0, behavior:'smooth'}); }

function transferGroupStoryToArticle() {
    const box = document.getElementById('groupStoryContent');
    if(!box || !box.innerText) return;
    const parts = box.innerText.split('---');
    currentArticleText = parts[0].trim();
    switchTab('articles');
    document.getElementById('articleDisplay').innerHTML = `<b>AI复习文章：</b><br>${currentArticleText}<hr><small>${parts[1]||""}</small>`;
}

function transferStoryToArticle() {
    const box = document.getElementById('aiStoryContent');
    const parts = box.innerText.split('---');
    currentArticleText = parts[0].trim();
    switchTab('articles');
    document.getElementById('articleDisplay').innerHTML = `<b>AI复习任务文章：</b><br>${currentArticleText}<hr><small>${parts[1]||""}</small>`;
}

// ================= [7] 文章练习逻辑 =================
function initArticleSelect() {
    const s = document.getElementById('articleStartSelect');
    const e = document.getElementById('articleEndSelect');
    s.innerHTML = ''; e.innerHTML = '';
    articleList.forEach((_, i) => { s.add(new Option(`第 ${i+1} 段`, i)); e.add(new Option(`第 ${i+1} 段`, i)); });
    changeArticleRange();
}

function changeArticleRange() {
    const sSel = document.getElementById('articleStartSelect');
    const eSel = document.getElementById('articleEndSelect');
    let s = parseInt(sSel.value);
    let e = parseInt(eSel.value);
    if (s > e) { e = s; eSel.value = e; }
    const selected = articleList.slice(s, e + 1);
    document.getElementById('articleDisplay').innerHTML = selected.map(item => `<div style="margin-bottom:12px;">${item.en}<br><small style="color:#7f8c8d">${item.zh}</small></div>`).join('');
    currentArticleText = selected.map(item => item.en).join(' ');
    document.getElementById('diffResult').style.display = 'none';
}

function nextArticleRange() {
    const s = document.getElementById('articleStartSelect');
    const e = document.getElementById('articleEndSelect');
    let span = parseInt(e.value) - parseInt(s.value) + 1;
    let nextS = parseInt(s.value) + span;
    if (nextS >= articleList.length) nextS = 0;
    s.value = nextS; e.value = Math.min(nextS + span - 1, articleList.length - 1);
    changeArticleRange();
}

function speakArticle() {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(currentArticleText);
    u.lang = 'en-US'; u.rate = parseFloat(document.getElementById('speedSelect').value);
    window.speechSynthesis.speak(u);
}

function startListeningForArticle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("不支持");
    const rec = new SR(); rec.lang = 'en-US';
    const con = document.getElementById('diffContent');
    document.getElementById('diffResult').style.display = 'block';
    con.innerText = "正在聆听..."; rec.start();
    rec.onresult = (e) => {
        const spoken = e.results[0][0].transcript;
        con.innerHTML = `你读的是: "${spoken}"<br>${compareSentences(currentArticleText, spoken)}`;
    };
}

function compareSentences(original, spoken) {
    let origWords = original.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
    let spokenWords = spoken.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
    let originalRawWords = original.split(/\s+/);
    let resultHTML = []; let spokenIdx = 0;
    for (let i = 0; i < origWords.length; i++) {
        if (!origWords[i]) continue;
        let found = false;
        for (let j = spokenIdx; j < Math.min(spokenIdx + 3, spokenWords.length); j++) {
            if (origWords[i] === spokenWords[j]) { found = true; spokenIdx = j + 1; break; }
        }
        if (found) resultHTML.push(`<span style="color:#34C759;font-weight:bold;">${originalRawWords[i]}</span>`);
        else resultHTML.push(`<span style="color:#FF3B30;text-decoration:line-through;">${originalRawWords[i]}</span>`);
    }
    return resultHTML.join(' ');
}

// 逐句听写
function startArticleDictation() {
    articleSentences = currentArticleText.match(/[^.!?\n]+[.!?\n]+/g) || [currentArticleText];
    articleSentences = articleSentences.map(s => s.trim()).filter(s => s.length > 0);
    currentSentenceIdx = 0;
    document.getElementById('articleDictationSetup').style.display = 'none';
    document.getElementById('articleDictationRunning').style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'blur(8px)';
    playCurrentSentence();
}

function playCurrentSentence() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    const s = articleSentences[currentSentenceIdx];
    document.getElementById('articleDictProgress').innerText = `听写: ${currentSentenceIdx+1}/${articleSentences.length}`;
    const hint = document.getElementById('timerHint'); hint.innerText = "🔊 第一遍播放...";
    const u = new SpeechSynthesisUtterance(s); u.lang = 'en-US';
    u.onend = () => {
        hint.innerText = "⏳ 10秒后重播...";
        sentenceReplayTimer = setTimeout(() => { hint.innerText = "🔊 第二遍播放..."; window.speechSynthesis.speak(u); }, 10000);
    };
    window.speechSynthesis.speak(u);
    setTimeout(()=>document.getElementById('articleDictInput').focus(), 200);
}

function checkArticleDictation() {
    const ans = articleSentences[currentSentenceIdx];
    const input = document.getElementById('articleDictInput').value.trim();
    const res = document.getElementById('articleDictResult');
    res.style.display = 'block';
    res.innerHTML = `你写: ${input}<br>参考: <b>${ans}</b>`;
    document.getElementById('btnNextSentence').style.display = 'block';
}

function nextDictationSentence() {
    currentSentenceIdx++;
    if (currentSentenceIdx >= articleSentences.length) { alert("全部完成！"); quitArticleDictation(); }
    else { document.getElementById('articleDictResult').style.display = 'none'; document.getElementById('btnNextSentence').style.display = 'none'; document.getElementById('articleDictInput').value = ""; playCurrentSentence(); }
}

function quitArticleDictation() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    document.getElementById('articleDictationRunning').style.display = 'none';
    document.getElementById('articleDictationSetup').style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'none';
}

// ================= [8] 翻译与回译练习 =================
async function startTranslationChallenge() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const bounds = getGroupBounds();
    let words = wordList.slice(bounds.start, bounds.end + 1).map(w => w.en);
    const qBox = document.getElementById('transQuestions');
    document.getElementById('transSetup').style.display = 'none';
    document.getElementById('transWorking').style.display = 'block';
    qBox.innerHTML = "正在出题...";
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:`根据词[${words.join(",")}]出3道纯中文翻译题，禁止带英文或括号。一行一句。`}]})
        });
        const data = await res.json();
        const lines = data.choices[0].message.content.split('\n').filter(l => l.trim().length > 2);
        translationTasks = lines.slice(0,3).map(l => ({ cn: l.replace(/^\d+[\.、\s]+/, '').trim(), userEn: '', correctEn: '' }));
        qBox.innerHTML = translationTasks.map((t, i) => `<div style="margin-bottom:10px;">Q${i+1}: ${t.cn}<input type="text" class="trans-user-input" data-idx="${i}"></div>`).join('');
    } catch(e) { alert("失败"); }
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
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:`批改翻译，每句一行，用###分隔。仅输出正确英文。`}], temperature:0.1, frequency_penalty:1.5})
        });
        const data = await res.json();
        const corrects = data.choices[0].message.content.split('###').map(s => s.trim());
        let html = ""; copySentenceQueue = [];
        translationTasks.forEach((t, i) => {
            const correct = corrects[i] || "Error";
            copySentenceQueue.push(correct);
            html += `<div style="margin-bottom:10px; border:1px solid #eee; padding:8px;">${t.cn}<br><span style="color:red;">${t.userEn}</span><br><span style="color:green;">${correct}</span></div>`;
        });
        document.getElementById('transComparisonArea').innerHTML = html;
        document.getElementById('transWorking').style.display = 'none';
        document.getElementById('transResult').style.display = 'block';
        startCopyExercise();
    } catch(e) { alert("失败"); }
}

function startCopyExercise() { currentCopyCount = 0; document.getElementById('copyExerciseArea').style.display = 'block'; updateCopyDisplay(); }
function updateCopyDisplay() { 
    document.getElementById('copyTargetBox').innerText = copySentenceQueue[0];
    document.getElementById('copyProgressText').innerText = `进度: ${currentCopyCount}/5`;
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
            else { alert("全胜！"); document.getElementById('copyExerciseArea').style.display = 'none'; }
        } else updateCopyDisplay();
    } else alert("请准确抄写");
}

// 文章回译 (startArticleChallenge, gradeArticleChallenge 等函数，逻辑同上，由于篇幅原因略)
// ================= [9] 辅助与拼写 =================
function startListeningForWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("不支持");
    const rec = new SR(); rec.lang = 'en-US';
    const resEl = document.getElementById('wordResult');
    resEl.innerText = "聆听中..."; rec.start();
    rec.onresult = (e) => {
        const spoken = e.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim();
        const target = wordList[currentWordIndex].en.toLowerCase().trim();
        if (spoken === target) resEl.innerHTML = `<span style="color:green;">✅ ${spoken}</span>`;
        else resEl.innerHTML = `<span style="color:red;">❌ ${spoken}</span>`;
    };
}

function checkDictation() {
    const input = document.getElementById('dictationInput').value.trim().toLowerCase();
    const target = wordList[currentWordIndex].en.toLowerCase();
    const resEl = document.getElementById('dictationResult');
    if (input === target) { resEl.style.color="green"; resEl.innerText="✅ 正确"; setTimeout(nextWord, 1500); }
    else { resEl.style.color="red"; resEl.innerText="❌ 错误"; }
}

function startGroupTest() {
    const bounds = getGroupBounds(); currentSentenceIdx = 0; articleSentences = []; // 借用变量
    document.getElementById('dictationSingleMode').style.display = 'none';
    document.getElementById('dictationGroupMode').style.display = 'block';
    // 逻辑略，由于拼写测验较为基础
}

function quitGroupTest() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationSingleMode').style.display = 'block';
}

function handleLogin() { 
    const email = document.getElementById('syncEmail').value;
    supabaseClient.auth.signInWithOtp({ email }).then(() => alert("邮件已发送"));
}
function handleLogout() { supabaseClient.auth.signOut().then(() => location.reload()); }
function saveApiKey() { 
    localStorage.setItem('silicon_api_key', document.getElementById('siliconApiKey').value); 
    alert("已保存"); toggleSettings(); 
}
function changeBook() { localStorage.setItem('selected_book_path', document.getElementById('bookSelect').value); location.reload(); }
function switchTab(t) {
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + t).style.display = 'block';
    document.getElementById('btn-' + t).classList.add('active');
    const b = document.getElementById('bookSelectorContainer'); if(b) b.style.display = (t === 'chat' ? 'none' : 'flex');
}
function toggleSettings() { const s = document.getElementById('settingsCard'); s.style.display = (s.style.display === 'none' ? 'block' : 'none'); }
// AI 对话逻辑 (sendChatMessage, switchChatMode 等保持你原本实现即可)