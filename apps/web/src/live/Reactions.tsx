import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { reactionAllowed, stickerOf, stickerPath, type Phase, type Reaction, type ReactionItem } from '@quiz/shared';
import { t } from '../i18n';
import { strayReactions } from '../reactions';

export type ReactionSize = 'phone' | 'stage' | 'host';

/** Сторона бейджа в px: телефон і пульт — 28, сцена — 56. */
const BADGE_PX: Record<ReactionSize, number> = { phone: 28, host: 28, stage: 56 };

interface ReactionsContext {
  reactions: Reaction[];
  size: ReactionSize;
  /** Скільки RowReaction кожного rowId зараз на екрані. */
  mounted: Record<string, number>;
  mount: (rowId: string) => () => void;
}

const Context = createContext<ReactionsContext | null>(null);

/** Роздає реакції рядкам; поза дозволеними фазами екрани передають []. */
export function ReactionsProvider({ reactions, size, children }: { reactions: Reaction[]; size: ReactionSize; children: ReactNode }) {
  const [mounted, setMounted] = useState<Record<string, number>>({});
  const mount = useCallback((rowId: string) => {
    setMounted((prev) => ({ ...prev, [rowId]: (prev[rowId] ?? 0) + 1 }));
    return () =>
      setMounted((prev) => {
        const left = (prev[rowId] ?? 1) - 1;
        const next = { ...prev };
        if (left > 0) next[rowId] = left;
        else delete next[rowId];
        return next;
      });
  }, []);
  const value = useMemo(() => ({ reactions, size, mounted, mount }), [reactions, size, mounted, mount]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function ReactionBadge({ item }: { item: ReactionItem }) {
  const size = BADGE_PX[useContext(Context)?.size ?? 'phone'];
  if (item.kind === 'emoji') {
    return (
      <span className="reaction-badge is-emoji" aria-label={t('reactionEmoji', { emoji: item.value })}>
        {item.value}
      </span>
    );
  }
  const sticker = stickerOf(item.value);
  return (
    <span className="reaction-badge">
      {sticker !== undefined && <img src={stickerPath(sticker)} alt={t('reactionSticker', { name: sticker.id })} width={size} height={size} />}
    </span>
  );
}

/** Біля ніка: реєструє rowId як «рядок на екрані» (useLayoutEffect) і малює бейджі реакцій цього rowId; поза провайдером — нічого. */
export function RowReaction({ rowId }: { rowId: string }) {
  const context = useContext(Context);
  const mount = context?.mount;
  useLayoutEffect(() => mount?.(rowId), [mount, rowId]);
  if (context === null) return null;
  const mine = context.reactions.filter((reaction) => reaction.rowId === rowId);
  if (mine.length === 0) return null;
  return (
    <span className="row-reactions">
      {mine.map((reaction) => (
        <span key={reaction.seq} className="row-reaction">
          <ReactionBadge item={reaction.item} />
          {/* Командна гра: рядок — команда, тож поруч нік того, хто реагує. */}
          {reaction.rowId !== reaction.by && reaction.nickname !== null && <span className="reaction-by">{reaction.nickname}</span>}
        </span>
      ))}
    </span>
  );
}

/** Смуга внизу (position: fixed, висота --reaction-strip-h): «нік + бейдж» для strayReactions; ведучий — t('reactionHost'). */
export function ReactionStrip() {
  const context = useContext(Context);
  const size = context?.size ?? 'phone';
  const stray = context === null ? [] : strayReactions(context.reactions, new Set(Object.keys(context.mounted)));
  return (
    // Живий регіон стоїть завжди (aria-live), а роль status — лише з реакціями: порожня смуга не бере на себе «статус» екрана.
    <div className={`reaction-strip is-${size}`} role={stray.length > 0 ? 'status' : undefined} aria-live="polite" aria-label={t('reactionStripLabel')}>
      {stray.map((reaction) => (
        <span key={reaction.seq} className="reaction-strip-item">
          <b>{reaction.nickname ?? t('reactionHost')}</b>
          <ReactionBadge item={reaction.item} />
        </span>
      ))}
    </div>
  );
}

const NO_REACTIONS: Reaction[] = [];

/**
 * main екрана (сцена, телефон, пульт) з реакціями: у REACTION_PHASES — клас has-reactions (запас під смугою), провайдер
 * з реакціями й смуга в кінці; в інших фазах (запитання, locked…) реакцій немає зовсім, навіть ще живих.
 */
export function ReactionMain({
  className,
  phase,
  reactions,
  size,
  children,
  ...rest
}: { className: string; phase: Phase; reactions: Reaction[]; size: ReactionSize; children: ReactNode } & Omit<ComponentProps<'main'>, 'className' | 'children'>) {
  const reacting = reactionAllowed(phase);
  return (
    <main className={reacting ? `${className} has-reactions` : className} {...rest}>
      <ReactionsProvider reactions={reacting ? reactions : NO_REACTIONS} size={size}>
        {children}
        {reacting && <ReactionStrip />}
      </ReactionsProvider>
    </main>
  );
}
