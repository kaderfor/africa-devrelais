import { useEffect, useRef } from 'react';

export default function PublicationConfirmation({ message, onClose }) {
  const dialog = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    if (message && !element.open) element.showModal();
  }, [message]);

  return <dialog ref={dialog} className="publication-confirmation" aria-labelledby="publication-title" aria-describedby="publication-message" onClose={onClose}>
    <h2 id="publication-title">Action confirmée</h2>
    <p id="publication-message">{message}</p>
    <form method="dialog"><button autoFocus>OK</button></form>
  </dialog>;
}
