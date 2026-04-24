// ================= [0] Supabase 云端初始化 =================
// 请在此处填入你在 Supabase 官网获取的真实参数
const supabaseUrl = 'https://bhilewmilbhxowxwwyfq.supabase.co/rest/v1/'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWxld21pbGJoeG93eHd3eWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYyNTUsImV4cCI6MjA5MjUzMjI1NX0._Kj-4i2KTU7LO07AwNkKAta-0qluh4BygU_OMwAKc6o'; 


// ================= [1] 全局变量定义 =================
let supabaseClient = null;
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
    
    // 初始化 Supabase
    try {
        if (window.supabase) {
            supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
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
    } catch (e) { console.warn("Supabase 暂未连接，将使用本地模式"); }

    // 加载数据
    loadAllData();

    // 恢复 API Key
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        const keyInput = document.getElementById('siliconApiKey');
        if(keyInput) keyInput.value = savedKey;
        const settings = document.getElementById('settingsCard');
        if(settings) settings.style.display = 'none';
    }

    switchTab('words');
    switchChatMode('eng');
    
    // 定时更新看板
    setInterval(updateDailyDashboard, 5000);
    setInterval(() => {
        const select = document.getElementById('groupSelect');
        const activeSpan = document.getElementById('currentActiveGNum');
        if (select && activeSpan) {
            const val = select.value;
            activeSpan.innerText = (val === 'all' ? '全' : parseInt(val) + 1);
        }
    }, 500);
};

// ================= [3] 数据加载 (3行读取逻辑) =================
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
    } catch (e) { console.error("数据加载失败:", e); }
}

// ================= [4] 单词练习核心控制 =================
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
    const counter = document.getElementById('wordCounter');
    if(counter) counter.innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    
    const chineseEl = document.getElementById('chineseMeaning');
    chineseEl.innerText = wordObj.zh;
    chineseEl.style.display = 'none';

    const exBox = document.getElementById('exampleSentence');
    const exParts = wordObj.ex.split("中文：");
    exBox.innerHTML = exParts.length > 1 ? 
        `<div style="font-weight:500;">${exParts[0]}</div><div style="color:#8e8e93; font-size:14px; margin-top:5px; border-top:1px solid #f0f0f0; padding-top:5px;">译: ${exParts[1]}</div>` : 
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
    document.getElementById('exampleSentence').style.display = 'block';
    let speechText = wordList[currentWordIndex].ex.split("中文：")[0];
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speechText.replace(/[^\x00-\xff]/g, ''));
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

// ================= [5] 云端同步与 1247 看板 =================
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
        history[i] = getLocalDateString(target);
    }
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    updateDailyDashboard();
    pushToCloud();
    alert("🎉 记录成功！进度已同步。");
}

