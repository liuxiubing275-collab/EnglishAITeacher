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
let isWrongBookMode = false;

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
    if (!select) return;
    
    const currentVal = select.value; // 记住当前选择，防止刷新时跳走
    select.innerHTML = '';
    
    // 1. 添加普通组
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        select.add(new Option(`📦 第 ${i + 1} 组`, i));
    }
    
    // 2. 添加全部练习
    select.add(new Option(`📚 全部练习`, 'all'));

    // 3. 【关键修复】：添加生词本选项
    let wrongWordsBook = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');
    if (wrongWordsBook.length > 0) {
        let opt = new Option(`❤️ 生词本 (${wrongWordsBook.length} 词)`, 'wrong_book');
        opt.style.color = "red";
        select.add(opt);
    }
    
    // 4. 更新看板上的生词统计数字
    const countSpan = document.getElementById('wrongWordsCount');
    const staticArea = document.getElementById('wrongWordsStatic');
    if (countSpan) countSpan.innerText = wrongWordsBook.length;
    if (staticArea) staticArea.style.display = wrongWordsBook.length > 0 ? 'block' : 'none';

    select.value = currentVal || 0;
}

function getGroupBounds() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return { start: 0, end: wordList.length - 1, total: wordList.length };
    const start = parseInt(val) * 10;
    const end = Math.min(start + 9, wordList.length - 1);
    return { start, end, total: end - start + 1 };
}

function updateWordDisplay() {
    // 1. 确定数据源：是练习普通课本，还是在练习生词本
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    
    // 2. 空列表处理：如果生词本练完了
    if (source.length === 0) {
        if (isWrongBookMode) {
            alert("🎉 太棒了！生词本中的单词已全部掌握！");
            isWrongBookMode = false;
            document.getElementById('groupSelect').value = 0; // 切回第一组
            loadAllData(); // 重新加载数据
        }
        return;
    }

    // 3. 获取当前单词对象
    // 确保索引不越界（尤其是在生词本数量变动时）
    if (currentWordIndex >= source.length) currentWordIndex = 0;
    const wordObj = source[currentWordIndex];

    // 4. 更新单词文本和计数器
    const wordEl = document.getElementById('targetWord');
    const counterEl = document.getElementById('wordCounter');
    
    if (wordEl) wordEl.innerText = wordObj.en;
    if (counterEl) {
        // 如果是生词本模式，显示总数；如果是普通模式，显示组内进度
        const total = isWrongBookMode ? source.length : getGroupBounds().total;
        const current = isWrongBookMode ? (currentWordIndex + 1) : (currentWordIndex - getGroupBounds().start + 1);
        counterEl.innerText = `${current} / ${total}`;
    }

    // 5. 更新中文释义（默认隐藏）
    const chineseEl = document.getElementById('chineseMeaning');
    if (chineseEl) {
        chineseEl.innerText = wordObj.zh;
        chineseEl.style.display = 'none';
    }

    // 6. 更新例句显示（处理换行逻辑）
    const exBox = document.getElementById('exampleSentence');
    if (exBox) {
        const exParts = wordObj.ex.split("中文：");
        if (exParts.length > 1) {
            exBox.innerHTML = `
                <div style="font-weight:500; color:#2c3e50;">${exParts[0].trim()}</div>
                <div style="color:#8e8e93; font-size:0.9em; margin-top:8px; border-top:1px solid #f0f0f0; padding-top:8px;">
                    <span style="background:#eee; padding:2px 5px; border-radius:4px; font-size:0.8em; margin-right:5px;">译</span>
                    ${exParts[1].trim()}
                </div>`;
        } else {
            exBox.innerHTML = `<div style="color:#2c3e50;">${wordObj.ex}</div>`;
        }
        exBox.style.display = 'none'; // 默认隐藏
    }

    // 7. 状态清理
    const resultEl = document.getElementById('wordResult');
    const dictResultEl = document.getElementById('dictationResult');
    const dictInput = document.getElementById('dictationInput');
    
    if (resultEl) resultEl.innerText = "";
    if (dictResultEl) dictResultEl.innerText = "";
    if (dictInput) dictInput.value = "";

    // 8. 模式判定：练习模式下强制单词清晰，除非正在测验
    if (wordEl) {
        const isTesting = document.getElementById('dictationGroupMode').style.display === 'block';
        wordEl.style.filter = isTesting ? 'blur(8px)' : 'none';
    }
}

