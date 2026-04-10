/**
 * AI 英语私教 - 核心功能逻辑
 */

// ================= 全局变量 =================
let activeUtterance = null; 
let wordList = [{ en: "Apple", zh: "苹果(示例)", ex: "An apple a day." }]; 
let currentWordIndex = 0; 
let articleList = ["Please create Texts.txt file to load articles."];
let currentArticleText = ""; 
let articleSentences = []; 
let currentSentenceIdx = 0; 
let sentenceReplayTimer = null;
let currentChatMode = 'eng'; // 'eng' 英文私教, 'chn' 中文助手
let chatHistory = [];

// AI Chat Prompts
const promptEng = `你是一位友好的英语母语者，正在和用户进行轻松的日常聊天。
【首要任务】：用自然、地道的英语回答问题，推进对话。
【纠错规则】：只有当用户的英语出现明显的语法或拼写错误时，你才纠错。没有明显错误，**绝对不要**纠错。
如果有错误，**必须**将中文纠错内容放在 <纠错> 和 </纠错> 标签之间，且放在回复最前。`;

const promptChn = `你是一个聪明、友善的AI助手。
请完全使用自然、流利的**中文**回答用户的所有问题。
不论用户问什么，你都直接用纯中文给予有用的帮助，态度亲切，就像朋友聊天一样。`;

// ================= 生命周期与初始化 =================

window.onload = function() {
    loadAllData();
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        document.getElementById('siliconApiKey').value = savedKey;
        document.getElementById('apiKeyStatus').innerText = "✅ API Key 已读取";
        document.getElementById('apiKeyStatus').style.color = "#27ae60";
        document.getElementById('settingsCard').style.display = 'none'; 
    }
    // 初始化聊天模式为英文
    switchChatMode('eng');
    
    // 初始化看板
    updateDailyDashboard();
    
    // 实时更新看板上显示的当前组号
    setInterval(() => {
        const val = document.getElementById('groupSelect').value;
        const gNum = val === 'all' ? '全' : parseInt(val) + 1;
        const activeSpan = document.getElementById('currentActiveGNum');
        if(activeSpan) activeSpan.innerText = gNum;
    }, 500);
};

// ================= 1. 数据加载 =================

async function loadAllData() {
    // 加载单词库
    try {
        const wRes = await fetch('NewWords.txt');
        if (wRes.ok) {
            const wText = await wRes.text();
            const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);  
            wordList = [];
            for (let i = 0; i < rawLines.length; i += 3) {
                const wordLine = rawLines[i];
                const sentenceLine = (i + 1 < rawLines.length) ? rawLines[i+1] : "暂无例句。";
	const hookLine = rawLines[i + 2] || ""; // 读取第三行：记忆宫殿内容                
	const parts = wordLine.split(/\||:|：/);
                wordList.push({ 
                    en: parts[0].trim(), 
                    zh: parts.length > 1 ? parts[1].trim() : "暂无中文释义", 
                    ex: sentenceLine
	    hook: hookLine // 将记忆钩子存入对象 
                });
            }
        }
    } catch (e) { console.log("单词库未找到"); }
    if (wordList.length > 0) { initGroupSelect(); updateWordDisplay(); }

    // 加载文章库
    try {
        const aRes = await fetch('Texts.txt');
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({
                    en: allLines[i],
                    zh: allLines[i + 1] || "" 
                });
            }
        }
    } catch (e) { console.log("文章库未找到"); }
    if (articleList.length > 0) { initArticleSelect(); }
}

// ================= 2. 自动化看板 (方案一) =================

// 辅助函数：获取本地日期的 YYYY-MM-DD 字符串（解决时区问题）
function getLocalDateString(date) {
    let y = date.getFullYear();
    let m = (date.getMonth() + 1).toString().padStart(2, '0');
    let d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// 1. 修复后的标记函数
function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') { alert("请先选择一个具体的组号进行学习。"); return; }
    
    const currentGNum = parseInt(val) + 1;
    const today = new Date();
    // 强制清除时分秒
    today.setHours(0, 0, 0, 0);

    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    
    for (let i = 1; i <= currentGNum; i++) {
        let targetDate = new Date(today); // 基于本地今天

        if (i === currentGNum) {
            // 今天完成
        } else if (i === currentGNum - 1) {
            targetDate.setDate(today.getDate() - 1); // 确保是本地时间的昨天
        } else if (i === currentGNum - 3) {
            targetDate.setDate(today.getDate() - 3); // 3天前
        } else if (i === currentGNum - 6) {
            targetDate.setDate(today.getDate() - 6); // 6天前
        } else {
            targetDate.setDate(today.getDate() - 20); // 很久以前
        }
        
        // 使用本地日期格式存储
        history[i] = getLocalDateString(targetDate);
    }

    localStorage.setItem('eng_study_history', JSON.stringify(history));
    alert(`🎉 记录成功！第 ${currentGNum} 组已学完。\n第 1、4、6 组已进入今日复习清单。`);
    updateDailyDashboard();
}

