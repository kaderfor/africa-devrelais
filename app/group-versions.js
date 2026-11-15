'use client';

import { useEffect, useState } from 'react';

export default function GroupVersions({ db, group, member, people }) {
  const [versions, setVersions] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(signal) {
    let query = db.from('group_versions').select().eq('group_id', group.id).order('id', { ascending: false });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (signal?.aborted) return;
    if (error) throw error;
    setVersions(data);
    return data;
  }

  useEffect(() => {
    const request = new AbortController();
    load(request.signal).catch(error => {
      if (!request.signal.aborted) setNotice(error.code === 'PGRST205'
        ? 'Applique la migration 012 pour activer les versions ZIP.'
        : error.message);
    });
    return () => request.abort();
  }, [db, group.id]);

  async function publish(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const file = fields.get('archive');
    setNotice('');
    if (!file?.name.toLowerCase().endsWith('.zip') || !file.size || file.size > 20 * 1024 * 1024) {
      setNotice('Choisis un fichier ZIP non vide de 20 Mo maximum.');
      return;
    }
    const note = fields.get('note').trim();
    if (!note) { setNotice('Décris brièvement tes changements.'); return; }

    setBusy(true);
    try {
      const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (signature[0] !== 80 || signature[1] !== 75 ||
          !((signature[2] === 3 && signature[3] === 4) || (signature[2] === 5 && signature[3] === 6))) {
        throw new Error('Le fichier ne semble pas être une archive ZIP.');
      }
      const archive = group.id + '/' + member.id + '/' + crypto.randomUUID() + '.zip';
      const storage = db.storage.from('group-archives');
      const upload = await storage.upload(archive, file, { contentType: 'application/zip' });
      if (upload.error) throw upload.error;
      const result = await db.from('group_versions').insert({ group_id: group.id, author: member.id, archive, note });
      if (result.error) {
        await storage.remove([archive]);
        throw result.error;
      }
      form.reset();
      await load();
      setNotice('Version déposée.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function download(version) {
    setNotice('');
    const { data, error } = await db.storage.from('group-archives').createSignedUrl(version.archive, 60, {
      download: 'projet-' + group.id + '-version-' + version.id + '.zip'
    });
    if (error) { setNotice(error.message); return; }
    window.location.assign(data.signedUrl);
  }

  return <section className="group-versions">
    <h4>Versions du projet</h4>
    <p>Dépose ton code en ZIP et indique ce que tu as modifié. L’équipe peut récupérer la dernière version ou consulter l’historique.</p>
    <p role="status">{notice}</p>
    {versions && <>
      {versions.length ? <button type="button" onClick={async () => {
        try {
          const [latest] = await load();
          if (latest) await download(latest);
        } catch (error) { setNotice(error.message); }
      }}>Télécharger la dernière version</button> : <p>Aucune version déposée.</p>}
      <button type="button" className="link" disabled={busy} onClick={() => load().catch(error => setNotice(error.message))}>Actualiser</button>
      <details><summary>Déposer une version ZIP</summary>
        <form onSubmit={publish}>
          <label>Archive ZIP<input name="archive" type="file" accept=".zip,application/zip" required /><small>20 Mo maximum. Retire les fichiers secrets comme .env avant le dépôt.</small></label>
          <label>Résumé des changements<textarea name="note" required maxLength={500} /></label>
          <button disabled={busy}>{busy ? 'Dépôt en cours…' : 'Déposer la version'}</button>
        </form>
      </details>
      {!!versions.length && <ol className="version-history">{versions.map((version, index) => <li key={version.id}>
        <strong>Version {version.id}{index === 0 ? ' · Dernière version' : ''}</strong>
        <p>{people[version.author]?.name ?? 'Membre'} · <time dateTime={version.created_at}>{new Date(version.created_at).toLocaleString('fr-FR')}</time></p>
        <p className="body-text">{version.note}</p>
        <button type="button" className="link" onClick={() => download(version)}>Télécharger ce ZIP</button>
      </li>)}</ol>}
    </>}
  </section>;
}
