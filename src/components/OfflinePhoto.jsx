import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { isOwnedPhotoUrl } from '../services/offlinePhotos';
import { useAuth } from '../context/AuthContext';

export function OfflinePhoto({ src, ...props }) {
  const { user } = useAuth();
  const userId = user?.id;
  const cached = useLiveQuery(
    () => userId && isOwnedPhotoUrl(src, userId) ? db.offline_photos.get([userId, src]) : undefined,
    [userId, src]
  );
  const imageRef = useRef(null);
  useEffect(() => {
    if (!imageRef.current) return undefined;
    if (!cached?.blob || cached.userId !== userId || cached.url !== src) { imageRef.current.src = src; return undefined; }
    const url = URL.createObjectURL(cached.blob);
    imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [cached, src, userId]);
  return <img ref={imageRef} src={src} {...props} />;
}
