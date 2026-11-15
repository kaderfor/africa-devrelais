import './style.css';

export const metadata = { title: 'Africa DevRelais', description: 'L’entraide des développeurs africains' };

export default function Layout({ children }) {
  return <html lang="fr"><body>{children}</body></html>;
}
