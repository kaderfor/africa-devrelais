const image = { limit: 5, extensions: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } };

const formats = {
  'question-images': image,
  'opportunity-images': image,
  'post-images': image,
  'profile-avatars': image,
  'guide-pdfs': { limit: 10, extensions: { 'application/pdf': 'pdf' } }
};

export async function uploadAttachment(db, bucket, owner, file) {
  const { limit, extensions } = formats[bucket];
  const extension = extensions[file.type];
  if (!extension) throw new Error('Ce format de fichier n’est pas accepté.');
  if (!file.size || file.size > limit * 1024 * 1024) {
    throw new Error('Choisis un fichier non vide de ' + limit + ' Mo maximum.');
  }

  const path = owner + '/' + crypto.randomUUID() + '.' + extension;
  const storage = db.storage.from(bucket);
  const upload = await storage.upload(path, file, { contentType: file.type });
  if (upload.error) throw upload.error;

  return path;
}

export async function insertWithAttachment(db, table, item, file, bucket, column) {
  if (!file || !file.name) return db.from(table).insert(item);
  const path = await uploadAttachment(db, bucket, item.author, file);
  const storage = db.storage.from(bucket);
  const result = await db.from(table).insert({ ...item, [column]: path });
  if (result.error) await storage.remove([path]);
  return result;
}
