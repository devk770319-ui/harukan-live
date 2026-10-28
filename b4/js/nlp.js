/* ===========================================================
   nlp.js — 아주 가벼운 한국어 처리
   형태소 분석기를 쓸 수 없으므로(오프라인·무의존성 원칙),
   조사/어미 제거 + 불용어 + TF-IDF 로 "이 글의 단어"를 뽑는다.
   완벽하지 않지만 태그 제안과 주제 통계에는 충분하다.
   =========================================================== */

/* 어미/조사 후보 — 긴 것부터 시도 */
const SUFFIXES = [
  '였습니다', '했습니다', '입니다', '습니다', '이었다', '에서는', '에서도', '에게서', '으로는', '이라는',
  '이라고', '라고는', '하고는', '했는데', '하는데', '이라도', '으로도',
  '에서', '에게', '한테', '으로', '까지', '부터', '보다', '처럼', '만큼', '라도', '이나', '든지',
  '이랑', '하고', '이며', '지만', '면서', '려고', '이다', '였다', '했다', '한다', '하다', '해서',
  '했고', '는데', '으며', '이라', '이고', '에는', '에도', '와는', '과는', '으로써', '로써',
  '들이', '들을', '들은', '들과', '들의', '들도', '에선', '이란', '으론', '엔', '란', '든',
  '은', '는', '이', '가', '을', '를', '에', '와', '과', '도', '만', '의', '로', '랑', '께', '야', '아',
];