function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    if (!dashboard) return;
    const today = new Date(); today.setHours(0,0,0,0);
    document.getElementById('todayDate').innerText = getLocalDateString(today);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    let maxG = 0; Object.keys(history).forEach(g => { if(parseInt(g)>maxG) maxG=parseInt(g); });
    tasks.push(`🆕 <b>新课建议：</b> 第 <a href="#" onclick="jumpToGroup(${maxG})" style="color:#f1c40f; font-weight:bold;">${maxG+1}</a> 组`);
    let review = [];
    for (let g in history) {
        const parts = history[g].split('-');
        const d = new Date(parts[0], parts[1]-1, parts[2]);
        const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
        if ([1, 3, 6].includes(diff)) review.push(`<a href="#" onclick="jumpToGroup(${g-1})" style="color:#f1c40f; font-weight:bold; margin-right:10px;">第 ${g} 组</a>`);
    }
    if (review.length) tasks.push(`<br>🔄 <b>今日必复习：</b> ${review.reverse().join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function jumpToGroup(idx) { 
    const select = document.getElementById('groupSelect');
    if (select) { select.value = idx; changeGroup(); }
}

// ================= [6] AI 故事与记忆宫殿 =================
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请存入 API Key");
    const bounds = getGroupBounds();
    let words = [];
    for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);
    const box = document.getElementById('aiStoryContent');
    box.style.display="block"; box.innerText="AI 正在创作故事...";
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:`使用单词[${words.join(", ")}]编写约100词的励志短文，单词加粗，文末附翻译，中间用---分隔。`}]})
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
            html += `<div style="margin-bottom:12px; border-bottom:1px dashed #eee; padding-bottom:8px;"><b>${i - bounds.start + 1}. ${wordList[i].en}</b> [${wordList[i].zh}]<br><small>${wordList[i].hook}</small></div>`;
        }
    }
    palaceArea.style.display = 'block';
    palaceContent.innerHTML = html;
    palaceArea.scrollIntoView({ behavior: 'smooth' });
}

function closeMemoryPalace() { 
    document.getElementById('memoryPalaceArea').style.display = 'none'; 
    window.scrollTo({top:0, behavior:'smooth'}); 
}

function transferStoryToArticle() {
    const box = document.getElementById('aiStoryContent');
    const parts = box.innerText.split('---');
    currentArticleText = parts[0].trim();
    switchTab('articles');
    document.getElementById('articleDisplay').innerHTML = `<div style="border-left:4px solid #8e44ad; padding-left:10px;"><b>AI复习文章：</b><br>${currentArticleText}<hr><small>${parts[1]||""}</small></div>`;
    quitArticleDictation();
}

function transferGroupStoryToArticle() {
    const box = document.getElementById('groupStoryContent');
    if (box) {
        const parts = box.innerText.split('---');
        currentArticleText = parts[0].trim();
        switchTab('articles');
        document.getElementById('articleDisplay').innerHTML = `<div style="border-left:4px solid #8e44ad; padding-left:10px;"><b>本组AI故事：</b><br>${currentArticleText}<hr><small>${parts[1]||""}</small></div>`;
        quitArticleDictation();
    }
}

// ================= [7] 文章练习逻辑 =================
function initArticleSelect() {
    const s = document.getElementById('articleStartSelect');
    const e = document.getElementById('articleEndSelect');
    if(!s || !e) return;
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
    const resBox = document.getElementById('diffResult');
    if(resBox) resBox.style.display = 'none';
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
    if (!SR) return alert("浏览器不支持识别");
    const rec = new SR(); rec.lang = 'en-US';
    const box = document.getElementById('diffResult');
    const con = document.getElementById('diffContent');
    box.style.display = 'block'; con.innerHTML = "🎤 正在聆听..."; rec.start();
    rec.onresult = (e) => {
        const spoken = e.results[0][0].transcript;
        con.innerHTML = `<b>AI 听到：</b>"${spoken}"<br><br><b>比对结果：</b>${compareSentences(currentArticleText, spoken)}`;
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

// 逐句听写 (黄金10秒)
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
    document.getElementById('articleDictProgress').innerText = `听写中: ${currentSentenceIdx+1} / ${articleSentences.length}`;
    const hint = document.getElementById('timerHint'); hint.innerText = "🔊 第一遍播放中...";
    const u = new SpeechSynthesisUtterance(s); u.lang = 'en-US';
    u.onend = () => {
        hint.innerText = "⏳ 10秒后重播...";
        sentenceReplayTimer = setTimeout(() => { hint.innerText = "🔊 第二遍播放中..."; window.speechSynthesis.speak(u); }, 10000);
    };
    window.speechSynthesis.speak(u);
    setTimeout(()=>document.getElementById('articleDictInput').focus(), 200);
}

function checkArticleDictation() {
    const ans = articleSentences[currentSentenceIdx];
    const input = document.getElementById('articleDictInput').value.trim();
    const res = document.getElementById('articleDictResult');
    res.style.display = 'block';
    res.innerHTML = `你写：${input}<br>参考：<b>${ans}</b>`;
    document.getElementById('btnNextSentence').style.display = 'block';
}

function nextDictationSentence() {
    currentSentenceIdx++;
    if (currentSentenceIdx >= articleSentences.length) { alert("🎉 全部完成！"); quitArticleDictation(); }
    else {
        document.getElementById('articleDictResult').style.display = 'none';
        document.getElementById('btnNextSentence').style.display = 'none';
        document.getElementById('articleDictInput').value = "";
        playCurrentSentence();
    }
}

function quitArticleDictation() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    document.getElementById('articleDictationRunning').style.display = 'none';
    document.getElementById('articleDictationSetup').style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'none';
}

// ================= [8] 翻译与回译挑战 =================
async function startTranslationChallenge() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if(!apiKey) return alert("请存 Key");
    const bounds = getGroupBounds();
    let words = [];
    for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);
    
    document.getElementById('transSetup').style.display = 'none';
    document.getElementById('transWorking').style.display = 'block';
    const qBox = document.getElementById('transQuestions');
    qBox.innerHTML = "正在联络 AI 老师出题...";

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:`根据词[${words.join(",")}]出3道纯中文翻译题，禁止带英文或括号。每行一句。`}]})
        });
        const data = await res.json();
        const lines = data.choices[0].message.content.split('\n').filter(l => l.trim().length > 2);
        translationTasks = lines.slice(0,3).map(l => ({ cn: l.replace(/^\d+[\.、\s]+/, '').trim(), userEn: '', correctEn: '' }));
        qBox.innerHTML = translationTasks.map((t, i) => `<div style="margin-bottom:10px;">Q${i+1}: ${t.cn}<input type="text" class="trans-user-input" data-idx="${i}"></div>`).join('');
    } catch(e) { alert("出题失败"); }
}

async function gradeTranslations() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const inputs = document.querySelectorAll('.trans-user-input');
    inputs.forEach(input => translationTasks[input.dataset.idx].userEn = input.value.trim());
    document.getElementById('btnSubmitTrans').innerText = "批改中...";

    const prompt = `Translate these 3 sentences: ${translationTasks.map(t=>t.cn).join(' | ')}. Output 3 lines, English only, separate with ###`;

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:prompt}], temperature:0.1, frequency_penalty:1.5})
        });
        const data = await res.json();
        const corrects = data.choices[0].message.content.split('###').map(s => s.trim().split(' ').filter((v,i,a) => v!==a[i-1]).join(' ')); // 物理去重

        copySentenceQueue = [];
        let html = "<h3>批改结果：</h3>";
        translationTasks.forEach((t, i) => {
            const correct = corrects[i] || "Error";
            copySentenceQueue.push(correct);
            html += `<div style="margin-bottom:10px; border:1px solid #eee; padding:10px;">${t.cn}<br><span style="color:red;">${t.userEn}</span><br><span style="color:green; font-weight:bold;">${correct}</span></div>`;
        });
        document.getElementById('transComparisonArea').innerHTML = html;
        document.getElementById('transWorking').style.display = 'none';
        document.getElementById('transResult').style.display = 'block';
        startCopyExercise();
    } catch(e) { alert("批改失败"); }
}

