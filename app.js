const WORKER = window.WORKER_BASE_URL?.replace(/\/$/, "");
if (!WORKER || WORKER.includes("YOUR_WORKER_URL_HERE")) {
  alert("Set WORKER_BASE_URL in index.html to your Cloudflare Worker URL.");
}

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const voiceSel = document.getElementById("voiceSel");
const turnLenSel = document.getElementById("turnLenSel");
const vocabModeSel = document.getElementById("vocabModeSel");
const wakeSel = document.getElementById("wakeSel");
const strictSel = document.getElementById("strictSel");
const sessionSel = document.getElementById("sessionSel");
const logEl = document.getElementById("log");

let running = false;
let conversationText = "";
let lastBotText = "";
let mediaStream = null;
let wakeLock = null;
let sessionEndAt = null;

const PHRASE_BANK_KEY = "rolo_phrase_bank_v1";
const MAX_PHRASES = 250;

const SYSTEM_PROMPT_BASE = `
Eres “Parcero Rolo”, un compañero de conversación de Bogotá (registro amable-profesional) y micro-coach.

Usuario: hablante herencia/intermedio. Entiende perfecto. Habla bien pero quiere sonar más nativo, ampliar vocabulario y ganar confianza. Practica manejando, así que todo debe ser corto y claro.

REGLAS (SEGURIDAD + FLUIDEZ)
- Habla SOLO en español colombiano de Bogotá (Rolo), amable-profesional.
- Turnos cortos: 1–2 frases + UNA sola pregunta.
- Corrección máxima: 1 micro-mejora por respuesta del usuario (1 frase). Luego sigues conversando.
- Prioriza naturalidad: conectores y suavizadores rolos (pues, o sea, la verdad, igual, qué pena, de una) bien usados.
- Sin jerga pesada ni groserías. Si algo es muy casual, márcalo como “casual”.
- Si el usuario se traba: da 2 opciones de respuesta (cortas y naturales) para elegir.

ESTRUCTURA DE SESIÓN (30 min)
- Vocab 1 minuto (10 palabras/expresiones rolas) al inicio.
- MODO SIN PAUSAS 2 min: preguntas fáciles, sin corregir.
- Conversación guiada 20 min (familia, trabajo/escuela, negocios, deportes, intereses, planes, noticias ligeras).
- UPGRADE MODE 6 min: mejora 8 frases del usuario (más rolas/naturales). Pídele repetir.
- RESUMEN 1 min: 5 frases top + 5 palabras top + 1 foco para mañana.

FORMATO DE SALIDA
Responde SIEMPRE usando estas etiquetas en líneas separadas:
[COACH] ... (opcional, 1 frase)
[ASK] ... (1 pregunta)
`;


function getCorrectionMode() {
  const v = (strictSel?.value || "normal").toLowerCase();
  if (v === "light" || v === "strict") return v;
  return "normal";
}

function buildInstructions() {
  const mode = getCorrectionMode();
  if (mode === "light") {
    return SYSTEM_PROMPT_BASE + `
AJUSTE: CORRECCIÓN LIGERA
- No corrijas a menos que el usuario diga "corrígeme".
- Mantén conversación natural y 1 pregunta corta.`;
  }
  if (mode === "strict") {
    return SYSTEM_PROMPT_BASE + `
AJUSTE: CORRECCIÓN ESTRICTA
- Da SIEMPRE una micro-mejora en [COACH] en cada turno (máximo 1 frase).
- Corrige naturalidad (conectores, orden, elección de palabras), no reglas largas.`;
  }
  return SYSTEM_PROMPT_BASE + `
AJUSTE: CORRECCIÓN NORMAL
- 1 micro-mejora cuando sea útil (máximo 1 frase).`;
}

function getSessionMinutes() {
  const m = parseInt(sessionSel?.value || "15", 10);
  return (m === 30) ? 30 : 15;
}

async function speakCountdown() {
  await ttsSpeak("Listo. Tres... dos... uno... ¡Dale!");
}

