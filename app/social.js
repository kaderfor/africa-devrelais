'use client';

import { ProfileAvatar } from './account-presentation';
import PostInteractions from './post-interactions';
import MemberImage from './member-image';
import PublicationConfirmation from './publication-confirmation';
import { insertWithAttachment } from './attachments';
import { countries, countryName } from './countries';
import { useEffect, useState } from 'react';

function splitSkills(value) {
  return (value ?? '').split(/[,;\n]+/).map(skill => skill.trim()).filter(Boolean);
}

function searchable(value) {
  return (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export default function Social({ db, profile, data, refresh, screen }) {
  const [creditedGuides, setCreditedGuides] = useState([]);
  const [details, setDetails] = useState(null);
  const [directory, setDirectory] = useState(null);
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [skill, setSkill] = useState('');
  const publications = screen === 'publications';
  const [composing, setComposing] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [member, setMember] = useState(null);
  const [feed, setFeed] = useState(false);
  const [items, setItems] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [extraProfile, setExtraProfile] = useState(null);
  const person = data.profiles.find(p => p.id === member) ?? (extraProfile?.id === member ? extraProfile : null);
  useEffect(() => {
    if (!member || !/^[0-9a-f-]{36}$/i.test(member)) return;
    const request = new AbortController();
    db.from('profiles').select().eq('id', member).maybeSingle().abortSignal(request.signal)
      .then(({ data }) => { if (!request.signal.aborted) setExtraProfile(data); });
    return () => request.abort();
  }, [db, member]);

  async function load() {
    const [posts, follows, projects] = await Promise.all([
      db.from('posts').select().order('id', { ascending: false }),
      profile ? db.from('follows').select().eq('follower', profile.id) : { data: [] },
      db.from('projects').select().order('id', { ascending: false })
    ]);
    const error = posts.error || follows.error || projects.error;
    if (error) throw error;
    setItems({ posts: posts.data, follows: follows.data, projects: projects.data });
  }

  useEffect(() => {
    setMember(new URLSearchParams(window.location.search).get('membre'));
  }, []);
  useEffect(() => {
    load().catch(error => setNotice(error.code === 'PGRST205'
      ? 'Applique les scripts Supabase 004 et 005 pour activer la communauté.'
      : error.message));
  }, [db, profile?.id]);

  async function save(request, form, success) {
    setBusy(true);
    setNotice('');
    try {
      const { error } = await (typeof request === 'function' ? request() : request);
      if (error) throw error;
      form?.reset();
      if (success) {
        setComposing(false);
        setConfirmation(success);
      }
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!person) return;
    const request = new AbortController();
    db.from('member_details').select().eq('owner', person.id).eq('visible', true).maybeSingle().abortSignal(request.signal)
      .then(({ data }) => { if (!request.signal.aborted) setDetails(data); });
    return () => request.abort();
  }, [db, person?.id]);

  useEffect(() => {
    if (!person) return;
    const request = new AbortController();
    db.from('guides').select('id,title').eq('credited_author', person.id).abortSignal(request.signal)
      .then(({ data }) => { if (!request.signal.aborted) setCreditedGuides(data ?? []); });
    return () => request.abort();
  }, [db, person?.id]);

  useEffect(() => {
    if (publications || new URLSearchParams(window.location.search).has('membre')) return;
    const request = new AbortController();
    async function loadDirectory() {
      const profiles = [];
      const batchSize = 200;
      for (let start = 0; !request.signal.aborted; start += batchSize) {
        const { data: batch, error } = await db.from('profiles')
          .select().order('id')
          .range(start, start + batchSize - 1).abortSignal(request.signal);
        if (request.signal.aborted) return;
        if (error) throw error;
        profiles.push(...batch);
        if (batch.length < batchSize) break;
      }
      if (!request.signal.aborted) setDirectory(profiles.sort((a,b) => a.name.localeCompare(b.name, 'fr')));
    }
    loadDirectory().catch(error => { if (!request.signal.aborted) setNotice(error.message); });
    return () => request.abort();
  }, [db]);

  const nameQuery = searchable(search).replace(/^@/, '');
  const skillQuery = searchable(skill);
  const members = (directory ?? []).filter(person =>
    (searchable(person.name).includes(nameQuery) || searchable(person.username).includes(nameQuery)) &&
    (!country || person.country === country) && searchable(person.skills).includes(skillQuery)
  );

  useEffect(() => {
    if (!profile || !person || profile.id === person.id) return;
    let current = true;
    db.from('conversations').select('state,sender,recipient')
      .or('and(sender.eq.' + profile.id + ',recipient.eq.' + person.id + '),and(sender.eq.' + person.id + ',recipient.eq.' + profile.id + ')')
      .maybeSingle().then(({ data }) => { if (current) setConversation(data); });
    return () => { current = false; };
  }, [db, profile?.id, person?.id]);

  async function requestConversation() {
    setBusy(true);
    setNotice('');
    try {
      const { data: request, error } = await db.from('conversations')
        .insert({ sender: profile.id, recipient: person.id }).select('state,sender,recipient').single();
      if (error) throw error;
      setConversation(request);
    } catch (error) {
      setNotice(error.code === '23505' ? 'Une discussion existe déjà. Ouvre Messages pour la consulter.' : error.message);
    } finally {
      setBusy(false);
    }
  }

  const following = new Set((items?.follows ?? []).map(row => row.followed));
  const visibleMembers = members.filter(person => !feed || following.has(person.id));
  const visible = row => (!member || row.author === member) && (!feed || following.has(row.author));
  const author = id => data.profiles.find(p => p.id === id)?.name;


  return <div className="page-panel community-page">
    <section className="space">
      {!person && <h2>{publications ? 'Publications' : 'Communauté'}</h2>}
      <PublicationConfirmation message={confirmation} onClose={() => setConfirmation('')} /><p role="status">{notice}</p>
      {person ? <>
        <div className="member-banner">
          <ProfileAvatar db={db} member={person} />
          <div><h1>{person.name}</h1><p>{person.username && person.username !== 'dev_' + person.id.replaceAll('-', '') && <>@{person.username} · </>}{countryName(person.country)}</p></div>
        </div>
        {person.bio && <p className="body-text">{person.bio}</p>}
        {person.skills && <div className="member-skills" aria-label="Compétences">{splitSkills(person.skills).map((skill,index) => skill.trim() && <span key={index}>{skill.trim()}</span>)}</div>}
        {profile && items && profile.id !== person.id && <button disabled={busy} onClick={() => save(following.has(person.id)
          ? db.from('follows').delete().eq('follower', profile.id).eq('followed', person.id)
          : db.from('follows').insert({ follower: profile.id, followed: person.id }))}>{following.has(person.id) ? 'Se désabonner' : 'Suivre'}</button>}
        {profile?.id === person.id && items && <details className="edit-member"><summary>Modifier ma présentation</summary><form onSubmit={event => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          save(db.rpc('edit_profile_details', { new_bio: fields.get('bio'), new_skills: fields.get('skills') }));
        }}>
          <label>Présentation publique<textarea name="bio" maxLength={600} defaultValue={person.bio ?? ''} /></label>
          <label>Compétences publiques<input name="skills" maxLength={250} defaultValue={person.skills ?? ''} /></label>
          <button disabled={busy}>Enregistrer le profil</button>
        </form><a href="/profil">Modifier mon parcours</a></details>}
        {profile && profile.id !== person.id && <p>{conversation?.state === 'pending' && conversation.sender === profile.id ? <button type="button" disabled>Demande en attente</button> :
          conversation?.state === 'blocked' ? 'Discussion bloquée' :
          conversation?.state === 'refused' ? 'Demande refusée' :
          conversation ? <a href={'/messages?membre=' + person.id}>{conversation.state === 'accepted' ? 'Ouvrir la discussion' : 'Voir la demande reçue'}</a> : <button type="button" disabled={busy} onClick={requestConversation}>Demander à discuter</button>}</p>}
        {details?.owner === person.id && <dl className="member-details">
          {[['education','Niveau d’études'],['school','Établissement'],['languages','Langues'],['status','Situation'],['interests','Opportunités recherchées'],['linkedin','LinkedIn'],['github','GitHub'],['portfolio','Portfolio']].map(([key,label]) =>
            details[key] && <div key={key}><dt>{label}</dt><dd>{details[key]}</dd></div>)}
        </dl>}
        <h3>Solutions acceptées</h3>
        <ul>{data.solutions.map(solution => {
          const answer = data.answers.find(item => item.id === solution.answer && item.author === person.id);
          const question = data.questions.find(item => item.id === solution.question);
          return answer && question && <li key={question.id}><a href={'/entraide?question=' + question.id}>{question.title}</a></li>;
        })}</ul>
        {creditedGuides.length > 0 && <><h3>Guides issus de ses solutions</h3>
          <ul>{creditedGuides.map(guide => <li key={guide.id}><a href={'/ressources#guide-' + guide.id}>{guide.title}</a></li>)}</ul>
        </>}
        <a href="/communaute">Tous les membres</a>
      </> : <>
        {!publications && <><div className="directory-filters">
          <label>Nom ou @identifiant<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ex. Junior ou @junior226" /></label>
          <label>Pays<select value={country} onChange={event => setCountry(event.target.value)}><option value="">Tous les pays</option>{countries.map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          <label>Compétence<input type="search" value={skill} onChange={event => setSkill(event.target.value)} placeholder="Ex. JavaScript" /></label>
        </div>
        <p role="status">{directory ? visibleMembers.length ? visibleMembers.length + ' profil(s)' : 'Aucun profil ne correspond à ta recherche.' : 'Chargement de l’annuaire…'}</p>
        <ul className="member-list">{visibleMembers.map(p => <li key={p.id}><a href={'/communaute?membre=' + p.id}><ProfileAvatar db={db} member={p} /><span className="member-card-text"><strong title={p.name}>{p.name}</strong><small>{p.username && p.username !== 'dev_' + p.id.replaceAll('-', '') && <>@{p.username} · </>}{countryName(p.country)}</small><small className="member-card-skills">{splitSkills(p.skills).slice(0, 2).join(' · ')}</small></span></a></li>)}</ul></>}
        {profile && <div className="filters">
          <button aria-pressed={!feed} onClick={() => setFeed(false)}>Tout</button>
          <button aria-pressed={feed} onClick={() => setFeed(true)}>Abonnements</button>
        </div>}
        {publications && profile && <button type="button" aria-expanded={composing} onClick={() => setComposing(!composing)}>{composing ? 'Fermer le formulaire' : '+ Créer une publication'}</button>}
        {publications && composing && profile && items && <form onSubmit={event => {
          event.preventDefault();
          const form = event.currentTarget;
          const fields = new FormData(form);
          save(() => insertWithAttachment(db, 'posts', { author: profile.id, body: fields.get('body').trim() }, fields.get('image'), 'post-images', 'image_path'), form, 'Publication partagée avec succès.');
        }}>
          <label>Partager une réalisation ou une avancée<textarea name="body" minLength={3} maxLength={2000} required /></label>
          <label>Image facultative<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /><small>JPEG, PNG ou WebP · 5 Mo maximum</small></label><button disabled={busy}>Publier</button>
        </form>}
      </>}
      {(publications || person) && items?.posts.filter(visible).map(post => <article key={post.id}>
        <a href={'/communaute?membre=' + post.author}>{author(post.author)}</a><p className="body-text">{post.body}</p>{post.image_path && <MemberImage key={post.image_path} db={db} bucket="post-images" path={post.image_path} alt="Image jointe à la publication" />}<PostInteractions db={db} post={post.id} profile={profile} author={author} />
      </article>)}
      {(person || (publications && feed)) && items?.projects.filter(visible).map(project => <article key={project.id}>
        <a href={'/projets#projet-' + project.id}>{project.title}</a><p>Appel à contribution · {author(project.author)}</p>
      </article>)}
    </section>
  </div>;
}