function startCopyExercise() { currentCopyCount = 0; document.getElementById('copyExerciseArea').style.display = 'block'; updateCopyDisplay(); }
function updateCopyDisplay() { 
    document.getElementById('copyTargetBox').innerText = copySentenceQueue[0];
    document.getElementById('copyProgressText').innerText = `句进度: ${currentCopyCount}/5`;
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
            else { alert("🎉 翻译挑战通关！"); document.getElementById('copyExerciseArea').style.display = 'none'; }
        } else updateCopyDisplay();
    } else alert("抄写不一致，请仔细检查");
}

// ================= [9] 文章精通挑战 (回译) =================
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
    qBox.innerHTML = artChallengeData.map((t, i) => `<div style="margin-bottom:15px;">Q${i+1}: ${t.zh}<textarea class="art-user-input" rows="2"></textarea></div>`).join('');
}

async function gradeArticleChallenge() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const inputs = document.querySelectorAll('.art-user-input');
    const fbBox = document.getElementById('artChallengeComparison');
    document.getElementById('artChallengeWorking').style.display = 'none';
    document.getElementById('artChallengeResult').style.display = 'block';
    fbBox.innerHTML = "AI 正在评分...";
    
    let prompt = `Compare these: ${artChallengeData.map((t,i)=> `Original: ${t.en}, User: ${inputs[i].value}`).join(' | ')}. Score each 0-100 and brief feedback. Use <p1>...<p3> tags.`;

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
            const feedback = match ? match[1] : "Done.";
            html += `<div style="margin-bottom:15px; border:1px solid #ddd; padding:10px; border-radius:10px;">${t.zh}<br><b>原句：</b>${t.en}<br><b>你写：</b>${inputs[i].value}<br><b>点评：</b>${feedback}</div>`;
        });
        fbBox.innerHTML = html;
    } catch(e) { fbBox.innerHTML = "批改失败"; }
}

function resetArtChallenge() {
    document.getElementById('artChallengeSetup').style.display = 'block';
    document.getElementById('artChallengeResult').style.display = 'none';
}