const VOCAB_PACK = [
  {
    "day": 1,
    "items": [
      [
        "o sea",
        "O sea, yo pensé que iba a ser rápido."
      ],
      [
        "pues",
        "Pues… la verdad hoy amanecí cansado."
      ],
      [
        "igual",
        "Igual, lo cuadramos para mañana."
      ],
      [
        "qué pena",
        "Qué pena, ¿me repites eso?"
      ],
      [
        "de una",
        "¿Lo hacemos hoy? De una."
      ],
      [
        "tranqui",
        "Tranqui, no hay afán."
      ],
      [
        "se me complicó",
        "Hoy se me complicó por trabajo."
      ],
      [
        "me quedó sonando",
        "Eso que dijiste me quedó sonando."
      ],
      [
        "en general",
        "En general, todo bien esta semana."
      ],
      [
        "a mil",
        "He estado a mil con varias cosas."
      ]
    ]
  },
  {
    "day": 2,
    "items": [
      [
        "la verdad",
        "La verdad, me gustó mucho."
      ],
      [
        "entonces",
        "Entonces, ¿qué hacemos?"
      ],
      [
        "porfa",
        "Porfa, mándame el dato cuando puedas."
      ],
      [
        "ahorita",
        "Ahorita te confirmo bien."
      ],
      [
        "de pronto",
        "De pronto salgo un poco más tarde."
      ],
      [
        "no hay lío",
        "No hay lío, yo me encargo."
      ],
      [
        "me toca",
        "Hoy me toca llevar a los niños."
      ],
      [
        "me parece",
        "Me parece buena idea."
      ],
      [
        "te cuento",
        "Te cuento: pasó algo en el trabajo."
      ],
      [
        "quedamos en",
        "Quedamos en hablar el viernes."
      ]
    ]
  },
  {
    "day": 3,
    "items": [
      [
        "qué tal",
        "¿Qué tal te fue hoy?"
      ],
      [
        "todo bien",
        "Todo bien, gracias. ¿Y tú?"
      ],
      [
        "más bien",
        "Más bien hagámoslo mañana."
      ],
      [
        "en serio",
        "¿En serio? No sabía."
      ],
      [
        "de hecho",
        "De hecho, yo también lo pensé."
      ],
      [
        "hágale",
        "¿Arrancamos? Hágale."
      ],
      [
        "me dio por",
        "Me dio por salir a caminar."
      ],
      [
        "me suena",
        "Me suena ese plan."
      ],
      [
        "no alcanzo",
        "Hoy no alcanzo, estoy sobre el tiempo."
      ],
      [
        "sobre el tiempo",
        "Voy sobre el tiempo, pero llego."
      ]
    ]
  },
  {
    "day": 4,
    "items": [
      [
        "qué más",
        "¿Qué más, cómo vas?"
      ],
      [
        "todo tranqui",
        "Todo tranqui por ahora."
      ],
      [
        "por si acaso",
        "Lleva chaqueta por si acaso."
      ],
      [
        "en ese orden de ideas",
        "En ese orden de ideas, hagámoslo simple."
      ],
      [
        "me da pena",
        "Me da pena decirlo, pero tengo una duda."
      ],
      [
        "mejor dicho",
        "Mejor dicho, lo dejamos para mañana."
      ],
      [
        "ahí miramos",
        "Ahí miramos cómo sale."
      ],
      [
        "como quien no quiere",
        "Como quien no quiere, le pregunté por el tema."
      ],
      [
        "me sirve",
        "Me sirve a las 3."
      ],
      [
        "me queda",
        "Ese sitio me queda cerca."
      ]
    ]
  },
  {
    "day": 5,
    "items": [
      [
        "qué nota",
        "Qué nota ese plan."
      ],
      [
        "qué bueno",
        "Qué bueno que me avisaste."
      ],
      [
        "tal cual",
        "Tal cual, eso fue lo que pasó."
      ],
      [
        "por ahí",
        "Por ahí a las seis salgo."
      ],
      [
        "mejor",
        "Mejor lo dejamos así."
      ],
      [
        "me alegra",
        "Me alegra escuchar eso."
      ],
      [
        "qué te digo",
        "Qué te digo… fue un día largo."
      ],
      [
        "no te preocupes",
        "No te preocupes, lo resolvemos."
      ],
      [
        "me gustaría",
        "Me gustaría aprender más de eso."
      ],
      [
        "toca organizar",
        "Toca organizar lo del fin de semana."
      ]
    ]
  },
  {
    "day": 6,
    "items": [
      [
        "a propósito",
        "A propósito, ¿cómo va tu familia?"
      ],
      [
        "por el lado de",
        "Por el lado de trabajo, todo bien."
      ],
      [
        "hasta donde sé",
        "Hasta donde sé, sí se puede."
      ],
      [
        "si te parece",
        "Si te parece, lo hacemos así."
      ],
      [
        "de acuerdo",
        "De acuerdo, quedamos así."
      ],
      [
        "me avisas",
        "Me avisas y lo cuadramos."
      ],
      [
        "qué opinas",
        "¿Qué opinas de ese plan?"
      ],
      [
        "en resumen",
        "En resumen, vamos bien."
      ],
      [
        "por ahora",
        "Por ahora, todo bajo control."
      ],
      [
        "me gustaría saber",
        "Me gustaría saber tu opinión."
      ]
    ]
  },
  {
    "day": 7,
    "items": [
      [
        "en cuanto a",
        "En cuanto a los niños, todo bien."
      ],
      [
        "por lo menos",
        "Por lo menos ya avanzamos algo."
      ],
      [
        "de ahí en adelante",
        "De ahí en adelante fue más fácil."
      ],
      [
        "así de simple",
        "Así de simple, no hay misterio."
      ],
      [
        "me impresiona",
        "Me impresiona lo rápido que aprenden."
      ],
      [
        "me preocupa",
        "Me preocupa un poquito el tiempo."
      ],
      [
        "no es por",
        "No es por quejarme, pero está pesado el tráfico."
      ],
      [
        "yo diría",
        "Yo diría que es buena opción."
      ],
      [
        "te parece si",
        "¿Te parece si hablamos mañana?"
      ],
      [
        "vamos viendo",
        "Vamos viendo cómo sale."
      ]
    ]
  },
  {
    "day": 8,
    "items": [
      [
        "te soy sincero",
        "Te soy sincero, no lo había pensado."
      ],
      [
        "me da la impresión",
        "Me da la impresión de que sí funciona."
      ],
      [
        "por mi lado",
        "Por mi lado, listo."
      ],
      [
        "me queda claro",
        "Me queda claro lo que toca hacer."
      ],
      [
        "me parece clave",
        "Me parece clave practicar diario."
      ],
      [
        "en todo caso",
        "En todo caso, lo intentamos."
      ],
      [
        "siendo honestos",
        "Siendo honestos, toca mejorar eso."
      ],
      [
        "me da risa",
        "Me da risa porque me pasó igual."
      ],
      [
        "me da pereza",
        "Me da pereza manejar con este tráfico."
      ],
      [
        "vale",
        "Vale, perfecto."
      ]
    ]
  },
  {
    "day": 9,
    "items": [
      [
        "de una vez",
        "De una vez, lo dejamos listo."
      ],
      [
        "mejor así",
        "Mejor así, sin enredos."
      ],
      [
        "sin afán",
        "Sin afán, cuando puedas."
      ],
      [
        "qué pena molestar",
        "Qué pena molestar, ¿me ayudas con algo?"
      ],
      [
        "por favorcito",
        "¿Me lo mandas por favorcito?"
      ],
      [
        "me queda pendiente",
        "Me queda pendiente responderte eso."
      ],
      [
        "me acuerdo",
        "Me acuerdo que lo hablamos."
      ],
      [
        "tengo entendido",
        "Tengo entendido que sí aplica."
      ],
      [
        "si no estoy mal",
        "Si no estoy mal, es el viernes."
      ],
      [
        "mejor lo confirmo",
        "Mejor lo confirmo y te digo."
      ]
    ]
  },
  {
    "day": 10,
    "items": [
      [
        "qué vaina",
        "Qué vaina ese trancón hoy."
      ],
      [
        "qué lío",
        "Qué lío cuadrar horarios."
      ],
      [
        "me tocó",
        "Me tocó quedarme más tarde."
      ],
      [
        "me hizo falta",
        "Me hizo falta descansar."
      ],
      [
        "me parece una nota",
        "Me parece una nota ese proyecto."
      ],
      [
        "me dio duro",
        "Esa semana me dio duro."
      ],
      [
        "no te voy a mentir",
        "No te voy a mentir, me costó."
      ],
      [
        "por suerte",
        "Por suerte, salió bien."
      ],
      [
        "a la final",
        "A la final, todo se resolvió."
      ],
      [
        "a ver",
        "A ver, cuéntame bien."
      ]
    ]
  },
  {
    "day": 11,
    "items": [
      [
        "cuadrar",
        "Cuadramos una llamada mañana."
      ],
      [
        "armar",
        "Armemos un plan simple."
      ],
      [
        "sacar el tiempo",
        "Tengo que sacar el tiempo."
      ],
      [
        "estar al tanto",
        "Estoy al tanto de eso."
      ],
      [
        "me gustaría que",
        "Me gustaría que lo hiciéramos así."
      ],
      [
        "me parece justo",
        "Me parece justo."
      ],
      [
        "me queda perfecto",
        "Me queda perfecto a esa hora."
      ],
      [
        "quedamos atentos",
        "Quedamos atentos."
      ],
      [
        "te confirmo",
        "Te confirmo en un rato."
      ],
      [
        "me avisas cualquier cosa",
        "Me avisas cualquier cosa."
      ]
    ]
  },
  {
    "day": 12,
    "items": [
      [
        "con toda",
        "Esta semana vamos con toda."
      ],
      [
        "pilas",
        "Pilas con ese cruce."
      ],
      [
        "mejor dicho",
        "Mejor dicho, fue más complicado."
      ],
      [
        "básicamente",
        "Básicamente, toca practicar."
      ],
      [
        "en la jugada",
        "Estoy en la jugada con eso."
      ],
      [
        "me suena bien",
        "Me suena bien el plan."
      ],
      [
        "me interesa",
        "Me interesa ese tema."
      ],
      [
        "me llama la atención",
        "Me llama la atención aprender eso."
      ],
      [
        "a la fija",
        "A la fija, eso funciona."
      ],
      [
        "no falla",
        "Eso no falla."
      ]
    ]
  },
  {
    "day": 13,
    "items": [
      [
        "si Dios quiere",
        "Si Dios quiere, todo sale bien."
      ],
      [
        "ojalá",
        "Ojalá podamos vernos."
      ],
      [
        "me encantaría",
        "Me encantaría hacerlo."
      ],
      [
        "me preocupa un poquito",
        "Me preocupa un poquito el tiempo."
      ],
      [
        "en mi caso",
        "En mi caso, trabajo temprano."
      ],
      [
        "por ejemplo",
        "Por ejemplo, en el colegio pasa eso."
      ],
      [
        "te explico",
        "Te explico rápido."
      ],
      [
        "en pocas palabras",
        "En pocas palabras: toca organizarse."
      ],
      [
        "para rematar",
        "Y para rematar, llovió."
      ],
      [
        "qué susto",
        "Uy, qué susto."
      ]
    ]
  },
  {
    "day": 14,
    "items": [
      [
        "me da gusto",
        "Me da gusto verte bien."
      ],
      [
        "qué chévere",
        "Qué chévere ese plan."
      ],
      [
        "qué interesante",
        "Qué interesante lo que dices."
      ],
      [
        "me parece bacano",
        "Me parece bacano ese enfoque."
      ],
      [
        "en buena onda",
        "En buena onda, te lo digo…"
      ],
      [
        "sin enredos",
        "Hagámoslo sin enredos."
      ],
      [
        "con calma",
        "Con calma, paso a paso."
      ],
      [
        "me toca salir",
        "Me toca salir ya, voy tarde."
      ],
      [
        "quedamos en contacto",
        "Quedamos en contacto."
      ],
      [
        "me cuentas",
        "Me cuentas cómo te fue."
      ]
    ]
  }
];

