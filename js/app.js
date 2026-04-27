/**
AI 英语私教 - 终极功能整合版 (已彻底修复所有语法错误)
包含：基础控制、单词练习、拼写测验、1247看板、AI故事、记忆宫殿、文章听写、AI对话、生词本管理、云同步、账号鉴权
*/
// ================= [0] 配置区 =================
const SB_URL = 'https://bhilewmilbhxowxwwyfq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWxld21pbGJoeG93eHd3eWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYyNTUsImV4cCI6MjA5MjUzMjI1NX0._Kj-4i2KTU7LO07AwNkKAta-0qluh4BygU_OMwAKc6o';
let supabaseClient = null;
try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
    console.log("✅ Supabase 客户端已就绪");
    initAuthListener();
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
let activeUtterance = null;
let isMistakeReviewMode = false;
let mistakeReviewList = [];
let mistakeReviewIdx = 0;
let currentBookPath = localStorage.getItem('selected_book_path') || 'default';

// ================= [2] 统一初始化入口（唯一） =================
(function initApp() {
  // 1. 保留其他脚本可能绑定的 onload
  const originalOnload = window.onload;
  
  window.onload = function() {
    if (originalOnload) originalOnload();
    
    console.log("🚀 程序开始加载...");
    
    // 2. 恢复上次选择的课本
    const bookSel = document.getElementById('bookSelect');
    if(bookSel) bookSel.value = currentBookPath;

    // 3. Supabase 鉴权监听
    if (supabaseClient) {
      supabaseClient.auth.onAuthStateChange((event, session) => {
        const authSection = document.getElementById('authSection');
        const userSection = document.getElementById('userSection');
        if (session) {
          if(authSection) authSection.style.display = 'none';
          if(userSection) userSection.style.display = 'block';
          const emailEl = document.getElementById('userEmailDisplay');
          if(emailEl) emailEl.innerText = "已登录: " + session.user.email;
          setTimeout(pullFromCloud, 500);
        } else {
          if(authSection) authSection.style.display = 'block';
          if(userSection) userSection.style.display = 'none';
        }
      });
    }

    // 4. 加载核心数据
    loadAllData();
    
    // 5. 恢复 API Key 设置
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
      const keyInput = document.getElementById('siliconApiKey');
      const keyStatus = document.getElementById('apiKeyStatus');
      const settingsCard = document.getElementById('settingsCard');
      if(keyInput) keyInput.value = savedKey;
      if(keyStatus) { keyStatus.innerText = "✅ API Key 已读取"; keyStatus.style.color = "#27ae60"; }
      if(settingsCard) settingsCard.style.display = 'none';
    }

    // 6. 初始化认证监听（恢复上次邮箱 + 状态监听）
    initAuthListener();

    // 7. 初始化 UI 状态
    switchTab('words'); 
    switchChatMode('eng');
    updateDailyDashboard();
    
    // 8. 定时任务
    setInterval(updateDailyDashboard, 10000);
    setInterval(() => {
      const val = document.getElementById('groupSelect')?.value;
      const gNum = val === 'all' ? '全' : parseInt(val) + 1;
      const activeSpan = document.getElementById('currentActiveGNum');
      if(activeSpan) activeSpan.innerText = gNum;
    }, 500);
  };
})();


async function loadAllData() {
  let wordPath = 'NewWords.txt';
  let textPath = 'Texts.txt';
  if (currentBookPath !== 'default') {
    wordPath = `books/${currentBookPath}/NewWords.txt`;
    textPath = `books/${currentBookPath}/Texts.txt`;
  }

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
      if (wordList.length > 0) { initGroupSelect(); updateWordDisplay(); }
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
    updateDailyDashboard();
  } catch (e) {
    console.error("切换课本失败:", e);
    alert("无法加载该课本文件，请检查文件夹是否存在。");
  }
}

function changeBook() {
  const select = document.getElementById('bookSelect');
  currentBookPath = select.value;
  localStorage.setItem('selected_book_path', currentBookPath);
  currentWordIndex = 0;
  loadAllData();
  if(document.getElementById('memoryPalaceArea')) document.getElementById('memoryPalaceArea').style.display = 'none';
  if(document.getElementById('groupStoryArea')) document.getElementById('groupStoryArea').style.display = 'none';
}

// =========== [3] 单词核心控制 ===============
function initGroupSelect() {
  const select = document.getElementById('groupSelect');
  if (!select) return;
  select.innerHTML = '';
  const groupCount = Math.ceil(wordList.length / 10);
  for (let i = 0; i < groupCount; i++) {
    const start = i * 10 + 1;
    const end = Math.min((i + 1) * 10, wordList.length);
    let option = document.createElement('option');
    option.value = i;
    option.text = `📦 第 ${i + 1} 组 (${start} - ${end})`;
    select.appendChild(option);
  }
  let allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.text = `📚 全部练习 (共 ${wordList.length} 词)`;
  select.appendChild(allOption);
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
  const wordEl = document.getElementById('targetWord');
  wordEl.style.opacity = 0;
  wordEl.style.transform = "translateY(10px)";

  setTimeout(() => {
    document.getElementById('targetWord').innerText = wordList[currentWordIndex].en;
    wordEl.style.transition = "all 0.4s ease";
    wordEl.style.opacity = 1;
    wordEl.style.transform = "translateY(0)";
  }, 50);

  if (wordList.length === 0) return;
  const bounds = getGroupBounds();
  const currentWord = wordList[currentWordIndex];

  document.getElementById('targetWord').innerText = currentWord.en;
  document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;

  const chineseEl = document.getElementById('chineseMeaning');
  chineseEl.innerText = currentWord.zh;
  chineseEl.style.display = 'none';

  const exBox = document.getElementById('exampleSentence');
  let exHtml = "";
  if (currentWord.ex.includes("中文：")) {
    const parts = currentWord.ex.split("中文：");
    exHtml = `
      <div style="color: #2c3e50; font-weight: 500; margin-bottom: 8px; line-height: 1.4;">${parts[0].trim()}</div>
      <div style="color: #7f8c8d; font-size: 0.95em; border-top: 1px solid #f0f0f0; padding-top: 8px;">
        <span style="background: #eee; padding: 2px 5px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;">译</span>${parts[1].trim()}
      </div>`;
  } else {
    exHtml = `<div style="color: #2c3e50;">${currentWord.ex}</div>`;
  }
  exBox.innerHTML = exHtml;
  exBox.style.display = 'none';

  document.getElementById('wordResult').innerText = ""; 
  document.getElementById('dictationResult').innerText = "";
  document.getElementById('dictationInput').value = "";

  if (document.getElementById('dictationGroupMode').style.display === 'none') {
    document.getElementById('targetWord').style.filter = 'none';
  }
}

