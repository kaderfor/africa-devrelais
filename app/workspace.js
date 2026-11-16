'use client';

import MemberImage from './member-image';
import PublicationConfirmation from './publication-confirmation';
import { insertWithAttachment } from './attachments';
import GroupVersions from './group-versions';
import PullRequests from './pull-requests';
import { countryName } from './countries';
import { useEffect, useState } from 'react';

const kinds = ['Emploi', 'Stage', 'Freelance', 'Appel d’offres', 'Communauté'];
const fields = { education: 'Niveau d’études', school: 'Établissement', languages: 'Langues', status: 'Situation professionnelle', interests: 'Opportunités recherchées', linkedin: 'Lien vers ton profil LinkedIn', github: 'Lien vers ton profil GitHub', portfolio: 'Lien vers ton portfolio' };

const linkExamples = {
  linkedin: 'https://www.linkedin.com/in/ton-nom',
  github: 'https://github.com/ton-pseudo',
  portfolio: 'https://ton-portfolio.com'
};

export default function Workspace({ db, profile, people, screen }) {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [active, setActive] = useState(null);
  const [rows, setRows] = useState({});
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const tables = {
    opportunites: ['opportunities'], groupes: ['groups', 'group_posts', ...(profile ? ['group_members', 'group_invitations'] : [])],
    messages: profile ? ['conversations', ...(active ? ['private_messages'] : [])] : [], profil: ['member_details']
  }[screen];

  useEffect(() => {
    if (screen === 'groupes') setSelectedGroup(Number(new URLSearchParams(window.location.search).get('groupe')) || null);
  }, [screen]);

  async function load() {
    const results = await Promise.all(tables.map(table => table === 'private_messages' ? db.from(table).select().eq('conversation', active).order('id') : db.from(table).select()));
    const failure = results.find(result => result.error);
    if (failure) throw failure.error;
    setRows(Object.fromEntries(tables.map((table, index) => [table, results[index].data])));
  }

  useEffect(() => {
    load().catch(error => setNotice(error.code === 'PGRST205' ? 'Applique les migrations Supabase de cet espace, dont le script 009 pour les invitations de groupe.' : error.message));
  }, [db, profile?.id, screen, active]);

  useEffect(() => {
    if (screen !== 'messages' || !profile) return;
    const timer = setInterval(() => {
      if (!document.hidden) load().catch(error => setNotice(error.message));
    }, 5000);
    return () => clearInterval(timer);
  }, [db, screen, profile?.id, active]);

  async function save(request, form, success) {
    setBusy(true);
    setNotice('');
    try {
      const { error } = await (typeof request === 'function' ? request() : request);
      if (error) throw error;
      form?.reset();
      if (form?.hasAttribute('data-collapse-on-success')) form.closest('details')?.removeAttribute('open');
      if (success && screen !== 'messages') setConfirmation(success);
      await load();
      if (!success || screen === 'messages') setNotice(success || 'Enregistré.');
    } catch (error) {
      setNotice(error.code === '23505' ? 'Cette entrée existe déjà.' : error.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(event, operation, reset = true, success) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    save(() => operation(fields), reset ? form : null, success);
  }

  const details = rows.member_details?.find(row => row.owner === profile?.id);
  const title = { opportunites: 'Opportunités', groupes: 'Projets de groupe', messages: 'Messages privés', profil: 'Compléter mon profil' }[screen];

  return <section className={screen === 'messages' ? 'space page-panel inbox' : 'space page-panel'}>
    <h2>{title}</h2><PublicationConfirmation message={confirmation} onClose={() => setConfirmation('')} /><p role="status">{notice}</p>
    {!profile && <p><a href="/compte">Connecte-toi</a> pour participer.</p>}

    {screen === 'profil' && profile && rows.member_details && <form onSubmit={event => submit(event, values => db.from('member_details').upsert({
      owner: profile.id, ...Object.fromEntries(Object.keys(fields).map(key => [key, values.get(key).trim()])), visible: values.has('visible')
    }), false)}>
      <p>Présente ton parcours et indique les opportunités qui t’intéressent. Tous les champs sont facultatifs.</p>
      <label>Pays du profil<input readOnly value={countryName(profile.country)} /></label>
      {Object.entries(fields).map(([key, label]) => <label key={key}>{label}<input name={key} maxLength={300} type={linkExamples[key] ? 'url' : 'text'} defaultValue={details?.[key] ?? ''} placeholder={linkExamples[key] ?? (key === 'status' ? 'Étudiant, salarié, freelance, en recherche…' : key === 'interests' ? 'Stage, emploi, missions…' : undefined)} /></label>)}
      <label className="paid"><input type="checkbox" name="visible" defaultChecked={details?.visible} /> Afficher ces informations sur mon profil public</label>
      <button disabled={busy}>Enregistrer mon profil</button>
    </form>}

    {screen === 'opportunites' && <>
      <label>Type d’opportunité<select value={kind} onChange={event => setKind(event.target.value)}><option value="">Toutes</option>{kinds.map(item => <option key={item}>{item}</option>)}</select></label>
      {profile && rows.opportunities && <details><summary>Publier une opportunité</summary>
        <form data-collapse-on-success onSubmit={event => submit(event, values => insertWithAttachment(db, 'opportunities', { author: profile.id, title: values.get('title').trim(), kind: values.get('kind'), body: values.get('body').trim() }, values.get('image'), 'opportunity-images', 'image_path'), true, 'Opportunité publiée avec succès.')}>
          <label>Type<select name="kind">{kinds.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>Titre<input name="title" required maxLength={150} /></label>
          <label>Description, lieu et modalités de candidature<textarea name="body" required maxLength={5000} /></label>
          <label>Affiche ou image (facultatif)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /><small>JPEG, PNG ou WebP · 5 Mo maximum</small></label>
          <button disabled={busy}>Publier</button>
        </form></details>}
      {rows.opportunities?.filter(row => !kind || row.kind === kind).sort((a,b) => b.id - a.id).map(row => <article key={row.id}>
        <span className="state">{row.kind}</span><h3>{row.title}</h3>{row.image_path && <MemberImage db={db} bucket="opportunity-images" path={row.image_path} alt={'Affiche de l’opportunité : ' + row.title} />}<p className="body-text">{row.body}</p><a href={'/communaute?membre=' + row.author}>{people[row.author]?.name}</a>
      </article>)}
    </>}

    {screen === 'groupes' && <>
      {profile && rows.groups && <details><summary>Créer un projet de groupe</summary><form data-collapse-on-success onSubmit={event => submit(event, values => db.from('groups').insert({ title: values.get('title').trim(), body: values.get('body').trim(), owner: profile.id, is_public: values.get('visibility') === 'public', ...(values.get('github').trim() ? { github: values.get('github').trim() } : {}) }), true, 'Groupe créé avec succès.')}>
        <label>Nom<input name="title" required maxLength={150} /></label><label>Sujet et description<textarea name="body" required maxLength={2000} /></label><label>Dépôt GitHub (facultatif)<input name="github" type="url" placeholder="https://github.com/equipe/projet" /></label><label>Visibilité<select name="visibility"><option value="private">Privé · sur invitation</option><option value="public">Public · adhésion libre</option></select></label><button disabled={busy}>Créer le projet de groupe</button>
      </form></details>}
      {rows.group_invitations?.some(invite => invite.recipient === profile?.id) && <section className="group-invitations">
        <h3>Mes invitations</h3>
        {rows.group_invitations.filter(invite => invite.recipient === profile?.id).map(invite => <div className="answer" key={invite.group_id}>
          <strong>{rows.groups.find(group => group.id === invite.group_id)?.title}</strong>
          <div className="filters">
            <button disabled={busy} onClick={() => save(db.rpc('accept_group_invitation', { target_group: invite.group_id }))}>Accepter</button>
            <button disabled={busy} onClick={() => save(db.from('group_invitations').delete().eq('group_id', invite.group_id).eq('recipient', profile.id))}>Refuser</button>
          </div>
        </div>)}
      </section>}
      {rows.groups?.length === 0 && <p>Aucun groupe pour le moment.</p>}
      <div className="group-directory" aria-label="Liste des groupes">
        {rows.groups?.map(group => <button className="problem" type="button" key={group.id} aria-pressed={selectedGroup === group.id} onClick={() => setSelectedGroup(group.id)}>
          <strong>{group.title}</strong><small>{group.owner === profile?.id ? 'Ton groupe' : rows.group_members?.some(row => row.group_id === group.id && row.member === profile?.id) ? 'Membre' : group.is_public ? 'Groupe public' : 'Groupe privé'}</small>
        </button>)}
      </div>
      {rows.groups?.filter(group => group.id === selectedGroup).map(group => {
        const owner = profile?.id === group.owner;
        const members = rows.group_members?.filter(row => row.group_id === group.id) ?? [];
        const invitations = rows.group_invitations?.filter(row => row.group_id === group.id) ?? [];
        const joined = members.some(row => row.member === profile?.id);
        const available = Object.values(people).filter(person => person.id !== group.owner &&
          !members.some(row => row.member === person.id) && !invitations.some(row => row.recipient === person.id));
        return <article key={group.id}><h3>{group.title}</h3><p className="body-text">{group.body}</p>
          {(owner || joined) && <GroupVersions key={group.id} db={db} group={group} member={profile} people={people} />}
          {group.github && <section><h4>Dépôt de l’équipe</h4><p><a href={group.github}>Ouvrir sur GitHub</a></p>
            <p>Récupère le code avec Git. Pousse tes changements sur une branche ou un fork, puis ouvre une pull request pour les proposer à l’équipe.</p>
            <PullRequests key={group.github} repository={group.github} showCommits />
          </section>}
          {owner && <details><summary>Gérer le dépôt GitHub</summary>
            <form key={group.github ?? ''} onSubmit={event => submit(event, values => db.from('groups').update({ github: values.get('repository').trim() || null }).eq('id', group.id), false)}>
              <label>URL du dépôt<input name="repository" type="url" defaultValue={group.github ?? ''} placeholder="https://github.com/equipe/projet" /></label>
              <button disabled={busy}>Enregistrer le dépôt</button>
            </form>
          </details>}

          {profile && !owner && (joined || group.is_public) && <button disabled={busy} onClick={() => save(joined
            ? db.from('group_members').delete().eq('group_id', group.id).eq('member', profile.id)
            : db.from('group_members').insert({ group_id: group.id, member: profile.id }))}>{joined ? 'Quitter' : 'Rejoindre'}</button>}
          {owner && rows.group_invitations && <details><summary>Invitations et membres</summary>
            {available.length ? <form onSubmit={event => submit(event, values => db.from('group_invitations').insert({ group_id: group.id, recipient: values.get('recipient') }))}>
              <label>Inviter un développeur<select required name="recipient" defaultValue=""><option value="">Choisir un membre</option>{available.map(person => <option key={person.id} value={person.id}>{person.name}{person.username && person.username !== 'dev_' + person.id.replaceAll('-', '') ? ' (@' + person.username + ')' : ''}</option>)}</select></label>
              <button disabled={busy}>Envoyer l’invitation</button>
            </form> : <p>Tous les membres disponibles sont déjà invités ou dans le groupe.</p>}
            {invitations.map(row => <div className="answer" key={row.recipient}>{people[row.recipient]?.name} · En attente <button disabled={busy} onClick={() => save(db.from('group_invitations').delete().eq('group_id', group.id).eq('recipient', row.recipient))}>Annuler l’invitation</button></div>)}
            {members.filter(row => row.member !== group.owner).map(row => <div className="answer" key={row.member}>{people[row.member]?.name} <button disabled={busy} onClick={() => {
              if (window.confirm('Retirer ce membre du groupe ?')) save(db.from('group_members').delete().eq('group_id', group.id).eq('member', row.member));
            }}>Retirer du groupe</button></div>)}
          </details>}
          {(owner || joined) && <details><summary>Publier dans le groupe</summary><form data-collapse-on-success onSubmit={event => submit(event, values => insertWithAttachment(db, 'group_posts', { group_id: group.id, author: profile.id, body: values.get('body').trim() }, values.get('pdf'), 'group-pdfs', 'pdf_path', group.id + '/' + profile.id), true, 'Publication ajoutée au groupe.')}>
            <label>Publier dans le groupe<textarea name="body" required maxLength={2000} /></label><label>Guide PDF du groupe (facultatif)<input name="pdf" type="file" accept="application/pdf,.pdf" /><small>10 Mo maximum · visible par les membres du groupe</small></label><button disabled={busy}>Publier</button>
          </form></details>}
          {rows.group_posts.filter(post => post.group_id === group.id && !post.parent).map(post => <div className="answer" key={post.id}><strong><a href={'/communaute?membre=' + post.author}>{people[post.author]?.name ?? 'Voir le profil'}</a></strong><p className="body-text">{post.body}</p>
            {post.pdf_path && <button type="button" className="link" onClick={async () => {
              const { data, error } = await db.storage.from('group-pdfs').createSignedUrl(post.pdf_path, 60, { download: 'guide-du-groupe.pdf' });
              if (error) setNotice(error.message);
              else window.location.assign(data.signedUrl);
            }}>Télécharger le guide PDF</button>}
            {rows.group_posts.filter(reply => reply.parent === post.id).map(reply => <div className="group-reply" key={reply.id}>
              <strong><a href={'/communaute?membre=' + reply.author}>{people[reply.author]?.name ?? 'Voir le profil'}</a></strong><p className="body-text">{reply.body}</p>
              {(owner || profile?.id === reply.author) && <button disabled={busy} onClick={() => save(db.from('group_posts').delete().eq('id', reply.id))}>Retirer la réponse</button>}
            </div>)}
            {(joined || owner) && <details><summary>Répondre</summary><form data-collapse-on-success onSubmit={event => submit(event, values => db.from('group_posts').insert({ group_id: group.id, parent: post.id, author: profile.id, body: values.get('body').trim() }))}><label>Réponse<textarea name="body" required maxLength={2000} /></label><button disabled={busy}>Envoyer</button></form></details>}
            {(owner || profile?.id === post.author) && <button disabled={busy} onClick={() => save(db.from('group_posts').delete().eq('id', post.id))}>Retirer la publication</button>}
          </div>)}
        </article>;
      })}
    </>}

    {screen === 'messages' && profile && rows.conversations && <>
      <button disabled={busy} onClick={() => load().catch(error => setNotice(error.message))}>Actualiser</button>
      <details open={new URLSearchParams(window.location.search).has('membre') || undefined}><summary>Nouvelle discussion</summary><form data-collapse-on-success onSubmit={event => submit(event, values => db.from('conversations').insert({ sender: profile.id, recipient: values.get('recipient') }), true, 'Demande en attente.')}>
        <label>Destinataire<select required name="recipient" defaultValue={new URLSearchParams(window.location.search).get('membre') ?? ''}><option value="">Choisir un membre</option>{Object.values(people).filter(person => person.id !== profile.id).map(person => <option key={person.id} value={person.id}>{person.name}{person.username && person.username.length < 36 ? ' (@' + person.username + ')' : ''}</option>)}</select></label>
        <button disabled={busy}>Demander à discuter</button>
      </form></details>
      <div className="inbox-grid">
      <nav className="inbox-list" aria-label="Conversations">
        {!rows.conversations.length && <p>Aucune conversation.</p>}
        {rows.conversations.map(item => {
          const other = people[item.recipient === profile.id ? item.sender : item.recipient];
          return <button key={item.id} type="button" aria-pressed={active === item.id} onClick={() => {
            if (active === item.id) return;
            setActive(item.id);
            setRows(previous => ({ ...previous, private_messages: [] }));
          }}><strong>{other?.name ?? 'Membre'}</strong><small>{{ pending: 'Demande en attente', accepted: 'Discussion', refused: 'Demande refusée', blocked: 'Bloquée' }[item.state]}</small></button>;
        })}
      </nav>
      <div className="inbox-thread">
      {!active && <p className="empty">Sélectionne une conversation pour lire les messages.</p>}
      {rows.conversations.filter(item => item.id === active).map(conversation => {
        const incoming = conversation.recipient === profile.id;
        const other = incoming ? conversation.sender : conversation.recipient;
        const change = state => save(db.from('conversations').update({ state }).eq('id', conversation.id));
        return <article key={conversation.id}><h3>{people[other]?.name}</h3>
          <p>{{ pending: 'Demande en attente', accepted: 'Conversation ouverte', refused: 'Demande refusée', blocked: 'Conversation bloquée' }[conversation.state]}</p>
          {incoming && conversation.state === 'pending' && <div className="filters"><button disabled={busy} onClick={() => change('accepted')}>Accepter</button><button disabled={busy} onClick={() => change('refused')}>Refuser</button><button disabled={busy} onClick={() => change('blocked')}>Bloquer</button></div>}
          {(rows.private_messages ?? []).filter(message => message.conversation === conversation.id).sort((a,b) => a.id - b.id).map(message => <div className={message.author === profile.id ? 'message-bubble mine' : 'message-bubble'} key={message.id}><strong>{people[message.author]?.name}</strong><p className="body-text">{message.body}</p></div>)}
          {conversation.state === 'accepted' && <>
            <form onSubmit={event => submit(event, values => db.from('private_messages').insert({ conversation: conversation.id, author: profile.id, body: values.get('body').trim() }))}>
              <label>Message<textarea name="body" required maxLength={2000} /></label><button disabled={busy}>Envoyer</button>
            </form><button disabled={busy} onClick={() => change('blocked')}>Bloquer</button>
          </>}
        </article>;
      })}
      </div></div>
    </>}
  </section>;
}

