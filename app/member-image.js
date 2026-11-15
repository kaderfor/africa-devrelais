import { useEffect, useState } from 'react';

export default function MemberImage({ db, bucket, path, alt }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    db.storage.from(bucket).createSignedUrl(path, 900).then(({ data, error }) => {
      if (!alive) return;
      if (error) setFailed(true);
      else setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [db, bucket, path]);

  if (failed) return <p>Image indisponible.</p>;
  if (!url) return null;
  return <a href={url}><img className="question-attachment" src={url} alt={alt} loading="lazy" /></a>;
}