function addMsg(who, txt) {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<div class="who">${escapeHtml(who)}</div><div class="txt">${escapeHtml(txt)}</div>`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function getPhraseBank() {
  try { return JSON.parse(localStorage.getItem(PHRASE_BANK_KEY) || "[]"); }
  catch { return []; }
}

function savePhraseBank(list) {
  localStorage.setItem(PHRASE_BANK_KEY, JSON.stringify(list.slice(0, MAX_PHRASES)));
}

function addToPhraseBank(original, improved) {
  if (!improved) return;
  const item = {
    ts: new Date().toISOString(),
    original: (original || "").trim(),
    improved: improved.trim(),
  };
  const list = getPhraseBank();
  if (list.some(x => x.improved === item.improved)) return; // dedupe
  list.unshift(item);
  savePhraseBank(list);
}

function bankTop(n = 5) {
  return getPhraseBank().slice(0, n);
}

function bankToCSV() {
  const rows = [["timestamp","original","improved"]];
  for (const r of getPhraseBank()) rows.push([r.ts, r.original, r.improved]);
  return rows.map(cols => cols.map(c => `"${String(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function ensureMic() {
  if (mediaStream) return mediaStream;
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return mediaStream;
}

async function tryWakeLock() {
  if (wakeSel?.value !== "on") return;
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      addMsg("APP", "🔆 Pantalla activa: ON");
      wakeLock.addEventListener("release", () => addMsg("APP", "🔅 Pantalla activa: liberada (iOS puede bloquear pantalla)."));
    } else {
      addMsg("APP", "ℹ️ Wake Lock no disponible en este navegador.");
    }
  } catch (e) {
    addMsg("APP", "ℹ️ No se pudo activar pantalla activa. (iPhone: Ajustes > Pantalla y brillo > Bloqueo automático).");
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
      addMsg("APP", "🔅 Pantalla activa: OFF");
    }
  } catch {}
}