// ================= [10] 互动聊天逻辑 =================
function switchChatMode(mode) {
    currentChatMode = mode;
    document.getElementById('modeBtnEng').classList.toggle('active', mode === 'eng');
    document.getElementById('modeBtnChn').classList.toggle('active', mode === 'chn');
    document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${mode==='eng'?"Hi! I'm your teacher.":"你好！我是中文助手。"}</div>`;
    chatHistory = [{role:"system", content: mode==='eng'?"You are a teacher. Correct errors briefly.":"你是助手。"}];
}

async function sendChatMessage() {
    const input = document.getElementById('chatMsgInput');
    const txt = input.value.trim(); if(!txt) return;
    const key = localStorage.getItem('silicon_api_key');
    if(!key) return alert("请设置 API Key");
    
    appendChatBubble(txt, 'user');
    input.value = ""; chatHistory.push({role:"user", content:txt});
    const loadingId = appendChatBubble("⏳ ...", 'ai');

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': {'Bearer': key}, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: chatHistory})
        });
        const data = await res.json();
        const aiTxt = data.choices[0].message.content;
        chatHistory.push({role:"assistant", content:aiTxt});
        updateChatBubble(loadingId, aiTxt);
    } catch(e) { updateChatBubble(loadingId, "Error"); }
}

function startChatVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return alert("不支持");
    const rec = new SR(); rec.lang = currentChatMode === 'eng' ? 'en-US' : 'zh-CN';
    rec.start();
    rec.onresult = (e) => { sendChatMessage(e.results[0][0].transcript); };
}

// ================= [11] 基础辅助功能 =================
function switchTab(t) {
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activePage = document.getElementById('page-' + t);
    if(activePage) activePage.style.display = 'block';
    const activeBtn = document.getElementById('btn-' + t);
    if(activeBtn) activeBtn.classList.add('active');
    const selector = document.getElementById('bookSelectorContainer');
    if(selector) selector.style.display = (t === 'chat' ? 'none' : 'flex');
}

function toggleSettings() { 
    const s = document.getElementById('settingsCard');
    s.style.display = (s.style.display === 'none' ? 'block' : 'none');
}

function saveApiKey() {
    const k = document.getElementById('siliconApiKey').value.trim();
    localStorage.setItem('silicon_api_key', k); alert("已保存"); toggleSettings();
}

function changeBook() { 
    localStorage.setItem('selected_book_path', document.getElementById('bookSelect').value);
    currentWordIndex = 0; location.reload(); 
}

function appendChatBubble(t, s) {
    const id = "msg-" + Date.now();
    const div = document.createElement('div');
    div.className = `chat-bubble bubble-${s}`; div.id = id; div.innerText = t;
    document.getElementById('chatLog').appendChild(div);
    const box = document.getElementById('chatLog'); box.scrollTop = box.scrollHeight;
    return id;
}

function updateChatBubble(id, t) {
    const el = document.getElementById(id);
    if(el) el.innerText = t;
}

function startListeningForWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return;
    const rec = new SR(); rec.lang = 'en-US';
    const resEl = document.getElementById('wordResult');
    resEl.innerText = "聆听中..."; rec.start();
    rec.onresult = (e) => {
        const spoken = e.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim();
        const target = wordList[currentWordIndex].en.toLowerCase().trim();
        resEl.innerHTML = (spoken === target) ? `<span style="color:green">✅ ${spoken}</span>` : `<span style="color:red">❌ ${spoken}</span>`;
    };
}

function checkDictation() {
    const input = document.getElementById('dictationInput').value.trim().toLowerCase();
    const target = wordList[currentWordIndex].en.toLowerCase();
    const resEl = document.getElementById('dictationResult');
    if (input === target) {
        resEl.style.color="green"; resEl.innerText="✅ 正确";
        document.getElementById('targetWord').style.filter="none";
        setTimeout(nextWord, 1500);
    } else { resEl.style.color="red"; resEl.innerText="❌ 错误"; }
}

function startGroupTest() {
    groupTestBounds = getGroupBounds(); groupTestAnswers = []; currentSentenceIdx = 0;
    document.getElementById('dictationSingleMode').style.display = 'none';
    document.getElementById('dictationGroupMode').style.display = 'block';
    playTestWord();
}

function playTestWord() {
    const word = wordList[groupTestBounds.start + groupTestAnswers.length].en;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word); u.lang = 'en-US';
    window.speechSynthesis.speak(u);
    document.getElementById('groupTestProgress').innerText = `词: ${groupTestAnswers.length + 1} / ${groupTestBounds.total}`;
}

function submitTestWord() {
    const val = document.getElementById('groupTestInput').value.trim();
    groupTestAnswers.push(val);
    document.getElementById('groupTestInput').value = "";
    if (groupTestAnswers.length < groupTestBounds.total) playTestWord();
    else showGroupTestResult();
}

function showGroupTestResult() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationResultMode').style.display = 'block';
    let correct = 0; let html = "";
    for (let i=0; i<groupTestBounds.total; i++) {
        const target = wordList[groupTestBounds.start + i];
        const isOk = groupTestAnswers[i].toLowerCase() === target.en.toLowerCase();
        if (isOk) correct++;
        html += `<li><b>${target.en}</b>: ${isOk?'✅':'❌ '+groupTestAnswers[i]}</li>`;
    }
    document.getElementById('groupTestScore').innerText = `正确率: ${Math.round(correct/groupTestBounds.total*100)}%`;
    document.getElementById('groupTestResultList').innerHTML = html;
}

function quitGroupTest() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationResultMode').style.display = 'none';
    document.getElementById('dictationSingleMode').style.display = 'block';
}

function handleLogout() { if(supabaseClient) supabaseClient.auth.signOut().then(() => location.reload()); }
function manualPush() { pushToCloud().then(() => alert("云端已备份")); }