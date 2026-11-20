import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import SignInPage from './features/auth/SignInPage';
import { api, clearSession, logout, messageFromError, readSession, type SessionData, type SessionUser } from './services';

type Page = 'dashboard' | 'reports' | 'books' | 'categories' | 'authors' | 'readers' | 'loans' | 'staff';
type Category = { id: number; name: string; description: string | null };
type Author = { id: number; name: string; nationality: string | null; birthDate: string | null };
type Book = { id: number; title: string; isbn: string; year: number | null; totalCopies: number; availableCopies: number; categoryId: number; category?: Category; authors?: Author[] };
type Reader = { id: number; name: string; cpf: string; email: string | null; phone: string | null };
type Loan = { id: number; loanDate: string; dueDate: string; returnDate: string | null; status: 'ATIVO' | 'ATRASADO' | 'DEVOLVIDO'; fine: number | string; book?: Book; reader?: Reader; attendant?: { name: string } };
type Staff = SessionUser;
type Dashboard = { totalBooks: number; totalCopies: number; activeLoans: number; overdueLoans: number; totalFines: number };
type Notice = { kind: 'success' | 'error'; text: string };

type FormState = Record<string, string>;

const navItems: { id: Page; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Visão geral', icon: '◫', adminOnly: true },
  { id: 'reports', label: 'Relatórios', icon: '▥', adminOnly: true },
  { id: 'books', label: 'Acervo de livros', icon: '▤' },
  { id: 'categories', label: 'Categorias', icon: '▦', adminOnly: true },
  { id: 'authors', label: 'Autores', icon: '✎', adminOnly: true },
  { id: 'readers', label: 'Leitores', icon: '♙' },
  { id: 'loans', label: 'Empréstimos', icon: '↗' },
  { id: 'staff', label: 'Atendentes', icon: '♧', adminOnly: true }
];