async function recordForSeconds(seconds) {
  const stream = await ensureMic();
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });

  return await new Promise((resolve, reject) => {
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onerror = reject;
    rec.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
    rec.start();
    setTimeout(() => { try { rec.stop(); } catch(e) {} }, seconds * 1000);
  });
}

async function stt(blob) {
  const fd = new FormData();
  fd.append("file", blob, "audio.webm");
  const r = await fetch(`${WORKER}/stt`, { method: "POST", body: fd });
  const data = await r.json();
  return (data.text || "").trim();
}

async function chat(userText) {
  conversationText += `\nUSUARIO: ${userText}\n`;

  const payload = {
    model: "gpt-4o-mini",
    instructions: buildInstructions(),
    input: conversationText.slice(-8000)
  };

  const r = await fetch(`${WORKER}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  const botText = (data.output_text || "").trim();
    if (!botText) {
    return "[ASK] Listo, empecemos. ¿Qué hiciste hoy en la mañana?";
  }
  conversationText += `ASISTENTE: ${botText}\n`;
  return botText;
}

function parseTagged(botText) {
  const lines = botText.split("\n").map(l => l.trim()).filter(Boolean);
  let coach = "";
  let ask = "";

  for (const l of lines) {
    if (l.startsWith("[COACH]")) coach += (coach ? "\n" : "") + l.replace("[COACH]", "").trim();
    else if (l.startsWith("[ASK]")) ask += (ask ? "\n" : "") + l.replace("[ASK]", "").trim();
  }

  if (!coach && !ask) ask = botText;
  return { coach, ask };
}

async function ttsSpeak(text) {
    text = (text || "").trim();
  if (!text) {
    text = "Listo. Sigamos. Cuéntame, ¿qué tal tu día hoy?";
  }
  const voice = voiceSel.value || "shimmer";
  const r = await fetch(`${WORKER}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });

  if (!r.ok) throw new Error(await r.text());

  const buf = await r.arrayBuffer();
  const blob = new Blob([buf], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);

  return await new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.play();
  });
}

