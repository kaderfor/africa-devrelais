'use client';

import PublicationConfirmation from './publication-confirmation';
import { insertWithAttachment } from './attachments';
import PullRequests from './pull-requests';
import { useEffect, useState } from 'react';

export default function Spaces({ db, profile, people, draft, screen }) {
  const [rows, setRows] = useState({ guides: [], projects: [], applications: [] });
  const [taskProject, setTaskProject] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [skill, setSkill] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [guides, projects, applications] = await Promise.all([
      db.from('guides').select().order('id', { ascending: false }),
      db.from('projects').select().order('id', { ascending: false }),
      profile ? db.from('applications').select() : { data: [] }
    ]);
    const error = guides.error || projects.error || applications.error;
    if (error) throw error;
    setRows({ guides: guides.data, projects: projects.data, applications: applications.data });
    setLoading(false);
    if (screen === 'projets') { const result = await db.from('project_tasks').select(); if (!result.error) setTasks(result.data); }
  }

  useEffect(() => {
    load().catch(error => setNotice(error.code === 'PGRST205'
      ? 'Exécute le script 004-guides-projects.sql dans Supabase pour activer ces espaces.'
      : error.message));
  }, [db, profile?.id]);

  async function save(request, form, success) {
    setBusy(true);
    setNotice('');
    try {
      const { error } = await (typeof request === 'function' ? request() : request);
      if (error) throw error;
      form?.reset();
      if (form?.hasAttribute('data-collapse-on-success')) form.closest('details')?.removeAttribute('open');
      if (success) setConfirmation(success);
      await load();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function openGroup(project, candidate) {
    setBusy(true);
    setNotice('');
    try {
      const { data: group, error } = await db.rpc('open_project_group', { target_project: project, candidate });
      if (error) throw error;
      window.location.assign('/groupes?groupe=' + group);
    } catch (error) {
      setNotice(error.code === 'PGRST202' ? 'Applique la migration 014 pour créer le groupe depuis le projet.' : error.message);
    } finally {
      setBusy(false);
    }
  }

  function publish(event, table) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const item = { author: profile.id, title: fields.get('title').trim(), body: fields.get('body').trim() };
    if (table === 'guides' && draft) Object.assign(item, { source_question: draft.id, credited_author: draft.author });
    if (table === 'projects') Object.assign(item, { skills: fields.get('skills').trim() || null, github: fields.get('github').trim() || null, paid: fields.has('paid') });
    save(() => table === 'guides' ? insertWithAttachment(db, table, item, fields.get('pdf'), 'guide-pdfs', 'pdf_path') : db.from(table).insert(item), event.currentTarget, table === 'guides' ? 'Ressource publiée avec succès.' : 'Projet publié avec succès.');
  }

  return <div className="spaces">
    <PublicationConfirmation message={confirmation} onClose={() => setConfirmation('')} /><p role="status">{notice}</p>
    {[
      ['guides', 'ressources', 'Ressources', 'Partage un guide que d’autres développeurs pourront réutiliser.'],
      ['projects', 'projets', 'Projets', 'Trouve des projets à rejoindre ou lance un appel à contribution.']
    ].filter(([, id]) => id === screen).map(([table, id, title, description]) => <section className="space" id={id} key={id}>
      <h2>{title}</h2><p>{description}</p>{table === 'projects' && <label>Filtrer par compétence<input type="search" value={skill} onChange={event => setSkill(event.target.value)} /></label>}
      {!loading && profile && <details open={table === 'guides' && draft ? true : undefined}>
        <summary>{table === 'guides' ? 'Publier un guide' : 'Publier un projet'}</summary>
        <form data-collapse-on-success key={table === 'guides' ? draft?.id : table} onSubmit={event => publish(event, table)}>
          {table === 'guides' && draft && <p>Solution de {people[draft.author]?.name || 'la communauté'}.</p>}
          <label>Titre<input name="title" required minLength={3} maxLength={150} defaultValue={table === 'guides' ? draft?.title : undefined} /></label>
          <label>{table === 'guides' ? 'Guide' : 'Description et compétences recherchées'}<textarea name="body" required minLength={5} maxLength={10000} defaultValue={table === 'guides' ? draft?.body : undefined} /></label>
          {table === 'guides' && <label>PDF public (facultatif)<input name="pdf" type="file" accept="application/pdf,.pdf" /><small>10 Mo maximum</small></label>}
          {table === 'projects' && <>
            <label>Compétences recherchées<input name="skills" maxLength={250} /></label><label>Dépôt GitHub (facultatif)<input name="github" type="url" placeholder="https://github.com/organisation/depot" /></label>
            <label className="paid"><input type="checkbox" name="paid" /> Contribution rémunérée</label>
          </>}
          <button disabled={busy}>Publier</button>
        </form>
      </details>}
      {!loading && !rows[table].length && <p className="empty">Aucune publication pour le moment.</p>}
      {rows[table].filter(item => table !== 'projects' || (item.skills || '').toLowerCase().includes(skill.trim().toLowerCase())).map(item => <article id={id === 'projets' ? 'projet-' + item.id : 'guide-' + item.id} key={item.id}>
        <h3>{item.title}</h3>
        <p className="empty"><a href={'/communaute?membre=' + item.author}>{people[item.author]?.name ?? 'Voir le profil'}</a></p>
        <p className="body-text">{item.body}</p>{item.pdf_path && <p><a href={db.storage.from('guide-pdfs').getPublicUrl(item.pdf_path, { download: 'ressource.pdf' }).data.publicUrl}>Télécharger le PDF</a></p>}
        {item.source_question && <p><a href={'/entraide?question=' + item.source_question}>Discussion d’origine</a>{item.credited_author && <> · Solution de <a href={'/communaute?membre=' + item.credited_author}>{people[item.credited_author]?.name ?? 'Voir le profil'}</a></>}</p>}
        {table === 'projects' && <>
          {item.group_id && <p><a href={'/groupes?groupe=' + item.group_id}>Ouvrir le groupe du projet</a></p>}
          {item.github && <PullRequests repository={item.github} />}
          {tasks && <details id={'taches-' + item.id} open={taskProject === item.id || undefined}><summary>Tâches du projet</summary>
            {tasks.filter(task => task.project === item.id).map(task => <div className="answer" key={task.id}>
              <strong>{task.title}</strong> · {task.done ? 'Terminée' : 'À faire'} · {people[task.assignee]?.name || 'Sans responsable'}
              {(profile?.id === item.author || profile?.id === task.assignee) && <p><button disabled={busy} onClick={() => save(db.from('project_tasks').update({ done: !task.done }).eq('id', task.id))}>{task.done ? 'Rouvrir' : 'Terminer'}</button></p>}
            </div>)}
            {profile?.id === item.author && <form onSubmit={event => {
              event.preventDefault();
              const form = event.currentTarget;
              const fields = new FormData(form);
              save(db.from('project_tasks').insert({ project: item.id, title: fields.get('title').trim(), assignee: fields.get('assignee') || null }), form);
            }}><label>Tâche<input name="title" required maxLength={150} /></label>
              <label>Responsable<select name="assignee"><option value="">Sans responsable</option><option value={item.author}>Moi</option>{rows.applications.filter(row => row.project === item.id && row.accepted).map(row => <option value={row.author} key={row.author}>{people[row.author]?.name}</option>)}</select></label>
              <button disabled={busy}>Ajouter la tâche</button>
            </form>}
          </details>}
          {item.skills && <p>Compétences · {item.skills}</p>}<p>{item.paid ? 'Contribution rémunérée' : 'Contribution bénévole'}{item.github && <> · <a href={item.github}>Dépôt GitHub</a> · <a href={item.github.replace(/\/$/, '') + '/pulls'}>Pull requests sur GitHub</a></>}</p>
          {profile && profile.id !== item.author && (rows.applications.find(row => row.project === item.id && row.author === profile.id)
            ? <p>{rows.applications.some(row => row.project === item.id && row.author === profile.id && row.accepted) ? 'Candidature acceptée. Consulte les tâches du projet pour voir ce qui t’a été attribué.' : 'Candidature envoyée'}</p>
            : <form onSubmit={event => {
              event.preventDefault();
              const form = event.currentTarget;
              save(db.from('applications').insert({ project: item.id, author: profile.id, body: new FormData(form).get('body').trim() }), form);
            }}>
              <label>Pourquoi souhaites-tu rejoindre le projet ?<textarea name="body" required minLength={5} maxLength={2000} /></label>
              <button disabled={busy}>Proposer ma candidature</button>
            </form>)}
          {profile?.id === item.author && rows.applications.filter(row => row.project === item.id).map(row => <div className="answer" key={row.author}>
            <strong><a href={'/communaute?membre=' + row.author}>{people[row.author]?.name ?? 'Voir le profil'}</a></strong><p className="body-text">{row.body}</p>
            {row.accepted ? <><span className="accepted">Acceptée</span> <button type="button" disabled={busy} onClick={() => openGroup(item.id, row.author)}>{item.group_id ? 'Ouvrir le groupe et inviter' : 'Créer le groupe et inviter'}</button> {tasks && <a href={'#taches-' + item.id} onClick={() => setTaskProject(item.id)}>Attribuer une tâche</a>}</> : <button disabled={busy} onClick={() => save(db.from('applications').update({ accepted: true }).eq('project', item.id).eq('author', row.author))}>Accepter la candidature</button>}
          </div>)}
        </>}
      </article>)}
    </section>)}
  </div>;
}
