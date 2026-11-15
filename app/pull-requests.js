import { useState } from 'react';

export default function PullRequests({ repository, showCommits = false }) {
  const [items, setItems] = useState(null);
  const [commits, setCommits] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setMessage('');
    try {
      const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/?$/.exec(repository);
      if (!match) throw new Error();
      const owner = encodeURIComponent(match[1]);
      const name = encodeURIComponent(match[2].replace(/\.git$/, ''));
      const repo = 'https://api.github.com/repos/' + owner + '/' + name;
      const base = repo + '/pulls?per_page=20&state=';
      const groups = await Promise.all(['open', 'closed'].map(async state => {
        const response = await fetch(base + state);
        if (!response.ok) throw new Error();
        return response.json();
      }));
      if (showCommits) {
        const response = await fetch(repo + '/commits?per_page=10');
        setCommits(response.ok ? await response.json() : []);
      }
      setItems([...groups[0], ...groups[1].filter(item => item.merged_at)]);
    } catch {
      setMessage('GitHub est indisponible ou le dépôt est privé. Tu peux ouvrir les pull requests sur GitHub.');
    } finally {
      setBusy(false);
    }
  }

  return <details><summary>Contributions GitHub</summary>
    <button onClick={load} disabled={busy}>{busy ? 'Chargement…' : showCommits ? 'Charger les commits et pull requests' : 'Charger les pull requests récentes'}</button>
    {message && <p role="status">{message}</p>}
    {items && <ul>{items.map(item => <li key={item.number}><a href={item.html_url}>#{item.number} {item.title}</a> · {item.merged_at ? 'Intégrée' : 'Ouverte'}</li>)}</ul>}
    {commits && <><h4>Commits récents sur la branche par défaut</h4>
      {commits.length ? <ul>{commits.map(item => <li key={item.sha}><a href={item.html_url}><code>{item.sha.slice(0,7)}</code> {item.commit.message.split('\n')[0]}</a> · {item.author?.login ?? item.commit.author?.name}</li>)}</ul> : <p>Aucun commit récent disponible.</p>}</>}
    {items?.length === 0 && <p>Aucune pull request récente.</p>}
  </details>;
}