// 2. 修复后的看板显示函数
function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    const dateSpan = document.getElementById('todayDate');
    if (!dashboard) return;

    // 获取本地今天
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dateSpan.innerText = getLocalDateString(today);

    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    
    // 1. 计算最大组号（建议新课）
    let maxGroup = 0;
    Object.keys(history).forEach(g => { if (parseInt(g) > maxGroup) maxGroup = parseInt(g); });
    tasks.push(`🆕 <b>新课建议：</b> 开始第 <a href="#" onclick="jumpToGroup(${maxGroup})" style="color: #f1c40f; font-weight: bold; text-decoration: underline;">${maxGroup + 1}</a> 组`);

    // 2. 计算复习任务
    let reviewLinks = [];
    for (let gNum in history) {
        // 解析存储的日期字符串
        const dateParts = history[gNum].split('-');
        const studyDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        studyDate.setHours(0, 0, 0, 0);

        // 计算天数差
        const diffTime = today.getTime() - studyDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        // 调试用：console.log(`组${gNum} 的差值是: ${diffDays}`);

        if (diffDays === 1 || diffDays === 3 || diffDays === 6) {
            reviewLinks.push(`<a href="#" onclick="jumpToGroup(${gNum-1})" style="color: #f1c40f; font-weight: bold; text-decoration: underline; margin-right:10px;">第 ${gNum} 组</a>`);
        }
    }

    if (reviewLinks.length > 0) {
        // 对显示的组号进行排序（从大到小显示，视觉更清晰）
        reviewLinks.reverse(); 
        tasks.push(`<br>🔄 <b>今日必复习：</b> ${reviewLinks.join('')}`);
    } else {
        tasks.push(`<br>✅ 今日暂无旧课复习任务，请专注新课！`);
    }

    dashboard.innerHTML = tasks.join('');
}

// ================= 3. AI 故事生成 (方案三) =================
async function generateGroupMemoryPalace() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请先设置 API Key");

    const bounds = getGroupBounds();
    let wordsToProcess = [];
    for (let i = bounds.start; i <= bounds.end; i++) {
        if (wordList[i]) wordsToProcess.push(`${wordList[i].en}(${wordList[i].zh})`);
    }

    const contentBox = document.getElementById('palaceContent');
    document.getElementById('memoryPalaceArea').style.display = 'block';
    contentBox.innerText = "正在为这 10 个单词设计视觉钩子...";

    const prompt = `你是一位记忆宫殿专家。请为以下 10 个单词分别创作一个独特的视觉记忆钩子。
    单词列表：[${wordsToProcess.join(", ")}]
    要求：
    1. 每个单词给出一个【视觉场景】描述，要求夸张、荒谬、具象。
    2. 格式如下：
    1. 单词：场景描述
    2. 单词：场景描述...`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-7B-Instruct',
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8
            })
        });
        const data = await response.json();
        const result = data.choices[0].message.content;
        
        // 渲染结果，将数字序号加粗高亮
        contentBox.innerHTML = result.replace(/\n/g, '<br>').replace(/(\d+\.)/g, '<strong style="color:#e67e22;">$1</strong>');
    } catch (e) {
        contentBox.innerText = "构建失败，请重试。";
    }
}