const STOP = new Set([
  '오늘', '어제', '내일', '그리고', '하지만', '그래서', '그런데', '근데', '정말', '진짜', '너무', '조금',
  '많이', '다시', '그냥', '계속', '아직', '이제', '역시', '아주', '매우', '약간', '살짝', '거의',
  '나는', '내가', '우리', '자기', '자신', '사람', '생각', '기분', '느낌', '하루', '시간', '때문',
  '이런', '그런', '저런', '이거', '그거', '저거', '무엇', '뭔가', '어떤', '모든', '전부', '다들',
  '것이', '것은', '것을', '수가', '수는', '한번', '다음', '이번', '저번', '지금', '아마', '혹시',
  '그럼', '그때', '오전', '오후', '아침', '점심', '저녁', '새벽', '진심', '완전', '엄청',
  '없이', '같기', '같이', '그래', '종일', '가끔', '이유', '정도', '자꾸', '아무', '별로', '조차',
  '통해', '대해', '위해', '여기', '거기', '저기', '어디', '언제', '누구', '동안', '무슨', '이상',
  '이하', '보고', '하는', '했던', '하던', '되는', '있는', '없는', '같은', '많은', '좋은', '나쁜',
  '오래', '먼저', '이미', '아까', '나중', '결국', '그저', '차라리', '어느', '무언가',
  '제대', '아무것', '자서', '넘게', '끝나', '만나', '스스로', '이렇', '그렇', '저렇', '하나',
  '가서', '와서', '해서', '봐서', '나서', '대로', '한테', '보니', '싶어', '보다', '하러',
  'the', 'and', 'that', 'this', 'with', 'have', 'from', 'just', 'like', 'about', 'been', 'they',
  'what', 'when', 'were', 'will', 'would', 'there', 'their', 'because', 'really', 'today',
  /* 라틴 문자 언어의 뜻 없는 말 (1.7.4) — 두 글자 이하는 어차피 버리므로 세 글자 이상만 */
  // en
  'was', 'are', 'for', 'not', 'but', 'you', 'all', 'had', 'has', 'her', 'his', 'him', 'she', 'our',
  'out', 'too', 'can', 'did', 'got', 'get', 'its', 'one', 'how', 'who', 'why', 'some', 'much', 'very',
  'then', 'than', 'them', 'into', 'over', 'even', 'still', 'again', 'only', 'more', 'after', 'before',
  'myself', 'felt', 'feel', 'went', 'made', 'make', 'thing', 'things', 'time', 'day', 'could', 'should',
  'maybe', 'little', 'bit', 'though', 'which', 'while', 'being', 'also', 'any', 'way', 'didn', 'don',
  // es
  'que', 'los', 'las', 'una', 'uno', 'por', 'con', 'para', 'del', 'como', 'pero', 'más', 'muy', 'hoy',
  'fue', 'está', 'estoy', 'estaba', 'había', 'tengo', 'esto', 'este', 'esta', 'eso', 'ese', 'esa',
  'todo', 'toda', 'todos', 'nada', 'algo', 'cuando', 'porque', 'sin', 'sobre', 'también', 'ya', 'otra',
  'otro', 'mucho', 'poco', 'bien', 'día', 'vez', 'aunque', 'después', 'hasta', 'desde', 'mis', 'nos',
  // pt
  'não', 'uma', 'com', 'para', 'por', 'mas', 'mais', 'muito', 'hoje', 'foi', 'está', 'estou', 'estava',
  'isso', 'isto', 'esse', 'essa', 'tudo', 'nada', 'algo', 'quando', 'porque', 'sem', 'também', 'já',
  'outra', 'outro', 'pouco', 'bem', 'dia', 'depois', 'até', 'meu', 'minha', 'meus', 'dos', 'das',
  'nas', 'nos', 'pelo', 'pela', 'ainda', 'tive', 'tinha', 'ser', 'ter', 'fiz', 'fui',
  // tr
  'bir', 've', 'bu', 'şu', 'ama', 'için', 'çok', 'daha', 'gibi', 'kadar', 'sonra', 'önce', 'bugün',
  'ben', 'beni', 'bana', 'benim', 'sen', 'biz', 'onlar', 'ile', 'ki', 'de', 'da', 'mi', 'mı', 'diye',
  'her', 'hiç', 'biraz', 'yine', 'bile', 'ancak', 'çünkü', 'gün', 'oldu', 'olan', 'olarak', 'gerek',
  // de
  'ich', 'und', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'nicht', 'mit', 'auf', 'für', 'war', 'ist', 'bin', 'habe', 'hatte', 'hat', 'mir', 'mich', 'mein',
  'meine', 'meinen', 'sich', 'aber', 'auch', 'noch', 'nur', 'schon', 'sehr', 'heute', 'dann', 'wenn',
  'weil', 'dass', 'wie', 'was', 'wir', 'sie', 'aus', 'bei', 'nach', 'vor', 'von', 'zum', 'zur', 'als',
  'oder', 'doch', 'mal', 'ganz', 'etwas', 'viel', 'wieder', 'immer', 'einfach', 'irgendwie', 'tag',
  'wurde', 'wäre', 'kann', 'muss', 'will', 'gibt', 'diese', 'dieser', 'dieses', 'alles', 'nichts',
  // fr
  'les', 'des', 'une', 'est', 'pas', 'que', 'qui', 'pour', 'dans', 'sur', 'avec', 'mais', 'plus',
  'tout', 'très', 'aujourd', 'hui', 'été', 'était', 'suis', 'avais', 'avait', 'ai', 'mon', 'mes',
  'moi', 'nous', 'vous', 'elle', 'ils', 'elles', 'ces', 'cette', 'ce', 'cet', 'aux', 'par', 'comme',
  'quand', 'parce', 'sans', 'encore', 'peu', 'bien', 'fait', 'faire', 'jour', 'journée', 'rien',
  'quelque', 'chose', 'après', 'avant', 'alors', 'donc', 'même', 'aussi', 'trop', 'leur', 'son',
  'sont', 'ont', 'avoir', 'être', 'peut', 'vraiment', 'enfin', 'toujours', 'jamais', 'notre',
  // nl
  'het', 'een', 'van', 'dat', 'die', 'niet', 'met', 'voor', 'maar', 'ook', 'nog', 'wel', 'heb', 'had',
  'was', 'ben', 'mijn', 'mij', 'zich', 'zijn', 'hun', 'ons', 'onze', 'zou', 'kan', 'moet', 'wil',
  'naar', 'uit', 'bij', 'aan', 'als', 'dan', 'toen', 'omdat', 'want', 'heel', 'erg', 'veel', 'beetje',
  'vandaag', 'weer', 'altijd', 'iets', 'niets', 'alles', 'deze', 'dit', 'daar', 'hier', 'over',
  'nadat', 'zonder', 'toch', 'gewoon', 'eigenlijk', 'dag', 'werd', 'hebben', 'worden', 'wordt',
  // pl
  'nie', 'jest', 'było', 'był', 'była', 'jestem', 'się', 'że', 'jak', 'ale', 'tak', 'dla', 'czy',
  'mnie', 'mi', 'moja', 'mój', 'moje', 'tego', 'tej', 'ten', 'ta', 'to', 'ich', 'jego', 'jej', 'nas',
  'nam', 'tylko', 'jeszcze', 'już', 'bardzo', 'dziś', 'dzisiaj', 'potem', 'kiedy', 'bo', 'aby',
  'oraz', 'albo', 'przez', 'przy', 'pod', 'nad', 'bez', 'od', 'do', 'po', 'na', 'za', 'ze', 'we',
  'trochę', 'dużo', 'zawsze', 'nigdy', 'coś', 'nic', 'wszystko', 'dzień', 'miałem', 'miałam',
  'byłem', 'byłam', 'jako', 'tam', 'tu', 'tutaj', 'też', 'tym', 'tych', 'który', 'która', 'które',
]);

/* 한 글자지만 일기에서 의미가 있는 명사들 — 이건 살린다 */
const KEEP_ONE = new Set([
  '밥', '잠', '돈', '책', '물', '술', '집', '몸', '말', '글', '일', '길', '손', '눈', '비', '밤',
  '낮', '힘', '옷', '차', '방', '문', '산', '강', '땀', '꿈', '봄', '해', '달', '별', '약',
]);

function stripSuffix(w) {
  for (const s of SUFFIXES) {
    if (w.length - s.length >= 1 && w.endsWith(s)) return w.slice(0, -s.length);
  }
  return w;
}