function dateLabel(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}
function money(value: number | string): string {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function firstName(name: string): string { return name.split(' ')[0] || name; }
function fieldValue(form: FormState, key: string): string { return form[key] ?? ''; }

export default function App() {
  const [session, setSession] = useState<SessionData | null>(() => readSession());
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<Page>(() => readSession()?.user.isAdmin ? 'dashboard' : 'books');
  const [categories, setCategories] = useState<Category[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [readers, setReaders] = useState<Reader[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [search, setSearch] = useState('');
  const [bookCategoryFilter, setBookCategoryFilter] = useState('');
  const [bookAuthorFilter, setBookAuthorFilter] = useState('');
  const [bookAvailableOnly, setBookAvailableOnly] = useState(false);
  const [loanStatus, setLoanStatus] = useState('TODOS');
  const [form, setForm] = useState<FormState>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedAuthorIds, setSelectedAuthorIds] = useState<number[]>([]);
  const [historyReader, setHistoryReader] = useState<Reader | null>(null);
  const [readerHistory, setReaderHistory] = useState<Loan[]>([]);

  useEffect(() => {
    const onExpired = () => {
      clearSession();
      setSession(null);
      setPage('books');
      setNotice({ kind: 'error', text: 'Sua sessão expirou. Entre novamente.' });
    };
    window.addEventListener('acervo:session-expired', onExpired);
    return () => window.removeEventListener('acervo:session-expired', onExpired);
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) { setReady(true); return; }
    api.get<{ user: SessionUser }>('/auth/me')
      .then((response) => {
        const updated = { ...current, user: response.data.user };
        setSession(updated);
        if (!updated.user.isAdmin) setPage('books');
      })
      .catch(() => { clearSession(); setSession(null); })
      .finally(() => setReady(true));
  }, []);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const requests = await Promise.all([
        api.get<{ data: Category[] }>('/categories'),
        api.get<{ data: Author[] }>('/authors'),
        api.get<{ data: Book[] }>('/books'),
        api.get<{ data: Reader[] }>('/readers'),
        api.get<{ data: Loan[] }>('/loans'),
        session.user.isAdmin ? api.get<{ data: Staff[] }>('/user') : Promise.resolve({ data: { data: [] as Staff[] } }),
        session.user.isAdmin ? api.get<{ data: Dashboard }>('/reports/dashboard') : Promise.resolve({ data: { data: null as Dashboard | null } })
      ]);
      setCategories(requests[0].data.data);
      setAuthors(requests[1].data.data);
      setBooks(requests[2].data.data);
      setReaders(requests[3].data.data);
      setLoans(requests[4].data.data);
      setStaff(requests[5].data.data);
      setDashboard(requests[6].data.data);
    } catch (error) {
      setNotice({ kind: 'error', text: messageFromError(error) });
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { if (ready && session) void loadData(); }, [ready, session, loadData]);

  function handleLogin(value: SessionData) {
    setSession(value);
    setPage(value.user.isAdmin ? 'dashboard' : 'books');
    setNotice({ kind: 'success', text: `Bem-vindo, ${firstName(value.user.name)}.` });
  }

  async function handleLogout() {
    try { await logout(); } catch { /* A sessão local também precisa ser encerrada se a API estiver indisponível. */ }
    clearSession();
    setSession(null);
    setNotice(null);
  }

  function openForm(values: FormState = {}, id: number | null = null, authorsForBook: number[] = []) {
    setForm(values);
    setEditingId(id);
    setSelectedAuthorIds(authorsForBook);
    setNotice(null);
  }
  function updateField(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }

  async function perform(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: 'success', text: successMessage });
      setForm({});
      setEditingId(null);
      setSelectedAuthorIds([]);
      await loadData();
    } catch (error) {
      setNotice({ kind: 'error', text: messageFromError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { name: fieldValue(form, 'name'), description: fieldValue(form, 'description') };
    await perform(() => editingId ? api.put(`/categories/${editingId}`, payload) : api.post('/categories', payload), editingId ? 'Categoria atualizada.' : 'Categoria cadastrada.');
  }
  async function submitAuthor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { name: fieldValue(form, 'name'), nationality: fieldValue(form, 'nationality'), birthDate: fieldValue(form, 'birthDate') || null };
    await perform(() => editingId ? api.put(`/authors/${editingId}`, payload) : api.post('/authors', payload), editingId ? 'Autor atualizado.' : 'Autor cadastrado.');
  }
  async function submitBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      title: fieldValue(form, 'title'), isbn: fieldValue(form, 'isbn'),
      year: fieldValue(form, 'year') ? Number(fieldValue(form, 'year')) : null,
      totalCopies: Number(fieldValue(form, 'totalCopies') || 0),
      categoryId: Number(fieldValue(form, 'categoryId')),
      authorIds: selectedAuthorIds
    };
    await perform(() => editingId ? api.put(`/books/${editingId}`, payload) : api.post('/books', payload), editingId ? 'Livro atualizado.' : 'Livro cadastrado.');
  }
  async function submitReader(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { name: fieldValue(form, 'name'), cpf: fieldValue(form, 'cpf'), email: fieldValue(form, 'email'), phone: fieldValue(form, 'phone') };
    await perform(() => editingId ? api.put(`/readers/${editingId}`, payload) : api.post('/readers', payload), editingId ? 'Leitor atualizado.' : 'Leitor cadastrado.');
  }
  async function submitStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Record<string, string> = {
      name: fieldValue(form, 'name'),
      username: fieldValue(form, 'username'),
      email: fieldValue(form, 'email')
    };
    if (fieldValue(form, 'password')) payload.password = fieldValue(form, 'password');
    await perform(
      () => editingId ? api.put(`/user/${editingId}`, payload) : api.post('/user', { ...payload, password: fieldValue(form, 'password') }),
      editingId ? 'Atendente atualizado.' : 'Atendente cadastrado.'
    );
  }
  async function submitLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const response = await api.post<{ data: Loan }>('/loans', { bookId: Number(fieldValue(form, 'bookId')), readerId: Number(fieldValue(form, 'readerId')) });
      const updatedBook = response.data.data.book;
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id
          ? { ...book, availableCopies: Number(updatedBook.availableCopies) }
          : book));
      }
      return response.data;
    }, 'Empréstimo registrado.');
  }

  async function removeRecord(kind: 'categories' | 'authors' | 'books', id: number) {
    if (!window.confirm('Confirma a exclusão deste registro?')) return;
    await perform(() => api.delete(`/${kind}/${id}`), 'Registro excluído.');
  }
  async function toggleStaff(item: Staff) {
    await perform(() => api.patch(`/user/${item.id}/active`, { active: !item.active }), item.active ? 'Atendente desativado.' : 'Atendente ativado.');
  }
  async function removeReader(reader: Reader) {
    if (!window.confirm(`Confirma a exclusão do leitor ${reader.name}? Leitores com histórico de empréstimos não podem ser excluídos.`)) return;
    await perform(() => api.delete(`/readers/${reader.id}`), 'Leitor excluído.');
  }
  async function removeStaff(item: Staff) {
    if (!window.confirm(`Confirma a exclusão do atendente ${item.name}? Atendentes com empréstimos registrados não podem ser excluídos.`)) return;
    await perform(() => api.delete(`/user/${item.id}`), 'Atendente excluído.');
  }
  async function returnBook(loan: Loan) {
    if (!window.confirm(`Registrar a devolução de “${loan.book?.title || 'este livro'}”?`)) return;
    await perform(async () => {
      const response = await api.patch<{ data: Loan }>(`/loans/${loan.id}/return`);
      const updatedBook = response.data.data.book;
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id
          ? { ...book, availableCopies: Number(updatedBook.availableCopies) }
          : book));
      }
      return response.data;
    }, 'Devolução registrada.');
  }
  async function showHistory(reader: Reader) {
    setHistoryReader(reader);
    try {
      const response = await api.get<{ data: Loan[] }>(`/readers/${reader.id}/loans`);
      setReaderHistory(response.data.data);
    } catch (error) {
      setNotice({ kind: 'error', text: messageFromError(error) });
      setHistoryReader(null);
    }
  }

  const visibleBooks = useMemo(() => books.filter((book) => {
    const text = `${book.title} ${book.isbn} ${(book.authors || []).map((author) => author.name).join(' ')}`.toLowerCase();
    const matchesText = text.includes(search.toLowerCase());
    const matchesCategory = !bookCategoryFilter || String(book.categoryId) === bookCategoryFilter;
    const matchesAuthor = !bookAuthorFilter || (book.authors || []).some((author) => String(author.id) === bookAuthorFilter);
    const matchesAvailability = !bookAvailableOnly || book.availableCopies > 0;
    return matchesText && matchesCategory && matchesAuthor && matchesAvailability;
  }), [books, search, bookCategoryFilter, bookAuthorFilter, bookAvailableOnly]);
  const visibleLoans = useMemo(() => loans.filter((loan) => loanStatus === 'TODOS' || loan.status === loanStatus), [loans, loanStatus]);
  const activeNav = navItems.filter((item) => !item.adminOnly || session?.user.isAdmin);

  if (!ready) return <div className="app-loading"><div className="loading-emblem">A</div><span>Preparando seu espaço...</span></div>;
  if (!session) return <SignInPage onSuccess={handleLogin} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-symbol">A</span><span>acervo<span className="brand-soft">campus</span><small>GESTÃO DE BIBLIOTECA</small></span></div>
        <div className="sidebar-label">ESPAÇO DE TRABALHO</div>
        <nav className="side-nav" aria-label="Navegação principal">
          {activeNav.map((item) => (
            <button type="button" key={item.id} className={`nav-link ${page === item.id ? 'selected' : ''}`} onClick={() => { setPage(item.id); setForm({}); setEditingId(null); setNotice(null); }}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>{page === item.id && <span className="nav-current" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><span className="help-icon">?</span><div><strong>Precisa de ajuda?</strong><small>Fale com o administrador</small></div></div>
          <div className="sidebar-version">ACERVO CAMPUS <span>v1.0</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Biblioteca</span><b>/</b><strong>{navItems.find((item) => item.id === page)?.label}</strong></div>
          <div className="topbar-user"><div className="user-meta"><strong>{session.user.name}</strong><span>{session.user.isAdmin ? 'Administrador' : 'Atendente'}</span></div><div className="avatar">{session.user.name.slice(0, 1).toUpperCase()}</div><button className="logout-button" onClick={handleLogout} title="Sair da conta">↗</button></div>
        </header>
        <section className="page-content">
          <div className="page-heading">
            <div><p className="kicker kicker-olive">{page === 'dashboard' ? 'RESUMO DA OPERAÇÃO' : page === 'reports' ? 'ANÁLISE DA BIBLIOTECA' : 'GESTÃO DO ACERVO'}</p><h1>{pageTitle(page)}</h1><p>{pageSubtitle(page)}</p></div>
            <div className="heading-actions"><span className="today-label">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span><button className="button button-quiet" onClick={() => void loadData()} disabled={loading}>↻ Atualizar</button></div>
          </div>
          {notice && <div className={`notice ${notice.kind === 'error' ? 'notice-error' : 'notice-success'}`} role="status"><span>{notice.kind === 'error' ? '!' : '✓'}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Fechar aviso">×</button></div>}
          {loading && <div className="loading-line"><span /> Atualizando dados...</div>}

          {page === 'dashboard' && session.user.isAdmin && <DashboardView dashboard={dashboard} loans={loans} books={books} onGo={(next) => setPage(next)} />}
          {page === 'reports' && session.user.isAdmin && <ReportsView dashboard={dashboard} loans={loans} />}
          {page === 'books' && <BooksView books={visibleBooks} categories={categories} authors={authors} isAdmin={session.user.isAdmin} search={search} setSearch={setSearch} categoryFilter={bookCategoryFilter} setCategoryFilter={setBookCategoryFilter} authorFilter={bookAuthorFilter} setAuthorFilter={setBookAuthorFilter} availableOnly={bookAvailableOnly} setAvailableOnly={setBookAvailableOnly} form={form} updateField={updateField} selectedAuthorIds={selectedAuthorIds} setSelectedAuthorIds={setSelectedAuthorIds} editingId={editingId} busy={busy} openForm={openForm} submit={submitBook} remove={removeRecord} />}
          {page === 'categories' && session.user.isAdmin && <CategoriesView rows={categories} form={form} updateField={updateField} editingId={editingId} busy={busy} openForm={openForm} submit={submitCategory} remove={removeRecord} />}
          {page === 'authors' && session.user.isAdmin && <AuthorsView rows={authors} form={form} updateField={updateField} editingId={editingId} busy={busy} openForm={openForm} submit={submitAuthor} remove={removeRecord} />}
          {page === 'readers' && <ReadersView rows={readers} isAdmin={session.user.isAdmin} form={form} updateField={updateField} editingId={editingId} busy={busy} openForm={openForm} submit={submitReader} onHistory={showHistory} onRemove={removeReader} />}
          {page === 'loans' && <LoansView rows={visibleLoans} books={books} readers={readers} status={loanStatus} setStatus={setLoanStatus} form={form} updateField={updateField} busy={busy} submit={submitLoan} onReturn={returnBook} />}
          {page === 'staff' && session.user.isAdmin && <StaffView rows={staff} form={form} updateField={updateField} editingId={editingId} busy={busy} openForm={openForm} submit={submitStaff} toggle={toggleStaff} remove={removeStaff} />}
        </section>
      </main>
      {historyReader && <HistoryModal reader={historyReader} rows={readerHistory} onClose={() => setHistoryReader(null)} />}
    </div>
  );
}

function pageTitle(page: Page): string {
  return ({ dashboard: 'Visão geral', reports: 'Relatórios', books: 'Acervo de livros', categories: 'Categorias', authors: 'Autores', readers: 'Leitores', loans: 'Empréstimos', staff: 'Equipe de atendimento' })[page];
}
function pageSubtitle(page: Page): string {
  return ({ dashboard: 'Acompanhe os principais números da biblioteca.', reports: 'Consulte atrasos, devoluções e multas registradas.', books: 'Consulte títulos, disponibilidade e informações bibliográficas.', categories: 'Organize os livros por assunto e área de conhecimento.', authors: 'Mantenha os dados dos autores do acervo.', readers: 'Cadastre leitores e consulte o histórico de movimentações.', loans: 'Registre retiradas, acompanhe prazos e realize devoluções.', staff: 'Gerencie as contas de atendentes da biblioteca.' })[page];
}

function DashboardView({ dashboard, loans, books, onGo }: { dashboard: Dashboard | null; loans: Loan[]; books: Book[]; onGo: (page: Page) => void }) {
  const latest = [...loans].slice(0, 5);
  const metrics = [
    { label: 'Títulos cadastrados', value: dashboard?.totalBooks ?? books.length, icon: '▤', tone: 'tone-sand', note: `${dashboard?.totalCopies ?? books.reduce((sum, book) => sum + book.totalCopies, 0)} exemplares no acervo` },
    { label: 'Empréstimos ativos', value: dashboard?.activeLoans ?? 0, icon: '↗', tone: 'tone-green', note: 'Dentro do prazo de devolução' },
    { label: 'Em atraso', value: dashboard?.overdueLoans ?? 0, icon: '◷', tone: 'tone-rose', note: 'Precisam de acompanhamento' },
    { label: 'Multas registradas', value: money(dashboard?.totalFines ?? 0), icon: 'R$', tone: 'tone-blue', note: 'Valor acumulado de devoluções' }
  ];
  return <>
    <div className="metric-grid">{metrics.map((item) => <article className="metric-card" key={item.label}><div className="metric-top"><span>{item.label}</span><span className={`metric-icon ${item.tone}`}>{item.icon}</span></div><strong className="metric-value">{item.value}</strong><small>{item.note}</small></article>)}</div>
    <div className="dashboard-grid">
      <section className="panel recent-panel"><div className="panel-heading"><div><span className="panel-kicker">MOVIMENTAÇÃO</span><h2>Empréstimos recentes</h2></div><button className="text-button" onClick={() => onGo('loans')}>Ver todos ↗</button></div>
        {latest.length === 0 ? <EmptyState title="Nenhum empréstimo ainda" description="Quando um empréstimo for registrado, ele aparecerá aqui." /> : <div className="table-wrap"><table><thead><tr><th>LEITOR</th><th>LIVRO</th><th>DEVOLUÇÃO</th><th>STATUS</th></tr></thead><tbody>{latest.map((loan) => <tr key={loan.id}><td><strong>{loan.reader?.name || '—'}</strong></td><td>{loan.book?.title || '—'}</td><td>{dateLabel(loan.dueDate)}</td><td><StatusTag status={loan.status} /></td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel shortcuts-panel"><div className="panel-heading"><div><span className="panel-kicker">ATALHOS</span><h2>Acesso rápido</h2></div></div><div className="shortcut-list"><button onClick={() => onGo('books')}><span>▤</span><div><strong>Consultar acervo</strong><small>Encontre um título</small></div><b>↗</b></button><button onClick={() => onGo('readers')}><span>♙</span><div><strong>Gerenciar leitores</strong><small>Cadastro e histórico</small></div><b>↗</b></button><button onClick={() => onGo('loans')}><span>↗</span><div><strong>Empréstimos</strong><small>Retiradas e devoluções</small></div><b>↗</b></button></div></section>
    </div>
  </>;
}

function ReportsView({ dashboard, loans }: { dashboard: Dashboard | null; loans: Loan[] }) {
  const overdueLoans = loans.filter((loan) => loan.status === 'ATRASADO');
  const finedLoans = loans.filter((loan) => Number(loan.fine || 0) > 0);
  const returnedLoans = loans.filter((loan) => loan.status === 'DEVOLVIDO');
  const metrics = [
    { label: 'Empréstimos registrados', value: loans.length },
    { label: 'Devoluções realizadas', value: returnedLoans.length },
    { label: 'Atrasos em aberto', value: dashboard?.overdueLoans ?? overdueLoans.length },
    { label: 'Multas registradas', value: money(dashboard?.totalFines ?? 0) }
  ];

  return <>
    <div className="metric-grid">
      {metrics.map((item) => <article className="metric-card" key={item.label}>
        <div className="metric-top"><span>{item.label}</span></div>
        <strong className="metric-value">{item.value}</strong>
      </article>)}
    </div>
    <DataPanel>
      <div className="panel-heading"><div><span className="panel-kicker">ACOMPANHAMENTO</span><h2>Empréstimos em atraso</h2></div><span className="toolbar-caption">{overdueLoans.length} registros</span></div>
      {overdueLoans.length === 0 ? <EmptyState title="Nenhum empréstimo em atraso" description="Os empréstimos vencidos e ainda não devolvidos aparecerão aqui." /> : <div className="table-wrap"><table><thead><tr><th>LEITOR</th><th>LIVRO</th><th>EMPRÉSTIMO</th><th>VENCIMENTO</th><th>STATUS</th></tr></thead><tbody>
        {overdueLoans.map((loan) => <tr key={loan.id}><td><strong>{loan.reader?.name || '—'}</strong></td><td>{loan.book?.title || '—'}</td><td>{dateLabel(loan.loanDate)}</td><td>{dateLabel(loan.dueDate)}</td><td><StatusTag status={loan.status} /></td></tr>)}
      </tbody></table></div>}
    </DataPanel>
    <DataPanel>
      <div className="panel-heading"><div><span className="panel-kicker">FINANCEIRO</span><h2>Devoluções com multa</h2></div><span className="toolbar-caption">{finedLoans.length} registros</span></div>
      {finedLoans.length === 0 ? <EmptyState title="Nenhuma multa registrada" description="Devoluções com atraso e multa calculada aparecerão aqui." /> : <div className="table-wrap"><table><thead><tr><th>LEITOR</th><th>LIVRO</th><th>DEVOLUÇÃO</th><th>MULTA</th></tr></thead><tbody>
        {finedLoans.map((loan) => <tr key={loan.id}><td><strong>{loan.reader?.name || '—'}</strong></td><td>{loan.book?.title || '—'}</td><td>{dateLabel(loan.returnDate)}</td><td>{money(loan.fine)}</td></tr>)}
      </tbody></table></div>}
    </DataPanel>
    <DataPanel>
      <div className="panel-heading"><div><span className="panel-kicker">HISTÓRICO</span><h2>Movimentação da biblioteca</h2></div><span className="toolbar-caption">{loans.length} registros</span></div>
      {loans.length === 0 ? <EmptyState title="Sem movimentações" description="Os empréstimos registrados aparecerão neste relatório." /> : <div className="table-wrap"><table><thead><tr><th>LEITOR</th><th>LIVRO</th><th>RETIRADA</th><th>VENCIMENTO</th><th>DEVOLUÇÃO</th><th>STATUS</th><th>MULTA</th></tr></thead><tbody>
        {loans.map((loan) => <tr key={loan.id}><td><strong>{loan.reader?.name || '—'}</strong></td><td>{loan.book?.title || '—'}</td><td>{dateLabel(loan.loanDate)}</td><td>{dateLabel(loan.dueDate)}</td><td>{dateLabel(loan.returnDate)}</td><td><StatusTag status={loan.status} /></td><td>{money(loan.fine)}</td></tr>)}
      </tbody></table></div>}
    </DataPanel>
  </>;
}

function PageToolbar({ children, action }: { children: ReactNode; action?: ReactNode }) { return <div className="section-toolbar"><div>{children}</div>{action}</div>; }
function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={`form-field ${wide ? 'field-wide' : ''}`}><span>{label}</span>{children}</label>; }
function FormActions({ busy, editing, onCancel }: { busy: boolean; editing?: boolean; onCancel: () => void }) { return <div className="form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancelar</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar'}</button></div>; }
function DataPanel({ children }: { children: ReactNode }) { return <section className="panel data-panel">{children}</section>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <div className="empty-state"><span>⌕</span><strong>{title}</strong><p>{description}</p></div>; }
function StatusTag({ status }: { status: string }) { const label = status === 'ATIVO' ? 'Ativo' : status === 'ATRASADO' ? 'Atrasado' : status === 'DEVOLVIDO' ? 'Devolvido' : status; return <span className={`status-tag ${status.toLowerCase()}`}>{label}</span>; }

function BooksView(props: { books: Book[]; categories: Category[]; authors: Author[]; isAdmin: boolean; search: string; setSearch: (value: string) => void; categoryFilter: string; setCategoryFilter: (value: string) => void; authorFilter: string; setAuthorFilter: (value: string) => void; availableOnly: boolean; setAvailableOnly: (value: boolean) => void; form: FormState; updateField: (key: string, value: string) => void; selectedAuthorIds: number[]; setSelectedAuthorIds: (ids: number[]) => void; editingId: number | null; busy: boolean; openForm: (values?: FormState, id?: number | null, authorIds?: number[]) => void; submit: (event: FormEvent<HTMLFormElement>) => void; remove: (kind: 'categories' | 'authors' | 'books', id: number) => void }) {
  const [showForm, setShowForm] = useState(false);
  function beginEdit(book: Book) { props.openForm({ title: book.title, isbn: book.isbn, year: String(book.year || ''), totalCopies: String(book.totalCopies), categoryId: String(book.categoryId) }, book.id, (book.authors || []).map((author) => author.id)); setShowForm(true); }
  return <>
    <PageToolbar action={props.isAdmin ? <button className="button button-primary" onClick={() => { props.openForm({ totalCopies: '1' }); setShowForm((value) => !value); }}>＋ Novo livro</button> : undefined}>
      <div className="book-toolbar">
        <div className="search-box"><span>⌕</span><input aria-label="Buscar livros" placeholder="Buscar por título, ISBN ou autor..." value={props.search} onChange={(event) => props.setSearch(event.target.value)} /></div>
        <div className="book-filter-row">
          <label className="filter-select"><span>CATEGORIA</span><select aria-label="Filtrar por categoria" value={props.categoryFilter} onChange={(event) => props.setCategoryFilter(event.target.value)}><option value="">Todas</option>{props.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="filter-select"><span>AUTOR</span><select aria-label="Filtrar por autor" value={props.authorFilter} onChange={(event) => props.setAuthorFilter(event.target.value)}><option value="">Todos</option>{props.authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}</select></label>
          <label className="availability-filter"><input type="checkbox" checked={props.availableOnly} onChange={(event) => props.setAvailableOnly(event.target.checked)} /> Somente disponíveis</label>
        </div>
      </div>
    </PageToolbar>
    {showForm && props.isAdmin && <DataPanel><div className="form-panel-heading"><div><span className="panel-kicker">CATÁLOGO</span><h2>{props.editingId ? 'Editar livro' : 'Novo livro'}</h2></div><button className="icon-button" onClick={() => { setShowForm(false); props.openForm(); }}>×</button></div><form className="data-form" onSubmit={(event) => { props.submit(event); setShowForm(false); }}>
      <Field label="Título"><input value={fieldValue(props.form, 'title')} onChange={(event) => props.updateField('title', event.target.value)} required /></Field>
      <Field label="ISBN"><input value={fieldValue(props.form, 'isbn')} onChange={(event) => props.updateField('isbn', event.target.value)} required /></Field>
      <Field label="Ano de publicação"><input type="number" min="1400" max="2200" value={fieldValue(props.form, 'year')} onChange={(event) => props.updateField('year', event.target.value)} /></Field>
      <Field label="Total de exemplares"><input type="number" min="0" value={fieldValue(props.form, 'totalCopies')} onChange={(event) => props.updateField('totalCopies', event.target.value)} required /></Field>
      <Field label="Categoria"><select value={fieldValue(props.form, 'categoryId')} onChange={(event) => props.updateField('categoryId', event.target.value)} required><option value="">Selecione</option>{props.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
      <Field label="Autores"><select multiple value={props.selectedAuthorIds.map(String)} onChange={(event) => props.setSelectedAuthorIds(Array.from((event.currentTarget as HTMLSelectElement).selectedOptions, (option: HTMLOptionElement) => Number(option.value)))} required>{props.authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}</select><small className="field-hint">Use Ctrl (Windows) ou Command (Mac) para selecionar vários.</small></Field>
      <FormActions busy={props.busy} editing={Boolean(props.editingId)} onCancel={() => { setShowForm(false); props.openForm(); }} />
    </form></DataPanel>}
    <DataPanel><div className="panel-heading"><div><span className="panel-kicker">CATÁLOGO ATUAL</span><h2>{props.books.length} {props.books.length === 1 ? 'título encontrado' : 'títulos encontrados'}</h2></div><span className="result-caption">DISPONIBILIDADE EM TEMPO REAL</span></div>
      {props.books.length === 0 ? <EmptyState title="Nenhum livro encontrado" description="Ajuste a busca ou cadastre um novo título." /> : <div className="table-wrap"><table><thead><tr><th>TÍTULO</th><th>CATEGORIA</th><th>AUTORES</th><th>EXEMPLARES</th><th>DISPONIBILIDADE</th>{props.isAdmin && <th />}</tr></thead><tbody>{props.books.map((book) => <tr key={book.id}><td><div className="book-cell"><span className="book-cover">▤</span><div><strong>{book.title}</strong><small>ISBN {book.isbn}{book.year ? ` · ${book.year}` : ''}</small></div></div></td><td>{book.category?.name || '—'}</td><td>{(book.authors || []).map((author) => author.name).join(', ') || '—'}</td><td>{book.totalCopies}</td><td><span className={`stock-pill ${book.availableCopies > 0 ? 'in-stock' : 'out-stock'}`}>{book.availableCopies} disponíveis</span></td>{props.isAdmin && <td><div className="row-actions"><button onClick={() => beginEdit(book)}>Editar</button><button className="danger-text" onClick={() => props.remove('books', book.id)}>Excluir</button></div></td>}</tr>)}</tbody></table></div>}
    </DataPanel>
  </>;
}

function CategoriesView(props: { rows: Category[]; form: FormState; updateField: (key: string, value: string) => void; editingId: number | null; busy: boolean; openForm: (values?: FormState, id?: number | null) => void; submit: (event: FormEvent<HTMLFormElement>) => void; remove: (kind: 'categories' | 'authors' | 'books', id: number) => void }) {
  const [showForm, setShowForm] = useState(false);
  return <>
    <PageToolbar action={<button className="button button-primary" onClick={() => { props.openForm(); setShowForm((value) => !value); }}>＋ Nova categoria</button>}><span className="toolbar-caption">{props.rows.length} categorias cadastradas</span></PageToolbar>
    {showForm && <DataPanel><div className="form-panel-heading"><div><span className="panel-kicker">ORGANIZAÇÃO</span><h2>{props.editingId ? 'Editar categoria' : 'Nova categoria'}</h2></div><button className="icon-button" onClick={() => { setShowForm(false); props.openForm(); }}>×</button></div><form className="data-form" onSubmit={(event) => { props.submit(event); setShowForm(false); }}><Field label="Nome"><input value={fieldValue(props.form, 'name')} onChange={(event) => props.updateField('name', event.target.value)} required /></Field><Field label="Descrição"><input value={fieldValue(props.form, 'description')} onChange={(event) => props.updateField('description', event.target.value)} /></Field><FormActions busy={props.busy} editing={Boolean(props.editingId)} onCancel={() => { setShowForm(false); props.openForm(); }} /></form></DataPanel>}
    <DataPanel><div className="panel-heading"><div><span className="panel-kicker">CLASSIFICAÇÃO</span><h2>Lista de categorias</h2></div></div>{props.rows.length === 0 ? <EmptyState title="Nenhuma categoria cadastrada" description="Crie categorias para organizar os livros." /> : <div className="table-wrap"><table><thead><tr><th>NOME</th><th>DESCRIÇÃO</th><th /></tr></thead><tbody>{props.rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.description || '—'}</td><td><div className="row-actions"><button onClick={() => { props.openForm({ name: row.name, description: row.description || '' }, row.id); setShowForm(true); }}>Editar</button><button className="danger-text" onClick={() => props.remove('categories', row.id)}>Excluir</button></div></td></tr>)}</tbody></table></div>}</DataPanel>
  </>;
}

function AuthorsView(props: { rows: Author[]; form: FormState; updateField: (key: string, value: string) => void; editingId: number | null; busy: boolean; openForm: (values?: FormState, id?: number | null) => void; submit: (event: FormEvent<HTMLFormElement>) => void; remove: (kind: 'categories' | 'authors' | 'books', id: number) => void }) {
  const [showForm, setShowForm] = useState(false);
  return <>
    <PageToolbar action={<button className="button button-primary" onClick={() => { props.openForm(); setShowForm((value) => !value); }}>＋ Novo autor</button>}><span className="toolbar-caption">{props.rows.length} autores cadastrados</span></PageToolbar>
    {showForm && <DataPanel><div className="form-panel-heading"><div><span className="panel-kicker">BIBLIOGRAFIA</span><h2>{props.editingId ? 'Editar autor' : 'Novo autor'}</h2></div><button className="icon-button" onClick={() => { setShowForm(false); props.openForm(); }}>×</button></div><form className="data-form" onSubmit={(event) => { props.submit(event); setShowForm(false); }}><Field label="Nome"><input value={fieldValue(props.form, 'name')} onChange={(event) => props.updateField('name', event.target.value)} required /></Field><Field label="Nacionalidade"><input value={fieldValue(props.form, 'nationality')} onChange={(event) => props.updateField('nationality', event.target.value)} /></Field><Field label="Data de nascimento"><input type="date" value={fieldValue(props.form, 'birthDate')} onChange={(event) => props.updateField('birthDate', event.target.value)} /></Field><FormActions busy={props.busy} editing={Boolean(props.editingId)} onCancel={() => { setShowForm(false); props.openForm(); }} /></form></DataPanel>}
    <DataPanel><div className="panel-heading"><div><span className="panel-kicker">CADASTRO DE AUTORES</span><h2>Autores do acervo</h2></div></div>{props.rows.length === 0 ? <EmptyState title="Nenhum autor cadastrado" description="Cadastre os autores para relacioná-los aos livros." /> : <div className="table-wrap"><table><thead><tr><th>NOME</th><th>NACIONALIDADE</th><th>NASCIMENTO</th><th /></tr></thead><tbody>{props.rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.nationality || '—'}</td><td>{dateLabel(row.birthDate)}</td><td><div className="row-actions"><button onClick={() => { props.openForm({ name: row.name, nationality: row.nationality || '', birthDate: row.birthDate || '' }, row.id); setShowForm(true); }}>Editar</button><button className="danger-text" onClick={() => props.remove('authors', row.id)}>Excluir</button></div></td></tr>)}</tbody></table></div>}</DataPanel>
  </>;
}

function ReadersView(props: { rows: Reader[]; isAdmin: boolean; form: FormState; updateField: (key: string, value: string) => void; editingId: number | null; busy: boolean; openForm: (values?: FormState, id?: number | null) => void; submit: (event: FormEvent<HTMLFormElement>) => void; onHistory: (reader: Reader) => void; onRemove: (reader: Reader) => void }) {
  const [showForm, setShowForm] = useState(false);
  return <>
    <PageToolbar action={<button className="button button-primary" onClick={() => { props.openForm(); setShowForm((value) => !value); }}>＋ Novo leitor</button>}><span className="toolbar-caption">{props.rows.length} leitores cadastrados</span></PageToolbar>
    {showForm && <DataPanel><div className="form-panel-heading"><div><span className="panel-kicker">CADASTRO</span><h2>{props.editingId ? 'Editar leitor' : 'Novo leitor'}</h2></div><button className="icon-button" onClick={() => { setShowForm(false); props.openForm(); }}>×</button></div><form className="data-form" onSubmit={(event) => { props.submit(event); setShowForm(false); }}><Field label="Nome completo"><input value={fieldValue(props.form, 'name')} onChange={(event) => props.updateField('name', event.target.value)} required /></Field><Field label="CPF (11 dígitos)"><input inputMode="numeric" maxLength={14} value={fieldValue(props.form, 'cpf')} onChange={(event) => props.updateField('cpf', event.target.value)} required /></Field><Field label="E-mail"><input type="email" value={fieldValue(props.form, 'email')} onChange={(event) => props.updateField('email', event.target.value)} /></Field><Field label="Telefone"><input value={fieldValue(props.form, 'phone')} onChange={(event) => props.updateField('phone', event.target.value)} /></Field><FormActions busy={props.busy} editing={Boolean(props.editingId)} onCancel={() => { setShowForm(false); props.openForm(); }} /></form></DataPanel>}
    <DataPanel><div className="panel-heading"><div><span className="panel-kicker">BASE DE LEITORES</span><h2>Leitores cadastrados</h2></div></div>{props.rows.length === 0 ? <EmptyState title="Nenhum leitor cadastrado" description="Cadastre leitores para registrar empréstimos." /> : <div className="table-wrap"><table><thead><tr><th>NOME</th><th>CPF</th><th>CONTATO</th><th /></tr></thead><tbody>{props.rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.cpf}</td><td>{row.email || '—'}<small className="table-subline">{row.phone || ''}</small></td><td><div className="row-actions"><button onClick={() => { props.openForm({ name: row.name, cpf: row.cpf, email: row.email || '', phone: row.phone || '' }, row.id); setShowForm(true); }}>Editar</button><button onClick={() => props.onHistory(row)}>Histórico</button>{props.isAdmin && <button className="danger-text" onClick={() => props.onRemove(row)}>Excluir</button>}</div></td></tr>)}</tbody></table></div>}</DataPanel>
  </>;
}

function LoansView(props: { rows: Loan[]; books: Book[]; readers: Reader[]; status: string; setStatus: (value: string) => void; form: FormState; updateField: (key: string, value: string) => void; busy: boolean; submit: (event: FormEvent<HTMLFormElement>) => void; onReturn: (loan: Loan) => void }) {
  const [showForm, setShowForm] = useState(false);
  const availableBooks = props.books.filter((book) => book.availableCopies > 0);
  return <>
    <PageToolbar action={<button className="button button-primary" onClick={() => setShowForm((value) => !value)}>＋ Novo empréstimo</button>}><div className="filter-row"><label className="filter-select"><span>STATUS</span><select value={props.status} onChange={(event) => props.setStatus(event.target.value)}><option value="TODOS">Todos</option><option value="ATIVO">Ativos</option><option value="ATRASADO">Atrasados</option><option value="DEVOLVIDO">Devolvidos</option></select></label><span className="toolbar-caption">{props.rows.length} registros</span></div></PageToolbar>
    {showForm && <DataPanel><div className="form-panel-heading"><div><span className="panel-kicker">MOVIMENTAÇÃO</span><h2>Registrar empréstimo</h2></div><button className="icon-button" onClick={() => setShowForm(false)}>×</button></div><form className="data-form" onSubmit={(event) => { props.submit(event); setShowForm(false); }}><Field label="Leitor"><select value={fieldValue(props.form, 'readerId')} onChange={(event) => props.updateField('readerId', event.target.value)} required><option value="">Selecione um leitor</option>{props.readers.map((reader) => <option key={reader.id} value={reader.id}>{reader.name} — {reader.cpf}</option>)}</select></Field><Field label="Livro"><select value={fieldValue(props.form, 'bookId')} onChange={(event) => props.updateField('bookId', event.target.value)} required><option value="">Selecione um livro</option>{availableBooks.map((book) => <option key={book.id} value={book.id}>{book.title} ({book.availableCopies} disponíveis)</option>)}</select></Field><div className="form-note">Prazo padrão: 7 dias. O sistema bloqueia leitores com três empréstimos ativos ou com atraso em aberto.</div><FormActions busy={props.busy} onCancel={() => setShowForm(false)} /></form></DataPanel>}
    <DataPanel><div className="panel-heading"><div><span className="panel-kicker">CONTROLE DE CIRCULAÇÃO</span><h2>Empréstimos registrados</h2></div></div>{props.rows.length === 0 ? <EmptyState title="Nenhum empréstimo encontrado" description="Os novos empréstimos aparecerão nesta lista." /> : <div className="table-wrap"><table><thead><tr><th>LEITOR</th><th>LIVRO</th><th>RETIRADA</th><th>VENCIMENTO</th><th>STATUS</th><th>MULTA</th><th /></tr></thead><tbody>{props.rows.map((loan) => <tr key={loan.id}><td><strong>{loan.reader?.name || '—'}</strong></td><td>{loan.book?.title || '—'}</td><td>{dateLabel(loan.loanDate)}</td><td>{dateLabel(loan.dueDate)}</td><td><StatusTag status={loan.status} /></td><td>{money(loan.fine)}</td><td>{loan.status !== 'DEVOLVIDO' && <button className="table-action" onClick={() => props.onReturn(loan)}>Registrar devolução</button>}</td></tr>)}</tbody></table></div>}</DataPanel>
  </>;
}

function StaffView(props: { rows: Staff[]; form: FormState; updateField: (key: string, value: string) => void; editingId: number | null; busy: boolean; openForm: (values?: FormState, id?: number | null) => void; submit: (event: FormEvent<HTMLFormElement>) => void; toggle: (item: Staff) => void; remove: (item: Staff) => void }) {
  const [showForm, setShowForm] = useState(false);
  return <>
    <PageToolbar action={<button className="button button-primary" onClick={() => { props.openForm(); setShowForm((value) => !value); }}>＋ Novo atendente</button>}><span className="toolbar-caption">{props.rows.length} contas cadastradas</span></PageToolbar>
    {showForm && <DataPanel><div className="form-panel-heading"><div><span className="panel-kicker">ACESSO AO SISTEMA</span><h2>{props.editingId ? 'Editar atendente' : 'Cadastrar atendente'}</h2></div><button className="icon-button" onClick={() => { setShowForm(false); props.openForm(); }}>×</button></div><form className="data-form" onSubmit={(event) => { props.submit(event); setShowForm(false); }}><Field label="Nome"><input value={fieldValue(props.form, 'name')} onChange={(event) => props.updateField('name', event.target.value)} required /></Field><Field label="Nome de usuário"><input value={fieldValue(props.form, 'username')} onChange={(event) => props.updateField('username', event.target.value)} required /></Field><Field label="E-mail"><input type="email" value={fieldValue(props.form, 'email')} onChange={(event) => props.updateField('email', event.target.value)} required /></Field><Field label={props.editingId ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial'}><input type="password" minLength={8} value={fieldValue(props.form, 'password')} onChange={(event) => props.updateField('password', event.target.value)} required={!props.editingId} /></Field><FormActions busy={props.busy} editing={Boolean(props.editingId)} onCancel={() => { setShowForm(false); props.openForm(); }} /></form></DataPanel>}
    <DataPanel><div className="panel-heading"><div><span className="panel-kicker">USUÁRIOS INTERNOS</span><h2>Equipe de atendimento</h2></div></div>{props.rows.length === 0 ? <EmptyState title="Nenhum atendente cadastrado" description="Crie contas para os funcionários da biblioteca." /> : <div className="table-wrap"><table><thead><tr><th>NOME</th><th>USUÁRIO</th><th>E-MAIL</th><th>STATUS</th><th /></tr></thead><tbody>{props.rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.username}</td><td>{row.email}</td><td><span className={`status-tag ${row.active ? 'ativo' : 'inativo'}`}>{row.active ? 'Ativo' : 'Inativo'}</span></td><td><div className="row-actions"><button onClick={() => { props.openForm({ name: row.name, username: row.username, email: row.email, password: '' }, row.id); setShowForm(true); }}>Editar</button><button className="table-action" disabled={row.isAdmin} onClick={() => props.toggle(row)}>{row.active ? 'Desativar' : 'Ativar'}</button><button className="danger-text" disabled={row.isAdmin} onClick={() => props.remove(row)}>Excluir</button></div></td></tr>)}</tbody></table></div>}</DataPanel>
  </>;
}

function HistoryModal({ reader, rows, onClose }: { reader: Reader; rows: Loan[]; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title"><div className="modal-heading"><div><span className="panel-kicker">LEITOR</span><h2 id="history-title">Histórico de {reader.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar">×</button></div>{rows.length === 0 ? <EmptyState title="Sem movimentações" description="Este leitor ainda não possui empréstimos." /> : <div className="table-wrap"><table><thead><tr><th>LIVRO</th><th>EMPRÉSTIMO</th><th>VENCIMENTO</th><th>DEVOLUÇÃO</th><th>STATUS</th></tr></thead><tbody>{rows.map((loan) => <tr key={loan.id}><td>{loan.book?.title || '—'}</td><td>{dateLabel(loan.loanDate)}</td><td>{dateLabel(loan.dueDate)}</td><td>{dateLabel(loan.returnDate)}</td><td><StatusTag status={loan.status} /></td></tr>)}</tbody></table></div>}</section></div>;
}
