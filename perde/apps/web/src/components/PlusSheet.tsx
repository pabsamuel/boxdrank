import { useState } from 'react';
import { useT } from '../lib/ui';

/**
 * The moment a family meets the price: a locked play was tapped. One screen,
 * parent-facing: what Plus is, what it costs once, where to buy it, and the
 * box for a key that was already bought. The TV shows the same offer as a QR.
 */
export function PlusSheet({
  checkoutUrl,
  notice,
  onActivate,
  onClose,
}: {
  checkoutUrl?: string;
  notice?: string | null;
  onActivate: (key: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [keyOpen, setKeyOpen] = useState(false);
  const [key, setKey] = useState('');
  return (
    <div className="plus-sheet" role="dialog" aria-label={t('premium')}>
      <div className="plus-sheet__head">
        <span className="badge badge--plus">Plus</span>
        <h2>{t('premium')}</h2>
        <p className="plus-sheet__price">
          {t('plusPrice')} <small>{t('plusOnce')}</small>
        </p>
      </div>
      <ul className="plus-sheet__list">
        <li>{t('plusFeature1')}</li>
        <li>{t('plusFeature2')}</li>
        <li>{t('plusFeature3')}</li>
      </ul>
      {checkoutUrl ? (
        <a
          className="btn btn--primary btn--big"
          href={checkoutUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t('plusBuy')}
        </a>
      ) : (
        <button className="btn btn--big" disabled>
          {t('plusBuySoon')}
        </button>
      )}
      <p className="plus-sheet__fine">{t('plusDevices')}</p>
      {keyOpen ? (
        <form
          className="plus-sheet__key"
          onSubmit={(e) => {
            e.preventDefault();
            onActivate(key.trim());
          }}
        >
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t('plusKeyPlaceholder')}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn btn--primary" type="submit" disabled={key.trim().length < 16}>
            {t('plusActivate')}
          </button>
        </form>
      ) : (
        <button className="btn btn--ghost" onClick={() => setKeyOpen(true)}>
          {t('plusHaveKey')}
        </button>
      )}
      {notice && (
        <p className="warn" role="status">
          {notice}
        </p>
      )}
      <button className="btn btn--ghost btn--small plus-sheet__close" onClick={onClose}>
        {t('notNow')}
      </button>
    </div>
  );
}