async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) { alert("请先在‘互动聊天’版块设置并保存 API Key"); return; }

    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    const todayObj = new Date();
    let selectedWords = [];

    for (let gNum in history) {
        const studyDate = new Date(history[gNum]);
        const diffDays = Math.ceil(Math.abs(todayObj - studyDate) / (1000 * 60 * 60 * 24)) - 1;
        if (diffDays === 1 || diffDays === 3 || diffDays === 6) {
            let start = (parseInt(gNum) - 1) * 10;
            let end = Math.min(start + 9, wordList.length - 1);
            for (let i = start; i <= end; i++) {
                if (wordList[i]) selectedWords.push(wordList[i].en);
            }
        }
    }

    if (selectedWords.length === 0) {
        alert("今日没有到期的复习单词。建议你先学习新课并点击‘标记完成’。");
        return;
    }

    const btn = document.getElementById('btnGenStory');
    const contentBox = document.getElementById('aiStoryContent');
    btn.innerText = "⏳ AI 正在构思故事并翻译...";
    btn.disabled = true;
    contentBox.style.display = 'block';
    contentBox.innerText = "正在通过词汇 [ " + selectedWords.join(", ") + " ] 编写情境故事...";

    const prompt = `你是一位英语教育专家。请使用以下单词编写一段连贯、地道的英语短文（约150词）：[${selectedWords.join(", ")}]。必须包含所有单词，加粗显示，并附带中文翻译。`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-7B-Instruct',
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        const fullResult = data.choices[0].message.content;
        contentBox.innerHTML = fullResult.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e67e22;">$1</strong>');
        document.getElementById('btnShadowStory').style.display = 'block';
        btn.innerText = "🪄 重新生成 AI 故事";
        btn.disabled = false;
    } catch (error) {
        console.error(error);
        alert("生成失败");
        btn.innerText = "🪄 重新生成 AI 故事";
        btn.disabled = false;
    }
}

function transferStoryToArticle() {
    const aiContent = document.getElementById('aiStoryContent').innerText;
    if (!aiContent) return;
    const parts = aiContent.split('---');
    const englishText = parts[0].trim();
    const chineseText = parts.length > 1 ? parts[1].trim() : "";
    currentArticleText = englishText;
    switchTab('articles');
    const articleDisplay = document.getElementById('articleDisplay');
    articleDisplay.innerHTML = `
        <div style="border-left: 4px solid #8e44ad; padding-left: 10px; background: #fdf6ff;">
            <p style="color: #8e44ad; font-weight: bold;">✨ AI 复习专题故事：</p>
            <p>${englishText}</p>
            <p style="color: #7f8c8d; font-size: 14px;">${chineseText}</p>
        </div>
    `;
    quitArticleDictation();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= 4. 单词核心逻辑 =================

function initGroupSelect() {
    const select = document.getElementById('groupSelect'); 
    select.innerHTML = `<option value="all">📚 整体练习 (共 ${wordList.length} 词)</option>`;
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        const start = i * 10 + 1; 
        const end = Math.min((i + 1) * 10, wordList.length);
        let option = document.createElement('option'); 
        option.value = i; 
        option.text = `📦 第 ${i + 1} 组 (词汇 ${start} - ${end})`;
        select.appendChild(option);
    }
}

function getGroupBounds() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return { start: 0, end: wordList.length - 1, total: wordList.length };
    const start = parseInt(val) * 10; 
    return { start, end: Math.min(start + 9, wordList.length - 1), total: Math.min(start + 9, wordList.length - 1) - start + 1 };
}

function changeGroup() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }

