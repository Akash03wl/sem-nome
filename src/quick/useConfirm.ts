import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Confirmação por segundo clique: `ask(chave)` devolve `true` só se a mesma chave
 * já estava armada; senão arma por `ms` milissegundos e devolve `false`.
 */
/** Um 2º clique/Enter mais rápido que isso é acidental (clique duplo, tecla repetida). */
const MIN_CONFIRM_DELAY = 300;

export function useConfirm(ms = 3000): { armed: string | null; ask(key: string): boolean; reset(): void } {
  const [armed, setArmed] = useState<string | null>(null);
  const armedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const reset = useCallback(() => {
    clear();
    setArmed(null);
  }, []);

  const ask = useCallback(
    (key: string) => {
      if (armed === key && Date.now() - armedAt.current < MIN_CONFIRM_DELAY) return false;
      clear();
      if (armed === key) {
        setArmed(null);
        return true;
      }
      armedAt.current = Date.now();
      setArmed(key);
      timer.current = setTimeout(() => setArmed(null), ms);
      return false;
    },
    [armed, ms],
  );

  return { armed, ask, reset };
}
