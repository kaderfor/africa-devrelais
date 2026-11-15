import { useEffect, useState } from 'react';
import { uploadAttachment } from './attachments';

export function ProfileAvatar({ db, member }) {
  const [photo, setPhoto] = useState(null);
  const path = member.avatar_path;
  useEffect(() => {
    if (!path) return;
    let active = true;
    db.storage.from('profile-avatars').createSignedUrl(path, 900).then(({ data }) => {
      if (active) setPhoto(data ? { path, url: data.signedUrl } : null);
    });
    return () => { active = false; };
  }, [db, path]);

  const initials = member.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return <span className="member-avatar" aria-hidden="true">{photo && photo.path === path
    ? <img src={photo.url} alt="" onError={() => setPhoto(null)} /> : initials}</span>;
}

export default function AccountPresentation({ db, profile, refresh }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function save(fields, remove = false) {
    setBusy(true);
    setNotice('');
    const bucket = 'profile-avatars';
    let path;
    try {
      if (remove || fields.get('avatar')?.name) {
        path = remove ? null : await uploadAttachment(db, bucket, profile.id, fields.get('avatar'));
        const { error } = await db.rpc('save_member_avatar', { path });
        if (error) {
          if (path) await db.storage.from(bucket).remove([path]);
          throw error;
        }
        if (profile.avatar_path && profile.avatar_path !== path) {
          await db.storage.from(bucket).remove([profile.avatar_path]);
        }
      }
      if (!remove) {
        const { error } = await db.rpc('edit_profile_details', {
          new_bio: fields.get('bio').trim(),
          new_skills: [...new Set(fields.get('skills').split(/[,;]+/).map(skill => skill.trim()).filter(Boolean))].join(', ')
        });
        if (error) throw error;
      }
      setNotice(remove ? 'Photo retirée.' : 'Présentation enregistrée.');
    } catch (error) {
      setNotice(error.code === 'PGRST202' ? 'Applique la migration 017 pour activer les photos de profil.' : error.message);
    } finally {
      try { await refresh(); } finally { setBusy(false); }
    }
  }

  return <section className="account-presentation">
    <div className="member-banner"><ProfileAvatar db={db} member={profile} /><div><strong>{profile.name}</strong><p>Présentation visible par les membres</p></div></div>
    <form onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      save(new FormData(form)).then(() => { form.elements.avatar.value = ''; });
    }}>
      <label>Photo de profil<input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" /><small>JPEG, PNG ou WebP · 5 Mo maximum</small></label>
      <label>Présentation<textarea name="bio" defaultValue={profile.bio ?? ''} maxLength={600} /></label>
      <label>Compétences<input name="skills" defaultValue={profile.skills ?? ''} maxLength={250} placeholder="JavaScript, React, PostgreSQL" /><small>Sépare les compétences par des virgules.</small></label>
      <button disabled={busy}>Enregistrer ma présentation</button>
      {profile.avatar_path && <button className="link" type="button" disabled={busy} onClick={() => save(null, true)}>Retirer la photo</button>}
      <p role="status">{notice}</p>
    </form>
    <a href={'/communaute?membre=' + profile.id}>Voir mon profil</a>
  </section>;
}