function changeGroup() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }
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
function toggleBlur() {
  const el = document.getElementById('targetWord');
  el.style.filter = el.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)';
}
function toggleMeaning() {
  const el = document.getElementById('chineseMeaning');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function showAndPlayExample() {
  const exBox = document.getElementById('exampleSentence');
  exBox.style.display = 'block';
  const currentWord = wordList[currentWordIndex];
  let speechText = currentWord.ex;
  if (speechText.includes("中文：")) {
    speechText = speechText.split("中文：")[0];
  }
  const englishOnly = speechText.replace(/[^\x00-\xff]/g, '').trim();
  if (englishOnly.length > 0) {
    window.speechSynthesis.cancel();
    activeUtterance = new SpeechSynthesisUtterance(englishOnly);
    activeUtterance.lang = 'en-US'; 
    window.speechSynthesis.speak(activeUtterance);
  }
}
function readTargetWord() {
  window.speechSynthesis.cancel();
  const wordEl = document.getElementById('targetWord');
  if (wordEl) wordEl.style.filter = 'none';
  if (wordList[currentWordIndex]) {
    activeUtterance = new SpeechSynthesisUtterance(wordList[currentWordIndex].en);
    activeUtterance.lang = 'en-US';
    window.speechSynthesis.speak(activeUtterance);
  }
}
function startListeningForWord() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return alert("请使用 Safari 或 Chrome。");
  const rec = new SR(); rec.lang = 'en-US';
  const resEl = document.getElementById('wordResult');
  resEl.innerText = "正在聆听..."; rec.start();
  rec.onresult = (e) => {
    const spoken = e.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim();
    const target = wordList[currentWordIndex].en.toLowerCase().trim();
    if (spoken === target) { resEl.style.color= "#27ae60"; resEl.innerHTML= `✅ 完美: "${spoken}"`; }
    else { resEl.style.color= "#e74c3c"; resEl.innerHTML= `❌ 差一点: "${spoken}"`; }
  };
}
function checkDictation() {
  const input = document.getElementById('dictationInput').value.toLowerCase().trim();
  const target = wordList[currentWordIndex].en.toLowerCase().trim();
  const resEl = document.getElementById('dictationResult');
  if (!input) return;
  if (input === target) {
    resEl.style.color="#27ae60"; resEl.innerText="✅ 正确！";
    document.getElementById('targetWord').style.filter="none";
    setTimeout(nextWord, 1500);
  } else { resEl.style.color="#e74c3c"; resEl.innerText="❌ 错误。"; }
}

// ================= [4] 单词组测验逻辑 =================
let groupTestAnswers = [];
let groupTestCurrentIndex = 0;
let groupTestBounds = null;

function startGroupTest() {
  if (isMistakeReviewMode) return;
  if (wordList.length === 0) return;
  groupTestBounds = getGroupBounds(); 
  groupTestAnswers = []; 
  groupTestCurrentIndex = 0;
  document.getElementById('dictationSingleMode').style.display = 'none';
  document.getElementById('dictationGroupMode').style.display = 'block';
  document.getElementById('dictationResultMode').style.display = 'none';
  const wordEl = document.getElementById('targetWord');
  if (wordEl) wordEl.style.filter = 'blur(8px)';
  playTestWord();
}
function playTestWord() {
  const word = wordList[groupTestBounds.start + groupTestCurrentIndex].en;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  window.speechSynthesis.speak(u);
  document.getElementById('targetWord').style.filter = 'blur(8px)';
  document.getElementById('groupTestProgress').innerText = `测验中: ${groupTestCurrentIndex + 1} / ${groupTestBounds.total}`;
  setTimeout(() => document.getElementById('groupTestInput').focus(), 200);
}

function submitTestWord() {
  const val = document.getElementById('groupTestInput').value.trim();
  if (!val) return;

  if (isMistakeReviewMode) {
    const target = mistakeReviewList[mistakeReviewIdx];
    const isCorrect = val.toLowerCase() === target.en.toLowerCase();
    if (isCorrect) syncMistakeBook(target, true);
    mistakeReviewIdx++;
    if (mistakeReviewIdx < mistakeReviewList.length) {
      document.getElementById('groupTestProgress').innerText = `📖 生词本复习: ${mistakeReviewIdx + 1} / ${mistakeReviewList.length}`;
      document.getElementById('groupTestInput').value = "";
      playMistakeWord();
    } else {
      showMistakeReviewResult();
    }
  } else {
    groupTestAnswers.push(val);
    document.getElementById('groupTestInput').value = "";
    groupTestCurrentIndex++;
    if (groupTestCurrentIndex < groupTestBounds.total) playTestWord();
    else showGroupTestResult();
  }
}

function getMistakeBook() { return JSON.parse(localStorage.getItem('eng_mistake_book') || '[]'); }
function syncMistakeBook(wordObj, isCorrect) {
  if (!wordObj || !wordObj.en) return;
  let book = getMistakeBook();
  if (isCorrect) {
    book = book.filter(w => w.en.toLowerCase() !== wordObj.en.toLowerCase());
  } else {
    if (!book.some(w => w.en.toLowerCase() === wordObj.en.toLowerCase())) {
      book.push({ en: wordObj.en, zh: wordObj.zh, addedAt: Date.now() });
    }
  }
  localStorage.setItem('eng_mistake_book', JSON.stringify(book));
}