// ================= [自由练习模式的拼写检查逻辑] =================

function checkDictation() {
    // 1. 获取当前数据源（普通课本或生词本）
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    
    if (source.length === 0) return;

    // 2. 获取用户输入和标准答案
    const userInput = document.getElementById('dictationInput').value.trim().toLowerCase();
    const targetWordObj = source[currentWordIndex];
    const correctAnswer = targetWordObj.en.toLowerCase().trim();
    
    const resultEl = document.getElementById('dictationResult');
    const wordEl = document.getElementById('targetWord');

    // 3. 读取生词本用于更新
    let wrongWordsBook = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');

    if (userInput === "") {
        resultEl.style.color = "#FF9500";
        resultEl.innerText = "⚠️ 请先输入单词！";
        return;
    }

    if (userInput === correctAnswer) {
        // --- 情况 A：拼写正确 ---
        resultEl.style.color = "#27ae60";
        resultEl.innerHTML = "✅ 完全正确！";
        
        // 视觉反馈：让模糊的单词变清晰
        if (wordEl) wordEl.style.filter = "none";

        // 【科学逻辑】：既然写对了，就从生词本中移除该词（如果原本在里面）
        wrongWordsBook = wrongWordsBook.filter(item => item.en.toLowerCase() !== correctAnswer);
        localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWordsBook));
        
        // 更新下拉菜单的数量显示
        initGroupSelect();
        // 同步到云端
        if (typeof pushToCloud === 'function') pushToCloud();

        // 1.5秒后自动跳转到下一个词
        setTimeout(() => {
            nextWord();
        }, 1500);

    } else {
        // --- 情况 B：拼写错误 ---
        resultEl.style.color = "#e74c3c";
        resultEl.innerHTML = "❌ 拼写有误，再试一次。";
        
        // 【科学逻辑】：拼错了，自动加入生词本（避免重复添加）
        const alreadyIn = wrongWordsBook.some(item => item.en.toLowerCase() === correctAnswer);
        if (!alreadyIn) {
            wrongWordsBook.push(targetWordObj);
            localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWordsBook));
            
            // 更新下拉菜单的数量显示
            initGroupSelect();
            // 同步到云端
            if (typeof pushToCloud === 'function') pushToCloud();
        }
        
        // 选中输入框文字，方便用户修改
        document.getElementById('dictationInput').select();
    }
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

