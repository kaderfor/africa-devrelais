import { notFound } from 'next/navigation';
import Platform from '../platform';

const screens = ['entraide', 'ressources', 'projets', 'classement', 'compte', 'parametres', 'communaute', 'profil', 'messages', 'groupes', 'opportunites', 'tableau-de-bord', 'notifications'];

export default async function Screen({ params }) {
  const { screen } = await params;
  if (!screens.includes(screen)) notFound();
  return <Platform screen={screen} />;
}
