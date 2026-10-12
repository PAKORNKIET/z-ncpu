// แผง AI Tutor (M5-4): ปิดไว้เป็นค่าเริ่มต้น ผู้เล่นเปิดเองด้วยคีย์ API ของตัวเอง
// ก่อนส่งเปิดดูข้อความทั้งหมดได้ คำตอบแสดงด้วย Markdown ของเราเอง (ไม่ใช้ innerHTML)
import { Bot, ExternalLink, Eye, KeyRound, Send, Settings2, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Markdown } from '../ui/Markdown';
import {
  askTutor,
  DEFAULT_SETTINGS,
  forgetKeys,
  getKey,
  loadSettings,
  MAX_QUESTION,
  MODEL_NAME,
  PROVIDER_IDS,
  PROVIDERS,
  setKey,
  storeSettings,
  systemPrompt,
  TutorError,
  userMessage,
  type HelpLevel,
  type KeyValue,
  type TutorContext,
  type TutorSettings,
} from './tutor';

const storage = (): KeyValue | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const HELP_TEXT: Record<HelpLevel, string> = { hint: 'คำใบ้ทีละขั้น', explain: 'อธิบายละเอียด' };

type Ask = { k: 'idle' } | { k: 'asking' } | { k: 'answer'; text: string } | { k: 'error'; text: string };