function detectCommand(userTextRaw) {
  const t = (userTextRaw || "").toLowerCase();

  if (t.includes("repite")) return { type: "repeat" };
  if (t.includes("más despacio") || t.includes("mas despacio")) return { type: "slow" };
  if (t.includes("resumen")) return { type: "summary" };
  if (t.includes("modo historia")) return { type: "story" };
  if (t.includes("corrígeme") || t.includes("corrigeme")) return { type: "correct" };
  if (t.includes("vocab")) return { type: "vocab" };
  if (t.includes("frases")) return { type: "phrases" };

  const m = t.match(/cambia tema a (deportes|familia|trabajo|noticias|negocios|intereses)/);
  if (m) return { type: "topic", topic: m[1] };

  return null;
}

function getDayIndexCalendar() {
  const startKey = "rolo_vocab_start_date";
  const start = localStorage.getItem(startKey);
  if (!start) {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(startKey, today);
    return 0;
  }
  const d0 = new Date(start);
  const d1 = new Date(new Date().toISOString().slice(0, 10));
  const diffDays = Math.floor((d1 - d0) / (1000 * 60 * 60 * 24));
  return ((diffDays % 14) + 14) % 14;
}

function getDayIndexSession() {
  const key = "rolo_vocab_session_idx";
  const n = parseInt(localStorage.getItem(key) || "0", 10);
  localStorage.setItem(key, String((n + 1) % 14));
  return n;
}