function updateWordDisplay() {
    if(wordList.length === 0) return;
    const bounds = getGroupBounds();
    document.getElementById('targetWord').innerText = wordList[currentWordIndex].en;
    document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    document.getElementById('chineseMeaning').style.display = 'none'; 
    document.getElementById('chineseMeaning').innerText = wordList[currentWordIndex].zh;
    document.getElementById('exampleSentence').style.display = 'none'; 
    document.getElementById('exampleSentence').innerText = wordList[currentWordIndex].ex;
    document.getElementById('wordResult').innerText = ""; 
    document.getElementById('dictationInput').value = ""; 
    document.getElementById('dictationResult').innerText = "";
    document.getElementById('targetWord').style.filter = 'none';
    const exBox = document.getElementById('exampleSentence');
    const currentWord = wordList[currentWordIndex];
    exBox.innerHTML = `
        <div style="margin-bottom: 8px;">${currentWord.ex}</div>
        <div style="color: #8e44ad; font-weight: bold; font-size: 14px; border-top: 1px dashed #ddd; pt-5;">
            ${currentWord.hook}
        </div>
}

function toggleMeaning() { 
    const el = document.getElementById('chineseMeaning'); 
    el.style.display = el.style.display === 'none' ? 'block' : 'none'; 
}

function showAndPlayExample() {
    document.getElementById('exampleSentence').style.display = 'block'; 
    const fullSentence = wordList[currentWordIndex].ex;
    if (fullSentence !== "暂无例句。") {
        const englishPart = fullSentence.replace(/[^\x00-\xff]/g, '').trim();
        if (englishPart.length > 0) {
            activeUtterance = new SpeechSynthesisUtterance(englishPart);
            activeUtterance.lang = 'en-US'; window.speechSynthesis.speak(activeUtterance);
        }
    }
}

function nextWord() { 
    if (wordList.length === 0) return; 
    const bounds = getGroupBounds(); 
    currentWordIndex++; 
    if (currentWordIndex > bounds.end) currentWordIndex = bounds.start; 
    updateWordDisplay(); 
}

function restartWords() { 
    if (wordList.length === 0) return; 
    currentWordIndex = getGroupBounds().start; 
    updateWordDisplay(); 
}

function toggleBlur() { 
    const wordEl = document.getElementById('targetWord'); 
    wordEl.style.filter = wordEl.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)'; 
}

function readTargetWord() {
    document.getElementById('targetWord').style.filter = 'blur(8px)';
    activeUtterance = new SpeechSynthesisUtterance(wordList[currentWordIndex].en); 
    activeUtterance.lang = 'en-US'; 
    window.speechSynthesis.speak(activeUtterance);
    setTimeout(() => { document.getElementById('dictationInput').focus(); }, 100);
}

// 单词练习：语音跟读识别
function startListeningForWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; 
    if (!SpeechRecognition) return alert("您的浏览器不支持语音识别，请在 iPhone Safari 或 Chrome 中使用。");
    
    const recognition = new SpeechRecognition(); 
    recognition.lang = 'en-US'; 
    const resultEl = document.getElementById('wordResult');
    
    resultEl.style.color = "#333";
    resultEl.innerText = "正在聆听..."; 
    
    recognition.start();

    recognition.onresult = function(event) {
        // 获取识别到的文本并清洗
        const transcript = event.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim(); 
        const target = wordList[currentWordIndex].en.toLowerCase().trim(); 
        
        if (transcript === target) { 
            resultEl.style.color = "#27ae60"; 
            resultEl.innerHTML = `✅ 完美！读作: "${transcript}"`; 
        } else { 
            resultEl.style.color = "#e74c3c"; 
            resultEl.innerHTML = `❌ 差一点: "${transcript}"`; 
        }
    };

    recognition.onerror = function() {
        resultEl.innerText = "⚠️ 没听清，请重试。";
    };
}
2. 检查 3 行读取逻辑是否完整
因为你改成了“三行一词”，请务必确认你的 loadAllData 函数已经更新为 i += 3，否则数据会错位，导致 currentWordIndex 对应的对象属性（如 en）变成空的，从而引发更多错误。
检查你的 loadAllData 是否包含这部分逻辑：
code
JavaScript
for (let i = 0; i < rawLines.length; i += 3) {
    const wordLine = rawLines[i];
    const sentenceLine = rawLines[i + 1] || "No example.";
    const hookLine = rawLines[i + 2] || "暂无记忆钩子。";
    
    const parts = wordLine.split(/\||:|：/);
    wordList.push({ 
        en: parts[0].trim(), 
        zh: parts.length > 1 ? parts[1].trim() : "暂无释义", 
        ex: sentenceLine,
        hook: hookLine 
    });
}

// 单词拼写检查
function checkDictation() {
    const userInput = document.getElementById('dictationInput').value.toLowerCase().trim(); 
    const targetWord = wordList[currentWordIndex].en.toLowerCase().trim(); 
    const resultEl = document.getElementById('dictationResult');
    if (userInput === "") return resultEl.innerText = "⚠️ 请输入单词！";
    if (userInput === targetWord) { 
        resultEl.style.color = "#27ae60"; resultEl.innerHTML = `✅ 完全正确！`; 
        document.getElementById('targetWord').style.filter = 'none'; 
        setTimeout(() => { nextWord(); }, 1500); 
    } else { 
        resultEl.style.color = "#e74c3c"; resultEl.innerHTML = `❌ 拼写错误。`; 
    }
}

// ================= 5. 单词组测验逻辑 =================

let groupTestBounds = null; let groupTestAnswers = []; let groupTestCurrentIndex = 0;

function startGroupTest() {
    if (wordList.length === 0) return;
    groupTestBounds = getGroupBounds(); groupTestAnswers = []; groupTestCurrentIndex = 0;
    document.getElementById('dictationSingleMode').style.display = 'none'; 
    document.getElementById('dictationResultMode').style.display = 'none'; 
    document.getElementById('dictationGroupMode').style.display = 'block';
    document.getElementById('groupTestInput').value = ''; 
    document.getElementById('groupTestProgress').innerText = `📝 第 ${groupTestCurrentIndex + 1} 词 / 共 ${groupTestBounds.total}`;
    document.getElementById('targetWord').style.filter = 'blur(8px)'; 
    setTimeout(() => { playTestWord(); }, 600);
}

function playTestWord() { 
    activeUtterance = new SpeechSynthesisUtterance(wordList[groupTestBounds.start + groupTestCurrentIndex].en); 
    activeUtterance.lang = 'en-US'; window.speechSynthesis.speak(activeUtterance); 
    setTimeout(() => { document.getElementById('groupTestInput').focus(); }, 100); 
}

function submitTestWord() {
    const inputEl = document.getElementById('groupTestInput'); 
    groupTestAnswers.push(inputEl.value.trim()); 
    inputEl.value = ''; 
    groupTestCurrentIndex++;
    if (groupTestCurrentIndex < groupTestBounds.total) { 
        document.getElementById('groupTestProgress').innerText = `📝 第 ${groupTestCurrentIndex + 1} 词 / 共 ${groupTestBounds.total}`; 
        setTimeout(() => { playTestWord(); }, 400); 
    } else { 
        showGroupTestResult(); 
    }
}

function showGroupTestResult() {
    document.getElementById('dictationGroupMode').style.display = 'none'; 
    document.getElementById('dictationResultMode').style.display = 'block'; 
    let correctCount = 0; let htmlList = '';
    for (let i = 0; i < groupTestBounds.total; i++) {
        let absIndex = groupTestBounds.start + i; 
        let targetWord = wordList[absIndex].en; 
        let userAnswer = groupTestAnswers[i] || ""; 
        let isCorrect = (targetWord.toLowerCase().trim() === userAnswer.toLowerCase());
        if (isCorrect) { 
            correctCount++; 
            htmlList += `<li class="correct-item"><strong>${targetWord}</strong> ✅</li>`; 
        } else { 
            htmlList += `<li class="incorrect-item"><s>${userAnswer || "(空)"}</s> -> <strong>${targetWord}</strong></li>`; 
        }
    }
    let accuracy = Math.round((correctCount / groupTestBounds.total) * 100);
    document.getElementById('groupTestScore').innerHTML = `正确率: ${accuracy}%`;
    document.getElementById('groupTestResultList').innerHTML = htmlList;
}

function quitGroupTest() { 
    document.getElementById('dictationGroupMode').style.display = 'none'; 
    document.getElementById('dictationResultMode').style.display = 'none'; 
    document.getElementById('dictationSingleMode').style.display = 'block'; 
    document.getElementById('targetWord').style.filter = 'none'; 
}

// ================= 6. 1247 复习逻辑 =================

function calculateReviewGroups() {
    const inputVal = document.getElementById('currentGroupInput').value;
    if (!inputVal) { alert("请输入当前组号"); return; }
    const N = parseInt(inputVal);
    const reviewOffsets = [1, 3, 6]; 
    const resultArea = document.getElementById('reviewResultArea');
    const linksSpan = document.getElementById('reviewLinks');
    let reviewGroups = [];
    reviewOffsets.forEach(offset => {
        let target = N - offset;
        if (target >= 1) reviewGroups.push(target);
    });
    if (reviewGroups.length === 0) {
        linksSpan.innerHTML = "暂无复习任务。";
    } else {
        linksSpan.innerHTML = "";
        reviewGroups.forEach(gNum => {
            const link = document.createElement('a'); link.href = "#"; link.innerText = `第 ${gNum} 组 `;
            link.style = "color: #007aff; margin-right: 10px; cursor: pointer; font-weight: bold;";
            link.onclick = (e) => { e.preventDefault(); jumpToGroup(gNum - 1); };
            linksSpan.appendChild(link);
        });
    }
    resultArea.style.display = 'block';
    document.getElementById('aiStoryArea').style.display = 'block';
}

function jumpToGroup(index) {
    const select = document.getElementById('groupSelect');
    if (index >= 0 && index < select.options.length - 1) {
        select.value = index; changeGroup();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ================= 7. 文章跟读逻辑 =================

function initArticleSelect() { 
    const startSel = document.getElementById('articleStartSelect'); 
    const endSel = document.getElementById('articleEndSelect'); 
    startSel.innerHTML = ''; endSel.innerHTML = '';
    articleList.forEach((_, index) => { 
        startSel.add(new Option(`第 ${index + 1} 段`, index));
        endSel.add(new Option(`第 ${index + 1} 段`, index));
    });
    startSel.value = 0; endSel.value = 0; changeArticleRange();
}

function changeArticleRange() { 
    let startIdx = parseInt(document.getElementById('articleStartSelect').value); 
    let endIdx = parseInt(document.getElementById('articleEndSelect').value);
    if (endIdx < startIdx) { endIdx = startIdx; document.getElementById('articleEndSelect').value = endIdx; }
    let selectedItems = articleList.slice(startIdx, endIdx + 1);
    let htmlContent = "";
    selectedItems.forEach(item => {
        htmlContent += `<div style="margin-bottom: 15px;"><div>${item.en}</div><div style="color: #7f8c8d; font-size: 14px;">${item.zh}</div></div>`;
    });
    document.getElementById('articleDisplay').innerHTML = htmlContent;
    currentArticleText = selectedItems.map(item => item.en).join(' ');
    document.getElementById('diffResult').style.display = 'none'; 
    quitArticleDictation(); 
}

function nextArticleRange() {
    let startIdx = parseInt(document.getElementById('articleStartSelect').value); 
    let endIdx = parseInt(document.getElementById('articleEndSelect').value);
    let span = endIdx - startIdx + 1; 
    let nextStart = startIdx + span; 
    if (nextStart >= articleList.length) nextStart = 0;
    document.getElementById('articleStartSelect').value = nextStart;
    document.getElementById('articleEndSelect').value = Math.min(nextStart + span - 1, articleList.length - 1);
    changeArticleRange();
}

function speakArticle() { 
    window.speechSynthesis.cancel();
    activeUtterance = new SpeechSynthesisUtterance(currentArticleText); 
    activeUtterance.lang = 'en-US'; 
    activeUtterance.rate = parseFloat(document.getElementById('speedSelect').value); 
    window.speechSynthesis.speak(activeUtterance); 
}

function startListeningForArticle() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; 
    if (!SpeechRecognition) return alert("不支持语音。");
    const recognition = new SpeechRecognition(); recognition.lang = 'en-US'; 
    document.getElementById('diffResult').style.display = 'block';
    document.getElementById('diffContent').innerHTML = "🎤 正在聆听..."; 
    recognition.start();
    recognition.onresult = function(event) { 
        const spoken = event.results[0][0].transcript;
        const diffHTML = compareSentences(currentArticleText, spoken); 
        document.getElementById('diffContent').innerHTML = `<b>听到了:</b> "${spoken}"<br><b>比对:</b> ${diffHTML}`; 
    };
}

function compareSentences(original, spoken) {
    let origWords = original.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/); 
    let spokenWords = spoken.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/); 
    let resultHTML = []; let spokenIdx = 0; 
    origWords.forEach(word => {
        let found = false;
        for(let j = spokenIdx; j < Math.min(spokenIdx + 3, spokenWords.length); j++) { 
            if (word === spokenWords[j]) { found = true; spokenIdx = j + 1; break; } 
        }
        resultHTML.push(found ? `<span style="color: #27ae60;">${word} </span>` : `<span style="color: #e74c3c; text-decoration: line-through;">${word} </span>`);
    }); 
    return resultHTML.join('');
}

// ================= 8. 文章精听听写 =================

function startArticleDictation() {
    articleSentences = currentArticleText.match(/[^.!?\n]+[.!?\n]+/g) || [currentArticleText];
    articleSentences = articleSentences.map(s => s.trim()).filter(s => s.length > 0); 
    currentSentenceIdx = 0;
    document.getElementById('articleDictationSetup').style.display = 'none'; 
    document.getElementById('articleDictationRunning').style.display = 'block'; 
    document.getElementById('articleDisplay').style.filter = 'blur(8px)';
    updateArticleDictProgress(); playCurrentSentence();
}

function updateArticleDictProgress() { 
    document.getElementById('articleDictProgress').innerText = `正在听写: ${currentSentenceIdx + 1} / ${articleSentences.length}`; 
}

function playCurrentSentence() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    const sentence = articleSentences[currentSentenceIdx];
    const utterance = new SpeechSynthesisUtterance(sentence); utterance.lang = 'en-US';
    utterance.onend = () => {
        sentenceReplayTimer = setTimeout(() => { window.speechSynthesis.speak(utterance); }, 10000); 
    };
    window.speechSynthesis.speak(utterance);
}

function checkArticleDictation() {
    const userInput = document.getElementById('articleDictInput').value.trim();
    const res = document.getElementById('articleDictResult');
    res.style.display = 'block';
    res.innerHTML = `你写了: ${userInput}<br>答案: <b>${articleSentences[currentSentenceIdx]}</b>`;
    document.getElementById('btnNextSentence').style.display = 'block';
}

function nextDictationSentence() {
    currentSentenceIdx++;
    if (currentSentenceIdx >= articleSentences.length) { 
        alert("完成！"); quitArticleDictation(); 
    } else {
        document.getElementById('articleDictResult').style.display = 'none';
        document.getElementById('btnNextSentence').style.display = 'none';
        document.getElementById('articleDictInput').value = '';
        updateArticleDictProgress(); playCurrentSentence();
    }
}

function quitArticleDictation() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    const running = document.getElementById('articleDictationRunning');
    if(running) running.style.display = 'none';
    const setup = document.getElementById('articleDictationSetup');
    if(setup) setup.style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'none';
}

// ================= 9. AI 聊天功能 =================

function switchChatMode(mode) {
    currentChatMode = mode;
    document.getElementById('modeBtnEng').classList.toggle('active', mode === 'eng');
    document.getElementById('modeBtnChn').classList.toggle('active', mode === 'chn');
    chatHistory = [{ role: "system", content: mode === 'eng' ? promptEng : promptChn }];
    const chatLog = document.getElementById('chatLog'); chatLog.innerHTML = '';
    appendChatBubble(mode === 'eng' ? "Hi! I'm your AI English coach." : "你好！我是你的中文助手。", 'ai');
}

async function sendChatMessage(overrideText = null) {
    const inputEl = document.getElementById('chatMsgInput');
    const userText = overrideText || inputEl.value.trim();
    if (!userText) return;
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) { alert("请配置 API Key"); return; }

    appendChatBubble(userText, 'user');
    inputEl.value = ''; chatHistory.push({ role: "user", content: userText });
    const loadingId = appendChatBubble("⏳ Thinking...", 'ai');

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: chatHistory })
        });
        const data = await response.json();
        const aiRawText = data.choices[0].message.content;
        chatHistory.push({ role: "assistant", content: aiRawText });
        renderAndSpeakAiResponse(aiRawText, loadingId);
    } catch (e) { updateChatBubble(loadingId, "Error."); }
}

function renderAndSpeakAiResponse(rawText, bubbleId) {
    let correctionText = ""; let replyText = rawText;
    if (currentChatMode === 'eng') {
        const match = rawText.match(/<纠错>([\s\S]*?)<\/纠错>/);
        if (match) { correctionText = match[1]; replyText = rawText.replace(/<纠错>[\s\S]*?<\/纠错>/, ''); }
    }
    const safeText = encodeURIComponent(replyText.replace(/[\u4e00-\u9fa5]/g, ''));
    let html = correctionText ? `<div class="chat-correction">${correctionText}</div>` : "";
    html += `<div class="chat-reply">${replyText} <button class="btn-play-reply" data-text="${safeText}" onclick="playAiSpeech(this)">🔊</button></div>`;
    updateChatBubble(bubbleId, html);
    window.playAiSpeech({ getAttribute: () => safeText });
}

function startChatVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("不支持语音。");
    const rec = new SR(); rec.lang = currentChatMode === 'eng' ? 'en-US' : 'zh-CN';
    rec.start();
    rec.onresult = (e) => { sendChatMessage(e.results[0][0].transcript); };
}

function saveApiKey() {
    const key = document.getElementById('siliconApiKey').value.trim();
    if (key.startsWith("sk-")) {
        localStorage.setItem('silicon_api_key', key);
        document.getElementById('apiKeyStatus').innerText = "✅ 已保存";
        setTimeout(() => { toggleSettings(); }, 600);
    }
}

function playAiSpeech(btn) {
    const text = decodeURIComponent(typeof btn === 'string' ? btn : btn.getAttribute('data-text'));
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = currentChatMode === 'eng' ? 'en-US' : 'zh-CN';
    window.speechSynthesis.speak(utt);
}

function appendChatBubble(text, sender) {
    const chatLog = document.getElementById('chatLog'); const id = "msg-" + Date.now();
    const div = document.createElement('div'); div.className = `chat-bubble bubble-${sender}`; div.id = id; div.innerHTML = text; 
    chatLog.appendChild(div); chatLog.scrollTop = chatLog.scrollHeight; return id;
}

function updateChatBubble(id, html) {
    const div = document.getElementById(id); if (div) div.innerHTML = html;
}

function switchTab(tab) {
    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + tab).classList.add('active');
    document.getElementById('btn-' + tab).classList.add('active');
}

function toggleSettings() {
    const s = document.getElementById('settingsCard');
    s.style.display = s.style.display === 'none' ? 'block' : 'none';
}

// ================= 10 词智能成文逻辑 =================

async function generateGroupStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) {
        alert("请先在‘互动聊天’版块设置并保存 API Key！");
        return;
    }

    // 1. 获取当前组的 10 个单词
    const bounds = getGroupBounds();
    const currentWords = [];
    for (let i = bounds.start; i <= bounds.end; i++) {
        if (wordList[i]) {
            currentWords.push(wordList[i].en);
        }
    }

    if (currentWords.length === 0) {
        alert("当前组没有单词，无法生成故事。");
        return;
    }

    // 2. UI 反馈
    const storyArea = document.getElementById('groupStoryArea');
    const storyContent = document.getElementById('groupStoryContent');
    storyArea.style.display = 'block';
    storyContent.innerText = `正在为这 10 个单词构思情境：\n[ ${currentWords.join(", ")} ] ...`;
    
    // 自动滚动到显示区域
    storyArea.scrollIntoView({ behavior: 'smooth' });

    // 3. 构建 Prompt
    const prompt = `你是一位专业的英语老师。请使用以下 10 个单词编写一段连贯、有逻辑且地道的英语短文（约 100-150 词）：
    单词列表：[${currentWords.join(", ")}]。
    
    要求：
    1. 故事内容要有趣、生活化或励志。
    2. 必须包含所有这 10 个单词，并在文中将这些单词用 **粗体** 标注。
    3. 在短文下方提供准确的中文对照翻译。
    
    格式如下：
    (英文短文内容)
    ---
    (中文翻译内容)`;

    // 4. 调用 AI 接口
    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-7B-Instruct', // 使用 Qwen 模型
                messages: [
                    { role: "system", content: "你是一个擅长情境化教学的英语助教。" },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) throw new Error("AI 响应失败");

        const data = await response.json();
        const fullText = data.choices[0].message.content;

        // 5. 渲染结果（处理换行和粗体）
        storyContent.innerHTML = fullText
            .replace(/\n/g, '<br>') // 换行符转为 HTML 换行
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e67e22;">$1</strong>'); // 粗体变色

    } catch (error) {
        console.error(error);
        storyContent.innerText = "⚠️ 生成失败，请检查网络或 API Key。";
    }
}

// 联动功能：将生成的 AI 故事发送到“文章跟读”板块
function transferGroupStoryToArticle() {
    const storyHtml = document.getElementById('groupStoryContent').innerHTML;
    if (!storyHtml || storyHtml.includes("正在构思")) return;

    // 解析出英文部分（分割线之前的内容）
    const parts = document.getElementById('groupStoryContent').innerText.split('---');
    const englishText = parts[0].trim();
    const chineseText = parts.length > 1 ? parts[1].trim() : "";

    // 切换到文章板块
    switchTab('articles');

    // 注入内容到文章显示区
    const articleDisplay = document.getElementById('articleDisplay');
    articleDisplay.innerHTML = `
        <div style="border-left: 4px solid #8e44ad; padding-left: 10px; background: #fdf6ff;">
            <p style="color: #8e44ad; font-weight: bold; font-size: 14px;">✨ AI 生成组故事：</p>
            <p style="font-weight: 500;">${englishText}</p>
            <p style="color: #7f8c8d; font-size: 14px; margin-top: 10px;">${chineseText}</p>
        </div>
    `;

    // 更新全局变量以便进行跟读和听写
    currentArticleText = englishText;
    
    // 重置听写模块
    quitArticleDictation();
    
    // 提示用户
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