export function TutorPanel({ context }: { context: () => TutorContext }) {
  const [settings, setSettings] = useState<TutorSettings>(() => loadSettings(storage()));
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState('');
  const [ask, setAsk] = useState<Ask>({ k: 'idle' });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const save = (next: TutorSettings): void => {
    setSettings(next);
    storeSettings(storage(), next);
  };
  const info = PROVIDERS[settings.provider];
  const ready = settings.enabled && !editing;

  const send = async (): Promise<void> => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setAsk({ k: 'asking' });
    try {
      const text = await askTutor(
        {
          provider: settings.provider,
          model: settings.models[settings.provider],
          key: getKey(storage(), settings.provider),
          system: systemPrompt(settings.help),
          user: userMessage(context(), question),
        },
        fetch.bind(window),
        ctrl.signal,
      );
      if (!ctrl.signal.aborted) setAsk({ k: 'answer', text });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setAsk({ k: 'error', text: e instanceof TutorError ? e.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด ลองใหม่อีกครั้ง' });
    }
  };
  const stop = (): void => {
    abort.current?.abort();
    setAsk({ k: 'idle' });
  };

  return (
    <details className="tutor">
      <summary>
        <Bot size={18} aria-hidden /> ถาม AI ติวเตอร์ <span className="muted small">{settings.enabled ? `(${info.name})` : '(ปิดอยู่)'}</span>
      </summary>
      <div className="tutor-body">
        {!settings.enabled && !editing ? (
          <>
            <p className="small">
              ติวเตอร์เป็นตัวเลือกเสริม ปิดไว้เป็นค่าเริ่มต้น เมื่อเปิดใช้ เกมจะส่ง <strong>สรุปโจทย์ งานที่คุณทำอยู่ในหน้านี้ และผลทดสอบ</strong> ไปยังผู้ให้บริการ AI
              ที่คุณเลือก ด้วยคีย์ API ของคุณเอง (ค่าใช้จ่ายเป็นไปตามผู้ให้บริการ) ไม่ส่งไฟล์บันทึกหรือข้อมูลส่วนตัว และส่งเฉพาะตอนที่คุณกดส่งเท่านั้น
            </p>
            <button onClick={() => setEditing(true)}>
              <Settings2 size={16} aria-hidden /> ตั้งค่าและเปิดใช้
            </button>
          </>
        ) : null}

        {editing ? <TutorSettingsForm settings={settings} onSave={(s) => { save(s); setEditing(false); }} onCancel={() => setEditing(false)} onDisable={() => {
              forgetKeys(storage());
              save({ ...settings, enabled: false, remember: false });
              setEditing(false);
              setAsk({ k: 'idle' });
            }} /> : null}

        {ready ? (
          <>
            <div className="tutor-row">
              <label className="small">
                ระดับความช่วยเหลือ{' '}
                <select aria-label="ระดับความช่วยเหลือ" value={settings.help} onChange={(e) => save({ ...settings, help: e.target.value === 'explain' ? 'explain' : 'hint' })}>
                  {(['hint', 'explain'] as const).map((h) => (
                    <option key={h} value={h}>
                      {HELP_TEXT[h]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="linklike small" onClick={() => setEditing(true)}>
                <Settings2 size={14} aria-hidden /> ตั้งค่า
              </button>
            </div>
            <label className="tutor-question">
              <span className="small">คำถาม (ไม่ใส่ก็ได้)</span>
              <textarea
                aria-label="คำถามถึงติวเตอร์"
                rows={2}
                maxLength={MAX_QUESTION}
                value={question}
                placeholder="เช่น ทำไมแถวที่ 3 ได้ 1 แทนที่จะเป็น 0"
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <details className="tutor-preview">
              <summary className="small">
                <Eye size={14} aria-hidden /> ดูข้อความที่จะส่ง
              </summary>
              <pre className="mono small" data-testid="tutor-preview">{userMessage(context(), question)}</pre>
            </details>
            <div className="tutor-row">
              {ask.k === 'asking' ? (
                <button onClick={stop}>
                  <Square size={14} aria-hidden /> หยุด
                </button>
              ) : (
                <button className="primary" onClick={() => void send()}>
                  <Send size={16} aria-hidden /> ส่งไป {info.host}
                </button>
              )}
              <span className="muted small">{settings.models[settings.provider]}</span>
            </div>
            <div role="status" aria-live="polite" className="tutor-answer" data-testid="tutor-answer">
              {ask.k === 'asking' ? <p className="muted small">กำลังรอคำตอบ…</p> : null}
              {ask.k === 'error' ? <p className="error small">{ask.text}</p> : null}
              {ask.k === 'answer' ? (
                <>
                  <Markdown text={ask.text} headingOffset={3} />
                  <p className="muted small">คำตอบจาก AI อาจผิดได้ ลองตรวจกับวงจรหรือโปรแกรมของคุณเองเสมอ</p>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </details>
  );
}

function TutorSettingsForm(props: { settings: TutorSettings; onSave: (s: TutorSettings) => void; onCancel: () => void; onDisable: () => void }) {
  const [draft, setDraft] = useState<TutorSettings>(props.settings.enabled ? props.settings : { ...props.settings, enabled: true });
  const [key, setKeyText] = useState(() => getKey(storage(), draft.provider));
  const [error, setError] = useState<string | null>(null);
  const info = PROVIDERS[draft.provider];
  const model = draft.models[draft.provider];

  const submit = (): void => {
    if (!key.trim()) {
      setError('ใส่คีย์ API ก่อน');
      return;
    }
    if (!MODEL_NAME.test(model)) {
      setError('ชื่อโมเดลใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ . _ - :');
      return;
    }
    setKey(storage(), draft.provider, key, draft.remember);
    props.onSave({ ...draft, enabled: true });
  };

  return (
    <form
      className="tutor-settings"
      aria-label="ตั้งค่า AI ติวเตอร์"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label>
        ผู้ให้บริการ
        <select
          aria-label="ผู้ให้บริการ AI"
          value={draft.provider}
          onChange={(e) => {
            const provider = PROVIDER_IDS.find((p) => p === e.target.value) ?? draft.provider;
            setDraft({ ...draft, provider });
            setKeyText(getKey(storage(), provider));
            setError(null);
          }}
        >
          {PROVIDER_IDS.map((p) => (
            <option key={p} value={p}>
              {PROVIDERS[p].name}
            </option>
          ))}
        </select>
      </label>
      <label>
        โมเดล
        <input
          className="mono"
          aria-label="ชื่อโมเดล"
          value={model}
          maxLength={64}
          spellCheck={false}
          onChange={(e) => setDraft({ ...draft, models: { ...draft.models, [draft.provider]: e.target.value.trim() } })}
        />
        <span className="muted small">
          ค่าเริ่มต้น {info.defaultModel}{' '}
          {model !== info.defaultModel ? (
            <button type="button" className="linklike small" onClick={() => setDraft({ ...draft, models: { ...draft.models, [draft.provider]: DEFAULT_SETTINGS.models[draft.provider] } })}>
              ใช้ค่าเริ่มต้น
            </button>
          ) : null}
        </span>
      </label>
      <label>
        <span className="with-icon">
          <KeyRound size={14} aria-hidden /> คีย์ API
        </span>
        <input
          type="password"
          className="mono"
          aria-label="คีย์ API"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => {
            setKeyText(e.target.value);
            setError(null);
          }}
        />
        <a className="small" href={info.keyUrl} target="_blank" rel="noreferrer">
          ขอคีย์ของ {info.name} <ExternalLink size={12} aria-hidden />
        </a>
      </label>
      <label className="tutor-check small">
        <input type="checkbox" checked={draft.remember} onChange={(e) => setDraft({ ...draft, remember: e.target.checked })} />
        จำคีย์ไว้ในเครื่องนี้ (ไม่ติ๊ก = ลืมเมื่อปิดหรือรีโหลดหน้า · คีย์ไม่อยู่ในไฟล์ .zncpu ที่บันทึกออก)
      </label>
      <p className="muted small">
        คำขอส่งตรงจากเบราว์เซอร์ไปที่ <span className="mono">{info.host}</span> เท่านั้น ไม่ผ่านเซิร์ฟเวอร์ของ Z-NCPU อย่าใช้คีย์นี้บนเครื่องที่คนอื่นใช้ร่วม
      </p>
      {error ? (
        <p className="error small" role="alert">
          {error}
        </p>
      ) : null}
      <div className="tutor-row">
        <button type="submit" className="primary">
          บันทึกและเปิดใช้
        </button>
        <button type="button" onClick={props.onCancel}>
          ยกเลิก
        </button>
        {props.settings.enabled ? (
          <button type="button" onClick={props.onDisable}>
            ปิดติวเตอร์และลบคีย์
          </button>
        ) : null}
      </div>
    </form>
  );
}