/** 문장 → 정규화된 토큰 배열 */
export function tokenize(text) {
  if (!text) return [];
  /* 라틴 문자는 악센트까지 통째로 살린다 (예전엔 a-z 만 남겨 café→caf, journée→journ 처럼 잘렸다).
     띄어쓰기가 없는 문자(일본어·중국어·태국어)와 아랍어는 예전처럼 빼고 본다 */
  const raw = text
    .toLowerCase()
    .replace(/\u0307/g, '')            // 튀르키예어 İ 를 소문자로 바꾸면 붙는 점
    .replace(/[’']/g, ' ')
    .replace(/[^0-9\p{Script=Latin}가-힣\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  for (let w of raw) {
    if (/^[0-9]+$/.test(w)) continue;
    const hangul = /[가-힣]/.test(w);
    if (hangul) {
      w = stripSuffix(w);
      if (w.length === 1) { if (!KEEP_ONE.has(w)) continue; }
      else {
        // 활용형(동사·형용사) 걸러내기 — 명사만 남기는 게 목적이다.
        // '…다/…요'로 끝나거나, 과거·추측 어간(았/었/였/겠/셨)이 섞이면 활용형이다.
        if (/[다요]$/.test(w)) continue;
        if (/[았었였겠셨]/.test(w)) continue;
        if (/다[고는가]$/.test(w)) continue;                    // 된다고, 한다는
        // 부사·연결어미 (확실히, 이상하게, 하니까, 버티면…)
        if (w.length >= 3 && /[히게까며찮면]$/.test(w)) continue;
      }
    } else if (w.length < 3) {
      continue;                          // 영어는 3자 미만이면 대개 노이즈
    }
    if (STOP.has(w)) continue;
    out.push(w);
  }
  return out;
}

/** 한 글의 단어 빈도 */
export function termFreq(text) {
  const m = new Map();
  for (const t of tokenize(text)) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

/**
 * 전체 글에서 IDF 를 계산해 두고, 특정 글의 "특징 단어"를 뽑는다.
 * @returns {(text:string, n:number) => string[]}
 */
export function makeKeywordExtractor(corpusTexts) {
  const df = new Map();
  for (const t of corpusTexts) {
    for (const w of new Set(tokenize(t))) df.set(w, (df.get(w) || 0) + 1);
  }
  const N = Math.max(1, corpusTexts.length);
  return (text, n = 5) => {
    const tf = termFreq(text);
    const scored = [];
    for (const [w, c] of tf) {
      const idf = Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 1;
      // 너무 흔한 단어(절반 이상의 글에 등장)는 태그로 쓸모없다
      if ((df.get(w) || 0) / N > 0.5 && N > 8) continue;
      scored.push([w, (1 + Math.log(c)) * idf]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, n).map(([w]) => w);
  };
}

/** 코퍼스 전체 단어 순위 */
export function topWords(texts, n = 24) {
  const m = new Map();
  for (const t of texts) for (const w of tokenize(t)) m.set(w, (m.get(w) || 0) + 1);
  return [...m.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w, c]) => ({ word: w, count: c }));
}

/* ── 아주 소박한 감정 어휘 ────────────────────────
   자동 판정이 아니라, 기분을 안 고른 날 "이런 기분이었나요?"
   하고 슬쩍 제안하는 용도로만 쓴다. 틀려도 사용자가 무시하면 그만.
   ------------------------------------------------ */
const POS = ['좋', '행복', '기쁘', '기뻤', '즐거', '즐겁', '재밌', '재미', '뿌듯', '설레', '설렘', '고맙', '감사',
  '편안', '평온', '만족', '성공', '해냈', '웃', '사랑', '따뜻', '시원', '개운', '든든', '보람', '희망',
  '멋지', '예쁘', '귀엽', '신나', '최고', '잘했', '괜찮'];
const NEG = ['힘들', '힘든', '지쳐', '지친', '지침', '피곤', '슬프', '슬펐', '우울', '외로', '불안', '걱정',
  '짜증', '화가', '화났', '답답', '속상', '아프', '아팠', '괴로', '무섭', '두렵', '싫', '망했', '실패',
  '후회', '미안', '눈물', '울었', '스트레스', '부담', '귀찮', '허무', '무기력'];
const HIGH_E = ['바쁘', '정신없', '뛰', '달렸', '급하', '서둘', '신나', '화가', '불안', '흥분', '설레', '초조'];
const LOW_E = ['조용', '느긋', '쉬었', '누워', '잠', '멍하', '차분', '나른', '침대', '휴식', '가만'];

function hits(text, list) {
  let n = 0;
  for (const w of list) if (text.includes(w)) n++;
  return n;
}

/** 본문에서 기분 추정. 신호가 약하면 null. */
export function guessMood(text) {
  if (!text || text.replace(/\s/g, '').length < 15) return null;
  const p = hits(text, POS), n = hits(text, NEG);
  const he = hits(text, HIGH_E), le = hits(text, LOW_E);
  if (p + n === 0) return null;
  const v = Math.max(-0.85, Math.min(0.85, (p - n) / Math.max(2.2, p + n) * 1.25));
  const e = Math.max(-0.7, Math.min(0.7, (he - le) / Math.max(2, he + le) * 0.9));
  if (Math.abs(v) < 0.15) return null;
  return { v: +v.toFixed(2), e: +e.toFixed(2) };
}

export { STOP };