function buildVocabMinuteText() {
  const mode = vocabModeSel?.value || "calendar";
  const idx = (mode === "session") ? getDayIndexSession() : getDayIndexCalendar();
  const day = VOCAB_PACK[idx] || VOCAB_PACK[0];
  const lines = day.items.map(([w, ex], i) => (i+1) + ". " + w + ": " + ex);
  return "Vocabulario del día (Día " + day.day + ").\n" + lines.join("\n");
}

async function speakPhrasesTop() {
  const top = bankTop(5);
  if (!top.length) {
    await ttsSpeak("Todavía no tienes frases guardadas. Durante la conversación, yo te voy dejando mejoras y las guardo solito.");
    return;
  }
  const lines = top.map((x, i) => (i+1) + ". " + x.improved);
  await ttsSpeak("Tus frases top recientes.\n" + lines.join("\n"));
}

async function runLoop() {
  const turnSeconds = parseInt(turnLenSel.value || "12", 10);
  const minutes = getSessionMinutes();
  sessionEndAt = Date.now() + minutes * 60 * 1000;
  await tryWakeLock();
  addMsg("APP", `⏱️ Sesión: ${minutes} min | Corrección: ${getCorrectionMode()}`);

  // Vocab kickoff
  const vocabText = buildVocabMinuteText();
  addMsg("BOT", "[VOCAB]\n" + vocabText);
  await ttsSpeak(vocabText);

  // No-pause kickoff
  const kickoff = await chat(
    minutes === 15
      ? "Arranquemos (sesión corta de 15 minutos). Primero hacemos MODO SIN PAUSAS por 1 minuto: preguntas fáciles, sin corregirme. Después, conversación normal. Al final, dame un resumen corto. Elige un conector del día (pues / la verdad / igual / entonces / o sea) y recuérdamelo 1 vez."
      : "Arranquemos (sesión completa de 30 minutos). Primero hacemos MODO SIN PAUSAS por 2 minutos: preguntas fáciles, sin corregirme. Después pasamos a conversación normal. Elige un conector del día (pues / la verdad / igual / entonces / o sea) y recuérdamelo 2 veces."
  );
  lastBotText = kickoff;
  addMsg("BOT", kickoff);

  const tg0 = parseTagged(kickoff);
  await ttsSpeak([tg0.coach, tg0.ask].filter(Boolean).join("\n\n") || kickoff);
  // Auto-start first response with a 3-2-1 countdown
  await speakCountdown();

  let firstTurn = true;
  while (running) {
    if (sessionEndAt && Date.now() > sessionEndAt) {
      addMsg("APP", "⏱️ Tiempo. Generando resumen…");
      const botText = await chat("Cierra la sesión con un RESUMEN corto: 5 frases top + 5 palabras top + 1 foco para mañana. Termina con una despedida breve.");
      lastBotText = botText;
      addMsg("BOT", botText);
      await ttsSpeak(botText);
      running = false;
      break;
    }

    if (!firstTurn) await speakCountdown();
    firstTurn = false;
    addMsg("APP", "🎙️ Grabando " + turnSeconds + "s...");
    const audioBlob = await recordForSeconds(turnSeconds);

    const userText = await stt(audioBlob);
    if (!userText) {
      addMsg("APP", "No te escuché bien. Intenta otra vez.");
      await ttsSpeak("Perdón, no te escuché bien. ¿Me lo repites?");
      continue;
    }
    addMsg("TÚ", userText);

    const cmd = detectCommand(userText);
    if (cmd?.type === "repeat") {
      addMsg("APP", "🔁 Repitiendo lo último del bot.");
      await ttsSpeak(lastBotText);
      continue;
    }
    if (cmd?.type === "slow") {
      addMsg("APP", "🐢 Más despacio.");
      await ttsSpeak("Listo, voy más despacio. " + (parseTagged(lastBotText).ask || "Sigamos."));
      continue;
    }
    if (cmd?.type === "vocab") {
      const v = buildVocabMinuteText();
      addMsg("BOT", "[VOCAB]\n" + v);
      await ttsSpeak(v);
      continue;
    }
    if (cmd?.type === "phrases") {
      addMsg("APP", "📌 Leyendo frases guardadas...");
      await speakPhrasesTop();
      continue;
    }
    if (cmd?.type === "topic") {
      const botText = await chat("Cambia el tema a " + cmd.topic + " y haz una pregunta corta.");
      lastBotText = botText;
      addMsg("BOT", botText);
      const tg = parseTagged(botText);
      if (tg.coach) addToPhraseBank(userText, tg.coach);
      await ttsSpeak([tg.coach, tg.ask].filter(Boolean).join("\n\n") || botText);
      continue;
    }
    if (cmd?.type === "summary") {
      const botText = await chat("Haz RESUMEN final: 5 frases top + 5 palabras top + 1 foco para mañana. Corto.");
      lastBotText = botText;
      addMsg("BOT", botText);
      await ttsSpeak(botText);
      continue;
    }
    if (cmd?.type === "story") {
      const botText = await chat("Modo historia: pídeme una historia de 3 partes (contexto-acción-reacción) sobre hoy.");
      lastBotText = botText;
      addMsg("BOT", botText);
      const tg = parseTagged(botText);
      if (tg.coach) addToPhraseBank(userText, tg.coach);
      await ttsSpeak([tg.coach, tg.ask].filter(Boolean).join("\n\n") || botText);
      continue;
    }
    if (cmd?.type === "correct") {
      const botText = await chat("Corrígeme con UNA micro-mejora y haz otra pregunta. Corto.");
      lastBotText = botText;
      addMsg("BOT", botText);
      const tg = parseTagged(botText);
      if (tg.coach) addToPhraseBank(userText, tg.coach);
      await ttsSpeak([tg.coach, tg.ask].filter(Boolean).join("\n\n") || botText);
      continue;
    }

    const botText = await chat(userText);
    lastBotText = botText;
    addMsg("BOT", botText);

    const tg = parseTagged(botText);
    if (tg.coach) addToPhraseBank(userText, tg.coach);

    const speakText = [tg.coach, tg.ask].filter(Boolean).join("\n\n") || botText;
    await ttsSpeak(speakText);
  }
}

startBtn.addEventListener("click", async () => {
  try {
    if (running) return;
    running = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    addMsg("APP", "✅ Iniciando. Si Safari pregunta por micrófono, acepta.");
    await ensureMic(); // permission on user gesture
    await runLoop();
  } catch (e) {
    addMsg("APP", "Error: " + (e.message || e));
    running = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    await releaseWakeLock();
  }
});

stopBtn.addEventListener("click", async () => {
  running = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  addMsg("APP", "🛑 Sesión detenida.");
  await releaseWakeLock();
});

exportBtn.addEventListener("click", () => {
  const csv = bankToCSV();
  const stamp = new Date().toISOString().slice(0,10);
  downloadText("rolo-frases-" + stamp + ".csv", csv);
  addMsg("APP", "⬇️ Exportado CSV de frases.");
});

clearBtn.addEventListener("click", () => {
  if (!confirm("¿Seguro que quieres borrar tus frases guardadas?")) return;
  localStorage.removeItem(PHRASE_BANK_KEY);
  addMsg("APP", "🧹 Frases borradas.");
});
