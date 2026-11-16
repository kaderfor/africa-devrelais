import { useEffect, useState } from 'react';

export default function PostInteractions({ db, post, profile, author }) {
  const [likes, setLikes] = useState(null);
  const [comments, setComments] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const liked = likes?.some(row => row.author === profile?.id);

  async function loadLikes() {
    const { data, error } = await db.from('post_likes').select('author').eq('post', post);
    if (error) throw error;
    setLikes(data);
  }

  async function loadComments() {
    const { data, error } = await db.from('post_comments').select().eq('post', post).order('id');
    if (error) throw error;
    setComments(data);
  }

  useEffect(() => {
    loadLikes().catch(() => setNotice('Interactions indisponibles.'));
  }, [db, post]);

  async function act(operation) {
    setBusy(true);
    setNotice('');
    try { await operation(); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  return <div className="post-interactions">
    <div className="filters">
      <button type="button" aria-pressed={!!liked} disabled={!profile || !likes || busy} onClick={() => act(async () => {
        const request = liked ? db.from('post_likes').delete().eq('post', post).eq('author', profile.id)
          : db.from('post_likes').insert({ post, author: profile.id });
        const { error } = await request;
        if (error) throw error;
        await loadLikes();
      })}>J’aime{likes ? ' · ' + likes.length : ''}</button>
      <button type="button" aria-expanded={expanded} onClick={() => {
        setExpanded(!expanded);
        if (!expanded) act(loadComments);
      }}>Commentaires</button>
    </div>
    {expanded && <>
      {comments?.length === 0 && <p>Aucun commentaire.</p>}
      {comments?.map(comment => <div className="answer" key={comment.id}>
        <a href={'/communaute?membre=' + comment.author}>{author(comment.author) ?? 'Membre'}</a>
        <p className="body-text">{comment.body}</p>
      </div>)}
      {profile && <form onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = new FormData(form).get('comment').trim();
        if (!body) return;
        act(async () => {
          const { error } = await db.from('post_comments').insert({ post, author: profile.id, body });
          if (error) throw error;
          form.reset();
          await loadComments();
        });
      }}>
        <label>Ton commentaire<textarea name="comment" required maxLength={1000} /></label>
        <button disabled={busy}>Envoyer</button>
      </form>}
    </>}
    <p role="status">{notice}</p>
  </div>;
}
