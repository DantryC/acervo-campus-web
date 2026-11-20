import { useState, type FormEvent } from 'react';
import { login, messageFromError, writeSession, type SessionData } from '../../services';

type Props = { onSuccess: (session: SessionData) => void };

export default function SignInPage({ onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSending(true);
    try {
      const session = await login(email.trim(), password);
      writeSession(session);
      onSuccess(session);
    } catch (issue) {
      setError(messageFromError(issue));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-aside">
        <div className="brand brand-light"><span className="brand-symbol">A</span><span>acervo<span className="brand-soft">campus</span></span></div>
        <div className="aside-copy">
          <p className="kicker">BIBLIOTECA ACADÊMICA</p>
          <h1>Conhecimento organizado. Acesso simplificado.</h1>
          <p>Uma plataforma para cuidar do acervo, acompanhar empréstimos e manter cada leitura em movimento.</p>
        </div>
        <div className="aside-bottom"><span>PLATAFORMA DE GESTÃO</span><span>01 / 04</span></div>
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
      </section>
      <section className="login-main">
        <div className="login-top"><span>ÁREA RESTRITA</span><span className="online-dot">AMBIENTE DISPONÍVEL</span></div>
        <div className="login-card">
          <div className="brand mobile-brand"><span className="brand-symbol">A</span><span>acervo<span className="brand-soft">campus</span></span></div>
          <p className="kicker kicker-olive">BEM-VINDO DE VOLTA</p>
          <h2>Entre na sua conta.</h2>
          <p className="muted">Informe suas credenciais para acessar o painel.</p>
          <form className="login-form" onSubmit={submit}>
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="username" placeholder="nome@instituicao.edu.br" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="password">Senha</label>
            <input id="password" type="password" autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <p className="alert alert-error" role="alert">{error}</p>}
            <button className="button button-primary button-wide" type="submit" disabled={sending}>{sending ? 'Verificando...' : 'Acessar painel'} <span>↗</span></button>
          </form>
          <p className="help-note">Problemas de acesso? Procure o administrador da biblioteca.</p>
        </div>
        <div className="login-foot"><span>ACERVO CAMPUS © 2026</span><span>GESTÃO DE ACERVO</span></div>
      </section>
    </main>
  );
}
