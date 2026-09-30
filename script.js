const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const setupView = $('#setupView');
const interviewView = $('#interviewView');
const resultView = $('#resultView');
const careerType = $('#careerType');
const esError = $('#esError');

let config = {};
let questions = [];
let currentIndex = 0;
let answers = [];
let listening = false;
let startedAt = 0;
let timerId = null;
let recognition = null;
let liveTranscript = '';
let buttonState = 'ready';
let pendingTranscript = '';

const generalNewgrad = [
  'まず、簡単に自己紹介をお願いします。',
  'あなたの強みを教えてください。',
  'あなたの弱みを教えてください。',
  '学生時代に最も力を入れたことを教えてください。',
  'これまでに一番苦労した経験を教えてください。',
  'チームで何かに取り組んだ経験を教えてください。',
  '周囲からはどんな人だと言われますか？',
  '失敗した経験と、そこから学んだことを教えてください。',
  '仕事をするうえで大切にしたいことは何ですか？',
  '5年後、どのような自分になっていたいですか？'
];

const generalMid = [
  'まず、これまでのご経歴を簡潔に教えてください。',
  '今回、転職を考えた理由を教えてください。',
  'あなたの強みを、仕事上の具体例と一緒に教えてください。',
  '現在の仕事で最も大きな成果を教えてください。',
  '仕事で大きな失敗をした経験と、その後どう対応したか教えてください。',
  'チームの中で、普段どのような役割を担うことが多いですか？',
  'これまでの経験の中で、再現性が高いと考えている強みは何ですか？',
  '今後のキャリアで実現したいことを教えてください。',
  '新しい環境に入ったとき、最初に何から着手しますか？',
  '入社後、早期に貢献できることは何だと思いますか？'
];

const surpriseNormal = [
  'もしあなたが今日の面接官だったら、今のあなたにどんな質問をしますか？',
  'あなたの強みが、逆に弱みとして出てしまった経験はありますか？',
  'あなたをよく知る人が、今の自己評価に反対するとしたら、どこだと思いますか？'
];

const surpriseHard = [
  'あなたが今話した強みについて、それが本当に強みだと言える客観的な証拠を一つ挙げてください。',
  'これまでの成果の中で、実は自分の力ではなかった部分を正直に挙げるとしたら何ですか？',
  'あなたを採用しない理由を、面接官の立場で一つ挙げてください。'
];

careerType.addEventListener('change', () => {
  const mid = careerType.value === 'midcareer';
  $('#newgradFields').classList.toggle('hidden', mid);
  $('#midcareerFields').classList.toggle('hidden', !mid);
});

$('#setupForm').addEventListener('submit', e => {
  e.preventDefault();
  const type = careerType.value;
  const es = type === 'newgrad'
    ? [
        {label:'志望動機', value:$('#motivation').value.trim()},
        {label:'自己PR', value:$('#selfPr').value.trim()},
        {label:'ガクチカ', value:$('#gakuchika').value.trim()}
      ]
    : [
        {label:'転職理由', value:$('#reasonChange').value.trim()},
        {label:'自己PR', value:$('#midSelfPr').value.trim()},
        {label:'職務経歴・実績', value:$('#careerHistory').value.trim()}
      ];

  if (!es.some(x => x.value)) {
    esError.classList.remove('hidden');
    esError.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }
  esError.classList.add('hidden');

  config = {
    type,
    job: $('#jobType').value.trim(),
    es,
    mode: $('input[name="mode"]:checked').value,
    count: Number($('input[name="count"]:checked').value)
  };
  questions = buildQuestionPlan(config);
  currentIndex = 0;
  answers = [];
  startInterview();
});

