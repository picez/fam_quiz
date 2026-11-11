import { useEffect, useState, type JSX } from 'react';
import { MATERIAL_LOOK, TROPHY_EMOJI, trophyLabel, type TrophyLook } from './trophy-meta';
import { pictureKey, readyPicture, trophyPicture } from './picture-cache';

/**
 * Статична картинка справжнього трофея (той самий матеріал, оформлення й фото, що в 3D): знімок рушія з кешу.
 * Поки знімка нема, без WebGL чи після збою — значок-емодзі в кольорі матеріалу. Живої сцени не тримає.
 */
export function TrophyPicture({ trophy }: { trophy: TrophyLook }): JSX.Element {
  const key = pictureKey(trophy);
  const [shot, setShot] = useState<{ key: string; url: string } | null>(() => {
    const url = readyPicture(trophy);
    return url === null ? null : { key, url };
  });
  useEffect(() => {
    let live = true;
    void trophyPicture(JSON.parse(key) as TrophyLook).then((url) => {
      if (live && url !== null) setShot({ key, url });
    });
    return () => {
      live = false;
    };
  }, [key]);
  const label = trophyLabel(trophy);
  if (shot !== null && shot.key === key) return <img className="trophy-picture" src={shot.url} alt={label} draggable={false} />;
  return (
    <span className="trophy-picture-fallback" role="img" aria-label={label} style={{ color: MATERIAL_LOOK[trophy.material].color }}>
      {TROPHY_EMOJI[trophy.kind]}
    </span>
  );
}