// 修改 1：读单词
function readTargetWord() {
    window.speechSynthesis.cancel();
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    const wordEl = document.getElementById('targetWord');
    if (wordEl) wordEl.style.filter = 'none';
    
    const u = new SpeechSynthesisUtterance(source[currentWordIndex].en);
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

function showAndPlayExample() {
    document.getElementById('exampleSentence').style.display = 'block';
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    let speechText = source[currentWordIndex].ex.split("中文：")[0].replace(/[^\x00-\xff]/g, '').trim();
    
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speechText);
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

// ================= [测验模块：含生词本逻辑] =================

// 1. 开始【本组连续测验】
function startGroupTest() {
    // 确定测验的数据源（是普通课本还是生词本）
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    let bounds = getGroupBounds();
    
    // 如果是生词本模式，范围就是整个生词本
    groupTestBounds = isWrongBookMode ? { start: 0, end: source.length - 1, total: source.length } : bounds;
    
    if (source.length === 0) return alert("没有单词可以测试");

    groupTestAnswers = []; 
    groupTestCurrentIndex = 0;

    // UI 切换
    document.getElementById('dictationSingleMode').style.display = 'none';
    document.getElementById('dictationGroupMode').style.display = 'block';
    document.getElementById('dictationResultMode').style.display = 'none';
    
    // 强制模糊单词
    document.getElementById('targetWord').style.filter = 'blur(8px)';
    
    playTestWord();
}

// 2. 播放测验单词
function playTestWord() {
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    const wordObj = source[groupTestBounds.start + groupTestCurrentIndex];
    
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(wordObj.en);
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
    
    document.getElementById('groupTestProgress').innerText = `测验中: ${groupTestCurrentIndex + 1} / ${groupTestBounds.total}`;
    setTimeout(() => { document.getElementById('groupTestInput').focus(); }, 200);
}

// 3. 提交当前单词并进入下一个 (你缺失的函数)
function submitTestWord() {
    const inputEl = document.getElementById('groupTestInput');
    groupTestAnswers.push(inputEl.value.trim());
    inputEl.value = "";
    
    groupTestCurrentIndex++;
    
    if (groupTestCurrentIndex < groupTestBounds.total) {
        playTestWord();
    } else {
        showGroupTestResult();
    }
}

// 4. 显示结果并管理生词本 (你缺失的函数)
function showGroupTestResult() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationResultMode').style.display = 'block';
    
    let correctCount = 0;
    let html = "";
    
    // 获取当前测验的数据源
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    // 获取生词本用于更新
    let wrongWordsBook = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');

    for (let i = 0; i < groupTestBounds.total; i++) {
        const target = source[groupTestBounds.start + i];
        const userAnswer = groupTestAnswers[i].toLowerCase().trim();
        const correctAnswer = target.en.toLowerCase().trim();
        
        const isOk = groupTestAnswers[i].toLowerCase().trim() === target.en.toLowerCase().trim();
        
        if (isOk) {
            correctCount++;
            // 【科学逻辑】：如果写对了，尝试从生词本中移除
            wrongWordsBook = wrongWordsBook.filter(item => item.en.toLowerCase() !== target.en.toLowerCase());
        } else {
            // 写错了，加入生词本
            if (!wrongWordsBook.some(item => item.en.toLowerCase() === target.en.toLowerCase())) {
                wrongWordsBook.push(target);
            }
        }
        
        html += `<li class="${isOk ? 'correct-item' : 'incorrect-item'}" style="margin-bottom:10px; padding:10px; border-radius:8px; list-style:none; background:#f8f9fa;">
                    <b>${target.en}</b>: ${isOk ? '✅' : '❌ 你写了: ' + (groupTestAnswers[i] || "(留空)")}
                    <br><small style="color:#666;">${target.zh}</small>
                 </li>`;
    }

    // 保存生词本到本地并同步云端
    localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWordsBook));
    if (typeof pushToCloud === 'function') pushToCloud();

    document.getElementById('groupTestScore').innerHTML = `正确率: ${Math.round(correctCount / groupTestBounds.total * 100)}%`;
    document.getElementById('groupTestResultList').innerHTML = html;
    
    // 重新初始化下拉框，以刷新生词本的数量显示
    initGroupSelect();
    pushToCloud();
}

// ================= [从测验模式返回到练习模式] =================

