import React, { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Card } from './UI';
import { useTranslation } from '../hooks/useTranslation';
import { api } from '../services/api';

const labels = {
  en: { title: 'Contact the team', description: 'Send a private message to the administrators.', placeholder: 'How can we help?', send: 'Send message', sending: 'Sending…', success: 'Message sent. An administrator can reply in the app.', error: 'Could not send your message. Please try again.' },
  pt: { title: 'Fale com a equipe', description: 'Envie uma mensagem privada para os administradores.', placeholder: 'Como podemos ajudar?', send: 'Enviar mensagem', sending: 'Enviando…', success: 'Mensagem enviada. Um administrador pode responder pelo aplicativo.', error: 'Não foi possível enviar sua mensagem. Tente novamente.' },
  fa: { title: 'تماس با تیم', description: 'پیامی خصوصی برای مدیران بفرستید.', placeholder: 'چطور می‌توانیم کمک کنیم؟', send: 'ارسال پیام', sending: 'در حال ارسال…', success: 'پیام ارسال شد. مدیر می‌تواند در برنامه پاسخ دهد.', error: 'ارسال پیام ممکن نشد. دوباره تلاش کنید.' }
};

export function ContactAdmin() {
  const { lang } = useTranslation();
  const text = labels[lang] || labels.en;
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (event) => {
    event.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setStatus('');
    try {
      await api.post('/api/notifications/contact', { message: message.trim() });
      setMessage('');
      setStatus(text.success);
    } catch {
      setStatus(text.error);
    } finally {
      setSending(false);
    }
  };

  return <Card className="space-y-3">
    <div className="flex items-center gap-2 text-sm font-semibold"><MessageSquare size={17} className="text-blue-400" />{text.title}</div>
    <p className="text-xs text-slate-400">{text.description}</p>
    <form onSubmit={send} className="space-y-2">
      <textarea aria-label={text.placeholder} placeholder={text.placeholder} value={message} onChange={event => setMessage(event.target.value)} maxLength={4000} rows={3} className="w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white placeholder:text-slate-500" />
      <button type="submit" disabled={sending || !message.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Send size={15} />{sending ? text.sending : text.send}</button>
    </form>
    {status && <p role="status" className="text-xs text-slate-300">{status}</p>}
  </Card>;
}
