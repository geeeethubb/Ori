/**
 * An image whose value is a record image value: `example:<name>` (public example photo) or a media
 * id (owner-only). Never breaks a layout: a quiet placeholder stands in while loading or on failure.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Icons } from '../components/ui.tsx';
import { canUseDirectImageSrc, exampleImageUrl, fetchMediaObjectUrl, isExampleImage, mediaUrl } from './media.ts';

interface Props {
  value: unknown;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** 'cover' fills its box (tiles); 'contain' shows the whole photo (lightbox). */
  fit?: 'cover' | 'contain';
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
}

type Src = { kind: 'loading' } | { kind: 'ready'; src: string } | { kind: 'error' };

/** Resolve an image value to something an <img> can show. */
export function useImageSource(value: unknown): Src {
  const id = typeof value === 'string' ? value : '';
  const direct = isExampleImage(id) ? exampleImageUrl(id) : id && canUseDirectImageSrc() ? mediaUrl(id) : null;
  const [state, setState] = useState<Src>(() => (!id ? { kind: 'error' } : direct ? { kind: 'ready', src: direct } : { kind: 'loading' }));

  useEffect(() => {
    if (!id) {
      setState({ kind: 'error' });
      return;
    }
    if (direct) {
      setState({ kind: 'ready', src: direct });
      return;
    }
    let alive = true;
    setState({ kind: 'loading' });
    fetchMediaObjectUrl(id)
      .then((src) => alive && setState({ kind: 'ready', src }))
      .catch(() => alive && setState({ kind: 'error' }));
    return () => {
      alive = false;
    };
  }, [id, direct]);

  return state;
}

export function AuthImage({ value, alt, className, style, fit = 'cover', loading = 'lazy', onLoad }: Props) {
  const source = useImageSource(value);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  const cls = ['rt-img', `rt-img-${fit}`, className].filter(Boolean).join(' ');
  if (source.kind === 'error' || failed) {
    return (
      <div className={`${cls} rt-img-fallback`} style={style} role="img" aria-label={alt ? `${alt} (photo unavailable)` : 'Photo unavailable'}>
        {Icons.image}
        <span>Photo unavailable</span>
      </div>
    );
  }
  if (source.kind === 'loading') {
    return <div className={`${cls} rt-img-loading`} style={style} aria-hidden="true" />;
  }
  return <img className={cls} style={style} src={source.src} alt={alt} loading={loading} decoding="async" onLoad={onLoad} onError={() => setFailed(true)} />;
}
