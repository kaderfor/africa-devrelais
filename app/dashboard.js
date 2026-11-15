import { useEffect, useState } from 'react';

export default function Dashboard({ db, profile, data, screen }) {
  const [board, setBoard] = useState(null);
  const [notice, setNotice] = useState('');

  async function load() {
    const id = profile.id;
    const results = await Promise.all([
      db.from('notification_reads').select('event_key').eq('owner', id),
      db.from('group_invitations').select().eq('recipient', id),
      db.from('conversations').select().eq('recipient', id).eq('state', 'pending'),
      db.from('project_tasks').select().eq('assignee', id).eq('done', false),
      db.from('applications').select('project,author,accepted'),
      db.from('projects').select('id,title').eq('author', id),
      db.from('groups').select('id,title'),
      db.from('group_versions').select('id,group_id,author,note').order('id', { ascending: false }).limit(20)
    ]);
    const failure = results.find(result => result.error);
    if (failure) throw failure.error;
    setBoard(results.map(result => result.data));
  }

  useEffect(() => {
    if (!profile) return;
    setBoard(null);
    load().catch(error => setNotice(error.code === 'PGRST205' ? 'Applique la migration 013 pour activer cet espace.' : error.message));
  }, [db, profile?.id]);

  if (!profile) return <section className="space page-panel"><a href="/compte">Complète ton profil pour accéder à cet espace.</a></section>;
  const [reads, invites, requests, tasks, applications, projects, groups, versions] = board ?? [[],[],[],[],[],[],[],[]];
  const questionTitles = new Map(data.questions.filter(q => q.author === profile.id).map(q => [q.id,q.title]));
  const names = new Map(data.profiles.map(p => [p.id,p.name]));
  const projectTitles = new Map(projects.map(p => [p.id,p.title]));
  const groupTitles = new Map(groups.map(g => [g.id,g.title]));
  const events = [
    ...invites.map(row => ['invite:' + row.group_id, 'Invitation · ' + groupTitles.get(row.group_id), '/groupes']),
    ...requests.map(row => ['conversation:' + row.id, names.get(row.sender) + ' souhaite discuter', '/messages']),
    ...data.answers.filter(row => questionTitles.has(row.question) && row.author !== profile.id).map(row => ['answer:' + row.id, 'Nouvelle réponse · ' + questionTitles.get(row.question), '/entraide?question=' + row.question]),
    ...applications.filter(row => !row.accepted && projectTitles.has(row.project)).map(row => ['application:' + row.project + ':' + row.author, 'Candidature · ' + projectTitles.get(row.project), '/projets#projet-' + row.project])
  ];
  const seen = new Set(reads.map(row => row.event_key));
  const unread = events.filter(([key]) => !seen.has(key));

  async function markRead(key) {
    const { error } = await db.from('notification_reads').upsert({ owner: profile.id, event_key: key }, { ignoreDuplicates: true });
    if (error) { setNotice(error.message); return; }
    setBoard(previous => [[...previous[0], { event_key: key }], ...previous.slice(1)]);
  }

  return <section className="space page-panel"><h1>{screen === 'notifications' ? 'Notifications' : 'Mon tableau de bord'}</h1>
    <p role="status">{notice}</p>
    {board && <>
      <h2>À consulter · {unread.length} non lue{unread.length === 1 ? '' : 's'}</h2>
      {!events.length && <p>Aucune notification pour le moment.</p>}
      <ul>{(screen === 'notifications' ? events : unread.slice(0, 5)).map(([key,label,url]) => <li key={key}>
        <a href={url}>{label}</a>{!seen.has(key) && <> · <button className="link" onClick={() => markRead(key)}>Marquer comme lue</button></>}
      </li>)}</ul>
      {screen !== 'notifications' && <>
        <a href="/notifications">Toutes les notifications</a>
        <h2>Mes tâches ouvertes</h2>
        {tasks.length ? <ul>{tasks.map(task => <li key={task.id}><a href={'/projets#projet-' + task.project}>{task.title}</a></li>)}</ul> : <p>Aucune tâche ouverte.</p>}
        <h2>Versions ZIP récentes</h2>
        {versions.length ? <ul>{versions.map(version => <li key={version.id}><a href={'/groupes?groupe=' + version.group_id}>{groupTitles.get(version.group_id)} · Version {version.id}</a> · {names.get(version.author) ?? 'Membre'}<p>{version.note}</p></li>)}</ul> : <p>Aucune version déposée dans tes groupes.</p>}
      </>}
    </>}
  </section>;
}