function exportMistakeBook() {
  const book = getMistakeBook();
  if (book.length === 0) return alert("📖 生词本为空，暂无可导出的单词。");
  let csvContent = "data:text/csv;charset=utf-8,\uFEFFWord,Chinese,Added Date\n";
  book.forEach(w => {
    const date = new Date(w.addedAt).toLocaleDateString();
    csvContent += `"${w.en.replace(/"/g, '""')}","${w.zh.replace(/"/g, '""')}","${date}"\n`;
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `生词本_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function startMistakeBookReview() {
  mistakeReviewList = getMistakeBook();
  if (mistakeReviewList.length === 0) return alert("📖 生词本为空，请先在测验中积累生词！");
  isMistakeReviewMode = true;
  mistakeReviewIdx = 0;
  document.getElementById('dictationSingleMode').style.display = 'none';
  document.getElementById('dictationGroupMode').style.display = 'block';
  document.getElementById('dictationResultMode').style.display = 'none';
  document.getElementById('groupTestProgress').innerText = `📖 生词本复习: ${mistakeReviewIdx + 1} / ${mistakeReviewList.length}`;
  document.getElementById('targetWord').style.filter = 'blur(8px)';
  playMistakeWord();
}
function playMistakeWord() {
  const word = mistakeReviewList[mistakeReviewIdx].en;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  window.speechSynthesis.speak(u);
  document.getElementById('targetWord').style.filter = 'blur(8px)';
  document.getElementById('groupTestInput').value = "";
  setTimeout(() => document.getElementById('groupTestInput').focus(), 200);
}
function showMistakeReviewResult() { alert("🎉 生词本本轮复习完成！已掌握的单词已自动移除。"); updateDailyDashboard(); quitMistakeReview(); }
function quitMistakeReview() {
  isMistakeReviewMode = false;
  document.getElementById('dictationGroupMode').style.display = 'none';
  document.getElementById('dictationResultMode').style.display = 'none';
  document.getElementById('dictationSingleMode').style.display = 'block';
  document.getElementById('targetWord').style.filter = 'none';
  updateWordDisplay();
}

function showGroupTestResult() {
  document.getElementById('dictationGroupMode').style.display = 'none';
  document.getElementById('dictationResultMode').style.display = 'block';
  let correct = 0; let html = "";
  for (let i=0; i < groupTestBounds.total; i++) {
    const target = wordList[groupTestBounds.start + i];
    const userAnswer = groupTestAnswers[i] || "";
    const isOk = userAnswer.toLowerCase().trim() === target.en.toLowerCase().trim();
    syncMistakeBook(target, isOk);
    if (isOk) correct++;
    html += `<li class="${isOk?'correct-item':'incorrect-item'}"><b>${target.en}</b>: ${isOk?'✅':'❌ 你写了: '+userAnswer}<br><small>${target.zh}</small></li>`;
  }
  document.getElementById('groupTestScore').innerText = `正确率: ${Math.round(correct/groupTestBounds.total*100)}%`;
  document.getElementById('groupTestResultList').innerHTML = html;
}
function quitGroupTest() {
  document.getElementById('dictationGroupMode').style.display = 'none';
  document.getElementById('dictationResultMode').style.display = 'none';
  document.getElementById('dictationSingleMode').style.display = 'block';
  const wordEl = document.getElementById('targetWord');
  if (wordEl) wordEl.style.filter = 'none';
}

// ================= [5] 1247 看板与云同步 =================
function getLocalDateString(date) {
  let y = date.getFullYear();
  let m = (date.getMonth() + 1).toString().padStart(2, '0');
  let d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function pushToCloud() {
  if (!supabaseClient) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  const progressData = {
    eng_study_history: localStorage.getItem('eng_study_history') || '{}',
    selected_book_path: localStorage.getItem('selected_book_path') || 'default',
    silicon_api_key: localStorage.getItem('silicon_api_key') || '',
    eng_mistake_book: localStorage.getItem('eng_mistake_book') || '[]'
  };
  const { error } = await supabaseClient.from('user_progress').upsert({ id: user.id, data: progressData });
  if (error) console.error('☁️ 云端同步失败:', error);
  else console.log('✅ 进度已成功推送到云端');
}

async function pullFromCloud() {
  if (!supabaseClient) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  const { data, error } = await supabaseClient.from('user_progress').select('data').eq('id', user.id).single();
  if (error && error.code !== 'PGRST116') { console.error('☁️ 拉取失败:', error); return; }
  if (data && data.data) {
    let changed = false;
    const cloud = data.data;
    for (const key in cloud) {
      if (cloud[key] !== null && cloud[key] !== undefined) {
        if (localStorage.getItem(key) !== cloud[key]) {
          localStorage.setItem(key, cloud[key]);
          changed = true;
        }
      }
    }
    if (changed) {
      console.log('✅ 已从云端拉取最新进度，自动刷新中...');
      updateDailyDashboard();
      setTimeout(() => loadAllData(), 300);
    }
  }
}

function markCurrentGroupFinished() {
  const val = document.getElementById('groupSelect').value;
  if (val === 'all') return alert("请选择具体组。");
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
  alert("🎉 记录成功！复习清单已更新。");
  updateDailyDashboard();
  pushToCloud();
}

function updateDailyDashboard() {
  const dashboard = document.getElementById('taskList');
  if (!dashboard) return;
  const today = new Date(); today.setHours(0,0,0,0);
  document.getElementById('todayDate').innerText = getLocalDateString(today);
  let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
  let tasks = [];
  let maxG = 0; Object.keys(history).forEach(g => { if(parseInt(g) > maxG) maxG = parseInt(g); });
  tasks.push(`🆕 <b>新课：</b> 第 <a href="#" onclick="jumpToGroup(${maxG})" style="color:#f1c40f; font-weight:bold;">${maxG+1}</a> 组`);
  let review = [];
  for (let g in history) {
    const parts = history[g].split('-');
    const d = new Date(parts[0], parts[1]-1, parts[2]);
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
    if ([1, 3, 6].includes(diff)) review.push(`<a href="#" onclick="jumpToGroup(${g-1})" style="color:#f1c40f; font-weight:bold; margin-right:8px;">第 ${g} 组</a>`);
  }
  if (review.length) tasks.push(`<br>🔄 <b>必复习：</b> ${review.reverse().join('')}`);

  const mistakeBook = getMistakeBook();
  const mistakeCount = mistakeBook.length;
  if (mistakeCount > 0) {
    tasks.push(`<br>📖 <b>生词本：</b> 当前共 <span style="color:#e74c3c; font-weight:bold;">${mistakeCount}</span> 个待攻克单词
    <button onclick="startMistakeBookReview()" style="margin-left:6px; padding:2px 8px; font-size:11px; background:#3498db; color:white; border:none; border-radius:4px; cursor:pointer;">🎯 独立复习</button>
    <button onclick="exportMistakeBook()" style="margin-left:4px; padding:2px 8px; font-size:11px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer;">📤 导出CSV</button>`);
  } else {
    tasks.push(`<br>📖 <b>生词本：</b> 🌟 太棒了！暂无生词`);
  }
  dashboard.innerHTML = tasks.join('');
}
function jumpToGroup(idx) { document.getElementById('groupSelect').value = idx; changeGroup(); }

// ================= [6] AI 故事与宫殿生成 =================
async function generateRevisionStory() {
  const apiKey = localStorage.getItem('silicon_api_key');
  if (!apiKey) return alert("请先在设置中保存 API Key");
  let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
  const today = new Date(); today.setHours(0,0,0,0);
  let selectedWords = [];
  for (let gNum in history) {
    const dateParts = history[gNum].split('-');
    const studyDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const diffDays = Math.round((today.getTime() - studyDate.getTime()) / 86400000);
    if ([1, 3, 6].includes(diffDays)) {
      let start = (parseInt(gNum) - 1) * 10;
      let end = Math.min(start + 9, wordList.length - 1);
      for (let i = start; i <= end; i++) { if(wordList[i]) selectedWords.push(wordList[i].en); }
    }
  }
  if (selectedWords.length === 0) {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return alert("今日暂无复习任务，请先选择一个具体的组进行预习/学习。");
    let start = parseInt(val) * 10;
    let end = Math.min(start + 9, wordList.length - 1);
    for (let i = start; i <= end; i++) { if(wordList[i]) selectedWords.push(wordList[i].en); }
  }
  const btn = document.getElementById('btnGenStory');
  const box = document.getElementById('aiStoryContent');
  btn.innerText = "⏳ AI 正在针对任务编写故事...";
  box.style.display = "block";
  box.innerHTML = "正在串联单词: " + selectedWords.slice(0, 5).join(", ") + "...";
  const prompt = `你是一位英语私教。请使用以下单词编写一段连贯、地道的英语故事（约150词）。要求单词加粗显示，并在文末附带中文翻译（用 --- 分隔）：[${selectedWords.join(", ")}]`;
  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{role: "user", content: prompt}], temperature: 0.7 })
    });
    const data = await response.json();
    const content = data.choices[0].message.content;
    box.innerHTML = content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b style="color:#e67e22;">$1</b>');
    document.getElementById('btnShadowStory').style.display = 'block';
    btn.innerText = "🪄 重新生成 AI 故事";
  } catch (e) {
    box.innerHTML = "❌ 生成失败，请检查 API Key 或网络。";
    btn.innerText = "🪄 生成今日复习词汇 AI 短文";
  }
}

function generateGroupMemoryPalace() {
  const bounds = getGroupBounds();
  if (wordList.length === 0) { alert("词库尚未加载，请稍后再试。"); return; }
  const palaceArea = document.getElementById('memoryPalaceArea');
  const palaceContent = document.getElementById('palaceContent');
  if (!palaceArea || !palaceContent) { alert("页面缺少显示区域（memoryPalaceArea）"); return; }
  let htmlContent = "";
  let foundCount = 0;
  for (let i = bounds.start; i <= bounds.end; i++) {
    const wordObj = wordList[i];
    if (wordObj) {
      foundCount++;
      const hookText = wordObj.hook || "（该词暂无预存钩子）";
      htmlContent += `<div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #eee;"><strong style="color: #d35400;">${foundCount}. ${wordObj.en}</strong> <span style="color: #7f8c8d; font-size: 0.9em;">[${wordObj.zh}]</span><div style="margin-top: 4px; color: #333; line-height: 1.5;">${hookText.replace('[💡记忆宫殿', '<b style="color:#2980b9;">[💡记忆宫殿</b>')}</div></div>`;
    }
  }
  if (foundCount > 0) {
    palaceArea.style.display = 'block';
    palaceContent.innerHTML = htmlContent;
    palaceArea.scrollIntoView({ behavior: 'smooth' });
  } else { alert("当前选中的组没有找到单词。"); }
}
function closeMemoryPalace() {
  const palaceArea = document.getElementById('memoryPalaceArea');
  if (palaceArea) {
    palaceArea.style.display = 'none';
    const wordDisplay = document.getElementById('page-words');
    if (wordDisplay) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
function transferStoryToArticle() {
  const text = document.getElementById('aiStoryContent').innerText;
  const parts = text.split('---');
  currentArticleText = parts[0].trim();
  switchTab('articles');
  document.getElementById('articleDisplay').innerHTML = `<div style="border-left:4px solid #8e44ad; padding-left:10px;"><b>AI故事：</b><br>${parts[0]}<hr><small>${parts[1]||""}</small></div>`;
  quitArticleDictation();
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
  const startSel = document.getElementById('articleStartSelect');
  const endSel = document.getElementById('articleEndSelect');
  let startIdx = parseInt(startSel.value);
  let endIdx = parseInt(endSel.value);
  if (startIdx > endIdx) { endIdx = startIdx; endSel.value = endIdx; }
  const selected = articleList.slice(startIdx, endIdx + 1);
  if (selected.length === 0) { document.getElementById('articleDisplay').innerHTML = "未选中有效段落"; return; }
  document.getElementById('articleDisplay').innerHTML = selected.map(item => `<div style="margin-bottom:12px;">${item.en}<br><small style="color:#7f8c8d">${item.zh}</small></div>`).join('');
  currentArticleText = selected.map(item => item.en).join(' ');
  document.getElementById('diffResult').style.display = 'none';
  quitArticleDictation();
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
  if (!SR) return alert("您的浏览器不支持语音识别");
  const recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  const box = document.getElementById('diffResult');
  const con = document.getElementById('diffContent');
  box.style.display = 'block';
  box.style.borderColor = '#e67e22';
  con.innerHTML = "🎤 <strong>请开始朗读...</strong>";
  recognition.start();
  recognition.onresult = (e) => {
    const spoken = e.results[0][0].transcript;
    const diffHTML = compareSentences(currentArticleText, spoken);
    box.style.borderColor = '#27ae60';
    con.innerHTML = `<div style="margin-bottom: 10px; color: #7f8c8d; font-size: 14px; border-bottom: 1px dashed #eee; padding-bottom:5px;"><b>AI 听到的内容：</b><br>"${spoken}"</div><div style="line-height: 1.8;"><b>比对结果（绿色为准确，红色为错漏）：</b><br>${diffHTML}</div>`;
  };
  recognition.onerror = () => { box.style.borderColor = '#e74c3c'; con.innerHTML = "⚠️ 没听清，请点击按钮重试。"; };
}
function compareSentences(original, spoken) {
  let origWords = original.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
  let spokenWords = spoken.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
  let originalRawWords = original.split(/\s+/);
  let resultHTML = [];
  let spokenIdx = 0;
  for (let i = 0; i < origWords.length; i++) {
    if (!origWords[i]) continue;
    let found = false;
    for (let j = spokenIdx; j < Math.min(spokenIdx + 3, spokenWords.length); j++) {
      if (origWords[i] === spokenWords[j]) { found = true; spokenIdx = j + 1; break; }
    }
    if (found) resultHTML.push(`<span style="color: #27ae60; font-weight: bold;">${originalRawWords[i]}</span>`);
    else resultHTML.push(`<span style="color: #e74c3c; text-decoration: line-through;">${originalRawWords[i]}</span>`);
  }
  return resultHTML.join(' ');
}
function startArticleDictation() {
  articleSentences = currentArticleText.match(/[^.!?\n]+[.!?\n]+/g) || [currentArticleText];
  articleSentences = articleSentences.map(s => s.trim()).filter(s => s.length > 0);
  currentSentenceIdx = 0;
  document.getElementById('articleDictationSetup').style.display = 'none';
  document.getElementById('articleDictationRunning').style.display = 'block';
  document.getElementById('articleDisplay').style.filter = 'blur(8px)';
  updateArticleDictProgress(); playCurrentSentence();
}
function updateArticleDictProgress() { document.getElementById('articleDictProgress').innerText = `听写中: ${currentSentenceIdx+1} / ${articleSentences.length}`; }
function playCurrentSentence() {
  clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
  const s = articleSentences[currentSentenceIdx];
  const hint = document.getElementById('timerHint');
  hint.innerText = "🔊 第一遍播放...";
  const u = new SpeechSynthesisUtterance(s); u.lang = 'en-US';
  u.onend = () => { hint.innerText = "⏳ 10秒后重播..."; sentenceReplayTimer = setTimeout(() => { hint.innerText = "🔊 第二遍播放..."; window.speechSynthesis.speak(u); }, 10000); };
  window.speechSynthesis.speak(u);
  setTimeout(()=>document.getElementById('articleDictInput').focus(), 200);
}
function checkArticleDictation() {
  clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
  const ans = articleSentences[currentSentenceIdx];
  const input = document.getElementById('articleDictInput').value.trim();
  const res = document.getElementById('articleDictResult');
  res.style.display = 'block';
  res.innerHTML = `你写了: ${input}<br>正确答案: <b>${ans}</b>`;
  document.getElementById('btnNextSentence').style.display = 'block';
}
function nextDictationSentence() {
  currentSentenceIdx++;
  if (currentSentenceIdx >= articleSentences.length) { alert("🎉 全部完成！"); quitArticleDictation(); }
  else {
    document.getElementById('articleDictResult').style.display = 'none';
    document.getElementById('btnNextSentence').style.display = 'none';
    document.getElementById('articleDictInput').value = "";
    updateArticleDictProgress(); playCurrentSentence();
  }
}
function quitArticleDictation() {
  clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
  document.getElementById('articleDictationRunning').style.display = 'none';
  document.getElementById('articleDictationSetup').style.display = 'block';
  document.getElementById('articleDisplay').style.filter = 'none';
}

// ================= [8] AI 对话 =================
function switchChatMode(mode) {
  currentChatMode = mode;
  document.getElementById('modeBtnEng').classList.toggle('active', mode==='eng');
  document.getElementById('modeBtnChn').classList.toggle('active', mode==='chn');
  document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${mode==='eng'?'Hi! I am your English teacher.':'你好！有什么我可以帮你的？'}</div>`;
  chatHistory = [{role:"system", content: mode==='eng'?'You are a friendly English teacher. Correct grammar only if it is a major mistake using <纠错>标签.':'你是全能中文助手。'}];
}
async function sendChatMessage() {
  const input = document.getElementById('chatMsgInput');
  const txt = input.value.trim(); if(!txt) return;
  const key = localStorage.getItem('silicon_api_key');
  if(!key) return alert("请存 Key");
  appendChatBubble(txt, 'user');
  input.value = ""; chatHistory.push({role: "user", content:txt});
  const loadingId = appendChatBubble("⏳ ...", 'ai');
  try {
    const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: chatHistory})
    });
    const data = await res.json();
    const aiTxt = data.choices[0].message.content;
    chatHistory.push({role: "assistant", content:aiTxt});
    updateChatBubble(loadingId, aiTxt);
  } catch(e) { updateChatBubble(loadingId, "Error"); }
}

// ================= [9] 辅助功能 & 登录/退出 =================
function switchTab(tabName) {
  document.querySelectorAll('.page-section').forEach(page => { page.classList.remove('active'); page.style.display = 'none'; });
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activePage = document.getElementById('page-' + tabName);
  const activeBtn = document.getElementById('btn-' + tabName);
  if (activePage) { activePage.classList.add('active'); activePage.style.display = 'block'; }
  if (activeBtn) activeBtn.classList.add('active');
  const bookSelector = document.getElementById('bookSelectorContainer');
  if (bookSelector) {
    if (tabName === 'chat') bookSelector.setAttribute('style', 'display: none !important');
    else bookSelector.setAttribute('style', 'margin-bottom: 15px; background: #e3e3e8; border-radius: 12px; padding: 10px; border: none; display: block;');
  }
}
function appendChatBubble(t, s) {
  const id = "msg-" + Date.now();
  const div = document.createElement('div');
  div.className = `chat-bubble bubble-${s}`; div.id = id; div.innerText = t;
  document.getElementById('chatLog').appendChild(div);
  return id;
}
function updateChatBubble(id, t) { document.getElementById(id).innerText = t; }
function toggleSettings() { const s = document.getElementById('settingsCard'); s.style.display = s.style.display === 'none' ? 'block' : 'none'; }
function saveApiKey() { const k = document.getElementById('siliconApiKey').value.trim(); localStorage.setItem('silicon_api_key', k); alert("保存成功"); toggleSettings(); }
function startChatVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return alert("您的浏览器不支持语音识别，请在 iPhone Safari 或 Chrome 浏览器中使用。");
  const recognition = new SpeechRecognition();
  recognition.lang = (currentChatMode === 'eng') ? 'en-US' : 'zh-CN';
  const inputEl = document.getElementById('chatMsgInput');
  const originalPlaceholder = inputEl.placeholder;
  inputEl.placeholder = "🎤 正在聆听，请说话...";
  recognition.start();
  recognition.onresult = function(event) { inputEl.value = event.results[0][0].transcript; inputEl.placeholder = originalPlaceholder; sendChatMessage(); };
  recognition.onerror = function(event) { console.error("语音识别错误:", event.error); inputEl.placeholder = "⚠️ 没听清，请重试..."; setTimeout(() => { inputEl.placeholder = originalPlaceholder; }, 2000); };
  recognition.onend = function() { if (inputEl.placeholder.includes("正在聆听")) inputEl.placeholder = originalPlaceholder; };
}

// 📖 [10] 账号登录/退出逻辑 (魔法链接 + 云端同步)
async function handleLogin() {
  if (!supabaseClient) {
    alert("❌ 云端服务未连接，请刷新页面重试");
    return;
  }
  const emailInput = document.getElementById('syncEmail');
  const email = emailInput?.value.trim();
  if (!email) {
    alert("📧 请输入邮箱地址");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert("⚠️ 请输入有效的邮箱地址");
    return;
  }
  const btn = document.querySelector('button[onclick="handleLogin()"]');
  const originalText = btn ? btn.innerText : "发送登录链接";
  if (btn) {
    btn.disabled = true;
    btn.innerText = "⏳ 发送中...";
  }
  try {
    const redirectUrl = window.location.origin + window.location.pathname;
    console.log("🔐 登录调试:", { email, redirectUrl });
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: redirectUrl }
    });
    if (error) {
      if (error.status === 406) {
        throw new Error("重定向地址未被允许。请在 Supabase 后台 Authentication → URL Configuration 中添加:\n" + redirectUrl);
      }
      throw error;
    }
    alert(`🎉 登录链接已发送至 ${email}\n\n1️⃣ 请查收邮件（检查垃圾邮箱）\n2️⃣ 点击邮件中的「确认登录」链接\n3️⃣ 页面将自动跳转并同步你的学习进度`);
    localStorage.setItem('last_login_email', email);
  } catch (err) {
    console.error("🔐 登录失败:", err);
    if (err.message?.includes('406') || err.message?.includes('重定向')) {
      alert(`❌ 406 错误：重定向地址未被允许\n\n✅ 解决方法：\n1. 打开 Supabase 后台 → Authentication → URL Configuration\n2. 在 "Redirect URLs" 中添加:\n${window.location.origin + window.location.pathname}*\n3. 保存后刷新页面重试`);
    } else {
      alert(`❌ 发送失败：${err.message}\n\n请检查网络连接或稍后重试。`);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = originalText;
    }
  }
}

async function handleLogout() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) alert("退出失败: " + error.message);
  else alert("👋 已退出登录");
}

function initAuthListener() {
  const lastEmail = localStorage.getItem('last_login_email');
  if (lastEmail) {
    const emailInput = document.getElementById('syncEmail');
    if (emailInput) emailInput.value = lastEmail;
  }
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log("🔐 认证状态变化:", event);
      const authSection = document.getElementById('authSection');
      const userSection = document.getElementById('userSection');
      const emailDisplay = document.getElementById('userEmailDisplay');
      if (event === 'SIGNED_IN' && session) {
        console.log("✅ 用户已登录:", session.user.email);
        if (authSection) authSection.style.display = 'none';
        if (userSection) {
          userSection.style.display = 'block';
          if (emailDisplay) emailDisplay.innerText = "👤 " + session.user.email;
        }
        console.log("⏳ 1 秒后开始同步云端数据...");
        setTimeout(async () => {
          await pullFromCloud();
          updateDailyDashboard();
          loadAllData();
        }, 1000);
      } else if (event === 'SIGNED_OUT') {
        console.log("👋 用户已退出");
        if (authSection) authSection.style.display = 'block';
        if (userSection) userSection.style.display = 'none';
      }
    });
  }
}

// ================= [11] 词成文逻辑 =================
async function generateGroupStory() {
  const apiKey = localStorage.getItem('silicon_api_key');
  if (!apiKey) { alert("请先在‘互动聊天’版块设置并保存 API Key！"); return; }
  const bounds = getGroupBounds();
  let currentWords = [];
  for (let i = bounds.start; i <= bounds.end; i++) { if (wordList[i] && wordList[i].en) currentWords.push(wordList[i].en); }
  if (currentWords.length === 0) { alert("当前组没有单词，请选一个单词组。"); return; }
  const storyArea = document.getElementById('groupStoryArea');
  const storyContent = document.getElementById('groupStoryContent');
  if (!storyArea) { alert("HTML中缺少 id='groupStoryArea' 的显示区域"); return; }
  storyArea.style.display = 'block';
  storyContent.innerText = "正在构思故事...";
  storyArea.scrollIntoView({ behavior: 'smooth' });
  const prompt = `使用以下 10 个单词编写一段连贯的英语短文（约 100 词），单词需加粗。结尾附带中文翻译，中间用 --- 分隔：[${currentWords.join(", ")}]`;
  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{ role: "user", content: prompt }], temperature: 0.7 })
    });
    const data = await response.json();
    const fullText = data.choices[0].message.content;
    storyContent.innerHTML = fullText.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e67e22;">$1</strong>');
  } catch (error) { console.error(error); storyContent.innerText = "⚠️ 生成失败，请检查网络或 API Key。"; }
}
function transferGroupStoryToArticle() {
  const storyBox = document.getElementById('groupStoryContent');
  if (!storyBox || storyBox.innerText.includes("正在构思")) return;
  const parts = storyBox.innerText.split('---');
  currentArticleText = parts[0].trim();
  switchTab('articles');
  const articleDisplay = document.getElementById('articleDisplay');
  articleDisplay.innerHTML = `<div style="border-left: 4px solid #8e44ad; padding-left: 10px; background: #fdf6ff;"><p style="color: #8e44ad; font-weight: bold;">✨ AI 单词挑战故事：</p><p>${currentArticleText}</p><p style="color: #7f8c8d; font-size: 14px;">${parts[1] || ""}</p></div>`;
  quitArticleDictation();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= 每日翻译挑战逻辑系统 =================
let translationTasks = [];
let copySentenceQueue = [];
let currentCopyCount = 0;
async function startTranslationChallenge() {
  const apiKey = localStorage.getItem('silicon_api_key');
  if (!apiKey) return alert("请先在设置中保存 API Key");
  const bounds = getGroupBounds();
  let words = [];
  for (let i = bounds.start; i <= bounds.end; i++) { if (wordList[i]) words.push(wordList[i].en); }
  document.getElementById('transSetup').style.display = 'none';
  document.getElementById('transWorking').style.display = 'block';
  const qBox = document.getElementById('transQuestions');
  qBox.innerHTML = "<p style='text-align:center; color:#8e44ad;'>⏳ AI 老师正在为你构思纯净题目...</p>";
  const prompt = `你是一位专业的英语老师。请根据以下单词：[${words.join(", ")}]，编写 3 个简单的日常中文句子。要求：1. 纯中文，严禁出现英文。2. 严格按以下格式输出（不要带括号，不要前言）：\n1. 第一句中文\n2. 第二句中文\n3. 第三句中文`;
  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{ role: "system", content: "你是一个翻译题目生成器，只输出中文题目内容，严禁带中括号[]或英文。" }, { role: "user", content: prompt }], temperature: 0.7 })
    });
    const data = await response.json();
    const content = data.choices[0].message.content;
    const rawLines = content.split('\n').filter(l => l.trim().length > 2);
    translationTasks = rawLines.slice(0, 3).map(l => ({ cn: l.replace(/[\[\]]/g, '').replace(/^\d+[\.、\s]+/, '').trim(), userEn: '', correctEn: '' }));
    qBox.innerHTML = translationTasks.map((t, i) => `<div style="margin-bottom:15px; border-bottom:1px solid #f0f0f0; padding-bottom:10px;"><p style="font-size:16px; color:#333;"><b>Q${i+1}:</b> ${t.cn}</p><input type="text" class="trans-user-input" data-idx="${i}" placeholder="尝试用学过的单词翻译..." style="border: 1px solid #007AFF;"></div>`).join('');
  } catch (e) { console.error(e); alert("出题失败，请重试"); resetTranslationSection(); }
}
async function gradeTranslations() {
  const apiKey = localStorage.getItem('silicon_api_key');
  if (!apiKey) return alert("请先设置 API Key");
  const inputs = document.querySelectorAll('.trans-user-input');
  inputs.forEach(input => { const idx = input.getAttribute('data-idx'); translationTasks[idx].userEn = input.value.trim(); });
  const btn = document.getElementById('btnSubmitTrans');
  btn.innerText = "⏳ 正在阅卷（防乱码模式）..."; btn.disabled = true;
  const prompt = `Task: Translate these 3 sentences into simple English.\n${translationTasks[0].cn}\n${translationTasks[1].cn}\n${translationTasks[2].cn}\nInstructions: Output ONLY 3 lines. One English sentence per line. NO Chinese, NO symbols, NO repeated words.`;
  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{ role: "system", content: "You are a translation machine. You only output 3 lines of plain English text. No repetition. No chatter." }, { role: "user", content: prompt }], temperature: 0.1, top_p: 0.1, frequency_penalty: 1.5, max_tokens: 300 })
    });
    const data = await response.json();
    let aiRaw = data.choices[0].message.content.trim();
    let lines = aiRaw.split('\n').filter(l => l.trim().length > 5);
    const resBox = document.getElementById('transResult');
    const compareArea = document.getElementById('transComparisonArea');
    resBox.style.display = 'block';
    let html = '<h3 style="margin-top:0; color:#e67e22; font-size:16px;">📋 精准批改结果：</h3>';
    copySentenceQueue = [];
    translationTasks.forEach((t, i) => {
      let rawText = lines[i] || "AI is busy, please submit again.";
      let words = rawText.replace(/[\[\]"]/g, '').split(/\s+/);
      let cleanedWords = [];
      for (let j = 0; j < words.length; j++) { if (j > 0 && words[j].toLowerCase() === words[j-1].toLowerCase()) continue; cleanedWords.push(words[j]); }
      let correctText = cleanedWords.join(' ').replace(/[\u4e00-\u9fa5]/g, '').trim();
      if (correctText.split(' ').length > 30) correctText = "The teacher is tired. Please click submit again.";
      t.correctEn = correctText;
      copySentenceQueue.push(correctText);
      html += `<div style="margin-bottom:12px; border:1px solid #eee; padding:12px; border-radius:12px; background:white;"><div style="font-size:13px; color:#8E8E93; margin-bottom:5px;">句 ${i+1}: ${t.cn}</div><div style="display:flex; gap:10px;"><div style="flex:1; border-right:1px solid #f0f0f0; padding-right:8px;"><small style="color:#e74c3c; font-weight:bold;">你的回答</small><br><span style="font-size:14px; color:#333;">${t.userEn || "(未填写)"}</span></div><div style="flex:1; padding-left:5px;"><small style="color:#34C759; font-weight:bold;">地道参考</small><br><b style="font-size:15px; color:#1B5E20;">${correctText}</b></div></div></div>`;
    });
    compareArea.innerHTML = html;
    document.getElementById('transWorking').style.display = 'none';
    btn.disabled = false; btn.innerText = "✅ 提交 AI 批改";
    startCopyExercise();
  } catch (e) { console.error(e); alert("网络繁忙，请再试一次。"); btn.disabled = false; }
}
function startCopyExercise() {
  if (copySentenceQueue.length === 0) return;
  currentCopyCount = 0;
  document.getElementById('copyExerciseArea').style.display = 'block';
  updateCopyDisplay();
  document.getElementById('copyExerciseArea').scrollIntoView({ behavior: 'smooth' });
}
function updateCopyDisplay() {
  const target = copySentenceQueue[0];
  const sentenceNum = 3 - copySentenceQueue.length + 1;
  document.getElementById('copyTargetBox').innerText = target;
  document.getElementById('copyProgressText').innerText = `第 ${sentenceNum}/3 句 | 抄写进度：${currentCopyCount} / 5`;
  document.getElementById('copyInput').value = "";
  document.getElementById('copyInput').focus();
}
function handleCopyInput() {
  const inputEl = document.getElementById('copyInput');
  const inputVal = inputEl.value.trim();
  const targetVal = copySentenceQueue[0].trim();
  const cleanInput = inputVal.replace(/[.,!?'"]/g, '').toLowerCase();
  const cleanTarget = targetVal.replace(/[.,!?'"]/g, '').toLowerCase();
  if (cleanInput === cleanTarget) {
    currentCopyCount++;
    if (currentCopyCount >= 5) {
      copySentenceQueue.shift();
      if (copySentenceQueue.length > 0) { alert("非常好！下一句。"); currentCopyCount = 0; updateCopyDisplay(); }
      else { alert("🎉 太棒了！今日 3 句地道表达已深度肌肉记忆！"); resetTranslationSection(); }
    } else { updateCopyDisplay(); }
  } else { alert("拼写有误，请仔细对照上方绿色文字抄写哦！"); inputEl.select(); }
}
function resetTranslationSection() {
  document.getElementById('copyExerciseArea').style.display = 'none';
  document.getElementById('transResult').style.display = 'none';
  document.getElementById('transSetup').style.display = 'block';
}

// ================= 文章回译挑战逻辑 =================
let artChallengeData = [];
async function startArticleChallenge() {
  if (articleList.length === 0) return alert("文章尚未加载");
  const endIdx = parseInt(document.getElementById('articleEndSelect').value);
  const pool = articleList.slice(0, endIdx + 1);
  if (pool.length < 3) { alert("已学段落不足 3 段，请先多学几段再来挑战！"); return; }
  let selectedIndices = [];
  while (selectedIndices.length < 3) {
    let r = Math.floor(Math.random() * pool.length);
    let isConsecutive = selectedIndices.some(idx => Math.abs(idx - r) <= 1);
    if (!selectedIndices.includes(r) && !isConsecutive) selectedIndices.push(r);
    if (pool.length <= 5 && !selectedIndices.includes(r)) selectedIndices.push(r);
  }
  artChallengeData = selectedIndices.map(i => pool[i]);
  document.getElementById('artChallengeSetup').style.display = 'none';
  document.getElementById('artChallengeWorking').style.display = 'block';
  document.getElementById('artChallengeResult').style.display = 'none';
  const qBox = document.getElementById('artChallengeQuestions');
  qBox.innerHTML = artChallengeData.map((item, i) => `<div style="margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:10px;"><p style="font-weight:bold; color:#2c3e50;">句 ${i+1} (来自原课文):</p><p style="background:#fffbe6; padding:10px; border-radius:8px;">${item.zh}</p><textarea class="art-user-input" data-idx="${i}" placeholder="尝试默写出对应的原英文句子..." rows="2" style="margin-top:10px;"></textarea></div>`).join('');
}
async function gradeArticleChallenge() {
  const apiKey = localStorage.getItem('silicon_api_key');
  if (!apiKey) return alert("请在‘互动聊天’版块设置 API Key");
  const inputs = document.querySelectorAll('.art-user-input');
  const feedbackBox = document.getElementById('artChallengeComparison');
  document.getElementById('artChallengeWorking').style.display = 'none';
  document.getElementById('artChallengeResult').style.display = 'block';
  feedbackBox.innerHTML = "<p style='text-align:center;'>⏳ AI 老师正在逐字逐句批改中...</p>";
  let checkContent = artChallengeData.map((item, i) => `第${i+1}题：\n【中文原意】：${item.zh}\n【课文原句】：${item.en}\n【用户翻译】：${inputs[i].value.trim() || "（未填写）"}\n-----------------------------------`).join('\n');
  const prompt = `你是一位极度细心的英语私教。请对比用户的“回译”和“课文原句”。必须【逐题】分析。即使意思对，也要指出用户用词与原句的细微差别。如果有语法错误，请明确指出。格式要求：为了方便程序解析，请你将每道题的点评分别放在 <p1>, <p2>, <p3> 标签中。每条点评内部包含：[分数] + 具体的错误/差异分析。`;
  try {
    const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{ role: "system", content: "你是一个精准的英语翻译批改助手。" }, { role: "user", content: prompt + "\n" + checkContent }], temperature: 0.3 })
    });
    const data = await res.json();
    const aiResponse = data.choices[0].message.content; 
    const getFeedback = (tag) => {
      const match = aiResponse.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return match ? match[1].trim() : "AI 老师开小差了，未生成本句点评。";
    };
    let html = '<h3 style="color:#007AFF;">📋 AI 深度批改报告：</h3>';
    artChallengeData.forEach((item, i) => {
      const feedback = getFeedback(`p${i+1}`);
      html += `<div style="margin-bottom:18px; background:white; padding:15px; border-radius:15px; border:1px solid #E5E5EA; box-shadow: 0 2px 8px rgba(0,0,0,0.05);"><div style="font-size:12px; color:#8E8E93; margin-bottom:8px;">🎯 挑战题目 ${i+1}</div><p style="background:#F2F2F7; padding:10px; border-radius:10px; font-size:14px; margin:0 0 10px 0;"><b>中文：</b>${item.zh}</p><div style="display:flex; gap:12px; margin-bottom:10px;"><div style="flex:1; padding:8px; background:#FFF5F5; border-radius:8px; border-left:4px solid #FF3B30;"><small style="color:#FF3B30; font-weight:bold;">你的翻译</small><br><span style="color:#C0392B;">${inputs[i].value.trim() || "(未填写)"}</span></div><div style="flex:1; padding:8px; background:#F0FFF4; border-radius:8px; border-left:4px solid #34C759;"><small style="color:#34C759; font-weight:bold;">课文原句</small><br><span style="color:#1B5E20; font-weight:bold;">${item.en}</span></div></div><div style="background:#F8F9FF; padding:12px; border-radius:10px; font-size:14px; color:#4834D4; line-height:1.6; border:1px solid #D1D8FF;"><b>💡 AI 老师点评：</b><br>${feedback.replace(/\n/g, '<br>')}</div></div>`;
    });
    feedbackBox.innerHTML = html;
  } catch (e) {
    console.error(e);
    feedbackBox.innerHTML = "<p style='color:red;'>批改请求失败，请检查 API Key 或网络环境。</p>";
  }
}
function resetArtChallenge() {
  document.getElementById('artChallengeSetup').style.display = 'block';
  document.getElementById('artChallengeResult').style.display = 'none';
}



// =============== [12] 登录回调引导横幅 (放在文件最底部) =================
(function detectLoginCallback() {
  const isCallback = window.location.hash.includes('access_token') || 
                     window.location.search.includes('type=');
  if (isCallback) {
    setTimeout(() => {
      const isNotPWA = !window.matchMedia('(display-mode: standalone)').matches && 
                       !navigator.standalone;
      if (isNotPWA) showPwaRedirectBanner();
    }, 2000);
  }
})();

function showPwaRedirectBanner() {
  if (document.getElementById('pwa-redirect-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-redirect-banner';
  banner.innerHTML = `
    <div style="position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#27ae60,#2ecc71);color:white;padding:14px 20px;text-align:center;z-index:9999;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
      <div style="font-weight:600;margin-bottom:4px;">✅ 登录成功！进度已同步 🎉</div>
      <div style="font-size:13px;opacity:0.95;margin-bottom:8px;">请关闭此页面，回到「主屏幕应用」刷新查看最新进度</div>
      <button onclick="document.getElementById('pwa-redirect-banner').remove()" style="padding:6px 16px;background:rgba(255,255,255,0.25);border:none;border-radius:20px;color:white;font-size:13px;cursor:pointer;">知道了</button>
    </div>`;
  document.body.prepend(banner);
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 30000);
}
