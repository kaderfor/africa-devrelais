'use client';

import { useEffect, useMemo, useState } from 'react';
import { insertWithAttachment } from './attachments';
import AccountPresentation from './account-presentation';
import Dashboard from './dashboard';
import Workspace from './workspace';
import Social from './social';
import Spaces from './spaces';
import { createClient } from '@supabase/supabase-js';

import { countries, countryName } from './countries';

function chosenUsername(profile) {
  return profile?.username && profile.username !== 'dev_' + profile.id.replaceAll('-', '');
}

export default function Platform({ screen = 'accueil' }) {
  const db = useMemo(() => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), []);
  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState(null);
  const [data, setData] = useState({ profiles: [], questions: [], answers: [], solutions: [], leaderboard: [] });
  const [notice, setNotice] = useState('');
  const [accountNotice, accountMessage] = useState('');
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [signup, setSignup] = useState(true);
  const [source, setSource] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const ranking = monthly ?? data.leaderboard;
  const [technology, setTechnology] = useState('');
  const [country, setCountry] = useState('');
  const [position, setPosition] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, select] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const profile = data.profiles.find(p => p.id === user?.id);
  const needsUsername = !chosenUsername(profile);
  const candidate = username.trim().toLowerCase();
  const validUsername = /^[a-z0-9_]{3,40}$/.test(candidate) && !/^dev_[a-f0-9]{32}$/.test(candidate);
  const usernameStatus = availability?.name === candidate ? availability.status : 'checking';
  const problem = data.questions.find(q => q.id === selected);
  const sourceProblem = data.questions.find(q => q.id === source);
  const sourceSolution = data.solutions.find(solution => solution.question === source);
  const sourceAnswer = data.answers.find(answer => answer.id === sourceSolution?.answer);
  const draft = sourceProblem && sourceAnswer ? { id: source, title: sourceProblem.title, body: sourceAnswer.body, author: sourceAnswer.author } : null;
  const solution = data.solutions.find(s => s.question === selected);
  const solvedIds = new Set(data.solutions.map(item => item.question));
  const answeredIds = new Set(data.answers.map(answer => answer.question));
  const query = search.trim().toLocaleLowerCase('fr');
  const questions = data.questions.filter(question => {
    const matchesQuery = (question.title + ' ' + question.body).toLocaleLowerCase('fr').includes(query);
    if (technology && question.technology !== technology) return false;
    if (country && question.country !== country) return false;
    if (!matchesQuery) return false;
    if (filter === 'unanswered') return !answeredIds.has(question.id);
    if (filter === 'resolved') return solvedIds.has(question.id);
    return filter === 'all' || !solvedIds.has(question.id);
  });
  const people = Object.fromEntries(data.profiles.map(p => [p.id, p]));

  async function refresh() {
    const tables = ['profiles', 'questions', 'answers', 'solutions', 'leaderboard'];
    const results = await Promise.all(tables.map(table => {
      const query = db.from(table).select();
      if (table === 'questions') return query.order('id', { ascending: false });
      if (table === 'leaderboard') return query.gt('points', 0).order('points', { ascending: false }).order('id').limit(100);
      return query;
    }));
    const failed = results.find(result => result.error);
    if (failed) throw failed.error;
    setData(Object.fromEntries(tables.map((table, index) => [table, results[index].data])));
    setReady(true);
  }

  useEffect(() => {
    const requested = Number(new URLSearchParams(window.location.search).get('question'));
    if (Number.isSafeInteger(requested) && requested > 0) {
      if (screen === 'entraide') select(requested);
      if (screen === 'ressources') setSource(requested);
    }
    const { data: subscription } = db.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setSessionReady(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
      if (event === 'PASSWORD_RECOVERY' && session) {
        if (screen !== 'parametres') window.history.replaceState(null, '', '/parametres');
        setRecovering(true);
        accountMessage('Lien vérifié. Choisis ton nouveau mot de passe.');
        requestAnimationFrame(() => document.getElementById('compte')?.scrollIntoView());
      }
      const url = new URL(window.location.href);
      if (session && url.searchParams.get('confirmation') === '1') {
        accountMessage('Adresse e-mail confirmée. Ton compte a bien été créé.');
        url.searchParams.delete('confirmation');
        window.history.replaceState(null, '', url.pathname + url.search + '#compte');
        requestAnimationFrame(() => document.getElementById('compte')?.scrollIntoView());
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, [db]);

  useEffect(() => {
    if (!user || !needsUsername || !validUsername) return;
    const request = new AbortController();
    const timer = setTimeout(async () => {
      const { data: matches, error } = await db.from('profiles')
        .select('username').eq('username', candidate).limit(1).abortSignal(request.signal);
      if (request.signal.aborted) return;
      setAvailability({ name: candidate, status: error ? 'error' : matches.length ? 'taken' : 'available' });
    }, 300);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [db, user, needsUsername, candidate, validUsername]);

  async function run(action, report = setNotice) {
    setBusy(true);
    report('');
    try { await action(); }
    catch (error) {
      const messages = {
        user_already_exists: 'Connecte-toi si tu as déjà un compte, ou demande un lien de réinitialisation.',
        over_email_send_rate_limit: 'Trop d’e-mails demandés. Attends avant de réessayer.',
        over_request_rate_limit: 'Trop de tentatives. Réessaie dans quelques instants.',
        invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
        email_not_confirmed: 'Confirme ton adresse e-mail avant de te connecter.',
        '23505': 'Ce nom d’utilisateur est déjà pris. Choisis-en un autre.'
      };
      report(messages[error.code] || error.message);
    }
    finally { setBusy(false); }
  }

  function submit(event, action, report) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    run(async () => {
      await action(fields);
      form.reset();
    }, report);
  }

  useEffect(() => {
    if (user?.id) refresh().catch(error => setNotice('Chargement impossible. ' + error.message));
    else setReady(false);
  }, [user?.id]);

  const visitor = !user;
  const publicScreen = ['accueil', 'compte', 'parametres'].includes(screen);
  const locked = sessionReady && visitor && !publicScreen;

  async function write(request) {
    const { error } = await request;
    if (error) throw error;
    await refresh();
  }

  return <>
    <header className={visitor ? 'site-header landing-header' : 'site-header'}>
      <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">↗</span>Africa <strong>DevRelais</strong></a>
      {visitor && <nav className="landing-nav" aria-label="Accueil">
        <a href="/">Accueil</a><a href="/#espaces">Découvrir la plateforme</a>
      </nav>}
      {visitor && <a className="button landing-account" href="/compte">{profile ? 'Mon compte' : 'Rejoindre'} ↗</a>}
      {!visitor && <nav className="desktop-navigation" aria-label="Navigation principale"><a href="/">Accueil</a><a href="/entraide">Entraide</a><a href="/ressources">Ressources</a><a href="/projets">Projets</a><a href="/opportunites">Opportunités</a><a href="/groupes">Projets de groupe</a><a href="/messages">Messages</a><a href="/notifications" aria-label="Notifications">🔔</a><a href="/communaute">Communauté</a><a href="/classement">Classement</a><a className="account-link" href="/compte">{profile ? profile.name : 'Mon compte'}</a></nav>}
      <details className="mobile-navigation">
        <summary>Menu <span aria-hidden="true">☰</span></summary>
        <nav aria-label="Navigation mobile">{visitor ? <><a href="/">Accueil</a><a href="/#espaces">Découvrir la plateforme</a><a href="/compte">Connexion et inscription</a></> : <><a href="/">Accueil</a><a href="/entraide">Entraide</a><a href="/ressources">Ressources</a><a href="/projets">Projets</a><a href="/opportunites">Opportunités</a><a href="/groupes">Projets de groupe</a><a href="/messages">Messages</a><a href="/notifications" aria-label="Notifications">🔔</a><a href="/communaute">Communauté</a><a href="/classement">Classement</a><a className="account-link" href="/compte">{profile ? profile.name : 'Mon compte'}</a></>}</nav>
      </details>
    </header>
    <main className={screen === 'accueil' ? 'landing' : undefined}>
      {screen === 'accueil' && <><section className="hero">
        <div className="hero-copy">
          <h1>Les devs d’Afrique <em>construisent ensemble.</em></h1>
          <p>Trouve une solution, partage ce que tu as appris et rejoins des projets avec des développeurs de toute l’Afrique.</p>
          <div className="hero-actions"><a className="button" href={profile ? '/entraide#publier' : '/compte'}>{profile ? 'Poser une question' : 'Rejoindre la communauté'} <span aria-hidden="true">↗</span></a><a className="secondary-action" href="#espaces">Découvrir les espaces</a></div>
        </div>
        <aside className="editor" aria-label="Exemple de code">
          <div className="editor-bar"><span aria-hidden="true">● ● ●</span><span>africa-devrelais.js</span></div>
          <pre><code><span>{'const '}</span>{'communaute = {\n  pays: ['}<b>{'\n    "Burkina Faso",\n    "Sénégal",\n    "Afrique du Sud"\n  '}</b>{'],\n  entraide: true\n};\n\n'}<span>{'export '}</span>{'default communaute;'}</code></pre>
          <div className="editor-footer"><span>● Africa DevRelais</span><span>JavaScript</span></div>
        </aside>
      </section>
      <section id="espaces" className="landing-spaces">
        <h2>Un espace pour chaque contribution</h2>
          <div className="home-links">
          {[
            ['/entraide', '?', 'Entraide technique', 'Pose une question ou propose une solution.', 'Voir les questions'],
            ['/ressources', '≡', 'Ressources', 'Retrouve les guides et les cours partagés par les membres.', 'Parcourir les guides'],
            ['/projets', '↗', 'Appels à contribution', 'Présente ton projet, recherche des coéquipiers et répartis les tâches.', 'Explorer les projets'],
            ['/groupes', '#', 'Projets de groupe', 'Invite des développeurs, relie un dépôt GitHub et suis les contributions de ton équipe.', 'Voir les projets de groupe'],
            ['/opportunites', '◎', 'Emplois, stages et appels d’offres', 'Publie des opportunités ou retrouve les modalités de candidature pour un emploi, un stage ou une mission.', 'Voir les opportunités'],
            ['/communaute', '✦', 'Communauté', 'Suis des développeurs et partage tes réalisations, tes projets et leurs avancées.', 'Découvrir les membres'],
            ['/messages', '…', 'Messages privés', 'Envoie une demande de discussion et échange avec les membres qui l’acceptent.', 'Ouvrir la messagerie'],
            ['/classement', '★', 'Les devs qui font avancer l’Afrique', 'Découvre les devs dont les solutions aident la communauté.', 'Voir le classement']
          ].map(([url, icon, label, description, action]) => <a key={url} href={visitor ? "/compte" : url}>
            <i aria-hidden="true">{icon}</i><strong>{label}</strong><span>{description}</span>{!visitor && <b>{action} →</b>}
          </a>)}
        </div>
        {!visitor && <nav className="landing-more" aria-label="Autres espaces"><a href="/tableau-de-bord">Mon tableau de bord</a><a href="/opportunites">Opportunités</a><a href="/groupes">Projets de groupe</a><a href="/messages">Messages</a><a href="/notifications" aria-label="Notifications">🔔</a><a href="/compte">Mon compte</a></nav>}
      </section>
      {!visitor && data.questions.length > 0 && <section className="space home-recent">
        <h2>Questions récentes</h2>
        {data.questions.slice(0, 4).map(question => <a className="problem recent-question" key={question.id} href={'/entraide?question=' + question.id}>
          <strong>{question.title}</strong><span className="question-meta">{people[question.author]?.name} <span className={solvedIds.has(question.id) ? 'state resolved' : 'state'}>{solvedIds.has(question.id) ? 'Résolue' : 'Ouverte'}</span></span>
        </a>)}
      </section>}
      <section className="landing-cta"><h2>Ton prochain projet commence ici.</h2>
        <a className="button" href={profile ? '/projets' : '/compte'}>{profile ? 'Explorer les projets' : 'Créer mon compte'} ↗</a>
      </section></>}
      {locked && <section className="space page-panel"><h1>Connecte-toi pour ouvrir cet espace</h1><p>Rejoins Africa DevRelais pour accéder aux échanges de la communauté.</p><a className="button" href="/compte">Connexion ou inscription</a></section>}
      {(publicScreen || (sessionReady && user)) && <>
      <p role="status">{notice}</p>
      <div className="columns page-panel">
        {screen === 'entraide' && <section id="problemes">
          <h2>Questions de la communauté</h2><label className="question-search">Rechercher une question<input type="search" value={search} onChange={event => { setSearch(event.target.value); select(null); }} /></label>
          <div className="filters">
            <label>Technologie<select value={technology} onChange={event => { setTechnology(event.target.value); select(null); }}><option value="">Toutes</option>{[...new Set(data.questions.map(q => q.technology).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Pays concerné<select value={country} onChange={event => { setCountry(event.target.value); select(null); }}><option value="">Tous</option>{countries.map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          </div>
          <div className="filters" role="group" aria-label="Filtrer les questions">
            {[['all', 'Toutes'], ['open', 'Ouvertes'], ['unanswered', 'Sans réponse'], ['resolved', 'Résolues']].map(([key, label]) =>
              <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); select(null); }}>{label}</button>
            )}
          </div>
          {profile && <form id="publier" onSubmit={event => submit(event, fields => write(insertWithAttachment(db, 'questions', { author: user.id, title: fields.get('title'), body: fields.get('body'), technology: fields.get('technology').trim() || null, country: fields.get('country') || null, code: fields.get('code').trim() || null }, fields.get('image'), 'question-images', 'image_path')))}>
            <h3>Publier un problème</h3>
            <label>Titre<input name="title" required minLength={5} maxLength={150} /></label>
            <label>Contexte et essais<textarea name="body" required minLength={10} maxLength={5000} /></label>
            <label>Technologie<input name="technology" maxLength={80} /></label>
            <label>Pays concerné<select name="country"><option value="">Aucun pays précis</option>{countries.map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            <label>Extrait de code<textarea name="code" maxLength={5000} spellCheck={false} /></label>
            <label>Image publique (facultatif)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /><small>JPEG, PNG ou WebP · 5 Mo maximum</small></label><button disabled={busy}>Publier</button>
          </form>}
          {ready && !questions.length && <p className="empty">{filter === 'all' && !query ? 'Aucune question publiée pour le moment.' : 'Aucune question avec ce filtre.'}</p>}
          {questions.map(q => <button id={'question-' + q.id} className="problem" key={q.id} aria-pressed={selected === q.id} onClick={() => select(q.id)}><strong>{q.title}</strong><span className="question-meta">{people[q.author]?.name}<span className={solvedIds.has(q.id) ? 'state resolved' : 'state'}>{solvedIds.has(q.id) ? 'Résolu' : 'Ouvert'}</span></span></button>)}
          {problem && <article>
            <h3>{problem.title}</h3><p className="body-text">{problem.body}</p>
            <p>{[problem.technology, problem.country && countryName(problem.country)].filter(Boolean).join(' · ')}</p>{problem.code && <pre className="editor question-code"><code>{problem.code}</code></pre>}{problem.image_path && <a href={db.storage.from('question-images').getPublicUrl(problem.image_path).data.publicUrl}>
              <img className="question-attachment" src={db.storage.from('question-images').getPublicUrl(problem.image_path).data.publicUrl} alt="Image jointe au problème" loading="lazy" />
            </a>}<h3>Réponses</h3>
            {data.answers.filter(a => a.question === problem.id).map(a => <div className="answer" key={a.id}>
              <strong>{people[a.author] && <a href={'/communaute?membre=' + a.author}>{people[a.author].name}</a>}</strong><p className="body-text">{a.body}</p>
              {solution?.answer === a.id ? <><span className="accepted">Solution acceptée</span>{profile && <a className="guide-link" href={'/ressources?question=' + problem.id}>Créer un guide</a>}</> : user?.id === problem.author && a.author !== user.id && <button disabled={busy} onClick={() => run(() => write(db.rpc('accept_solution', { problem_id: problem.id, response_id: a.id })))}>Accepter la solution</button>}
            </div>)}
            {profile && <form onSubmit={event => submit(event, fields => write(db.from('answers').insert({ question: problem.id, author: user.id, body: fields.get('body') })))}>
              <label>Ta réponse<textarea name="body" required minLength={5} maxLength={5000} /></label><button disabled={busy}>Répondre</button>
            </form>}
          </article>}
        </section>}
          {screen === 'classement' && <section id="classement"><h2>Les devs qui font avancer l’Afrique</h2><p>Le classement des contributeurs, selon les solutions que la communauté a acceptées.</p><div className="filters">
              <button aria-pressed={!monthly} onClick={() => { setMonthly(null); setPosition(null); }}>Depuis le lancement</button>
              <button aria-pressed={!!monthly} onClick={() => run(async () => {
                const { data: scores, error } = await db.from('monthly_leaderboard').select().gt('points', 0).order('points', { ascending: false }).order('id').limit(100);
                if (error) throw error;
                setMonthly(scores);
                setPosition(null);
              })}>Ce mois-ci</button>
            </div>{monthly?.length > 0 && <p><strong>Dev engagé du mois</strong> · {monthly[0].name}</p>}<p>10 points par solution acceptée.</p>
            {ready && !ranking.length && <p>Les premières contributions apparaîtront ici.</p>}
            {profile && <button onClick={() => run(async () => {
              const table = monthly ? 'monthly_leaderboard' : 'leaderboard';
              const { data: score, error } = await db.from(table).select('points').eq('id', profile.id).single();
              if (error) throw error;
              if (!score.points) { setPosition('Aucune solution acceptée pour cette période.'); return; }
              const result = await db.from(table).select('id', { count: 'exact', head: true }).gt('points', score.points);
              if (result.error) throw result.error;
              setPosition('Rang ' + (result.count + 1) + ' · ' + score.points + ' points');
            })}>Ma position</button>}{position && <p role="status">{position}</p>}
            <ol>{ranking.map((p, index, list) => <li key={p.id} value={list.findIndex(other => other.points === p.points) + 1}><a href={'/communaute?membre=' + p.id}>{p.name}</a>{chosenUsername(p) && <> (@{p.username})</>} · {countryName(p.country)} <strong>{p.points} pts</strong></li>)}</ol>
          </section>}
          {(screen === 'compte' || screen === 'parametres' || recovering) && <section id="compte"><h2>{screen === 'parametres' || recovering ? 'Paramètres de sécurité' : 'Mon compte'}</h2><p role="status">{accountNotice}</p>
            {recovering && user ? <form onSubmit={event => submit(event, async fields => {
                const password = fields.get('password');
                if (password !== fields.get('confirmation')) throw new Error('Les deux mots de passe doivent être identiques.');
                const { error } = await db.auth.updateUser({ password });
                if (error) throw error;
                setRecovering(false);
                accountMessage('Mot de passe modifié.');
              }, accountMessage)}>
                <label>Nouveau mot de passe<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
                <label>Confirmer le mot de passe<input name="confirmation" type="password" required minLength={8} autoComplete="new-password" /></label>
                <button disabled={busy}>Enregistrer le nouveau mot de passe</button>
              </form> : screen === 'parametres' ? <>
                <form onSubmit={event => submit(event, async fields => {
                  const { error } = await db.auth.resetPasswordForEmail(fields.get('email'), { redirectTo: window.location.origin + '/parametres' });
                  if (error) throw error;
                  accountMessage('Si un compte correspond à cette adresse, tu recevras un lien de réinitialisation.');
                }, accountMessage)}>
                  <label>E-mail<input name="email" type="email" required autoComplete="email" defaultValue={user?.email ?? ''} readOnly={!!user} /></label>
                  <button disabled={busy}>Envoyer le lien</button>
                </form>
                <a href="/compte">Retour au compte</a>
              </> : user ? <>
              {profile && <p><strong>{profile.name}</strong>{chosenUsername(profile) && <> (@{profile.username})</>} · {countryName(profile.country)}</p>}
              {ready && needsUsername && <form onSubmit={event => submit(event, async fields => {
                if (profile) {
                  const { data: updated, error } = await db.from('profiles').update({ username: candidate })
                    .eq('id', user.id).select('username').single();
                  if (error) throw error;
                  await refresh();
                  accountMessage('Nom d’utilisateur enregistré : @' + updated.username);
                } else {
                  await write(db.from('profiles').insert({ id: user.id, name: fields.get('name').trim(), country: fields.get('country'), username: candidate }));
                }
                setUsername('');
              }, accountMessage)}>
                {!profile && <label>Nom d’affichage<input name="name" required minLength={2} maxLength={80} /></label>}
                <label>Nom d’utilisateur<input name="username" required pattern="[A-Za-z0-9_]{3,40}" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} aria-describedby="username-status" /><small>Lettres, chiffres et tiret bas (_), de 3 à 40 caractères.</small></label>
                {!profile && <label>Pays africain<select name="country" required defaultValue=""><option value="" disabled>Choisir un pays</option>{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>}
                <p id="username-status" role="status">{username && (!validUsername ? 'Utilise de 3 à 40 caractères autorisés.' : {
                  checking: 'Vérification de la disponibilité…',
                  available: '@' + candidate + ' est disponible.',
                  taken: '@' + candidate + ' est déjà pris. Essaie une variante, par exemple avec 226.',
                  error: 'Vérification indisponible. Tu peux essayer de créer ton profil.'
                }[usernameStatus])}</p>
                <button disabled={busy || !validUsername || usernameStatus === 'taken' || usernameStatus === 'checking'}>{profile ? 'Enregistrer mon nom d’utilisateur' : 'Créer mon profil'}</button>
              </form>}
              {profile && <AccountPresentation key={profile.id} db={db} profile={profile} refresh={refresh} />}
              <p><a href="/profil">Complète ton profil pour présenter ton parcours et les opportunités qui t’intéressent.</a></p><p><a href="/tableau-de-bord">Mon tableau de bord</a></p><a className="button settings-link" href="/parametres">Paramètres</a>
              <button disabled={busy} onClick={() => run(async () => { const { error } = await db.auth.signOut(); if (error) throw error; }, accountMessage)}>Se déconnecter</button>
            </> : <>
              <form onSubmit={event => submit(event, async fields => {
                const credentials = { email: fields.get('email'), password: fields.get('password') };
                const { error } = signup ? await db.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + '/compte?confirmation=1' } }) : await db.auth.signInWithPassword(credentials);
                if (error) throw error;
                accountMessage(signup ? 'Si cette adresse peut être inscrite, tu recevras un lien de confirmation. Si tu as déjà un compte, connecte-toi ou demande un lien de réinitialisation.' : 'Connexion réussie.');
              }, accountMessage)}>
                <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
                <label>Mot de passe<input name="password" type="password" minLength={signup ? 8 : undefined} required autoComplete={signup ? 'new-password' : 'current-password'} /></label>
                <button disabled={busy}>{signup ? 'Créer un compte' : 'Se connecter'}</button>
              </form>
              <button className="link" onClick={() => { accountMessage(''); setSignup(!signup); }}>{signup ? 'J’ai déjà un compte' : 'Créer un compte'}</button>
              <a className="link" href="/parametres">Mot de passe oublié ?</a>
            </>}
          </section>}
      </div>
      {(screen === 'ressources' || screen === 'projets') && <Spaces db={db} profile={profile} people={people} draft={draft} screen={screen} />}
      {['notifications','tableau-de-bord'].includes(screen) && <Dashboard db={db} profile={profile} data={data} screen={screen} />}
      {screen === 'communaute' && <Social db={db} profile={profile} data={data} refresh={refresh} />}
      {['profil', 'messages', 'groupes', 'opportunites'].includes(screen) && <Workspace db={db} profile={profile} people={people} screen={screen} />}
      </>}
    </main>
    {screen === 'accueil' && <footer className="site-footer"><a href="/" className="brand">Africa <strong>DevRelais</strong></a></footer>}
  </>;
}