function quitGroupTest() {
    // 1. 隐藏测验运行界面和结果展示界面
    const groupMode = document.getElementById('dictationGroupMode');
    const resultMode = document.getElementById('dictationResultMode');
    const singleMode = document.getElementById('dictationSingleMode');

    if (groupMode) groupMode.style.display = 'none';
    if (resultMode) resultMode.style.display = 'none';

    // 2. 重新显示自由练习（单词练习）界面
    if (singleMode) singleMode.style.display = 'block';

    // 3. 核心修复：强制取消单词模糊效果，让单词恢复清晰
    const wordEl = document.getElementById('targetWord');
    if (wordEl) {
        wordEl.style.filter = 'none';
    }

    // 4. 刷新当前单词显示，确保界面数据同步
    updateWordDisplay();

    // 5. 自动滚动回到顶部，方便继续练习
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

function changeGroup() {
    const val = document.getElementById('groupSelect').value;
    
    if (val === 'wrong_book') {
        isWrongBookMode = true;
        currentWordIndex = 0;
    } else {
        isWrongBookMode = false;
        currentWordIndex = getGroupBounds().start;
    }
    updateWordDisplay();
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
    if (!apiKey) return alert("请先设置 API Key");

    const inputs = document.querySelectorAll('.trans-user-input');
    inputs.forEach(input => {
        const idx = input.getAttribute('data-idx');
        translationTasks[idx].userEn = input.value.trim();
    });

    const btn = document.getElementById('btnSubmitTrans');
    btn.innerText = "⏳ AI 正在进行纯净批改...";
    btn.disabled = true;

    // --- 策略 1：极简指令 + 强制英文约束 ---
    const prompt = `Task: Translate the following 3 Chinese sentences into English.
    1. ${translationTasks[0].cn}
    2. ${translationTasks[1].cn}
    3. ${translationTasks[2].cn}

    Rules:
    - Output ONLY English.
    - NO Chinese characters.
    - NO explanations.
    - Format: One English sentence per line.`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-7B-Instruct',
                messages: [
                    { role: "system", content: "You are a professional Chinese-to-English translator. You only output plain English sentences. You never use Chinese in your response." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,      // 极低随机性，防止胡言乱语
                top_p: 0.1,
                frequency_penalty: 1.5, // 强力防止单词重复 (如 tarted tarted)
                max_tokens: 300
            })
        });
        
        const data = await response.json();
        let aiRaw = data.choices[0].message.content.trim();
        
        // --- 策略 2：物理清洗（关键修复点） ---
        let lines = aiRaw.split('\n').filter(l => l.trim().length > 3);

        const resBox = document.getElementById('transResult');
        const compareArea = document.getElementById('transComparisonArea');
        resBox.style.display = 'block';
        
        let html = '<h3 style="color:#e67e22; font-size:16px;">📋 地道参考答案：</h3>';
        copySentenceQueue = [];

        translationTasks.forEach((t, i) => {
            let rawText = lines[i] || "AI is thinking, please try again.";
            
            // 1. 去掉所有中文字符（物理屏蔽 kuk 或中文解释）
            let englishOnly = rawText.replace(/[\u4e00-\u9fa5]/g, '').trim();
            
            // 2. 去掉开头的序号 (如 "1. ", "2-")
            englishOnly = englishOnly.replace(/^\d+[\.、\-\s]+/, '');

            // 3. 单词去重洗涤器（防止 tarted tarted 这种重复）
            let words = englishOnly.split(/\s+/);
            let cleanedWords = [];
            for (let j = 0; j < words.length; j++) {
                if (j > 0 && words[j].toLowerCase() === words[j-1].toLowerCase()) continue;
                cleanedWords.push(words[j]);
            }
            let correctText = cleanedWords.join(' ').trim();

            // 如果洗完发现是空的，给个兜底
            if (correctText.length < 5) correctText = "Translation failed, please resubmit.";

            t.correctEn = correctText;
            copySentenceQueue.push(correctText);

            html += `
                <div style="margin-bottom:12px; border:1px solid #eee; padding:12px; border-radius:12px; background:white;">
                    <div style="font-size:13px; color:#8E8E93; margin-bottom:5px;">Q${i+1}: ${t.cn}</div>
                    <div style="display:flex; gap:10px;">
                        <div style="flex:1; border-right:1px solid #f0f0f0; padding-right:8px;">
                            <small style="color:#e74c3c; font-weight:bold;">你的回答</small><br>
                            <span style="font-size:14px; color:#333;">${t.userEn || "(未填写)"}</span>
                        </div>
                        <div style="flex:1; padding-left:5px;">
                            <small style="color:#34C759; font-weight:bold;">地道参考</small><br>
                            <b style="font-size:15px; color:#1B5E20;">${correctText}</b>
                        </div>
                    </div>
                </div>
            `;
        });

        compareArea.innerHTML = html;
        document.getElementById('transWorking').style.display = 'none';
        btn.disabled = false;
        btn.innerText = "✅ 提交 AI 批改";

        // 启动抄写练习
        startCopyExercise();

    } catch (e) {
        console.error(e);
        alert("网络超时，请检查 API Key 后重试。");
        btn.disabled = false;
        btn.innerText = "✅ 提交 AI 批改";
    }
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
            headers: {
    'Authorization': `Bearer ${key}`, 
    'Content-Type': 'application/json'
},
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

function jumpToWrongBook() {
    const select = document.getElementById('groupSelect');
    if (select) {
        // 先检查生词本选项是否存在
        let hasWrongBook = Array.from(select.options).some(opt => opt.value === 'wrong_book');
        if (hasWrongBook) {
            select.value = 'wrong_book';
            changeGroup(); // 触发切换
            // 自动滚动到练习区
            document.getElementById('page-words').scrollIntoView({ behavior: 'smooth' });
        } else {
            alert("目前生词本是空的哦！");
        }
    }
}