function buildQuestionPlan(c) {
  const pool = c.type === 'newgrad' ? [...generalNewgrad] : [...generalMid];
  const activeEs = c.es.filter(x => x.value);
  const q = [];
  const generalMinimum = c.mode === 'hard' ? 1 : 3;

  if (c.mode === 'gentle') {
    q.push(...pool.slice(0, Math.min(3, c.count)));
  } else {
    q.push(pool[0]);
    if (generalMinimum >= 2) q.push(pool[1]);
  }

  activeEs.forEach(item => {
    if (q.length >= c.count) return;
    q.push(esOpeningQuestion(item.label, c.type));
    if (q.length < c.count) q.push(esDeepQuestion(item.label, c.mode, 1));
    if (q.length < c.count && c.mode !== 'gentle') q.push(esDeepQuestion(item.label, c.mode, 2));
  });

  while (q.filter(x => x.kind === 'general' || typeof x === 'string').length < generalMinimum && q.length < c.count) {
    q.push(pool[q.length % pool.length]);
  }

  if (c.mode !== 'gentle' && q.length < c.count) {
    const source = c.mode === 'hard' ? surpriseHard : surpriseNormal;
    q.splice(Math.max(2, Math.floor(q.length * .65)), 0, {text:source[Math.floor(Math.random()*source.length)], kind:'surprise'});
  }

  let p = 2;
  while (q.length < c.count) {
    if (activeEs.length && q.length % 3 !== 0) {
      const item = activeEs[(q.length + p) % activeEs.length];
      q.push(esDeepQuestion(item.label, c.mode, p++));
    } else {
      q.push(pool[(q.length + p) % pool.length]);
    }
  }
  return q.slice(0, c.count).map(x => typeof x === 'string' ? {text:x,kind:'general'} : x);
}

function esOpeningQuestion(label, type) {
  const map = {
    '志望動機':'ESに書かれている志望動機について、改めてあなたの言葉で説明してください。',
    '自己PR':'ESの自己PRについて、強みが最も表れた具体的な経験を教えてください。',
    'ガクチカ':'ESに書かれている学生時代の経験について、最初から簡潔に説明してください。',
    '転職理由':'ESに書かれている転職理由について、改めて説明してください。',
    '職務経歴・実績':'職務経歴の中で、あなた自身の貢献が最も大きかった実績を教えてください。'
  };
  return {text:map[label] || 'ESに書かれている内容について、具体的に説明してください。', kind:'es', label};
}

function esDeepQuestion(label, mode, depth) {
  const gentle = [
    'その経験の中で、あなた自身が工夫したことは何ですか？',
    'そのとき、特に大変だったことを教えてください。',
    'その経験から得た学びを教えてください。'
  ];
  const normal = [
    'その行動を選んだ理由を、もう少し具体的に教えてください。',
    'その成果の中で、あなた自身が担った部分はどこですか？',
    'もし同じ状況をもう一度経験するとしたら、何を変えますか？',
    '周囲の人はあなたの行動をどのように評価していましたか？'
  ];
  const hard = [
    '今の説明には少し抽象的な部分があります。具体的な数字や事実で説明できますか？',
    'その成果は、本当にあなたの行動が原因だったと言えますか？他の要因との違いを説明してください。',
    'あなたがいなかった場合でも同じ結果になった可能性はありませんか？',
    'その判断が最善だったと考える根拠は何ですか？',
    '今の回答の中で、面接官に最も疑われそうな部分はどこだと思いますか？'
  ];
  const arr = mode === 'gentle' ? gentle : mode === 'hard' ? hard : normal;
  return {text:arr[(depth-1)%arr.length], kind:'es', label};
}

function startInterview() {
  setupView.classList.remove('active');
  resultView.classList.remove('active');
  interviewView.classList.add('active');
  const labels = {gentle:'GENTLE INTERVIEWER', normal:'STANDARD INTERVIEWER', hard:'HARD INTERVIEWER'};
  $('#modeLabel').textContent = labels[config.mode];
  configureRecognition();
  showQuestion();
}

function showQuestion() {
  if (currentIndex >= questions.length) return finishInterview();
  const q = questions[currentIndex];
  $('#questionText').textContent = q.text;
  $('#progressText').textContent = `${currentIndex+1} / ${config.count}`;
  $('#progressBar').style.width = `${((currentIndex+1)/config.count)*100}%`;
  $('#timer').textContent = '00:00';
  $('#answerButton').textContent = '🎙 回答を開始';
  $('#answerButton').classList.remove('live');
  $('#micState').classList.remove('live');
  $('#micState').innerHTML = '<span class="mic-dot"></span>待機中';
  $('#transcriptBox').classList.add('hidden');
  $('#transcriptText').textContent = '';
  liveTranscript = '';
  speak(q.text);
}

$('#replayQuestion').addEventListener('click', () => speak(questions[currentIndex].text));
$('#answerButton').addEventListener('click', () => {
  if (buttonState === 'ready') return startAnswer();
  if (buttonState === 'recording') return stopAnswer();
  if (buttonState === 'next') {
    currentIndex++;
    applyAdaptiveFollowup(pendingTranscript);
    pendingTranscript = '';
    buttonState = 'ready';
    showQuestion();
  }
});

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = .95;
  u.pitch = 1;
  speechSynthesis.speak(u);
}

function configureRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  recognition = new SR();
  recognition.lang = 'ja-JP';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onresult = e => {
    let finalText = '', interim = '';
    for (let i=e.resultIndex;i<e.results.length;i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    if (finalText) liveTranscript += finalText;
    const all = (liveTranscript + interim).trim();
    $('#transcriptText').textContent = all || '認識中…';
    $('#transcriptBox').classList.remove('hidden');
  };
  recognition.onerror = () => {};
  recognition.onend = () => {
    if (listening) {
      try { recognition.start(); } catch(e) {}
    }
  };
}

function startAnswer() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  listening = true;
  buttonState = 'recording';
  liveTranscript = '';
  startedAt = Date.now();
  $('#answerButton').textContent = '■ 回答を終了';
  $('#answerButton').classList.add('live');
  $('#micState').classList.add('live');
  $('#micState').innerHTML = '<span class="mic-dot"></span>回答中';
  timerId = setInterval(updateTimer, 200);
  if (recognition) {
    try { recognition.start(); } catch(e) {}
  } else {
    $('#supportText').textContent = 'このブラウザでは文字起こしに対応していません。回答時間の計測は利用できます。';
  }
}

function stopAnswer() {
  listening = false;
  clearInterval(timerId);
  const seconds = Math.max(1, Math.round((Date.now()-startedAt)/1000));
  if (recognition) {
    try { recognition.stop(); } catch(e) {}
  }
  const transcript = liveTranscript.trim();

  answers.push({
    question: questions[currentIndex].text,
    seconds,
    transcript
  });

  $('#micState').classList.remove('live');
  $('#micState').innerHTML = '<span class="mic-dot"></span>回答完了';
  $('#answerButton').textContent = '次の質問へ →';
  $('#answerButton').classList.remove('live');

  pendingTranscript = transcript;
  buttonState = 'next';
}

function applyAdaptiveFollowup(text) {
  if (!text || currentIndex >= config.count) return;
  const nextPos = currentIndex;
  let adaptive = null;
  if (/\d|％|%|パーセント|売上|改善|増加|削減/.test(text)) {
    adaptive = config.mode === 'hard'
      ? '今の数字について、その数値があなたの行動によるものだと判断した根拠を説明してください。'
      : '今出てきた数字について、どのように測ったものか教えてください。';
  } else if (/チーム|メンバー|周囲|仲間|上司|同僚/.test(text)) {
    adaptive = config.mode === 'hard'
      ? 'その成果のうち、チームではなくあなた個人の貢献は具体的にどこですか？'
      : 'その中で、あなた自身はどのような役割を担っていましたか？';
  } else if (/失敗|苦労|困難|課題/.test(text)) {
    adaptive = 'その状況で、最初に取った行動と、その判断理由を教えてください。';
  }
  if (adaptive) questions[nextPos] = {text:adaptive, kind:'adaptive'};
}

function updateTimer() {
  const sec = Math.floor((Date.now()-startedAt)/1000);
  const m = String(Math.floor(sec/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');
  $('#timer').textContent = `${m}:${s}`;
}


function finishInterview() {
  listening = false;
  clearInterval(timerId);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  interviewView.classList.remove('active');
  resultView.classList.add('active');

  const total = answers.reduce((a,b)=>a+b.seconds,0);
  const avg = answers.length ? Math.round(total/answers.length) : 0;
  const max = answers.length ? Math.max(...answers.map(x=>x.seconds)) : 0;
  $('#summaryStats').innerHTML = `
    <div class="stat"><b>${answers.length}</b><span>回答した質問</span></div>
    <div class="stat"><b>${avg}秒</b><span>平均回答時間</span></div>
    <div class="stat"><b>${max}秒</b><span>最長回答時間</span></div>`;

  $('#resultList').innerHTML = answers.map((a,i)=>`
    <article class="result-item">
      <header><b>Q${i+1}. ${escapeHtml(a.question)}</b><time>${a.seconds}秒</time></header>
      ${a.transcript ? `<p class="answer">「${escapeHtml(a.transcript)}」</p>` : '<p>文字起こしなし</p>'}
    </article>`).join('');
}

$('#restartButton').addEventListener('click', () => {
  resultView.classList.remove('active');
  setupView.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
});

function escapeHtml(str='') {
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
